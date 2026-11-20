import {execFileSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, readFile, writeFile, rm, copyFile, mkdtempDisposable, rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import path from 'node:path';
import {documentationReady, prepareDocumentation} from './documentation.mjs';

const execFileAsync = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function preferredInstaller() {
  try {
    execFileSync(pnpm, ['--version'], {shell: false, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe']});
    return pnpm;
  } catch (error) {
    if (error.code === 'ENOENT') return npm;
    throw error;
  }
}

async function installDependencies(runtime, packages) {
  const installer = preferredInstaller();
  let arguments_;
  if (installer === pnpm) {
    // Keep registry routes consistent with npm-based version discovery, including scoped registries.
    const {stdout} = await execFileAsync(npm, ['config', 'list', '--json'], {shell: false, encoding: 'utf8', timeout: 10_000});
    const registryOptions = Object.entries(JSON.parse(stdout))
      .filter(([key, value]) => /^(?:@[^:]+:)?registry$/u.test(key) && typeof value === 'string')
      .map(([key, value]) => `--${key}=${value}`);
    arguments_ = ['--dir', runtime, 'add', '--save-exact', '--ignore-scripts', '--ignore-workspace',
      '--ignore-pnpmfile', '--prefer-offline', ...registryOptions, ...packages];
  } else {
    arguments_ = ['install', '--prefix', runtime, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', ...packages];
  }
  process.stderr.write(`Installing isolated dependencies with ${installer}: ${packages.join(', ')}\n`);
  execFileSync(installer, arguments_, {
    shell: false, encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function readJson(file) {
  try {return JSON.parse(await readFile(file, 'utf8'));} catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return;
    throw error;
  }
}

export function highestStableVersion(metadata) {
  const versions = (Array.isArray(metadata) ? metadata : [metadata]).filter(version =>
    typeof version === 'string' && /^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/u.test(version));
  return versions.toSorted((left, right) => {
    const a = left.split('+', 1)[0].split('.').map(Number);
    const b = right.split('+', 1)[0].split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  }).at(-1);
}

export async function resolveDependencies(requirements) {
  const entries = await Promise.all(Object.entries(requirements).map(async ([name, spec]) => {
    if (typeof spec !== 'string' || !spec.trim()) throw new Error(`Invalid dependency specification: ${name}`);
    const query = spec === '*' ? [name, 'versions'] : [`${name}@${spec}`, 'version'];
    const {stdout} = await execFileAsync(npm, ['view', ...query, '--json', '--prefer-online'], {
      shell: false, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    });
    const version = highestStableVersion(JSON.parse(stdout));
    if (!version) throw new Error(`npm did not resolve a stable version for ${name}@${spec}.`);
    let gitHead;
    if (name === 'eslint-plugin-unicorn') {
      const commit = await execFileAsync(npm, ['view', `${name}@${version}`, 'gitHead', '--json', '--prefer-online'], {
        shell: false, encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024,
      });
      gitHead = JSON.parse(commit.stdout || 'null');
    }
    return [name, {spec, version, ...(gitHead && {gitHead})}];
  }));
  return Object.fromEntries(entries);
}

export function documentationSource(config, release) {
  if (!release || !/^[a-f\d]{40}$/u.test(release.gitHead ?? '')) {
    throw new Error('Installed Unicorn release has no valid published gitHead; matching documentation cannot be prepared.');
  }
  return {
    package: config.package,
    version: release.version,
    commit: release.gitHead,
    archiveUrl: `${config.archiveBaseUrl}/${release.gitHead}`,
  };
}

export async function prepareRuntime(runtime, requirements, documentConfig, noInstall) {
  const resolutionFile = path.join(runtime, 'resolved-dependencies.json');
  const loaderSource = new URL('../assets/runtime-loader.mjs', import.meta.url);
  const loaderFile = path.join(runtime, 'runtime-loader.mjs');
  async function syncLoader() {
    await using temporary = await mkdtempDisposable(path.join(runtime, '.loader-'));
    const file = path.join(temporary.path, 'runtime-loader.mjs');
    await copyFile(loaderSource, file);
    await rename(file, loaderFile);
  }
  async function ready(resolved) {
    if (!resolved) return false;
    for (const [name, spec] of Object.entries(requirements)) {
      if (resolved[name]?.spec !== spec) return false;
      const installed = await readJson(path.join(runtime, 'node_modules', name, 'package.json'));
      if (installed?.version !== resolved[name].version) return false;
    }
    return true;
  }
  let resolved = await readJson(resolutionFile);
  if (noInstall) {
    if (!await ready(resolved)) throw new Error('Runtime dependencies are missing or do not match cached resolutions. Run without --no-install once.');
    const source = documentationSource(documentConfig, resolved[documentConfig.package]);
    if (!await documentationReady(runtime, source)) throw new Error('Plugin documentation is missing or invalid. Run without --no-install once.');
    await syncLoader();
    return Object.fromEntries(Object.keys(requirements).map(name => [name, resolved[name].version]));
  }
  const releases = await resolveDependencies(requirements);
  await mkdir(runtime, {recursive: true});
  const lock = path.join(runtime, '.install-lock');
  const deadline = Date.now() + 180_000;
  while (true) {
    try {await mkdir(lock); break;} catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() > deadline) throw new Error(`Install lock timed out: ${lock}. Inspect interrupted installations before removing it.`);
      await setTimeout(250);
    }
  }
  await using lockCleanup = new AsyncDisposableStack();
  lockCleanup.defer(() => rm(lock, {recursive: true, force: true}));
  resolved = {...(await readJson(resolutionFile)), ...releases};
  const packages = [];
  for (const [name, release] of Object.entries(releases)) {
    const installed = await readJson(path.join(runtime, 'node_modules', name, 'package.json'));
    if (installed?.version !== release.version) packages.push(`${name}@${release.version}`);
  }
  if (packages.length > 0) {
    const packageFile = path.join(runtime, 'package.json');
    if (!await readJson(packageFile)) await writeFile(packageFile, JSON.stringify({private: true, type: 'module'}));
    await installDependencies(runtime, packages);
  }
  if (!await ready(resolved)) throw new Error('Installed runtime differs from resolved versions.');
  await syncLoader();
  await prepareDocumentation(runtime, documentationSource(documentConfig, resolved[documentConfig.package]));
  await writeFile(resolutionFile, JSON.stringify(resolved, undefined, 2));
  return Object.fromEntries(Object.keys(requirements).map(name => [name, resolved[name].version]));
}
