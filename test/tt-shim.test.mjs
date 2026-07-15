// Verify tt-shim.js: when the page CSP blocks createPolicy (Trusted Types
// policy-name allowlist, e.g. LinkedIn), the patched prototype returns a
// pass-through pseudo-policy instead of letting the capture die.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { ROOT, check, finish } from "./helpers.mjs";

const dom = new JSDOM("<body></body>", {
  url: "https://www.linkedin.com/jobs/",
  runScripts: "outside-only",
});
const ctx = dom.getInternalVMContext();
vm.runInContext(
  `
  class TrustedTypePolicyFactory {
    createPolicy(name) {
      throw new TypeError(\`Policy "\${name}" disallowed by CSP\`);
    }
  }
  globalThis.TrustedTypePolicyFactory = TrustedTypePolicyFactory;
  globalThis.trustedTypes = new TrustedTypePolicyFactory();
`,
  ctx
);
vm.runInContext(readFileSync(resolve(ROOT, "tt-shim.js"), "utf8"), ctx);
const result = vm.runInContext(
  `
  const p = trustedTypes.createPolicy("html2canvas-pro", { createHTML: (s) => s + "!" });
  [p.name, p.createHTML("<div>"), p.createScriptURL("u")];
`,
  ctx
);

console.log("— Trusted Types shim —");
check("policy name preserved", result[0] === "html2canvas-pro", result[0]);
check("createHTML delegates to rules", result[1] === "<div>!", result[1]);
check("createScriptURL passes through", result[2] === "u", result[2]);

finish();
