import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile, readdir, rm, rename} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function documentationPaths(runtime) {
  const root = path.join(runtime, 'documentation');
  return {root, readme: path.join(root, 'readme.md'), rules: path.join(root, 'docs', 'rules')};
}

export async function documentationReady(runtime, source) {
  const {root} = documentationPaths(runtime);
  try {
    const metadata = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    if (metadata.version !== source.version || metadata.commit !== source.commit) return false;
    const entries = Object.entries(metadata.files ?? {});
    if (entries.every(([file]) => file !== 'readme.md') || entries.every(([file]) => !file.startsWith('docs/rules/'))) return false;
    const checks = await Promise.all(entries.map(async ([file, expected]) => {
      if (file !== 'readme.md' && file !== 'license' && !/^docs\/[\w./-]+\.md$/u.test(file)) return false;
      if (file.split('/').includes('..')) return false;
      return digest(await readFile(path.join(root, file))) === expected;
    }));
    return checks.every(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
    throw error;
  }
}

async function download(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(90_000)});
  if (!response.ok) throw new Error(`Documentation download failed: HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024 * 1024) throw new Error('Documentation archive exceeds 16 MiB.');
      chunks.push(value);
    }
  } finally {await reader.cancel();}
  return Buffer.concat(chunks);
}

export async function prepareDocumentation(runtime, source) {
  if (await documentationReady(runtime, source)) return documentationPaths(runtime);
  const packageJson = JSON.parse(await readFile(path.join(runtime, 'node_modules', source.package, 'package.json'), 'utf8'));
  if (packageJson.version !== source.version) throw new Error('Plugin and documentation versions differ.');
  process.stderr.write(`Preparing ${source.package}@${source.version} documentation.\n`);
  const archive = await download(source.archiveUrl);
  const staging = await mkdtemp(path.join(runtime, 'documentation-'));
  try {
    const archiveFile = path.join(staging, 'source.tar.gz');
    const output = path.join(staging, 'content');
    await writeFile(archiveFile, archive);
    await mkdir(output);
    const {default: importDependency} = await import(pathToFileURL(path.join(runtime, 'runtime-loader.mjs')).href);
    const tar = await importDependency('tar');
    const prefix = `eslint-plugin-unicorn-${source.commit}/`;
    await tar.x({
      file: archiveFile,
      cwd: output,
      strip: 1,
      strict: true,
      filter(name, entry) {
        if (entry.type !== 'File' || !name.startsWith(prefix)) return false;
        const relative = name.slice(prefix.length);
        return !relative.split('/').includes('..') && (relative === 'readme.md' || relative === 'license' || relative === 'package.json'
          || /^docs\/[\w./-]+\.md$/u.test(relative));
      },
    });
    const archivePackage = JSON.parse(await readFile(path.join(output, 'package.json'), 'utf8'));
    if (archivePackage.name !== source.package || archivePackage.version !== source.version) {
      throw new Error('Documentation archive does not match the installed plugin version.');
    }
    await rm(path.join(output, 'package.json'));
    const files = {};
    async function record(directory) {
      const entries = await readdir(directory, {withFileTypes: true});
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await record(file);
        else if (entry.isFile()) files[path.relative(output, file).split(path.sep).join('/')] = digest(await readFile(file));
      }
    }
    await record(output);
    if (!files['readme.md'] || !files['docs/rules/prefer-includes.md']) throw new Error('Documentation archive is incomplete.');
    await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
      version: source.version, commit: source.commit, archiveSha256: digest(archive), files,
    }, undefined, 2));
    const {root} = documentationPaths(runtime);
    await rm(root, {recursive: true, force: true});
    await rename(output, root);
    return documentationPaths(runtime);
  } finally {await rm(staging, {recursive: true, force: true});}
}

export function ruleDocumentation(ruleId, paths) {
  if (!ruleId?.startsWith('unicorn/')) return;
  const name = ruleId.slice('unicorn/'.length);
  return /^[a-z\d-]+$/u.test(name) ? path.join(paths.rules, `${name}.md`) : undefined;
}
