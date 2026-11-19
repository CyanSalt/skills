import path from 'node:path';

export const profiles = {
  javascript: ['js', 'cjs', 'mjs', 'jsx', 'cjsx', 'mjsx'],
  typescript: ['ts', 'cts', 'mts', 'tsx', 'ctsx', 'mtsx'],
  vue: ['vue'],
  css: ['css'],
  html: ['html', 'htm'],
  json: ['json', 'jsonc', 'json5'],
  markdown: ['md', 'markdown'],
  toml: ['toml'],
  yaml: ['yaml', 'yml'],
};

export function profileFor(file) {
  const extension = path.extname(file).slice(1);
  return Object.keys(profiles).find(name => profiles[name].includes(extension));
}

export function patternsFor(profile) {
  return profiles[profile].map(extension => `**/*.${extension}`);
}
