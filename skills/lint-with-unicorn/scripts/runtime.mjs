import {execFileSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {documentationReady, prepareDocumentation} from './documentation.mjs';

const exec = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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
    const {stdout} = await exec(npm, ['view', ...query, '--json', '--prefer-online'], {
      encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    });
    const version = highestStableVersion(JSON.parse(stdout));
    if (!version) throw new Error(`npm did not resolve a stable version for ${name}@${spec}.`);
    let gitHead;
    if (name === 'eslint-plugin-unicorn') {
      const commit = await exec(npm, ['view', `${name}@${version}`, 'gitHead', '--json', '--prefer-online'], {
        encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024,
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
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  try {
    resolved = {...(await readJson(resolutionFile)), ...releases};
    const packages = [];
    for (const [name, release] of Object.entries(releases)) {
      const installed = await readJson(path.join(runtime, 'node_modules', name, 'package.json'));
      if (installed?.version !== release.version) packages.push(`${name}@${release.version}`);
    }
    if (packages.length > 0) {
      const packageFile = path.join(runtime, 'package.json');
      if (!await readJson(packageFile)) await writeFile(packageFile, JSON.stringify({private: true, type: 'module'}));
      process.stderr.write(`Installing isolated dependencies: ${packages.join(', ')}\n`);
      execFileSync(npm, ['install', '--prefix', runtime, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', ...packages], {
        encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    if (!await ready(resolved)) throw new Error('Installed runtime differs from resolved versions.');
    await prepareDocumentation(runtime, documentationSource(documentConfig, resolved[documentConfig.package]));
    await writeFile(resolutionFile, JSON.stringify(resolved, undefined, 2));
    return Object.fromEntries(Object.keys(requirements).map(name => [name, resolved[name].version]));
  } finally {await rm(lock, {recursive: true, force: true});}
}
