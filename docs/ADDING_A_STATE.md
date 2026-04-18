# Adding a new state

equiPay's form-fill pipeline is shaped as a per-state adapter registry specifically so adding another state doesn't require touching the orchestrator or the library. In the common case it's one new file in `formfill/adapters/`, one registry entry, and one host added to the manifest.

This guide walks through the full process end-to-end. Expect ~1–2 hours for a state that has a stateful form similar to NY's JSF, maybe longer if the form uses an unusual framework (React-based forms, multi-page wizards, etc.).

---

## 1. Prerequisites — research the law + the form

Before writing code, collect:

- **Statute citation + URL** (e.g., "CA SB 1162", "CO Equal Pay for Equal Work Act"). These go in the review panel and description.
- **Overview page on the state labor department's site** (user-facing "file a complaint" page).
- **Actual complaint form URL** — the page with the submittable form. Note whether it's JSF (`.faces` suffix), a standard HTML form, or a React/Angular SPA.
- **Law thresholds** — employer size (4+ / 15+ / 1+), applicability criteria, any exemptions. These drive the review-panel checklist.
- **Host pattern** — the domain + path prefix for the form. Goes in `manifest.json`'s `host_permissions`.

Make sure the law actually exists and applies to pay-transparency violations before starting. Don't add adapters speculatively.

## 2. Inspect the form's DOM

Open the state's complaint form in Chrome, press **F12** to open DevTools, and run this snippet in the Console to dump every radio/checkbox group on the page:

```js
(() => {
  const groups = new Map();
  document.querySelectorAll("input[type='radio'], input[type='checkbox']").forEach(i => {
    if (!i.name) return;
    if (!groups.has(i.name)) groups.set(i.name, []);
    const forLabel = i.id ? document.querySelector(`label[for="${CSS.escape(i.id)}"]`) : null;
    const td = i.closest('td')?.nextElementSibling;
    const txt = (forLabel?.textContent || td?.textContent || i.closest('label')?.textContent || i.value || '').trim();
    groups.get(i.name).push({ id: i.id, value: i.value, label: txt });
  });
  const out = [];
  for (const [name, opts] of groups) {
    const first = document.getElementById(opts[0].id) || document.querySelector(`input[name="${CSS.escape(name)}"]`);
    let prompt = '';
    let el = first;
    while (el && !prompt) {
      el = el.previousElementSibling || el.parentElement;
      if (!el) break;
      const t = (el.textContent || '').trim();
      if (t.length > 15 && t.length < 400) prompt = t.split('\n')[0].slice(0, 200);
    }
    out.push({ name, prompt, options: opts.map(o => o.label) });
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
})();
```

Save the output — you'll paste this into your adapter as `inputMappings`. Then dump text fields and textareas:

```js
[...document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea')]
  .map(el => ({
    tag: el.tagName.toLowerCase(),
    name: el.name,
    id: el.id,
    labelFor: el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : null,
    placeholder: el.placeholder,
  }));
```

And check the file input:

```js
[...document.querySelectorAll('input[type="file"]')].map(i => ({ name: i.name, id: i.id, accept: i.accept }));
```

Also **test the "additional comments" validator by pasting a test string** with various characters (colons, hyphens, arrows, quotes). Note which characters trigger a rejection — you'll need a sanitizer rule that strips them.

## 3. Write the adapter

Create `formfill/adapters/[state-code].js` — copy `ny.js` as a starting scaffold and fill in:

```js
export const caAdapter = {
  id: "ca",                                    // two-letter state code
  host: "apps.example.ca.gov",                 // exact host of the complaint form
  formUrl: "https://apps.example.ca.gov/complaint.html",

  waitForSelector: "form",                     // or a more specific selector
  hydrationDelayMs: 600,                       // bump if the form runs framework setup

  fileInputSelector: 'input[type="file"]',

  // Text inputs by label within a section heading.
  textFieldMappings: [
    { section: ["complainant", "your info"], labels: ["first name"], from: "complainant.firstName" },
    // ...
  ],

  // Radio/checkbox groups by input `name` from the diagnostic dump above.
  inputMappings: [
    { name: "employmentStatus", option: "Applicant" },
    { name: "payRangeProvided", option: "No" },
    // ...
  ],

  // Conditional "please explain" textareas that appear after a specific answer.
  explanationMappings: [
    {
      nearInputName: "payRangeProvided",
      text: "No salary or pay range was disclosed in the posting.",
    },
  ],

  // Free-text comments / additional information field.
  commentsField: {
    labels: ["additional comments", "comments"],
    preferTag: "textarea",
    sanitizer: "alphanumDotSlash",             // or add a new rule in lib/sanitizers.js
    templateLines: [
      "Job title {{jobTitle}}",
      "Employer {{companyName}}",
      "Source {{bareUrl}}",
    ],
  },

  // Post-fill review panel content.
  reviewPanel: {
    title: "equiPay — review before submitting",
    requirements: {
      title: "Before submitting, confirm:",
      items: [
        "The employer has 15+ employees",             // <- CA threshold differs
        "The job is performed in CA or remotely with a CA nexus",
        "The posting really lacked a pay range",
        "Your claimant info (above) is accurate",
      ],
      warning: "Only file a complaint if all four apply — false or duplicate reports waste state resources.",
    },
    addressLookup: {
      title: "Business address (manual):",
      description: "Use one of these to look up {{companyName}}:",
      buttons: [
        { label: "🔍 CA SOS",      action: "clipboardAndOpen", url: "https://bizfileonline.sos.ca.gov/search/business" },
        { label: "🌐 Web search", action: "webSearch",         query: "{{companyName}} corporate address headquarters" },
      ],
    },
    links: [
      { label: "CA CRD — Pay Transparency",     href: "https://..." },
      { label: "CA Labor Code §432.3 (statute)", href: "https://..." },
    ],
  },
};
```

**Keep adapters logic-less.** No `function` properties, no dynamic values, no DOM access. Everything here must be JSON-serializable. If your state's form needs behavior we don't have yet — say, a multi-step wizard that advances via "Next" clicks, or a dropdown whose options load on click — add that capability to `formfill/lib/` with a config flag that adapters can opt into, rather than embedding the behavior in `ca.js`.

## 4. Register the adapter

Edit `formfill/adapters/index.js`:

```js
import { nyAdapter } from "./ny.js";
import { caAdapter } from "./ca.js";    // <- add import

const BY_HOST = {
  [nyAdapter.host]: nyAdapter,
  [caAdapter.host]: caAdapter,           // <- add entry
};
```

## 5. Add the host to `manifest.json`

The background service worker injects `dist/formfill.js` into the newly-opened form tab. That tab's URL must match one of the extension's `host_permissions`:

```json
"host_permissions": [
  "https://apps.labor.ny.gov/*",
  "https://apps.example.ca.gov/*"        // <- add
]
```

## 6. Handle the new form URL in `background.js`

**Today this is NY-only.** The service worker hardcodes `NYS_DOL_COMPLAINT_URL` and opens that tab after capture. To support multiple states, you'll need to pick the target URL based on the user's intent. Options:

- Add a **"preferred state" dropdown** to the Options page, default to NY. The background script reads `complainant.state` (or a new `preferredState` field) and opens the matching adapter's `formUrl`.
- **Infer from the user's mailing-address state** in the claimant profile. Falls back to NY if not set.
- **Prompt at capture time** via a small popup. More UX, but explicit.

The first option is simplest and is the recommended path. Leave this as a follow-up if you're adding the adapter primarily to prove the architecture works. Document the gap until state selection is wired up.

## 7. Build, reload, test

```bash
npm run build-formfill      # rebuild dist/formfill.js
```

Then at `chrome://extensions` → equiPay → ↻ (reload). Also reload the form tab.

Test the full flow on a real job posting:

1. Click equiPay on a posting → PDF downloads, form tab opens to the new state's form.
2. Open the form tab's DevTools → Console → filter `equiPay:`. You should see:
   ```
   equiPay: formfill bundle running on https://...
   equiPay: using adapter id=ca
   equiPay: adapter=ca — text X/Y, inputs Z/W, explanations N, comments filled, upload auto-uploaded|manual
   ```
3. Visually confirm radios, text fields, explanation, comments, and file upload are all set correctly.
4. If `could not fill input name=...` shows up, that input's name from the diagnostic dump doesn't match what you put in `inputMappings`. Re-run the diagnostic to check.

## 8. Update docs

- [README.md](../README.md): add the state to the opening paragraph.
- [docs/STORE_LISTING.md](STORE_LISTING.md): update the detailed description's "COMING SOON" paragraph to reflect what now ships.
- Update [manifest.json](../manifest.json) `description` field to reflect new scope.
- Bump `version` in `package.json` and `manifest.json`.
- Re-zip and upload to the Chrome Web Store. The new `host_permissions` entry will trigger a "permission change" review, so expect 1–3 extra business days.

## Common pitfalls

- **"Could not fill input" on every radio.** Your host in the adapter doesn't match `window.location.host` of the form. Check for trailing `/` or wrong subdomain. The orchestrator also logs `no form adapter registered for host X` if the host is mismatched.
- **Text fields don't fill.** The `section` keywords in `textFieldMappings` don't appear in any heading on the page. Either change your keywords to match actual headings, or drop the `section` scope (the fill will then search the whole document, which is less precise but works).
- **JSF AJAX races.** Some forms re-render sections after a radio click, dropping subsequent mappings' targets. Bump `hydrationDelayMs` or add a per-input `waitAfterMs` to the mapping (and extend the orchestrator loop to honor it). This is exactly the kind of capability that goes in `lib/`, not the adapter.
- **Comments field rejects characters we didn't strip.** Test the actual validator (see §2 above) and add a sanitizer rule in `formfill/lib/sanitizers.js` if `alphanumDotSlash` isn't strict enough. Reference the new rule name from the adapter's `commentsField.sanitizer`.
- **File upload rejected** (`DataTransfer upload REJECTED`). The form uses a custom JSF/PrimeFaces upload widget that doesn't react to `change` on the underlying `<input>`. Fallback to the highlight-and-drag path is automatic; if you want auto-upload, you'll need to reverse-engineer the widget's AJAX flow (per-adapter code — goes in `lib/` behind a config flag).
