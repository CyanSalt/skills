import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {patternsFor} from './profiles.mjs';

const runtime = process.env.UNICORN_LINT_RUNTIME;
if (!runtime) {
  throw new Error('Run scripts/lint.mjs to prepare the isolated runtime.');
}

const {default: importDependency} = await import(pathToFileURL(path.join(runtime, 'runtime-loader.mjs')).href);
const selected = new Set(JSON.parse(process.env.UNICORN_LINT_PROFILES ?? '[]'));

// Load optional dependencies only for the selected file types.
const {defineConfig, globalIgnores} = await importDependency('eslint/config');
const {default: unicorn} = await importDependency('eslint-plugin-unicorn');
const hasScripts = selected.has('javascript') || selected.has('typescript') || selected.has('vue');
const js = hasScripts ? (await importDependency('@eslint/js')).default : undefined;
const globals = hasScripts ? (await importDependency('globals')).default : undefined;
const tseslint = selected.has('typescript') || selected.has('vue') ? await importDependency('typescript-eslint') : undefined;
// Apply strict's TS compatibility overrides to Vue scripts and every supported TS suffix.
const tsStrict = tseslint?.configs.strict.map(({files: _files, ...configuration}) => configuration);
const vueParser = selected.has('vue') ? (await importDependency('vue-eslint-parser')).default : undefined;
const css = selected.has('css') ? (await importDependency('@eslint/css')).default : undefined;
const html = selected.has('html') ? (await importDependency('@html-eslint/eslint-plugin')).default : undefined;
const json = selected.has('json') ? (await importDependency('@eslint/json')).default : undefined;
const markdown = selected.has('markdown') ? (await importDependency('@eslint/markdown')).default : undefined;
const toml = selected.has('toml') ? (await importDependency('eslint-plugin-toml')).default : undefined;
const yml = selected.has('yaml') ? (await importDependency('eslint-plugin-yml')).default : undefined;

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/.git/**'], 'lint-as-if-perfect/ignores'),
  {
    name: 'lint-as-if-perfect/isolation',
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'off',
    },
  },

  // JavaScript and JSX.
  selected.has('javascript') && {
    extends: [js.configs.recommended, unicorn.configs.recommended],
    name: 'lint-as-if-perfect/javascript',
    files: patternsFor('javascript'),
    languageOptions: {
      // Without project configuration, accept both standard browser and Node globals.
      globals: {...globals.builtin, ...globals.browser, ...globals.node},
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
    extends: [js.configs.recommended, tsStrict, unicorn.configs.recommended],
    name: 'lint-as-if-perfect/typescript',
    files: patternsFor('typescript'),
    languageOptions: {
      // Without project configuration, accept both standard browser and Node globals.
      globals: {...globals.builtin, ...globals.browser, ...globals.node},
      ecmaVersion: 'latest',
      sourceType: 'module',
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
    extends: [js.configs.recommended, tsStrict, unicorn.configs.recommended],
    name: 'lint-as-if-perfect/vue',
    files: patternsFor('vue'),
    languageOptions: {
      // Without project configuration, accept both standard browser and Node globals.
      globals: {...globals.builtin, ...globals.browser, ...globals.node},
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
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
    name: 'lint-as-if-perfect/commonjs',
    files: ['**/*.cjs', '**/*.cjsx', '**/*.cts', '**/*.ctsx'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  // CSS.
  selected.has('css') && {
    extends: [css.configs.recommended, unicorn.configs['recommended-css']],
    name: 'lint-as-if-perfect/css',
    files: patternsFor('css'),
    language: 'css/css',
  },

  // HTML.
  selected.has('html') && {
    extends: [unicorn.configs['recommended-html']],
    name: 'lint-as-if-perfect/html',
    files: patternsFor('html'),
    plugins: {
      html,
    },
    language: 'html/html',
  },

  // JSON dialects are separate configurations, with no cascading dialect overrides.
  selected.has('json') && {
    extends: [json.configs.recommended, unicorn.configs['recommended-json']],
    name: 'lint-as-if-perfect/json',
    files: ['**/*.json'],
    language: 'json/json',
  },
  selected.has('json') && {
    extends: [json.configs.recommended, unicorn.configs['recommended-json']],
    name: 'lint-as-if-perfect/jsonc',
    files: ['**/*.jsonc'],
    language: 'json/jsonc',
    languageOptions: {
      allowTrailingCommas: true,
    },
  },
  selected.has('json') && {
    extends: [json.configs.recommended, unicorn.configs['recommended-json']],
    name: 'lint-as-if-perfect/json5',
    files: ['**/*.json5'],
    language: 'json/json5',
  },

  // Markdown documents, using GitHub Flavored Markdown.
  selected.has('markdown') && {
    extends: [markdown.configs.recommended, unicorn.configs['recommended-markdown']],
    name: 'lint-as-if-perfect/markdown',
    files: patternsFor('markdown'),
    language: 'markdown/gfm',
  },

  // TOML.
  selected.has('toml') && {
    extends: [toml.configs.recommended, unicorn.configs['recommended-toml']],
    name: 'lint-as-if-perfect/toml',
    files: patternsFor('toml'),
    language: 'toml/toml',
  },

  // YAML uses the language plugin's yml namespace.
  selected.has('yaml') && {
    extends: [yml.configs.recommended, unicorn.configs['recommended-yaml']],
    name: 'lint-as-if-perfect/yaml',
    files: patternsFor('yaml'),
    language: 'yml/yaml',
  },

  // Function-scoping overrides apply only to script languages.
  hasScripts && {
    name: 'lint-as-if-perfect/script-rule-exceptions',
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
    name: 'lint-as-if-perfect/rule-exceptions',
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
].filter(Boolean));
