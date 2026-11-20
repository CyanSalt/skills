// Copied into the isolated runtime so native imports resolve from its dependency tree.
export default function importDependency(specifier) {
  return import(specifier);
}
