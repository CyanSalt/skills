import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {patternsFor} from './profiles.mjs';

const runtime = process.env.UNICORN_LINT_RUNTIME;
if (!runtime) {
  throw new Error('Run scripts/lint.mjs to prepare the isolated runtime.');
}

const require = createRequire(path.join(runtime, 'package.json'));
const selected = new Set(JSON.parse(process.env.UNICORN_LINT_PROFILES ?? '[]'));

async function load(name) {
  const module = await import(pathToFileURL(require.resolve(name)).href);
  return module.default ?? module;
}

// Load optional dependencies only for the selected file types.
const unicorn = await load('eslint-plugin-unicorn');
const tsParser = selected.has('typescript') || selected.has('vue')
  ? await load('@typescript-eslint/parser')
  : undefined;
const vueParser = selected.has('vue') ? await load('vue-eslint-parser') : undefined;
const css = selected.has('css') ? await load('@eslint/css') : undefined;
const html = selected.has('html') ? await load('@html-eslint/eslint-plugin') : undefined;
const json = selected.has('json') ? await load('@eslint/json') : undefined;
const markdown = selected.has('markdown') ? await load('@eslint/markdown') : undefined;
const toml = selected.has('toml') ? await load('eslint-plugin-toml') : undefined;
const yml = selected.has('yaml') ? await load('eslint-plugin-yml') : undefined;

export default [
  {
    name: 'unicorn-audit/isolation',
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'off',
    },
    ignores: ['**/node_modules/**', '**/.git/**'],
  },

  // JavaScript and JSX.
  selected.has('javascript') && {
    ...unicorn.configs.recommended,
    name: 'unicorn-audit/javascript',
    files: patternsFor('javascript'),
    languageOptions: {
      ...unicorn.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // TypeScript, TSX, and declaration files; parsing without a type-checking project.
  selected.has('typescript') && {
    ...unicorn.configs.recommended,
    name: 'unicorn-audit/typescript',
    files: patternsFor('typescript'),
    languageOptions: {
      ...unicorn.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: false,
        projectService: false,
        jsDocParsingMode: 'none',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // Vue scripts use the Vue parser with TypeScript-capable script parsing.
  selected.has('vue') && {
    ...unicorn.configs.recommended,
    name: 'unicorn-audit/vue',
    files: patternsFor('vue'),
    languageOptions: {
      ...unicorn.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        project: false,
        projectService: false,
        jsDocParsingMode: 'none',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // CommonJS suffixes override only the module mode of their language config.
  (selected.has('javascript') || selected.has('typescript')) && {
    name: 'unicorn-audit/commonjs',
    files: ['**/*.cjs', '**/*.cjsx', '**/*.cts', '**/*.ctsx'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  // CSS.
  selected.has('css') && {
    ...unicorn.configs['recommended-css'],
    name: 'unicorn-audit/css',
    files: patternsFor('css'),
    plugins: {
      unicorn,
      css,
    },
    language: 'css/css',
  },

  // HTML.
  selected.has('html') && {
    ...unicorn.configs['recommended-html'],
    name: 'unicorn-audit/html',
    files: patternsFor('html'),
    plugins: {
      unicorn,
      html,
    },
    language: 'html/html',
  },

  // JSON dialects are separate configurations, with no cascading dialect overrides.
  selected.has('json') && {
    ...unicorn.configs['recommended-json'],
    name: 'unicorn-audit/json',
    files: ['**/*.json'],
    plugins: {
      unicorn,
      json,
    },
    language: 'json/json',
  },
  selected.has('json') && {
    ...unicorn.configs['recommended-json'],
    name: 'unicorn-audit/jsonc',
    files: ['**/*.jsonc'],
    plugins: {
      unicorn,
      json,
    },
    language: 'json/jsonc',
    languageOptions: {
      allowTrailingCommas: true,
    },
  },
  selected.has('json') && {
    ...unicorn.configs['recommended-json'],
    name: 'unicorn-audit/json5',
    files: ['**/*.json5'],
    plugins: {
      unicorn,
      json,
    },
    language: 'json/json5',
  },

  // Markdown documents, using GitHub Flavored Markdown.
  selected.has('markdown') && {
    ...unicorn.configs['recommended-markdown'],
    name: 'unicorn-audit/markdown',
    files: patternsFor('markdown'),
    plugins: {
      unicorn,
      markdown,
    },
    language: 'markdown/gfm',
  },

  // TOML.
  selected.has('toml') && {
    ...unicorn.configs['recommended-toml'],
    name: 'unicorn-audit/toml',
    files: patternsFor('toml'),
    plugins: {
      unicorn,
      toml,
    },
    language: 'toml/toml',
  },

  // YAML uses the language plugin's yml namespace.
  selected.has('yaml') && {
    ...unicorn.configs['recommended-yaml'],
    name: 'unicorn-audit/yaml',
    files: patternsFor('yaml'),
    plugins: {
      unicorn,
      yml,
    },
    language: 'yml/yaml',
  },

  // Function-scoping overrides apply only to script languages.
  (selected.has('javascript') || selected.has('typescript') || selected.has('vue')) && {
    name: 'unicorn-audit/script-rule-exceptions',
    files: [...patternsFor('javascript'), ...patternsFor('typescript'), ...patternsFor('vue')],
    rules: {
      // Preserve local arrow callbacks and fresh callback identities while still checking ordinary functions.
      'unicorn/consistent-function-scoping': [
        'error',
        {
          checkArrowFunctions: false,
        },
      ],
    },
  },

  // Shared exceptions apply after every language preset.
  {
    name: 'unicorn-audit/rule-exceptions',
    rules: {
      // Filename casing is project-specific; accept conventional names such as README.md and SKILL.md.
      'unicorn/filename-case': 'off',
      // Preserve established abbreviations while keeping all other default replacements enabled.
      'unicorn/name-replacements': [
        'error',
        {
          replacements: {
            // Conventional shorthand for individual parameters and parameter collections.
            param: false,
            params: false,
            // Conventional name for the previous value in state-update callbacks.
            prev: false,
            // Standard component property names in React and Vue.
            prop: false,
            props: false,
            // Standard reference names in React and Vue.
            ref: false,
            refs: false,
          },
        },
      ],
      // Preserve conventional JSDoc and block-comment formatting without removing leading asterisks.
      'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
      // Explicit null values are required by framework state, library APIs, and JSON contracts.
      'unicorn/no-null': 'off',
      // Vue Options API, object methods, and library callbacks may intentionally use their this receiver.
      'unicorn/no-this-outside-of-class': 'off',
      // Intentional module-level caches, counters, and shared state require binding reassignment.
      'unicorn/no-top-level-assignment-in-function': 'off',
    },
  },
].filter(Boolean);
