# Upstream patches (fork divergence from webrecorder/wabac.js)

This fork is based on **upstream v2.24.5** (`e458ce3` = version bump). Everything
listed here is Arqivo-specific and must be **re-applied / re-verified when syncing
with upstream**. Rewriter patches are marked `AQ-PATCH(<name>)` in code comments —
grep for `AQ-PATCH` and `aq_` before and after any upstream merge.

## Rewriter patches (`src/rewrite/jsrewriter.ts`) — the sync hotspot

### AQ-PATCH(location-class-fields) — 2026-08-26

**Problem:** the `location = ` rewrite rule emits
`((self.__WB_check_loc && self.__WB_check_loc(location, arguments)) || {}).href = `.
A bare `arguments` token is a **SyntaxError** inside class field initializers,
static blocks, and arrow functions nested in them. Modern minified bundles
(esbuild/Angular ≥16: Angular Router) contain class fields literally named
`location` (`class X{...;location=w(jn);...}`), so the rewritten module failed to
parse and the whole SPA replayed as a blank page. First seen on
mijnstembureau-oisterwijk.nl (site 597) and mijnstembureau-almere.nl (site 148).

**Fix:** the rule callback (`addCheckLocSuffix`) lazily acorn-parses the file
(only when a `location=` match fires and the text contains `class`; falls back to
old behavior if both module- and script-parse fail) and collects ranges where
`arguments` is illegal. Then:
- class field **named `location`** → not rewritten at all (it is a field
  definition, not a navigation assignment);
- real `location =` assignment inside a static block / arrow-in-field →
  rewritten with the `arguments`-free variant `__WB_check_loc(location)`
  (loses only param-shadow detection there);
- everywhere else → unchanged output, byte-identical to before.

The lazy zone cache is stored on `opts["_wbArgZones"]` and reset at the top of
`JSRewriter.rewrite()` (opts objects are reused across inline scripts of one page).

**Upstream status (checked 2026-08-26):** upstream `main` has the identical bug —
same `arguments`-based `checkLoc`, they only renamed `.href` to `.maybeHref`.
When syncing: keep this patch; consider adopting `.maybeHref` (needs matching
wombat version); consider upstreaming this patch.

**Tests:** `test/rewriteJS.ts`, block marked `AQ-PATCH(location-class-fields)`
(5 regression cases: field named location module+script, static block, arrow in
field, function in field).

### AQ-PATCH candidates already in the fork (pre-dating this doc, unmarked)

- **`aq_no_wombat_rewrite` escape hatch** — `JSRewriter.rewrite()` returns text
  unrewritten when it contains the marker `aq_no_wombat_rewrite`. Used by our
  injected scripts. Not upstream.
- **`getModuleOverrides()`** — for ES modules, parse top-level declarations that
  conflict with `GLOBAL_OVERRIDES` and exclude them from the injected
  `__wb_module_decl.js` import to avoid "Identifier has already been declared".
  Not upstream (checked 2026-08-26).
- **`checkLoc` uses `.href`** while upstream `main` uses `.maybeHref` — upstream
  change we have not adopted yet (requires wombat with `maybeHref` support).

## Other fork commits on top of v2.24.5 (outside the rewriter)

| Commit | What |
|---|---|
| `37d531c` | File status broadcast |
| `28cdd59` | IndexedDB configuration storage; LiveProxy uses stored API key |
| `1f13229` | Response handling refactor in `collection.ts`; rewriteJS test update |
| `bcb4efe` | URL-encoding fix in redirect logic in `collection.ts` |
| `42b6204` | `AGENTS.md` docs (no code change) |

## Sync checklist

1. `grep -rn "AQ-PATCH\|aq_" src/ test/` — every hit must survive the merge.
2. Re-run `npx ava` (all suites) — the AQ regression tests must pass.
3. Re-check the "Upstream status" notes above — patches may have landed upstream.
4. Update this file: new patches, new upstream base version, re-check dates.
