// Form-fill regression test: run the built dist/formfill.js inside jsdom
// against saved copies of the real NYC CCHR and NYS DOL form HTML
// (test/fixtures/ — see test/README.md for how to refresh them), and assert
// every fill. Requires `npm run build-formfill` first (npm test does this).
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { ROOT, fixture, check, finish, patchWindow } from "./helpers.mjs";

const BUNDLE = readFileSync(resolve(ROOT, "dist/formfill.js"), "utf8");

const PENDING_FILL = {
  meta: {
    url: "https://www.linkedin.com/jobs/view/4242424242/",
    hostname: "www.linkedin.com",
    title: "Software Engineer | Acme Corp | LinkedIn",
    companyName: "Acme Corp",
    jobTitle: "Software Engineer",
    location: "New York, NY",
    timestamp: "2026-07-14T15:00:00.000Z",
    jurisdiction: "nyc",
    jurisdictionDetected: "nyc",
  },
  description: "We are hiring...",
  pdfFilename: "NYC_Violation_AcmeCorp.pdf",
  pdfDataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
  ts: 1780000000000,
};

const COMPLAINANT = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@example.com",
  phone: "555-867-5309",
  address1: "123 Main St",
  address2: "Apt 4B",
  city: "Brooklyn",
  state: "NY",
  zip: "11201",
  county: "Kings",
};

function makeDom(htmlPath, url) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on("log", (...a) => logs.push(a.join(" ")));
  vc.on("warn", (...a) => logs.push("WARN " + a.join(" ")));
  vc.on("error", (...a) => logs.push("ERR " + a.join(" ")));
  vc.on("jsdomError", (e) => logs.push("JSDOM-ERR " + e.message));
  const dom = new JSDOM(readFileSync(htmlPath, "utf8"), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  patchWindow(window);
  window.chrome = {
    storage: {
      local: {
        get: async () => ({ pendingFill: PENDING_FILL, complainant: COMPLAINANT }),
      },
    },
    runtime: { sendMessage: (msg) => logs.push("SENT " + JSON.stringify(msg)) },
  };
  return { dom, window, logs };
}

function waitForPanel(window, timeoutMs = 20000) {
  return new Promise((resolvePromise, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.document.getElementById("equipay-review-panel")) {
        clearInterval(iv);
        resolvePromise();
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        reject(new Error("review panel never appeared"));
      }
    }, 200);
  });
}

// ————— Test 1: NYC CCHR form —————
{
  console.log("— NYC CCHR form —");
  const { dom, window, logs } = makeDom(
    fixture("cchr.html"),
    "https://www.nyc.gov/site/cchr/about/report-discrimination.page"
  );
  const d = window.document;
  // The page's own setBasis() (jQuery, external script) can't run under
  // jsdom; pre-inject the exact markup it produces for the Employment
  // category so the checkbox mapping can be exercised.
  d.getElementById("basis").innerHTML =
    '<label class="control-label">Basis of Discrimination</label><br/>' +
    '<p><label><input type="checkbox" name="Basis Of Discrimination" value="Salary history" /> Salary history</label></p>' +
    '<p><label><input type="checkbox" name="Basis Of Discrimination" value="Salary transparency" /> Salary transparency</label></p>';

  vm.runInContext(BUNDLE, dom.getInternalVMContext());
  await waitForPanel(window);

  const val = (name) =>
    d.querySelector(`[name="${name.replace(/"/g, '\\"')}"]`)?.value;
  check("adapter=nyc picked", logs.some((l) => l.includes("adapter id=nyc")));
  check("Your Name", val("Your Name") === "Jane Doe", val("Your Name"));
  check("Your Email", val("Your Email") === "jane.doe@example.com");
  check("Your Phone", val("Your Phone") === "555-867-5309");
  check(
    "Your Address",
    val("Your Address") === "123 Main St, Apt 4B, Brooklyn, NY 11201",
    val("Your Address")
  );
  check(
    "Business name",
    val("Name of the person(s) and/or business") === "Acme Corp"
  );
  check(
    "General location",
    val("Address or general location") === "New York, NY"
  );
  check(
    "Incident date",
    val("Date of most recent incident") === "Jul 14, 2026",
    val("Date of most recent incident")
  );
  check(
    "Category select = Employment",
    d.querySelector('select[name="Category of Discrimination"]').value ===
      "Employment"
  );
  const basis = [
    ...d.querySelectorAll('input[name="Basis Of Discrimination"]'),
  ];
  check(
    "Salary transparency checked, others not",
    basis.find((b) => b.value === "Salary transparency")?.checked === true &&
      basis.filter((b) => b.checked).length === 1
  );
  const explain = val("Please explain the issue or problem") || "";
  check("Explanation mentions 8-107(32)", explain.includes("8-107(32)"));
  check("Explanation has URL", explain.includes(PENDING_FILL.meta.url));
  check("Explanation has no {{leftovers}}", !/\{\{\w+\}\}/.test(explain));
  check(
    "Ack checkbox untouched",
    d.querySelector('input[name="Acknowledgement"]').checked === false
  );
  check(
    "'Filed before' radios untouched",
    [...d.querySelectorAll('input[name="Have you filed a complaint with us before"]')].every(
      (r) => !r.checked
    )
  );
  check(
    "'How did you hear' untouched",
    [...d.querySelectorAll('input[name="How did you hear about the Commission"]')].every(
      (r) => !r.checked
    )
  );
  const panel = d.getElementById("equipay-review-panel");
  const switchBtn = panel.querySelector('[data-equipay-action="switchForm"]');
  check(
    "Switch button targets nys",
    switchBtn?.getAttribute("data-equipay-target") === "nys"
  );
  switchBtn?.click();
  check(
    "Switch button sends OPEN_ALTERNATE_FORM",
    logs.some((l) => l.includes('"type":"OPEN_ALTERNATE_FORM"') && l.includes('"jurisdiction":"nys"'))
  );
  check(
    "No mismatch hint (detected nyc, filing nyc)",
    !panel.textContent.includes("other agency may have jurisdiction")
  );
  console.log("  LOG   " + logs.find((l) => l.includes("adapter=nyc —")));
}

// ————— Test 2: NYS DOL form (regression) —————
{
  console.log("— NYS DOL form —");
  const { dom, window, logs } = makeDom(
    fixture("dol.html"),
    "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces"
  );
  const d = window.document;
  vm.runInContext(BUNDLE, dom.getInternalVMContext());
  await waitForPanel(window);

  check("adapter=ny picked", logs.some((l) => l.includes("adapter id=ny")));
  const radioChecked = (name) =>
    [...d.querySelectorAll(`input[name="${name}"]`)].some((i) => i.checked);
  check("typeComplainantSel checked", radioChecked("typeComplainantSel"));
  check("chooseFormA checked", radioChecked("chooseFormA"));
  check("rangeOfPay checked", radioChecked("rangeOfPay"));
  console.log("  LOG   " + logs.find((l) => l.includes("adapter=ny —")));
  const panel = d.getElementById("equipay-review-panel");
  check(
    "NY panel has switch button → nyc",
    panel
      .querySelector('[data-equipay-action="switchForm"]')
      ?.getAttribute("data-equipay-target") === "nyc"
  );
  check(
    "Mismatch hint shown (detected nyc, filing on DOL form)",
    panel.textContent.includes("other agency may have jurisdiction")
  );
}

finish();
