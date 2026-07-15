# equiPay tests

Run everything with:

```bash
npm test    # rebuilds dist/formfill.js first, then runs the three suites
```

The suites run the extension's real code inside [jsdom](https://github.com/jsdom/jsdom) with the Chrome extension APIs stubbed (`test/helpers.mjs` also patches jsdom gaps like `innerText` and `CSS.escape`):

| Suite | What it exercises |
|---|---|
| `formfill.test.mjs` | The built `dist/formfill.js` against **saved copies of the real complaint-form HTML** (`fixtures/`): every NYC CCHR fill (including the deliberately-untouched user-judgment fields), the NYS DOL radios/labels regression, the review panel, the agency-switch button, and the jurisdiction-mismatch hint. |
| `capture.test.mjs` | `content.js` against synthetic LinkedIn pages where **all class selectors are stale**: metadata from the title-parse / company-link / location-text-shape fallbacks, the "About the job" JD locator (including inside an open shadow root), the text-fallback PDF when rasterization throws, and the popup's `filingChoice` override of location detection. |
| `tt-shim.test.mjs` | `tt-shim.js` returns a working pass-through policy when the page CSP blocks `trustedTypes.createPolicy`. |

## Refreshing the form fixtures

`fixtures/cchr.html` and `fixtures/dol.html` are snapshots of the live complaint forms (fetched July 2026). If an agency redesigns its form, refresh the snapshot and re-run the suite — failures then show exactly which adapter mappings went stale:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
curl -sL -A "$UA" "https://www.nyc.gov/site/cchr/about/report-discrimination.page" -o test/fixtures/cchr.html
curl -sL -A "$UA" "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces" -o test/fixtures/dol.html
```

Notes on fidelity:

- The fixtures' own scripts don't run under jsdom (`runScripts: "outside-only"`), so page behaviors are simulated where needed — e.g. `formfill.test.mjs` pre-injects the basis checkboxes that the CCHR page's `setBasis()` would create when "Employment" is selected. If the CCHR page changes that markup, update the injected snippet from `https://www.nyc.gov/assets/cchr/js/report-discrimination.js`.
- The LinkedIn pages in `capture.test.mjs` are synthetic (LinkedIn is login-walled), deliberately built to be *worse* than the real DOM — no recognizable classes — so they only pass if the selector-independent fallbacks work.
- These tests can't catch everything: JSF AJAX re-renders on the DOL form, LinkedIn's real DOM, and Trusted Types enforcement only exist in a real browser. Do one manual end-to-end pass before a store release.
