// Shared jsdom harness bits for the equiPay test suites.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const fixture = (name) =>
  resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", name);

let failures = 0;

export function check(label, cond, detail = "") {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
}

export function finish() {
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

// jsdom gaps relative to Chrome, applied to a jsdom window:
// - innerText (approximated with textContent)
// - CSS.escape
// - scrollIntoView
// - offsetParent (jsdom reports null everywhere; visibility checks need it)
export function patchWindow(window) {
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() {
      return this.textContent;
    },
  });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) {
    window.CSS.escape = (s) =>
      String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  }
  Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
    get() {
      return this.closest("[hidden]") ? null : this.ownerDocument.body;
    },
  });
}
