/*eslint-env node */

// AQ-PATCH: source patches on @webrecorder/wombat, applied by webpack while bundling
// dist-wombat/wombat.txt (see webpack.config.cjs). Each patch is an exact string replacement
// that must match exactly once; a mismatch fails the build, so a wombat upgrade has to re-check
// every patch (docs/UPSTREAM-PATCHES.md).

const PATCHES = [
  {
    // AQ-PATCH(proxy-get-symbol) — Wombat.defaultProxyGet (window/document proxy `get` trap)
    // runs parseInt(prop) whenever the value is a non-empty string (its frames[N] check). A Symbol
    // key throws "Cannot convert a Symbol value to a string"; window[Symbol.toStringTag] is
    // "Window" and lodash getRawTag reads exactly that → the calling bundle dies (Divi etCore on
    // expertisecentrumoverijssel.nl/podcast/, 2026-11-10). A Symbol key is never an index.
    id: "AQ-PATCH(proxy-get-symbol)",
    file: /[\\/]@webrecorder[\\/]wombat[\\/]src[\\/]wombat\.js$/,
    find: "var asNum = parseInt(prop);",
    replace:
      "var asNum = typeof prop === 'symbol' ? NaN : parseInt(prop); // AQ-PATCH(proxy-get-symbol)",
  },
];

function applyWombatPatches(source, resourcePath) {
  let out = source;
  for (const p of PATCHES) {
    if (!p.file.test(resourcePath)) {
      continue;
    }
    const first = out.indexOf(p.find);
    if (first < 0 || out.indexOf(p.find, first + 1) >= 0) {
      throw new Error(
        `${p.id} does not match exactly once in ${resourcePath} — re-check it (docs/UPSTREAM-PATCHES.md)`,
      );
    }
    out = out.slice(0, first) + p.replace + out.slice(first + p.find.length);
  }
  return out;
}

module.exports = function (source) {
  return applyWombatPatches(source, this.resourcePath);
};
module.exports.PATCHES = PATCHES;
module.exports.applyWombatPatches = applyWombatPatches;
