import test from "ava";

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

// AQ-PATCH: build/aq-wombat-patches.cjs (webpack loader on @webrecorder/wombat/src/wombat.js)
const require = createRequire(import.meta.url);
const { PATCHES, applyWombatPatches } = require("../build/aq-wombat-patches.cjs");

const WOMBAT_SRC = require.resolve("@webrecorder/wombat/src/wombat.js");
const BUILT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "dist-wombat", "wombat.txt");

test("AQ-PATCH wombat patches match the installed wombat source exactly once", (t) => {
  const src = readFileSync(WOMBAT_SRC, "utf8");
  for (const p of PATCHES) {
    t.is(src.split(p.find).length, 2, p.id);
  }
  const out = applyWombatPatches(src, WOMBAT_SRC);
  t.true(out.includes("typeof prop === 'symbol' ? NaN : parseInt(prop)"));
  t.throws(() => applyWombatPatches("no match here", WOMBAT_SRC), { message: /proxy-get-symbol/ });
});

// window[Symbol.toStringTag] === 'Window'; lodash getRawTag reads it (Divi etCore, 2026-11-10).
test("AQ-PATCH(proxy-get-symbol) built wombat: Symbol keys pass through defaultProxyGet", (t) => {
  if (!existsSync(BUILT)) {
    t.log("dist-wombat/wombat.txt not built — run `yarn build` first");
    t.pass();
    return;
  }
  const window: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync(BUILT, "utf8"), { window, self: window });
  // wbWombat.js only defines window._WBWombat when no wbinfo is present
  const W = window["_WBWombat"] as {
    prototype: { defaultProxyGet: (...a: unknown[]) => unknown };
  };
  t.truthy(W, "window._WBWombat");
  const inits: unknown[] = [];
  const wombat = {
    WB_ASSIGN_FUNC: "_____WB$wombat$assign$function_____",
    WB_CHECK_THIS_FUNC: "_____WB$wombat$check$this$function_____",
    WBWindow: class {},
    initNewWindowWombat(w: unknown) {
      inits.push(w);
    },
  };
  const win = { [Symbol.toStringTag]: "Window", 0: "frame-0", name: "top" };
  const get = (prop: string | symbol) =>
    W.prototype.defaultProxyGet.call(wombat, win, prop, [], {});

  t.is(get(Symbol.toStringTag), "Window");
  t.is(get(Symbol.iterator), undefined);
  t.is(get("name"), "top");
  t.deepEqual(inits, []);
  get("0");
  t.deepEqual(inits, ["frame-0"]);
});
