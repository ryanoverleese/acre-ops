// Node resolves ./registry to registry.json before registry.ts unless .ts
// is earlier in Module._extensions than .json. Call this after registering
// the .ts transpiler and before requiring any module that imports registry.
module.exports = function preferTsOverJson() {
  const ext = require('node:module')._extensions;
  if (!ext['.ts'] || !ext['.json']) return;
  const json = ext['.json'];
  const node = ext['.node'];
  delete ext['.json'];
  if (ext['.node']) delete ext['.node'];
  ext['.json'] = json;
  if (node) ext['.node'] = node;
};
