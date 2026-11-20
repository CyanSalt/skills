#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempDisposable, writeFile, readFile, mkdir, rm, rename, readdir, realpath, chmod, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {classify, lineMapping} from './compare.mjs';
import {documentationReady, prepareDocumentation} from './documentation.mjs';
import {documentationSource, highestStableVersion, resolveDependencies, prepareRuntime} from './runtime.mjs';

const script = fileURLToPath(new URL('lint.mjs', import.meta.url));
await using temporaryRoot = await mkdtempDisposable(path.join(os.tmpdir(), 'lint-as-if-perfect-tests-'));
const root = await realpath(temporaryRoot.path);
const fixture = path.join(root, 'project');
await mkdir(fixture);
function execute(arguments_, environment = process.env) {
  const result = spawnSync(process.execPath, [script, '--cwd', fixture, '--format', 'json', ...arguments_],
    {encoding: 'utf8', env: environment, maxBuffer: 32 * 1024 * 1024, timeout: 240_000});
  if (result.error) throw result.error;
  return result;
}
function resultOf(arguments_, status) {
  const result = execute(arguments_);
  assert.equal(result.status, status, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}
function git(...arguments_) {
  const result = spawnSync('git', ['-C', fixture, ...arguments_], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const code = 'export function check(value) { return value.indexOf("x") !== -1; }\n';
const tsCode = 'export function check(value: string): boolean { return value.indexOf("x") !== -1; }\n';
const jsxCode = 'export const view = <div title="hello" />;\n';
const tsxCode = 'export const view: unknown = <div title="hello" />;\n';
// HTTP fixtures intentionally exercise diagnostics and protocol-changing fixes.
const files = {
  'sample.js': code, 'sample.cjs': 'module.exports = value => value.indexOf("x") !== -1;\n', 'sample.mjs': code,
  'sample.jsx': jsxCode, 'sample.cjsx': 'module.exports = <div />;\n', 'sample.mjsx': jsxCode,
  'sample.ts': tsCode, 'sample.cts': 'const value: string = "x"; module.exports = value;\n', 'sample.mts': tsCode,
  'sample.tsx': tsxCode, 'sample.ctsx': tsxCode, 'sample.mtsx': tsxCode,
  'sample.d.ts': 'export declare const value: string;\n', 'sample.d.cts': 'export declare const value: string;\n',
  'sample.d.mts': 'export declare const value: string;\n',
  'sample.vue': `<script setup lang="ts">\n${tsCode}</script>\n<template><div /></template>\n`,
  'plain.vue': `<script>\n${code}</script>\n<template><div /></template>\n`,
  'sample.css': 'a { transition: all 1s; background: url("http://example.com/a.png"); }\n',
  'sample.html': '<!doctype html><a href="http://example.com">Example</a>\n',
  'sample.json': '{"url":"http://example.com"}\n',
  'sample.jsonc': '// Comment\n{"url":"http://example.com",}\n',
  'sample.json5': '{url: "http://example.com",}\n',
  'sample.md': '[Example](http://example.com)\n',
  'sample.toml': 'url = "http://example.com"\n',
  'sample.yaml': 'url: http://example.com\n', 'sample.yml': 'url: http://example.com\n',
};
for (const [name, source] of Object.entries(files)) await writeFile(path.join(fixture, name), source);

{
  await test('npm resolves wildcard and semver ranges and documentation follows the selected release', async () => {
    assert.equal(highestStableVersion(['2.9.0', '10.1.0', '11.0.0-beta.1', '2.10.0']), '10.1.0');
    assert.equal(highestStableVersion('6.0.3'), '6.0.3');
    assert.equal(highestStableVersion(['7.0.0-beta.1']), undefined);
    const resolved = await resolveDependencies({eslint: '*', typescript: '^6.0.3', '@typescript-eslint/parser': '*'});
    assert.equal(resolved.eslint.spec, '*');
    assert.match(resolved.eslint.version, /^\d+\.\d+\.\d+/u);
    assert.equal(resolved.typescript.spec, '^6.0.3');
    assert.match(resolved.typescript.version, /^6\./u);
    const config = {package: 'eslint-plugin-unicorn', archiveBaseUrl: 'https://codeload.github.com/sindresorhus/eslint-plugin-unicorn/tar.gz'};
    const oldRelease = {version: '80.0.0', gitHead: 'a'.repeat(40)};
    const newRelease = {version: '81.0.0', gitHead: 'b'.repeat(40)};
    assert.equal(documentationSource(config, oldRelease).version, oldRelease.version);
    assert.equal(documentationSource(config, newRelease).archiveUrl, `${config.archiveBaseUrl}/${newRelease.gitHead}`);
    assert.throws(() => documentationSource(config, {version: '81.0.0'}), /gitHead/u);
  });
  await test('entry point prefers pnpm, preserves registry routes, and never retries failed installers', {skip: process.platform === 'win32'}, async () => {
    const bin = path.join(root, 'installer-bin');
    const log = path.join(root, 'installer-calls.jsonl');
    await mkdir(bin);
    const shim = path.join(bin, 'package-manager.mjs');
    await writeFile(shim, `import {appendFileSync} from 'node:fs';
const [manager, ...args] = process.argv.slice(2);
appendFileSync(process.env.INSTALLER_LOG, JSON.stringify({manager, args}) + '\\n');
if (args[0] === '--version') {
  if (process.env.FAIL_PNPM_PROBE) process.exit(43);
  console.log('11.0.0');
} else if (args[0] === 'view') {
  console.log(JSON.stringify(args.includes('gitHead') ? 'a'.repeat(40) : ['1.0.0']));
} else if (args[0] === 'config') {
  console.log(JSON.stringify({registry: 'https://registry.example.invalid/', '@typescript-eslint:registry': 'https://scoped.example.invalid/'}));
} else {
  process.exit(manager === 'pnpm' ? 42 : 41);
}
`);
    const wrapper = manager => `#!/bin/sh\nexec "${process.execPath}" "${shim}" ${manager} "$@"\n`;
    for (const manager of ['npm', 'pnpm']) {
      await writeFile(path.join(bin, manager), wrapper(manager));
      await chmod(path.join(bin, manager), 0o755);
    }
    await symlink(process.execPath, path.join(bin, 'node'));
    const environment = {...process.env, PATH: bin, INSTALLER_LOG: log, UNICORN_LINT_CACHE: path.join(root, 'installer-cache')};
    const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const preferred = execute(['--', 'sample.ts'], environment);
    assert.equal(preferred.status, 2);
    assert.match(preferred.stderr, /Installing isolated dependencies with pnpm/u);
    const preferredCalls = await calls();
    const install = preferredCalls.find(call => call.manager === 'pnpm' && call.args.includes('add'));
    assert.ok(install);
    assert.ok(install.args.includes('--registry=https://registry.example.invalid/'));
    assert.ok(install.args.includes('--@typescript-eslint:registry=https://scoped.example.invalid/'));
    assert.ok(install.args.includes('--ignore-scripts'));
    assert.ok(install.args.includes('--ignore-pnpmfile'));
    assert.ok(install.args.includes('--ignore-workspace'));
    assert.ok(install.args.includes('--prefer-offline'));
    assert.ok(!preferredCalls.some(call => call.manager === 'npm' && call.args.includes('install')));
    const failedRuntime = path.join(environment.UNICORN_LINT_CACHE, 'runtimes');
    for (const name of await readdir(failedRuntime)) assert.ok(!(await readdir(path.join(failedRuntime, name))).includes('.install-lock'));
    await writeFile(log, '');
    const failedProbe = execute(['--', 'sample.js'], {...environment, FAIL_PNPM_PROBE: '1'});
    assert.equal(failedProbe.status, 2);
    assert.ok(!(await calls()).some(call => call.args.includes('install') || call.args.includes('add')));
    await rm(path.join(bin, 'pnpm'));
    await writeFile(log, '');
    const fallback = execute(['--', 'sample.js'], environment);
    assert.equal(fallback.status, 2);
    assert.match(fallback.stderr, /Installing isolated dependencies with npm/u);
    const fallbackInstall = (await calls()).find(call => call.manager === 'npm' && call.args.includes('install'));
    assert.ok(fallbackInstall.args.includes('--ignore-scripts'));
    await writeFile(log, '');
    const offline = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(offline.status, 2);
    assert.deepEqual(await calls(), []);
  });
  await test('documentation staging is disposed on publication and failure, and oversized streams are cancelled', async context => {
    await using temporary = await mkdtempDisposable(path.join(root, 'documentation-test-'));
    const runtime = temporary.path;
    const packageDirectory = path.join(runtime, 'node_modules', 'eslint-plugin-unicorn');
    await mkdir(packageDirectory, {recursive: true});
    await writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify({version: '1.0.0'}));
    await writeFile(path.join(runtime, 'runtime-loader.mjs'), `import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
export default function importDependency() {
  return {async x({cwd}) {
    await mkdir(path.join(cwd, 'docs', 'rules'), {recursive: true});
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({name: 'eslint-plugin-unicorn', version: '1.0.0'}));
    await writeFile(path.join(cwd, 'readme.md'), '# Fixture documentation\\n');
    await writeFile(path.join(cwd, 'docs', 'rules', 'prefer-includes.md'), '# Fixture rule\\n');
  }};
}
`);
    const source = {package: 'eslint-plugin-unicorn', version: '1.0.0', commit: 'a'.repeat(40), archiveUrl: 'https://documentation.example.invalid/fixture'};
    const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response('Fixture archive'));
    const published = await prepareDocumentation(runtime, source);
    assert.equal(await documentationReady(runtime, source), true);
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('documentation-')));
    await assert.rejects(prepareDocumentation(runtime, {...source, commit: 'b'.repeat(40), version: '2.0.0'}), /Plugin and documentation versions differ/u);
    await writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify({version: '2.0.0'}));
    await assert.rejects(prepareDocumentation(runtime, {...source, commit: 'b'.repeat(40), version: '2.0.0'}), /archive does not match/u);
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('documentation-')));
    assert.equal(await readFile(published.readme, 'utf8'), '# Fixture documentation\n');
    let cancelled = false;
    fetchMock.mock.mockImplementation(async () => new Response(new ReadableStream({
      start(controller) {controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));},
      cancel() {cancelled = true;},
    })));
    await assert.rejects(prepareDocumentation(runtime, {...source, commit: 'b'.repeat(40), version: '2.0.0'}), /exceeds 16 MiB/u);
    assert.equal(cancelled, true);
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('documentation-')));
  });
  await test('cold JavaScript installation needs no optional language packages and is reused offline', async () => {
    const coldCache = path.join(root, 'cold-cache');
    const environment = {...process.env, UNICORN_LINT_CACHE: coldCache};
    const first = execute(['--', 'sample.js'], environment);
    assert.equal(first.status, 1, first.stderr);
    assert.match(first.stderr, /Installing isolated dependencies/u);
    const hasPnpm = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], {encoding: 'utf8'}).status === 0;
    if (hasPnpm) assert.match(first.stderr, /Installing isolated dependencies with pnpm/u);
    const runtimes = await readdir(path.join(coldCache, 'runtimes'));
    if (hasPnpm) assert.ok((await readdir(path.join(coldCache, 'runtimes', runtimes[0]))).includes('pnpm-lock.yaml'));
    const installed = JSON.parse(await readFile(path.join(coldCache, 'runtimes', runtimes[0], 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(installed.dependencies).toSorted((left, right) => left.localeCompare(right)), ['@eslint/js', 'diff', 'eslint', 'eslint-plugin-unicorn', 'globals', 'tar']);
    const next = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(next.status, 1, next.stderr);
    assert.ok(!next.stderr.includes('Installing isolated dependencies'));
    const runtime = path.join(coldCache, 'runtimes', runtimes[0]);
    const loaderFile = path.join(runtime, 'runtime-loader.mjs');
    const loaderSource = await readFile(new URL('runtime-loader.mjs', import.meta.url), 'utf8');
    assert.equal(await readFile(loaderFile, 'utf8'), loaderSource);
    await writeFile(loaderFile, 'throw new Error("Corrupt loader must not execute");\n');
    const invalidLoader = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(invalidLoader.status, 1, invalidLoader.stderr);
    assert.ok(!invalidLoader.stderr.includes('Corrupt loader must not execute'));
    assert.ok(!invalidLoader.stderr.includes('Installing isolated dependencies'));
    assert.equal(await readFile(loaderFile, 'utf8'), loaderSource);
    await rm(loaderFile);
    const missingLoader = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(missingLoader.status, 1, missingLoader.stderr);
    assert.equal(await readFile(loaderFile, 'utf8'), loaderSource);
    assert.ok(!missingLoader.stderr.includes('Installing isolated dependencies'));
    // Replace only disposable fixture dependencies with dual entry points whose require branch fails.
    const replacements = {
      diff: 'export default {marker: "default"};\nexport function diffLines(source) { return [{value: source, count: source.split("\\n").length - 1}]; }\n',
      '@eslint/js': 'export default {configs: {recommended: {rules: {"no-debugger": "error"}}}};\n',
    };
    await writeFile(path.join(fixture, 'dual-entry.js'), 'export function debug() { debugger; }\n');
    try {
      for (const [name, source] of Object.entries(replacements)) {
        const directory = path.join(runtime, 'node_modules', name);
        await rename(directory, `${directory}-original`);
        await mkdir(directory);
        await writeFile(path.join(directory, 'package.json'), JSON.stringify({name, version: installed.dependencies[name],
          type: 'module', exports: {import: './index.mjs', require: './index.cjs'}}));
        await writeFile(path.join(directory, 'index.mjs'), source);
        await writeFile(path.join(directory, 'index.cjs'), 'throw new Error("Require branch must not load");\n');
      }
      const dualSnapshot = path.join(root, 'dual-entry-before');
      const snapshot = execute(['--snapshot', dualSnapshot, '--', 'dual-entry.js'], environment);
      assert.equal(snapshot.status, 0, snapshot.stderr);
      const dualEntry = execute(['--no-install', '--baseline', dualSnapshot, '--', 'dual-entry.js'], environment);
      assert.equal(dualEntry.status, 0, dualEntry.stderr);
      assert.ok(JSON.parse(dualEntry.stdout).files[0].messages.some(message => message.ruleId === 'no-debugger'));
      const probe = path.join(fixture, 'loader-probe.mjs');
      await writeFile(probe, `import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const loader = await import(pathToFileURL(process.argv[2]).href);
assert.deepEqual(Object.keys(loader), ['default']);
const module = await loader.default('diff');
assert.equal(module.default.marker, 'default');
assert.equal(typeof module.diffLines, 'function');
`);
      try {
        const preserved = spawnSync(process.execPath, [probe, loaderFile], {encoding: 'utf8', shell: false});
        assert.equal(preserved.status, 0, preserved.stderr);
      } finally {await rm(probe);}
    } finally {
      for (const name of Object.keys(replacements)) {
        const directory = path.join(runtime, 'node_modules', name);
        await rm(directory, {recursive: true});
        await rename(`${directory}-original`, directory);
      }
      await rm(path.join(fixture, 'dual-entry.js'));
    }
    const ts = execute(['--', 'sample.ts'], environment);
    assert.equal(ts.status, 1, ts.stderr);
    assert.match(ts.stderr, /typescript-eslint/u);
    const tsOffline = execute(['--no-install', '--', 'sample.ts'], environment);
    assert.equal(tsOffline.status, 1, tsOffline.stderr);
    assert.ok(!tsOffline.stderr.includes('Installing isolated dependencies'));
    const extended = JSON.parse(await readFile(path.join(coldCache, 'runtimes', runtimes[0], 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(extended.dependencies).toSorted((left, right) => left.localeCompare(right)), ['@eslint/js', 'diff', 'eslint', 'eslint-plugin-unicorn', 'globals', 'tar', 'typescript', 'typescript-eslint']);
    assert.match(extended.dependencies.typescript, /^6\./u);
    const resolutionFile = path.join(coldCache, 'runtimes', runtimes[0], 'resolved-dependencies.json');
    const resolved = JSON.parse(await readFile(resolutionFile, 'utf8'));
    const manifest = JSON.parse(await readFile(new URL('../assets/dependencies.json', import.meta.url), 'utf8'));
    const documentConfig = JSON.parse(await readFile(new URL('../assets/documentation.json', import.meta.url), 'utf8'));
    await Promise.all(Array.from({length: 6}, () => prepareRuntime(runtime, {...manifest.core, ...manifest.javascript}, documentConfig, true)));
    assert.equal(await readFile(loaderFile, 'utf8'), loaderSource);
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('.loader-')));
    await rm(loaderFile);
    await mkdir(loaderFile);
    try {
      const failedCopy = execute(['--no-install', '--', 'sample.js'], environment);
      assert.equal(failedCopy.status, 2);
      assert.ok((await readdir(runtime)).every(name => !name.startsWith('.loader-')));
    } finally {await rm(loaderFile, {recursive: true});}
    const recoveredCopy = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(recoveredCopy.status, 1, recoveredCopy.stderr);
    assert.equal(await readFile(loaderFile, 'utf8'), loaderSource);
    assert.equal(resolved.typescript.spec, '^6.0.3');
    assert.equal(resolved.eslint.spec, '*');
    resolved.eslint.spec = 'stale-tag';
    await writeFile(resolutionFile, JSON.stringify(resolved));
    assert.equal(execute(['--no-install', '--', 'sample.js'], environment).status, 2);
    const refresh = execute(['--', 'sample.js'], environment);
    assert.equal(refresh.status, 1, refresh.stderr);
    assert.equal(JSON.parse(await readFile(resolutionFile, 'utf8')).eslint.spec, '*');
    const firstOutput = JSON.parse(first.stdout);
    const documentationRoot = path.dirname(firstOutput.repair.documentationPath);
    const metadata = JSON.parse(await readFile(path.join(documentationRoot, 'manifest.json'), 'utf8'));
    assert.match(metadata.commit, /^[a-f\d]{40}$/u);
    assert.equal(metadata.commit, JSON.parse(await readFile(resolutionFile, 'utf8'))['eslint-plugin-unicorn'].gitHead);
    assert.equal(metadata.version, installed.dependencies['eslint-plugin-unicorn']);
    assert.ok(Object.keys(metadata.files).length > 300);
    const firstMessages = firstOutput.files[0].messages;
    for (const message of firstMessages) {
      assert.ok(path.isAbsolute(message.documentationPath));
      const documentation = await readFile(message.documentationPath, 'utf8');
      assert.ok(documentation.length > 0);
    }
    assert.ok(!next.stderr.includes('Preparing eslint-plugin-unicorn'));
    const rulePath = firstOutput.files[0].messages[0].documentationPath;
    await writeFile(rulePath, 'Corrupted documentation');
    const corrupted = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(corrupted.status, 2);
    assert.match(corrupted.stderr, /documentation is missing or invalid/u);
    const repaired = execute(['--', 'sample.js'], environment);
    assert.equal(repaired.status, 1, repaired.stderr);
    assert.notEqual(await readFile(rulePath, 'utf8'), 'Corrupted documentation');
    assert.ok(!repaired.stderr.includes('Installing isolated dependencies'));
    await rm(rulePath);
    const missingDocument = execute(['--no-install', '--', 'sample.js'], environment);
    assert.equal(missingDocument.status, 2);
    assert.match(missingDocument.stderr, /documentation is missing or invalid/u);
  });
  await test('all supported extensions parse and run the selected Unicorn presets', async () => {
    const output = resultOf(['--', ...Object.keys(files)], 1);
    assert.ok(output.baseline === null);
    assert.ok(output.files.every(report => report.messages.every(message => message.status === 'unknown')));
    assert.equal(output.files.length, Object.keys(files).length);
    assert.equal(output.profiles.length, 9);
    for (const report of output.files) {
      assert.ok(report.messages.every(message => !message.fatal), JSON.stringify(report));
      assert.ok(report.messages.every(message => typeof message.ruleId === 'string'), JSON.stringify(report));
      for (const message of report.messages) {
        assert.equal(typeof message.documentationUrl, 'string');
        if (message.ruleId.startsWith('unicorn/')) {
          assert.equal(typeof message.documentationPath, 'string');
          const documentation = await readFile(message.documentationPath, 'utf8');
          assert.ok(documentation.length > 0);
        }
      }
      const extension = path.extname(report.filePath);
      if (['.css', '.html', '.json', '.jsonc', '.json5', '.md', '.toml', '.yaml', '.yml'].includes(extension)) {
        const namespace = {'.css': 'css/', '.json': 'json/', '.jsonc': 'json/', '.json5': 'json/',
          '.md': 'markdown/', '.toml': 'toml/', '.yaml': 'yml/', '.yml': 'yml/'}[extension];
        assert.ok(report.messages.every(message => message.ruleId.startsWith('unicorn/') || namespace && message.ruleId.startsWith(namespace)), JSON.stringify(report));
        assert.ok(report.messages.some(message => message.ruleId === 'unicorn/prefer-https'), JSON.stringify(report));
      }
    }
  });
  await test('non-script recommended presets cover every rule and preserve profiles and dialects', async () => {
    const cases = [
      {name: 'recommended.css', source: 'a { unknown-property: 1; }\n', rule: 'css/no-invalid-properties', namespace: 'css/'},
      {name: 'recommended.json', source: '{"value":1,"value":2}\n', rule: 'json/no-duplicate-keys', namespace: 'json/'},
      {name: 'recommended.jsonc', source: '// Comment\n{"value":1,"value":2,}\n', rule: 'json/no-duplicate-keys', namespace: 'json/'},
      {name: 'recommended.json5', source: '{value:1,value:2,}\n', rule: 'json/no-duplicate-keys', namespace: 'json/'},
      {name: 'recommended.md', source: '# Document\n\n| Link |\n| --- |\n| []() |\n\n[Link][missing]\n\n```ts\nexport const = ;\n```\n', rule: 'markdown/no-empty-links', namespace: 'markdown/'},
      {name: 'recommended.toml', source: 'value = 9223372036854775808\n', rule: 'toml/precision-of-integer', namespace: 'toml/'},
      {name: 'recommended.yaml', source: 'value:\n', rule: 'yml/no-empty-mapping-value', namespace: 'yml/'},
      {name: 'recommended.yml', source: 'value:\n', rule: 'yml/no-empty-mapping-value', namespace: 'yml/'},
    ];
    const probe = path.join(root, 'recommended-probe.mjs');
    try {
      for (const {name, source} of cases) await writeFile(path.join(fixture, name), source);
      const output = resultOf(['--no-install', '--', ...cases.map(item => item.name)], 1);
      for (const {name, rule, namespace, source} of cases) {
        const report = output.files.find(file => path.basename(file.filePath) === name);
        assert.ok(report.messages.some(message => message.ruleId === rule), JSON.stringify(report));
        assert.ok(report.messages.every(message => !message.fatal && (message.ruleId.startsWith(namespace) || message.ruleId.startsWith('unicorn/'))), JSON.stringify(report));
        for (const message of report.messages) assert.equal(typeof message.documentationUrl, 'string');
        if (name.endsWith('.md')) assert.ok(report.messages.some(message => message.ruleId === 'markdown/no-missing-label-refs'), name);
        assert.equal(await readFile(path.join(fixture, name), 'utf8'), source);
        // A single-language invocation must behave like the same file in a mixed batch.
        const separate = resultOf(['--no-install', '--', name], 1);
        assert.deepEqual(separate.files[0].messages, report.messages, name);
      }
      const runtime = path.dirname(path.dirname(output.repair.documentationPath));
      await writeFile(probe, `import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [runtime, skill, cwd] = process.argv.slice(2);
const {default: load} = await import(pathToFileURL(path.join(runtime, 'runtime-loader.mjs')));
const {ESLint} = await load('eslint');
const {defineConfig} = await load('eslint/config');
const eslint = new ESLint({cwd, overrideConfigFile: path.join(skill, 'assets', 'eslint.config.mjs')});
const checks = [
  ['@eslint/css', ['recommended.css'], 'css'],
  ['@eslint/json', ['recommended.json', 'recommended.jsonc', 'recommended.json5'], undefined],
  ['@eslint/markdown', ['recommended.md'], 'gfm'],
  ['eslint-plugin-toml', ['recommended.toml'], 'toml'],
  ['eslint-plugin-yml', ['recommended.yaml', 'recommended.yml'], 'yaml'],
];
for (const [name, files, language] of checks) {
  const {default: plugin} = await load(name);
  const rules = Object.assign({}, ...[plugin.configs.recommended].flat().map(block => block.rules));
  for (const file of files) {
    const config = await eslint.calculateConfigForFile(path.join(cwd, file));
    const key = language ?? path.extname(file).slice(1);
    const namespace = {css: 'css', json: 'json', jsonc: 'json', json5: 'json', gfm: 'markdown', toml: 'toml', yaml: 'yml'}[key];
    const official = new ESLint({cwd, overrideConfigFile: true, overrideConfig: defineConfig({
      files: [file], extends: [plugin.configs.recommended],
      plugins: {[namespace]: plugin}, language: namespace + '/' + key,
    })});
    const expected = await official.calculateConfigForFile(path.join(cwd, file));
    for (const rule of Object.keys(rules)) {
      // ESLint normalizes severity and merges rule default options into the effective settings.
      assert.deepEqual(config.rules[rule], expected.rules[rule], file + ': ' + rule);
    }
    assert.equal(config.language, plugin.languages[key], file);
    assert.equal(config.processor, undefined, file);
  }
}
const ts = await load('typescript-eslint');
const compatibilityRules = Object.assign({}, ...ts.configs.strict.map(block => block.files ? block.rules : {}));
const reference = new ESLint({cwd, overrideConfigFile: true, overrideConfig: defineConfig({files: ['**/*.ts'], extends: [ts.configs.strict]})});
const expectedTs = await reference.calculateConfigForFile(path.join(cwd, 'sample.ts'));
for (const file of ['sample.ts', 'sample.cts', 'sample.mts', 'sample.tsx', 'sample.ctsx', 'sample.mtsx', 'sample.vue']) {
  const config = await eslint.calculateConfigForFile(path.join(cwd, file));
  for (const rule of Object.keys(compatibilityRules)) assert.deepEqual(config.rules[rule], expectedTs.rules[rule], file + ': ' + rule);
}
const namespaces = ['css/', 'json/', 'markdown/', 'toml/', 'yml/'];
for (const file of ['sample.js', 'sample.ts', 'sample.vue', 'sample.html']) {
  const config = await eslint.calculateConfigForFile(path.join(cwd, file));
  assert.ok(Object.keys(config.rules).every(rule => namespaces.every(namespace => !rule.startsWith(namespace))), file);
}
`);
      const configuration = spawnSync(process.execPath, [probe, runtime, fileURLToPath(new URL('..', import.meta.url)), fixture], {
        encoding: 'utf8', shell: false, timeout: 30_000, env: {...process.env, UNICORN_LINT_RUNTIME: runtime,
          UNICORN_LINT_PROFILES: JSON.stringify(['javascript', 'typescript', 'vue', 'html', ...output.profiles])},
      });
      assert.equal(configuration.status, 0, configuration.stderr);
      const text = execute(['--no-install', '--format', 'text', '--', 'recommended.yaml']);
      assert.equal(text.status, 1);
      assert.match(text.stdout, /Rule documentation: https:/u);
      const snapshot = path.join(root, 'recommended-before');
      resultOf(['--snapshot', snapshot, '--', 'recommended.yaml'], 0);
      const compared = resultOf(['--no-install', '--baseline', snapshot, '--', 'recommended.yaml'], 0);
      assert.ok(compared.files[0].messages.some(message => message.ruleId === 'yml/no-empty-mapping-value' && message.status === 'existing'));
    } finally {
      for (const {name} of cases) await rm(path.join(fixture, name), {force: true});
      await rm(probe, {force: true});
    }
  });
  await test('script presets report core and strict findings without type services or non-script leakage', async () => {
    const source = 'export function check(value: any) { return value!; }\n'
      + 'export function remove(container: Record<string, unknown>, key: string) { delete container[key]; }\n';
    const sources = {
      'core-check.js': 'export function read() { return missingValue; }\n',
      'core-check.jsx': 'export const view = <div>{missingValue}</div>;\n',
      'strict-check.ts': source,
      'strict-check.ctsx': source,
      'strict-check.mtsx': source,
      'strict-check.vue': `<script setup lang="ts">\n${source}</script>\n<template><div /></template>\n`,
      'strict-check-js.vue': '<script>\nconst unusedValue = 1;\n</script>\n<template><div /></template>\n',
      'strict-check.json': '{"value":1}\n',
      'strict-check.md': '# Checked document\n',
    };
    await writeFile(path.join(fixture, 'tsconfig.json'), 'Invalid project config must not be read');
    try {
      for (const [name, content] of Object.entries(sources)) await writeFile(path.join(fixture, name), content);
      const output = resultOf(['--no-install', '--', ...Object.keys(sources)], 1);
      for (const report of output.files) {
        assert.ok(report.messages.every(message => !message.fatal), JSON.stringify(report));
        const name = path.basename(report.filePath);
        if (name.startsWith('core-check')) {
          assert.ok(report.messages.some(message => message.ruleId === 'no-undef'), name);
          assert.ok(report.messages.every(message => !message.ruleId.startsWith('@typescript-eslint/')), name);
        } else if (name === 'strict-check-js.vue') {
          assert.ok(report.messages.some(message => message.ruleId === '@typescript-eslint/no-unused-vars'), name);
        } else if (['.json', '.md'].includes(path.extname(name))) {
          assert.equal(report.messages.length, 0, name);
        } else {
          for (const rule of ['no-explicit-any', 'no-non-null-assertion', 'no-dynamic-delete']) {
            assert.ok(report.messages.some(message => message.ruleId === `@typescript-eslint/${rule}`), JSON.stringify(report));
          }
          assert.ok(report.messages.every(message => message.ruleId !== 'no-unused-vars'), name);
        }
        for (const message of report.messages) {
          assert.equal(typeof message.documentationUrl, 'string');
          if (!message.ruleId.startsWith('unicorn/')) assert.equal(message.documentationPath, undefined);
        }
      }
      assert.match(output.repair.nextStep, /independently decide.*worth fixing/u);
      const text = execute(['--no-install', '--format', 'text', '--', 'core-check.js']);
      assert.equal(text.status, 1);
      assert.match(text.stdout, /Rule documentation: https:/u);
      for (const [name, content] of Object.entries(sources)) assert.equal(await readFile(path.join(fixture, name), 'utf8'), content);
    } finally {
      for (const name of [...Object.keys(sources), 'tsconfig.json']) await rm(path.join(fixture, name));
    }
  });
  await test('filename casing is ignored across profiles while other recommended rules still run', async () => {
    const casingFiles = Object.entries(files).map(([name, source], index) => [`AuditFile${index}${path.extname(name)}`, source]);
    for (const [name, source] of casingFiles) await writeFile(path.join(fixture, name), source);
    for (const name of ['README.md', 'SKILL.md']) await writeFile(path.join(fixture, name), '# Documentation\n');
    try {
      const output = resultOf(['--no-install', '--', ...casingFiles.map(([name]) => name)], 1);
      assert.equal(output.profiles.length, 9);
      assert.ok(output.files.every(report => report.messages.every(message => message.ruleId !== 'unicorn/filename-case')));
      assert.ok(output.files.some(report => report.messages.some(message => message.ruleId === 'unicorn/prefer-https')));
      const documents = resultOf(['--no-install', '--', 'README.md', 'SKILL.md'], 0);
      assert.equal(documents.summary.total, 0);
    } finally {
      for (const name of [...casingFiles.map(([name]) => name), 'README.md', 'SKILL.md']) await rm(path.join(fixture, name));
    }
  });
  await test('framework naming conventions apply to every extension without disabling other replacements', async () => {
    const directory = path.join(fixture, 'naming');
    await mkdir(directory);
    const names = ['param', 'params', 'prev', 'prop', 'props', 'ref', 'refs',
      'routeParam', 'routeParams', 'prevState', 'someProp', 'someProps', 'someRef', 'someRefs',
      'Param', 'Params', 'Prev', 'Prop', 'Props', 'Ref', 'Refs'];
    const functionSource = `function audit(${names.join(', ')}) { return [${names.join(', ')}]; }\nconsole.log(audit);\n`;
    const namingSources = {
      '.vue': `<script setup>\n${functionSource}</script>\n<template><div /></template>\n`,
      '.css': `${names.map(name => `.${name}`).join(', ')} { color: red; }\n`,
      '.html': `<!doctype html><div class="${names.join(' ')}"></div>\n`,
      '.json': '{"value":1}\n',
      '.jsonc': '{"value":1}\n',
      '.json5': '{value:1}\n',
      '.md': '# Naming\n',
      '.toml': 'value = 1\n',
      '.yaml': 'value: 1\n',
      '.yml': 'value: 1\n',
    };
    const extensions = [...new Set(Object.keys(files).map(name => name.slice('sample'.length)))].filter(extension => extension.startsWith('.'));
    const allowedFiles = [];
    const rejectedFiles = [];
    try {
      for (const extension of extensions) {
        const source = namingSources[extension] ?? functionSource;
        for (const [index, name] of names.entries()) {
          const nameDirectory = path.join(directory, `case-${index}`);
          await mkdir(nameDirectory, {recursive: true});
          const file = path.join(nameDirectory, `${name}${extension}`);
          await writeFile(file, source);
          allowedFiles.push(file);
        }
        const rejected = path.join(directory, `err${extension}`);
        await writeFile(rejected, source);
        rejectedFiles.push(rejected);
      }
      const allowed = resultOf(['--no-install', '--', ...allowedFiles], 0);
      assert.equal(allowed.files.length, allowedFiles.length);
      assert.equal(allowed.profiles.length, 9);
      assert.equal(allowed.summary.total, 0);
      const rejected = resultOf(['--no-install', '--', ...rejectedFiles], 1);
      for (const report of rejected.files) {
        assert.ok(report.messages.some(message => message.ruleId === 'unicorn/name-replacements'), report.filePath);
      }
      const repaired = resultOf(['--fix', '--no-install', '--', ...allowedFiles], 0);
      assert.equal(repaired.repair.fixedFiles.length, 0);
    } finally {await rm(directory, {recursive: true});}
  });
  await test('intentional module-level state is allowed across JavaScript, TypeScript, and Vue scripts', async () => {
    const source = 'let sequence = 0;\nfunction next() { sequence++; return sequence; }\nconsole.log(next);\n';
    const stateFiles = ['module-state.js', 'module-state.cjs', 'module-state.mjs', 'module-state.jsx',
      'module-state.cjsx', 'module-state.mjsx', 'module-state.ts', 'module-state.cts', 'module-state.mts',
      'module-state.tsx', 'module-state.ctsx', 'module-state.mtsx', 'module-state.vue'];
    try {
      for (const name of stateFiles) {
        const content = name.endsWith('.vue') ? `<script setup lang="ts">\n${source}</script>\n<template><div /></template>\n` : source;
        await writeFile(path.join(fixture, name), content);
      }
      const checked = resultOf(['--no-install', '--', ...stateFiles], 0);
      assert.equal(checked.files.length, stateFiles.length);
      assert.equal(checked.summary.total, 0);
      const applied = resultOf(['--fix', '--no-install', '--', ...stateFiles], 0);
      assert.equal(applied.repair.fixedFiles.length, 0);
    } finally {for (const name of stateFiles) await rm(path.join(fixture, name));}
  });
  await test('framework receivers, explicit null values, and conventional documentation remain unchanged', async () => {
    const source = '/**\n * Creates a fresh callback.\n */\nfunction createCallback() { return value => value + 1; }\n'
      + 'const model = {value: null, read() { return this.value; }};\nconsole.log(model, createCallback);\n';
    const extensions = ['.js', '.cjs', '.mjs', '.jsx', '.cjsx', '.mjsx', '.ts', '.cts', '.mts', '.tsx', '.ctsx', '.mtsx'];
    const sources = Object.fromEntries(extensions.map(extension => [`framework-contract${extension}`, source]));
    Object.assign(sources, {
      'framework-contract.vue': `<script lang="ts">\n${source}</script>\n<template><div /></template>\n`,
      'framework-script-setup.vue': `<script setup lang="ts">\n${source}</script>\n<template><div /></template>\n`,
      'framework-script-js.vue': `<script>\n${source}</script>\n<template><div /></template>\n`,
      'documentation-contract.css': '/**\n * Keeps the conventional comment prefix.\n */\na { color: red; }\n',
      'documentation-contract.jsonc': '/**\n * Keeps the explicit protocol value.\n */\n{"value":null}\n',
      'documentation-contract.json5': '/**\n * Keeps the explicit protocol value.\n */\n{value:null}\n',
      'protocol-contract.json': '{"value":null}\n',
    });
    const names = Object.keys(sources);
    try {
      for (const [name, content] of Object.entries(sources)) await writeFile(path.join(fixture, name), content);
      const checked = resultOf(['--no-install', '--', ...names], 0);
      assert.equal(checked.files.length, names.length);
      assert.equal(checked.summary.total, 0);
      const applied = resultOf(['--fix', '--no-install', '--', ...names], 0);
      assert.equal(applied.repair.fixedFiles.length, 0);
      for (const [name, content] of Object.entries(sources)) assert.equal(await readFile(path.join(fixture, name), 'utf8'), content);
    } finally {for (const name of names) await rm(path.join(fixture, name));}
  });
  await test('function scoping skips arrows but still reports movable ordinary functions', async () => {
    const arrow = 'function createCallback() { return value => value + 1; }\n';
    const ordinary = 'function createCallback() { function increment(value) { return value + 1; } return increment; }\n';
    const sources = {
      'scoping-arrow.js': arrow,
      'scoping-arrow.ts': arrow,
      'scoping-arrow.vue': `<script setup lang="ts">\n${arrow}</script>\n<template><div /></template>\n`,
      'scoping-function.js': ordinary,
      'scoping-function.ts': ordinary,
      'scoping-function.vue': `<script setup lang="ts">\n${ordinary}</script>\n<template><div /></template>\n`,
    };
    const names = Object.keys(sources);
    try {
      for (const [name, content] of Object.entries(sources)) await writeFile(path.join(fixture, name), content);
      const output = resultOf(['--no-install', '--', ...names], 1);
      for (const report of output.files) {
        assert.ok(report.messages.every(message => !message.fatal), report.filePath);
        const reported = report.messages.some(message => message.ruleId === 'unicorn/consistent-function-scoping');
        assert.equal(reported, path.basename(report.filePath).startsWith('scoping-function'), report.filePath);
      }
    } finally {for (const name of names) await rm(path.join(fixture, name));}
  });
  await test('project configuration and inline directives cannot change the audit', async () => {
    await writeFile(path.join(fixture, 'eslint.config.mjs'), 'throw new Error("Project config must not load");\n');
    await writeFile(path.join(fixture, 'isolated.js'), `/* eslint-disable */\n${code}`);
    const output = resultOf(['--no-install', '--', 'isolated.js'], 1);
    assert.ok(output.files[0].messages.some(message => message.ruleId === 'unicorn/prefer-includes'));
    assert.equal(await readFile(path.join(fixture, 'isolated.js'), 'utf8'), `/* eslint-disable */\n${code}`);
    const projectEntries = await readdir(fixture);
    assert.ok(!projectEntries.includes('node_modules'));
    const shadowDependencies = path.join(fixture, 'node_modules');
    for (const name of ['diff', '@eslint/js', 'eslint-plugin-unicorn']) {
      const directory = path.join(shadowDependencies, name);
      await mkdir(directory, {recursive: true});
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({name, type: 'module', exports: './index.mjs'}));
      await writeFile(path.join(directory, 'index.mjs'), 'throw new Error("Project dependency must not load");\n');
    }
    try {
      resultOf(['--no-install', '--', 'isolated.js'], 1);
    } finally {await rm(shadowDependencies, {recursive: true});}
    assert.ok(!projectEntries.includes('.eslintcache'));
    await writeFile(path.join(fixture, '.eslintcache'), 'Preserve the project cache');
    resultOf(['--no-install', '--no-cache', '--', 'isolated.js'], 1);
    assert.equal(await readFile(path.join(fixture, '.eslintcache'), 'utf8'), 'Preserve the project cache');
    await writeFile(path.join(fixture, '\u{4E2D}\u{6587} name.js'), code);
    const unicode = resultOf(['--no-install', '--', '\u{4E2D}\u{6587} name.js'], 1);
    assert.equal(unicode.files.length, 1);
    await rm(path.join(fixture, '\u{4E2D}\u{6587} name.js'));
  });
  await test('offline missing dependencies and unmatched inputs fail explicitly', async () => {
    const offline = execute(['--no-install', '--', 'sample.js'],
      {...process.env, UNICORN_LINT_CACHE: path.join(root, 'empty-cache')});
    assert.equal(offline.status, 2);
    assert.match(offline.stderr, /dependencies are missing/u);
    assert.equal(execute(['--', 'missing*.ts']).status, 2);
    await mkdir(path.join(fixture, 'node_modules'));
    await writeFile(path.join(fixture, 'node_modules', 'ignored.js'), code);
    assert.equal(execute(['--no-install', '--', 'node_modules/ignored.js']).status, 2);
    await rm(path.join(fixture, 'node_modules'), {recursive: true});
    assert.equal(execute([]).status, 2);
  });
  await test('directory and quoted glob enumeration, worker CLI and cache reuse', () => {
    const output = resultOf(['--no-install', '--concurrency', '2', '--', '*.ts'], 1);
    assert.equal(output.files.length, 2);
    const again = resultOf(['--no-install', '--', 'sample.js'], 1);
    assert.equal(again.files.length, 1);
    const directory = resultOf(['--no-install', '--', fixture], 1);
    assert.ok(directory.files.some(report => report.filePath.endsWith('sample.ctsx')));
  });
  await test('parse errors are visible and return exit two', async () => {
    await writeFile(path.join(fixture, 'invalid.ts'), 'export const = ;\n');
    const output = resultOf(['--no-install', '--', 'invalid.ts'], 2);
    assert.ok(output.files[0].messages.some(message => message.fatal && message.status === 'unknown'));
    await rm(path.join(fixture, 'invalid.ts'));
  });
  await test('baseline directories are disposed on successful comparison and setup failure', async () => {
    const snapshot = path.join(root, 'cleanup-before');
    resultOf(['--snapshot', snapshot, '--', 'sample.js'], 0);
    const compared = resultOf(['--baseline', snapshot, '--no-install', '--', 'sample.js'], 0);
    const runtime = path.dirname(path.dirname(compared.repair.documentationPath));
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('baseline-')));
    const file = path.join(snapshot, 'snapshot.json');
    const metadata = JSON.parse(await readFile(file, 'utf8'));
    metadata.entries[path.join(fixture, 'sample.js')] = '../invalid.js';
    await writeFile(file, JSON.stringify(metadata));
    const failed = execute(['--baseline', snapshot, '--no-install', '--', 'sample.js']);
    assert.equal(failed.status, 2);
    assert.match(failed.stderr, /Invalid snapshot entry/u);
    assert.ok((await readdir(runtime)).every(name => !name.startsWith('baseline-')));
  });
  await test('snapshot comparison distinguishes existing, new, missing, and ambiguous content', async () => {
    const snapshot = path.join(root, 'before');
    resultOf(['--snapshot', snapshot, '--', 'sample.js'], 0);
    assert.equal(execute(['--snapshot', snapshot, '--', 'sample.js']).status, 2);
    const unchanged = resultOf(['--baseline', snapshot, '--no-install', '--', 'sample.js'], 0);
    assert.ok(unchanged.summary.existing > 0);
    assert.equal(unchanged.summary.new, 0);
    await writeFile(path.join(fixture, 'sample.js'), `// Added comment\n${code}export function added(value) { return value.substring(1); }\n`);
    const changed = resultOf(['--baseline', snapshot, '--no-install', '--', 'sample.js'], 1);
    assert.ok(changed.summary.existing > 0);
    assert.ok(changed.files[0].messages.some(message => message.ruleId === 'unicorn/prefer-string-slice' && message.status === 'new'));
    const missing = resultOf(['--baseline', snapshot, '--no-install', '--', 'sample.mjs'], 1);
    assert.ok(missing.files[0].messages.every(message => message.status === 'unknown'));
    await writeFile(path.join(fixture, 'sample.js'), code);
    await writeFile(path.join(fixture, 'broken-before.js'), 'export const = ;\n');
    const brokenSnapshot = path.join(root, 'broken-before');
    resultOf(['--snapshot', brokenSnapshot, '--', 'broken-before.js'], 0);
    await writeFile(path.join(fixture, 'broken-before.js'), 'export const value = 1;\n');
    const broken = resultOf(['--baseline', brokenSnapshot, '--no-install', '--', 'broken-before.js'], 2);
    assert.ok(broken.files[0].baselineErrors.some(message => message.fatal));
    const blocked = resultOf(['--baseline', brokenSnapshot, '--fix', '--no-install', '--', 'broken-before.js'], 2);
    assert.equal(blocked.repair.blocked, true);
    assert.equal(await readFile(path.join(fixture, 'broken-before.js'), 'utf8'), 'export const value = 1;\n');
    await rm(path.join(fixture, 'broken-before.js'));
  });
  await test('autofix preview is read-only, applies through ESLint, and preserves the snapshot', async () => {
    const name = 'repair.md';
    const source = '[Example](http://example.com)\n';
    const snapshot = path.join(root, 'repair-before');
    await writeFile(path.join(fixture, name), source);
    try {
      resultOf(['--snapshot', snapshot, '--', name], 0);
      const preview = resultOf(['--baseline', snapshot, '--fix', '--dry-run', '--no-install', '--', name], 0);
      assert.equal(preview.repair.mode, 'preview');
      assert.equal(preview.files[0].output, '[Example](https://example.com)\n');
      assert.equal(await readFile(path.join(fixture, name), 'utf8'), source);
      const reversed = resultOf(['--baseline', snapshot, '--dry-run', '--fix', '--no-install', '--', name], 0);
      assert.equal(reversed.repair.mode, 'preview');
      assert.equal(reversed.files[0].output, preview.files[0].output);
      assert.equal(await readFile(path.join(fixture, name), 'utf8'), source);
      const applied = resultOf(['--baseline', snapshot, '--fix', '--no-install', '--', name], 0);
      assert.equal(applied.repair.mode, 'applied');
      assert.deepEqual(applied.repair.fixedFiles, [path.join(fixture, name)]);
      assert.equal(await readFile(path.join(fixture, name), 'utf8'), preview.files[0].output);
      const metadata = JSON.parse(await readFile(path.join(snapshot, 'snapshot.json'), 'utf8'));
      const snapshotEntry = metadata.entries[path.join(fixture, name)];
      assert.equal(await readFile(path.join(snapshot, snapshotEntry), 'utf8'), source);
      const rechecked = resultOf(['--baseline', snapshot, '--no-install', '--', name], 0);
      assert.equal(rechecked.summary.total, 0);
      const second = resultOf(['--fix', '--no-install', '--', name], 0);
      assert.equal(second.repair.fixedFiles.length, 0);
    } finally {await rm(path.join(fixture, name));}
  });
  await test('suggestions remain available after autofix in JSON and text for AI repair', async () => {
    const name = 'suggestion.cjs';
    const source = 'module.exports = value => value.indexOf("x") !== -1;\n';
    await writeFile(path.join(fixture, name), source);
    try {
      const initial = resultOf(['--no-install', '--', name], 1);
      assert.ok(initial.repair.autoFixable > 0);
      assert.ok(initial.repair.suggestionCount > 0);
      const after = resultOf(['--fix', '--no-install', '--', name], 1);
      assert.ok(after.repair.suggestionCount > 0);
      assert.match(await readFile(path.join(fixture, name), 'utf8'), /\.includes\(/u);
      const text = execute(['--format', 'text', '--no-install', '--', name]);
      assert.equal(text.status, 1);
      assert.match(text.stdout, /Suggestion 1 \(review before applying\)/u);
      assert.match(text.stdout, /Edit: .*range/u);
      assert.match(text.stdout, /Rule documentation: .*\.md/u);
      const finding = after.files[0].messages.find(message => message.ruleId === 'unicorn/no-anonymous-default-export');
      const suggestion = finding.suggestions[0];
      assert.equal(typeof suggestion.desc, 'string');
      const current = await readFile(path.join(fixture, name), 'utf8');
      const {range, text: replacement} = suggestion.fix;
      await writeFile(path.join(fixture, name), current.slice(0, range[0]) + replacement + current.slice(range[1]));
      const recheck = execute(['--no-install', '--', name]);
      assert.ok([0, 1].includes(recheck.status), recheck.stderr);
      assert.ok(JSON.parse(recheck.stdout).files[0].messages.every(message => message.ruleId !== finding.ruleId));
    } finally {await rm(path.join(fixture, name));}
  });
  await test('autofix covers every selected language profile without touching unselected files', async () => {
    const repairFiles = Object.entries(files).map(([name, source], index) => [`repair-${index}${path.extname(name)}`, source]);
    for (const [name, source] of repairFiles) await writeFile(path.join(fixture, name), source);
    try {
      const applied = resultOf(['--fix', '--no-install', '--', ...repairFiles.map(([name]) => name)], 1);
      assert.equal(applied.profiles.length, 9);
      assert.ok(applied.repair.fixedFiles.length > 0);
      for (const [name, source] of repairFiles) {
        const content = await readFile(path.join(fixture, name), 'utf8');
        if (source.includes('http://example.com')) assert.ok(!content.includes('http://example.com'), name);
        const report = applied.files.find(file => file.filePath.endsWith(name));
        assert.ok(report.messages.every(message => !message.fatal), name);
      }
      for (const [name, source] of Object.entries(files)) assert.equal(await readFile(path.join(fixture, name), 'utf8'), source);
    } finally {for (const [name] of repairFiles) await rm(path.join(fixture, name));}
  });
  await test('fix modes reject conflicting options and block all writes on parsing failures', async () => {
    await writeFile(path.join(fixture, 'broken-repair.ts'), 'export const = ;\n');
    await writeFile(path.join(fixture, 'blocked-repair.md'), '[Example](http://example.com)\n');
    try {
      const dryRunOnly = execute(['--dry-run', '--', 'sample.js']);
      assert.equal(dryRunOnly.status, 2);
      assert.match(dryRunOnly.stderr, /--dry-run requires --fix/u);
      assert.equal(execute(['--fix-dry-run', '--', 'sample.js']).status, 2);
      assert.equal(execute(['--snapshot', path.join(root, 'invalid-snapshot'), '--fix', '--', 'sample.js']).status, 2);
      const blocked = resultOf(['--fix', '--no-install', '--', 'broken-repair.ts', 'blocked-repair.md'], 2);
      assert.equal(blocked.repair.blocked, true);
      assert.equal(blocked.repair.fixedFiles.length, 0);
      assert.equal(await readFile(path.join(fixture, 'blocked-repair.md'), 'utf8'), '[Example](http://example.com)\n');
    } finally {
      await rm(path.join(fixture, 'broken-repair.ts'));
      await rm(path.join(fixture, 'blocked-repair.md'));
    }
  });
  await test('Git comparison selects tracked changes, untracked additions and renames without changing the index', async () => {
    git('init', '--quiet');
    git('add', '--', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Baseline');
    const index = git('diff', '--cached', '--name-only');
    const unchanged = resultOf(['--base', 'HEAD', '--no-install', '--', 'sample.js'], 0);
    assert.ok(unchanged.summary.existing > 0);
    await writeFile(path.join(fixture, 'sample.js'), `${code}export function added(value) { return value.substring(1); }\n`);
    await writeFile(path.join(fixture, 'new-file.js'), code);
    await rename(path.join(fixture, 'sample.mjs'), path.join(fixture, 'renamed.mjs'));
    git('add', '--', 'sample.mjs', 'renamed.mjs');
    const staged = git('diff', '--cached', '--name-status');
    const output = resultOf(['--base', 'HEAD', '--changed', '--no-install'], 1);
    assert.equal(output.files.length, 3);
    const renamed = output.files.find(report => report.filePath.endsWith('renamed.mjs'));
    assert.ok(renamed.messages.some(message => message.status === 'existing'));
    const added = output.files.find(report => report.filePath.endsWith('new-file.js'));
    assert.ok(added.messages.every(message => message.status === 'new'));
    assert.equal(git('diff', '--cached', '--name-status'), staged);
    const applied = resultOf(['--base', 'HEAD', '--fix', '--no-install', '--', 'sample.js'], 0);
    assert.ok(applied.repair.fixedFiles.includes(path.join(fixture, 'sample.js')));
    assert.ok(applied.files[0].messages.every(message => message.ruleId !== 'unicorn/prefer-includes'));
    assert.equal(git('diff', '--cached', '--name-status'), staged);
    assert.equal(index, '');
  });
  await test('comparison is conservative for moved duplicates and baseline parse failures', () => {
    const message = {ruleId: 'unicorn/prefer-includes', messageId: 'prefer-includes', severity: 2, line: 1, column: 1};
    assert.deepEqual([...lineMapping([{count: 1, added: true}, {count: 2}])], [[2, 1], [3, 2]]);
    const moved = classify({messages: [message]}, {messages: [message]}, 'bad\n', 'bad\n', [{count: 1, removed: true}, {count: 1, added: true}]);
    assert.equal(moved[0].status, 'unknown');
    const inserted = classify({messages: [message, {...message, line: 2}]}, {messages: [message]}, 'bad\nbad\n', 'bad\n', [{count: 1, added: true}, {count: 1}]);
    assert.deepEqual(inserted.map(item => item.status), ['new', 'existing']);
    const edited = classify({messages: [message]}, {messages: [message]}, 'changed\n', 'bad\n', [{count: 1, removed: true}, {count: 1, added: true}]);
    assert.equal(edited[0].status, 'unknown');
    const unavailable = classify({messages: [message]}, undefined, 'bad\n', undefined, []);
    assert.equal(unavailable[0].status, 'unknown');
    const empty = classify({messages: [message]}, {messages: []}, 'bad\n', '', []);
    assert.equal(empty[0].status, 'new');
    const broken = classify({messages: [message]}, {messages: [{fatal: true}]}, 'bad\n', '', []);
    assert.equal(broken[0].status, 'unknown');
  });
}
