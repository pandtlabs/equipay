// Injected before the vendor libraries, into the extension's isolated world
// only — the page's own world is untouched.
//
// Sites that enforce Trusted Types with a policy-name allowlist (LinkedIn:
// "trusted-types default jSecure 'allow-duplicates' dompurify …") make
// html2canvas-pro's trustedTypes.createPolicy("html2canvas-pro") throw,
// killing the capture. Chromium checks policy *creation* against the page
// CSP even from isolated worlds (crbug.com/1281028), while DOM *sinks*
// used from the isolated world follow the extension's CSP and accept plain
// strings. So when creation is blocked, hand the library a pass-through
// pseudo-policy: everything it writes goes through our isolated-world code,
// where string sinks are permitted.
(() => {
  if (typeof TrustedTypePolicyFactory !== "function") return;
  const proto = TrustedTypePolicyFactory.prototype;
  const originalCreatePolicy = proto.createPolicy;
  proto.createPolicy = function (name, rules = {}) {
    try {
      return originalCreatePolicy.call(this, name, rules);
    } catch (err) {
      console.log(
        `equiPay: page CSP blocked TrustedTypes policy "${name}" — using isolated-world pass-through`
      );
      return {
        name,
        createHTML: (...args) =>
          rules.createHTML ? rules.createHTML(...args) : args[0],
        createScript: (...args) =>
          rules.createScript ? rules.createScript(...args) : args[0],
        createScriptURL: (...args) =>
          rules.createScriptURL ? rules.createScriptURL(...args) : args[0],
      };
    }
  };
})();
