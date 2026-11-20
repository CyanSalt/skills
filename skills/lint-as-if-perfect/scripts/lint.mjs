#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, stat, realpath, mkdtempDisposable} from 'node:fs/promises';
import {globSync, lstatSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {profileFor} from '../assets/profiles.mjs';
import {classify} from './compare.mjs';
import {documentationPaths, ruleDocumentation} from './documentation.mjs';
import {prepareRuntime} from './runtime.mjs';

const skill = fileURLToPath(new URL('..', import.meta.url));
const help = `Usage: node scripts/lint.mjs [options] -- file [file/glob/directory ...]
  --base REF          Compare working files with a Git commit (e.g. HEAD).
  --changed           Select tracked changes and untracked files; requires --base.
  --snapshot DIR      Save a pre-edit snapshot of the selected files (exclusive creation).
  --baseline DIR      Compare with a snapshot created by this command.
  --cwd DIR           Resolve input paths against this directory.
  --format json|text  Default: text. JSON contains every diagnostic and its evidence.
  --fix               Apply ESLint autofixes to every selected file, then report remaining findings.
  --dry-run           With --fix, preview autofixes without writing; JSON includes proposed output.
  --no-install        Reuse cached resolved versions and matching documentation; never download.
  --no-cache          Disable ESLint result caching.
  --concurrency N     ESLint workers: off, auto, or a positive integer; default off.
  --help              Show this help.
Exit: 0 no new findings (or no findings without baseline), 1 findings/unknowns,
      2 setup, selection, configuration or parsing failure. Source writes require --fix.
--fix applies all automatic fixes in selected files, including historical findings.
Suggestions require AI review and are never applied automatically.
Requires Node >=24.4, npm for metadata; prefers pnpm on PATH for installation.
Git is required for repository ignore filtering and --base/--changed.
Non-Git projects can be checked without Git. Ignored files are never checked or fixed.
Cache root: UNICORN_LINT_CACHE or the OS user cache directory.`;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, shell: false, ...options});
  if (result.error) throw result.error;
  return result;
}
function git(cwd, arguments_) {
  const result = run('git', ['-C', cwd, ...arguments_]);
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git failed.');
  return result.stdout;
}
function hash(value) {return createHash('sha256').update(value).digest('hex').slice(0, 24);}
async function exists(file) {
  return await stat(file, {throwIfNoEntry: false}) !== undefined;
}
function cacheRoot() {
  if (process.env.UNICORN_LINT_CACHE) return path.resolve(process.env.UNICORN_LINT_CACHE);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'lint-with-unicorn');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'lint-with-unicorn');
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'lint-with-unicorn');
}

function isWithin(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function repositoryFinder() {
  const directories = new Map();
  function find(directory) {
    if (directories.has(directory)) return directories.get(directory);
    let root;
    if (lstatSync(path.join(directory, '.git'), {throwIfNoEntry: false})) {
      root = git(directory, ['rev-parse', '--path-format=absolute', '--show-toplevel']).replace(/\r?\n$/u, '');
      if (!path.isAbsolute(root) || !isWithin(root, directory)) throw new Error(`Invalid Git repository root: ${directory}`);
    } else {
      const parent = path.dirname(directory);
      if (parent !== directory) root = find(parent);
    }
    directories.set(directory, root);
    return root;
  }
  return find;
}

async function filterGitIgnored(files) {
  const findRepository = repositoryFinder();
  const groups = new Map();
  for (const file of files) {
    const root = findRepository(path.dirname(file));
    if (!root) continue;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(file);
  }
  const ignored = new Set();
  for (const [root, candidates] of groups) {
    const paths = candidates.map(file => path.relative(root, file).split(path.sep).join('/'));
    const result = run('git', ['-C', root, 'check-ignore', '--stdin', '-z'], {input: `${paths.join('\0')}\0`});
    if (![0, 1].includes(result.status) || result.signal) throw new Error(result.stderr.trim() || 'Git ignore filtering failed.');
    for (const name of result.stdout.split('\0')) {
      if (name) ignored.add(path.resolve(root, name));
    }
  }
  const selected = await Promise.all(files.filter(file => !ignored.has(file)).map(file => realpath(file)));
  return {
    files: [...new Set(selected)].toSorted((left, right) => left.localeCompare(right)),
    ignoredFiles: [...ignored].toSorted((left, right) => left.localeCompare(right)),
  };
}

async function selectFiles(inputs, cwd) {
  const found = new Set();
  async function add(file, explicit) {
    const info = await stat(file);
    if (info.isDirectory()) {
      const matches = globSync('**/*', {
        cwd: await realpath(file), exclude: ['**/node_modules/**', '**/.git/**'], withFileTypes: true,
      });
      for (const match of matches) {
        if (match.isFile() && profileFor(match.name)) found.add(path.resolve(match.parentPath, match.name));
      }
      return;
    }
    if (!info.isFile()) throw new Error(`Not a regular file: ${file}`);
    if (!profileFor(file)) {
      if (explicit) throw new Error(`Unsupported extension: ${file}`);
      return;
    }
    found.add(file);
  }
  for (const input of inputs) {
    const absolute = path.resolve(cwd, input);
    if (await exists(absolute)) {await add(absolute, true); continue;}
    const matches = globSync(input, {cwd, exclude: ['**/node_modules/**', '**/.git/**']});
    if (matches.length === 0) throw new Error(`No files match: ${input}`);
    for (const match of matches) await add(path.resolve(cwd, match), false);
  }
  return [...found].toSorted((left, right) => left.localeCompare(right));
}

async function lintBatch(files, cwd, runtime, selected, options, configHash, cacheLabel) {
  if (files.length === 0) return [];
  const cacheFile = path.join(cacheRoot(), 'results', `${hash(`${cwd}:${configHash}:${cacheLabel}`)}.cache`);
  const arguments_ = [path.join(runtime, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    '--no-config-lookup', '--config', path.join(skill, 'assets', 'eslint.config.mjs'),
    '--no-inline-config', '--format', 'json-with-metadata', '--exit-on-fatal-error', '--concurrency', options.concurrency ?? 'off',
    '--cache-location', cacheFile];
  if (!options['no-cache']) {
    await mkdir(path.dirname(cacheFile), {recursive: true});
    arguments_.push('--cache', '--cache-strategy', 'content');
  }
  if (options.fix) arguments_.push(options['dry-run'] ? '--fix-dry-run' : '--fix');
  arguments_.push('--', ...files);
  const result = run(process.execPath, arguments_, {cwd, env: {
    ...process.env, UNICORN_LINT_RUNTIME: runtime, UNICORN_LINT_PROFILES: JSON.stringify(selected),
  }});
  let reports;
  let rulesMeta;
  try {
    const output = JSON.parse(result.stdout);
    reports = output.results;
    rulesMeta = output.metadata?.rulesMeta;
  } catch {
    throw new Error(`ESLint failed (${result.status}):\n${result.stderr || result.stdout}`);
  }
  if (!Array.isArray(reports) || result.status > 2 || result.signal) throw new Error(`Unexpected ESLint result: ${result.stderr}`);
  if (result.status === 2 && reports.every(report => !report.fatalErrorCount)) throw new Error(`ESLint configuration failed: ${result.stderr}`);
  const ignored = reports.find(report => report.messages.some(message => !message.ruleId && !message.fatal));
  if (ignored) throw new Error(`ESLint did not audit ${ignored.filePath}: ${ignored.messages.map(message => message.message).join(' ')}`);
  for (const report of reports) for (const message of report.messages) {
    const documentationUrl = rulesMeta?.[message.ruleId]?.docs?.url;
    if (documentationUrl) message.documentationUrl = documentationUrl;
  }
  return reports;
}

async function gitBaseline(cwd, base) {
  if (!base || base.startsWith('-')) throw new Error('Provide a valid Git commit reference.');
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const commit = git(root, ['rev-parse', '--verify', base + '^{commit}']).trim();
  const tree = new Set(git(root, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean));
  const changes = git(root, ['diff', '--no-ext-diff', '--find-renames', '--name-status', '-z', commit, '--']).split('\0').filter(Boolean);
  const renames = new Map();
  const changed = [];
  for (let index = 0; index < changes.length;) {
    const status = changes[index++];
    const old = changes[index++];
    const name = status.startsWith('R') || status.startsWith('C') ? changes[index++] : old;
    if (status.startsWith('R') || status.startsWith('C')) renames.set(name, old);
    if (status !== 'D') changed.push(path.join(root, name));
  }
  changed.push(...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).map(name => path.join(root, name)));
  return {root, commit, tree, renames, changed};
}

async function main() {
  const {values: options, positionals} = parseArgs({allowPositionals: true, options: {
    base: {type: 'string'}, changed: {type: 'boolean'}, snapshot: {type: 'string'}, baseline: {type: 'string'},
    cwd: {type: 'string'}, format: {type: 'string', default: 'text'}, help: {type: 'boolean'},
    fix: {type: 'boolean'}, 'dry-run': {type: 'boolean'},
    'no-install': {type: 'boolean'}, 'no-cache': {type: 'boolean'}, concurrency: {type: 'string'},
  }});
  if (options.help) {process.stdout.write(`${help}\n`); return;}
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major === 24 && minor >= 4 || major > 24)) throw new Error('Requires Node 24.4+.');
  if (!['json', 'text'].includes(options.format)) throw new Error('--format must be json or text.');
  if (options.concurrency && !/^(?:off|auto|[1-9]\d*)$/u.test(options.concurrency)) throw new Error('Invalid --concurrency.');
  if (options.base && options.baseline || options.snapshot && (options.base || options.baseline)) throw new Error('Use only one of --base, --baseline, or --snapshot.');
  if (options.changed && !options.base) throw new Error('--changed requires --base.');
  if (options['dry-run'] && !options.fix) throw new Error('--dry-run requires --fix.');
  if (options.snapshot && (options.fix || options['dry-run'])) throw new Error('--snapshot cannot be combined with fix options.');
  const cwd = await realpath(path.resolve(options.cwd ?? process.cwd()));
  const base = options.base ? await gitBaseline(cwd, options.base) : undefined;
  let files = await selectFiles(positionals, cwd);
  if (options.changed) {
    const selectedChanges = new Set(base.changed);
    files = positionals.length > 0 ? files.filter(file => selectedChanges.has(file)) : base.changed.filter(file => {
      const relative = path.relative(cwd, file);
      return profileFor(file) && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
    files = [...new Set(files)].toSorted((left, right) => left.localeCompare(right));
  }
  const {files: eligibleFiles, ignoredFiles} = await filterGitIgnored(files);
  files = eligibleFiles;
  if (files.length === 0 && ignoredFiles.length === 0 && !options.changed) throw new Error('No supported files selected. Supply files, globs, or directories.');
  const selection = {ignoredFiles};
  if (files.length === 0) {
    const output = {files: [], summary: {new: 0, existing: 0, unknown: 0, total: 0}, baseline: base?.commit ?? null,
      selection, checked: false, reason: ignoredFiles.length > 0 ? 'All selected files are ignored by Git.' : 'No supported changed files.'};
    if (options.format === 'json') process.stdout.write(`${JSON.stringify(output)}\n`);
    else {
      for (const file of ignoredFiles) process.stdout.write(`Skipped Git-ignored file: ${JSON.stringify(path.relative(cwd, file))}\n`);
      process.stdout.write(`No files checked. ${output.reason}\n`);
    }
    return;
  }
  const selected = [...new Set(files.map(file => profileFor(file)))].toSorted((left, right) => left.localeCompare(right));
  const manifest = JSON.parse(await readFile(path.join(skill, 'assets', 'dependencies.json'), 'utf8'));
  const configHash = hash(JSON.stringify(manifest) + await readFile(path.join(skill, 'assets', 'eslint.config.mjs'), 'utf8')
    + await readFile(path.join(skill, 'assets', 'profiles.mjs'), 'utf8')
    + await readFile(path.join(skill, 'assets', 'runtime-loader.mjs'), 'utf8'));
  const sources = new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
  if (options.snapshot) {
    const target = path.resolve(cwd, options.snapshot);
    await mkdir(target, {recursive: false});
    const entries = {};
    for (const [index, file] of files.entries()) {
      const name = `${index}${path.extname(file)}`;
      await writeFile(path.join(target, name), sources.get(file));
      entries[file] = name;
    }
    await writeFile(path.join(target, 'snapshot.json'), JSON.stringify({version: 1, cwd, configHash, entries}, undefined, 2));
    process.stdout.write(`${JSON.stringify({snapshot: target, files: files.length, selection})}\n`);
    return;
  }
  let saved;
  let snapshotRoot;
  if (options.baseline) {
    snapshotRoot = await realpath(path.resolve(cwd, options.baseline));
    saved = JSON.parse(await readFile(path.join(snapshotRoot, 'snapshot.json'), 'utf8'));
    if (saved.version !== 1 || saved.configHash !== configHash || saved.cwd !== cwd) throw new Error('Snapshot root or skill configuration differs; comparison would be unreliable.');
  }
  const runtime = path.join(cacheRoot(), 'runtimes', hash(JSON.stringify(manifest)));
  const needed = Object.assign({}, manifest.core, ...selected.map(name => manifest[name] ?? {}));
  const documentConfig = JSON.parse(await readFile(path.join(skill, 'assets', 'documentation.json'), 'utf8'));
  const versions = await prepareRuntime(runtime, needed, documentConfig, options['no-install']);
  const runtimeConfigHash = hash(configHash + JSON.stringify(versions));
  const documentation = documentationPaths(runtime);
  const {default: importDependency} = await import(pathToFileURL(path.join(runtime, 'runtime-loader.mjs')).href);
  const {diffLines} = await importDependency('diff');
  const checkOptions = {...options, fix: false, 'dry-run': false};
  let reports = await lintBatch(files, cwd, runtime, selected, checkOptions, runtimeConfigHash, 'working');
  await using temporary = base || saved ? await mkdtempDisposable(path.join(runtime, 'baseline-')) : undefined;
  const baselineRoot = temporary?.path;
  const oldSources = new Map();
  const oldPaths = new Map();
  const missing = new Set();
  if (baselineRoot) {
    for (const file of files) {
      let source;
      let relative;
      if (base) {
        relative = path.relative(base.root, file).split(path.sep).join('/');
        if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`File is outside Git repository: ${file}`);
        const old = base.renames.get(relative) ?? relative;
        if (!base.tree.has(old)) {missing.add(file); continue;}
        source = git(base.root, ['show', `${base.commit}:${old}`]);
      } else {
        relative = path.relative(cwd, file);
        if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`File is outside snapshot root: ${file}`);
        const entry = saved.entries[file];
        if (!entry) continue;
        if (typeof entry !== 'string' || path.basename(entry) !== entry) throw new Error('Invalid snapshot entry.');
        source = await readFile(path.join(snapshotRoot, entry), 'utf8');
      }
      const oldPath = path.join(baselineRoot, relative);
      await mkdir(path.dirname(oldPath), {recursive: true});
      await writeFile(oldPath, source);
      oldSources.set(file, source);
      oldPaths.set(file, oldPath);
    }
  }
  const oldReports = baselineRoot ? await lintBatch(oldPaths.values().toArray(), baselineRoot, runtime, selected,
    {...checkOptions, 'no-cache': true}, runtimeConfigHash, 'baseline') : [];
  const oldByPath = new Map(oldReports.map(report => [path.resolve(report.filePath), report]));
  const fixRequested = options.fix;
  const originalSources = new Map(sources);
  const isFatalBeforeFix = [...reports, ...oldReports].some(report => report.fatalErrorCount > 0);
  const fixedFiles = [];
  for (const file of files) {
    if (await readFile(file, 'utf8') !== sources.get(file)) throw new Error(`Source changed during lint; rerun: ${file}`);
  }
  if (fixRequested && !isFatalBeforeFix) {
    reports = await lintBatch(files, cwd, runtime, selected, {...options, 'no-cache': true}, runtimeConfigHash, 'working');
    for (const report of reports) {
      const file = path.resolve(report.filePath);
      const content = options['dry-run'] ? report.output ?? sources.get(file) : await readFile(file, 'utf8');
      if (content !== sources.get(file)) fixedFiles.push(file);
      sources.set(file, content);
    }
  }
  const byFile = new Map(reports.map(report => [path.resolve(report.filePath), report]));
  const outputFiles = files.map(file => {
    const report = byFile.get(file);
    if (!report) throw new Error(`ESLint did not report the requested file: ${file}`);
    const oldReport = missing.has(file) ? {messages: []} : oldByPath.get(oldPaths.get(file));
    const messages = classify(report, oldReport, sources.get(file), oldSources.get(file),
      oldSources.has(file) ? diffLines(oldSources.get(file), sources.get(file)) : []).map(message => ({
        ...message,
        ...(message.ruleId?.startsWith('unicorn/') && {documentationPath: ruleDocumentation(message.ruleId, documentation)}),
      }));
    return {filePath: file, sourceHash: hash(sources.get(file)), messages,
      ...(options['dry-run'] && report.output !== undefined && {output: report.output}),
      baselineErrors: oldReport?.messages.filter(message => message.fatal) ?? [],
      suppressedMessages: report.suppressedMessages ?? []};
  });
  for (const file of files) {
    const expected = options['dry-run'] ? originalSources.get(file) : sources.get(file);
    if (await readFile(file, 'utf8') !== expected) throw new Error(`Source changed during lint; rerun: ${file}`);
  }
  const summary = {new: 0, existing: 0, unknown: 0, total: 0};
  for (const file of outputFiles) for (const message of file.messages) {summary[message.status]++; summary.total++;}
  const repair = {
    mode: options.fix ? (options['dry-run'] ? 'preview' : 'applied') : 'check',
    blocked: Boolean(fixRequested && isFatalBeforeFix),
    fixedFiles,
    autoFixable: outputFiles.reduce((count, file) => count + file.messages.filter(message => message.fix).length, 0),
    suggestionCount: outputFiles.reduce((count, file) => count + file.messages.reduce((total, message) => total + (message.suggestions?.length ?? 0), 0), 0),
    documentationPath: documentation.readme,
    rulesDocumentationPath: documentation.rules,
    nextStep: `Lint findings are quality references; fixing every finding or producing a clean report is not required. The agent must independently decide whether each in-scope finding is worth fixing based on benefit, behavior/API compatibility, and change risk; retain intentional or low-value patterns with a concrete reason. Review --fix --dry-run first; apply --fix only when every proposed change is worthwhile and authorized. Read documentationPath or documentationUrl when needed and review messages[].suggestions before manual edits and recheck. Unicorn documentation: ${documentation.readme}. Suggestions are alternatives, not automatic fixes. Preview ranges refer to output, not the original file.`,
  };
  const output = {version: 1, configHash: runtimeConfigHash, versions, baseline: base?.commit ?? (saved ? snapshotRoot : null), profiles: selected, selection, checked: true, summary, repair, files: outputFiles};
  if (options.format === 'json') process.stdout.write(`${JSON.stringify(output, undefined, 2)}\n`);
  else {
    for (const file of ignoredFiles) process.stdout.write(`Skipped Git-ignored file: ${JSON.stringify(path.relative(cwd, file))}\n`);
    for (const file of outputFiles) {
      for (const message of file.messages) {
        process.stdout.write(
          `${path.relative(cwd, file.filePath)}:${message.line ?? 1}:${message.column ?? 1} [${message.status}] ${message.ruleId ?? 'eslint'} ${message.message}\n`);
        if (message.documentationPath) process.stdout.write(`  Rule documentation: ${message.documentationPath}\n`);
        else if (message.documentationUrl) process.stdout.write(`  Rule documentation: ${message.documentationUrl}\n`);
        if (message.fix) process.stdout.write('  Automatic fix available: use --fix or --fix --dry-run.\n');
        const suggestions = message.suggestions ?? [];
        for (const [index, suggestion] of suggestions.entries()) process.stdout.write(
          `  Suggestion ${index + 1} (review before applying): ${suggestion.desc}\n  Edit: ${JSON.stringify(suggestion.fix)}\n`);
      }
      for (const message of file.baselineErrors) process.stdout.write(
        `${path.relative(cwd, file.filePath)}:${message.line ?? 1}:${message.column ?? 1} [baseline-error] ${message.message}\n`);
    }
    process.stdout.write(`Total ${summary.total}: new ${summary.new}, existing ${summary.existing}, unknown ${summary.unknown}.\n`);
    if (fixRequested) process.stdout.write(`${repair.blocked ? 'Fix blocked by parsing errors' : repair.mode}: ${fixedFiles.length} changed file(s).\n`);
    process.stdout.write(`Plugin documentation: ${documentation.readme}\n`);
    if (summary.total) process.stdout.write(`${repair.autoFixable} automatic fix(es), ${repair.suggestionCount} suggestion(s). ${repair.nextStep}\n`);
  }
  const isFatal = [...reports, ...oldReports].some(report => report.fatalErrorCount > 0);
  const findings = base || saved ? summary.new + summary.unknown : summary.total;
  process.exitCode = isFatal ? 2 : (findings ? 1 : 0);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`lint-as-if-perfect: ${error.message}\n`);
  process.exitCode = 2;
}
