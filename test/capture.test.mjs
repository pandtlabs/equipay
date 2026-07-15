// Capture-side test: run content.js in jsdom against synthetic
// logged-in-style LinkedIn pages whose top-card CLASS SELECTORS ARE ALL
// STALE, so metadata must come from the selector-independent fallbacks
// (document.title parse, /company/ link, top-card text shape). html2canvas
// is stubbed to fail so the text-fallback PDF path runs end-to-end, the
// popup's filingChoice override is exercised, and one scenario renders the
// whole details pane inside an open shadow root.
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { ROOT, check, finish, patchWindow } from "./helpers.mjs";

const CONTENT = readFileSync(resolve(ROOT, "content.js"), "utf8");

const DESC = "We are looking for a staff engineer to join Initech. ".repeat(40);
const TOP_CARD = `<div class="artdeco-card job-view-top-card">
  <a href="https://www.linkedin.com/company/initech-llc/life">Initech LLC</a>
  <h1 class="t-24">Staff Software Engineer</h1>
  <span class="tvm__text">Brooklyn, NY · Reposted 2 days ago</span>
</div>`;

function makePage(variant) {
  let pane;
  if (variant === "modern") {
    pane = `${TOP_CARD}<div class="artdeco-card"><h2>About the job</h2><p>${DESC}</p></div>`;
  } else if (variant === "shadow") {
    pane = `<div id="pane-host"></div>`; // populated via attachShadow in runCapture
  } else {
    pane = `${TOP_CARD}<div id="job-details"><p>${DESC}</p></div>`;
  }
  return `<!doctype html><html><head>
<title>(3) Staff Software Engineer | Initech LLC | LinkedIn</title>
</head><body>
<nav>${"Navigation chrome and job list sidebar text. ".repeat(30)}</nav>
<main>
  <div class="scaffold-layout__detail">
    ${pane}
  </div>
</main>
</body></html>`;
}

async function runCapture({ filingChoice, variant = "legacy" }) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on("log", (...a) => logs.push(a.join(" ")));
  vc.on("warn", (...a) => logs.push("WARN " + a.join(" ")));
  vc.on("error", (...a) => logs.push("ERR " + a.join(" ")));
  const dom = new JSDOM(makePage(variant), {
    url: "https://www.linkedin.com/jobs/search/?currentJobId=4015234567&keywords=engineer",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  patchWindow(window);
  const sent = [];
  const alerts = [];
  window.alert = (m) => alerts.push(m);
  window.chrome = {
    storage: { local: { get: async () => ({ filingChoice }) } },
    runtime: { sendMessage: (msg) => sent.push(msg) },
  };
  // html2canvas that fails like unpatched libraries do on modern CSS colors.
  window.html2canvas = () =>
    Promise.reject(
      new Error('Attempting to parse an unsupported color function "oklch"')
    );
  // Minimal jsPDF stub — enough for the text-fallback path.
  const saved = [];
  class FakePDF {
    constructor() {
      this.internal = { pageSize: { getWidth: () => 8.5, getHeight: () => 11 } };
    }
    setFont() {}
    setFontSize() {}
    setDrawColor() {}
    line() {}
    addPage() {}
    splitTextToSize(t) {
      return String(t).split("\n");
    }
    text() {}
    save(name) {
      saved.push(name);
    }
    output() {
      return "data:application/pdf;base64,U1RVQg==";
    }
  }
  window.jspdf = { jsPDF: FakePDF };

  if (variant === "shadow") {
    const host = window.document.getElementById("pane-host");
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `${TOP_CARD}<div><h2>About the job</h2><p>${DESC}</p></div>`;
  }

  vm.runInContext(CONTENT, dom.getInternalVMContext());
  // capture flow: 400ms layout-settle sleep + async work
  await new Promise((r) => setTimeout(r, 2500));
  return { sent, alerts, logs, saved };
}

{
  console.log("— LinkedIn capture, stale selectors, auto choice —");
  const { sent, alerts, saved } = await runCapture({ filingChoice: "auto" });
  check("no alert shown", alerts.length === 0, alerts.join("; "));
  check("CAPTURE_COMPLETE sent", sent.length === 1 && sent[0].type === "CAPTURE_COMPLETE");
  const meta = sent[0]?.meta || {};
  check("company from title parse", meta.companyName === "Initech LLC", meta.companyName);
  check("job title from title parse", meta.jobTitle === "Staff Software Engineer", meta.jobTitle);
  check("canonical URL from currentJobId", meta.url === "https://www.linkedin.com/jobs/view/4015234567/", meta.url);
  check("detected nyc (Brooklyn)", meta.jurisdictionDetected === "nyc", JSON.stringify(meta.location));
  check("auto → jurisdiction nyc", meta.jurisdiction === "nyc");
  check("PDF filename NYC-prefixed", saved[0] === "NYC_Violation_InitechLLC.pdf", saved[0]);
  check("text-fallback PDF produced", (sent[0]?.pdfDataUrl || "").startsWith("data:application/pdf"));
  check("description extracted", (sent[0]?.description || "").includes("staff engineer"));
}

{
  console.log("— modern layout: no known classes, About-the-job heading —");
  const { sent, alerts, logs } = await runCapture({ filingChoice: "auto", variant: "modern" });
  check("no alert shown", alerts.length === 0, alerts.join("; "));
  const meta = sent[0]?.meta || {};
  check(
    "container via about-the-job heading",
    logs.some((l) => l.includes("JD container via about-the-job heading")),
    logs.find((l) => l.includes("JD container"))
  );
  check(
    "description is the JD, not the sidebar",
    (sent[0]?.description || "").includes("staff engineer") &&
      !(sent[0]?.description || "").includes("sidebar text")
  );
  check("company still resolved", meta.companyName === "Initech LLC");
}

{
  console.log("— shadow DOM: whole pane in an open shadow root —");
  const { sent, alerts, logs } = await runCapture({ filingChoice: "auto", variant: "shadow" });
  check("no alert shown", alerts.length === 0, alerts.join("; "));
  const meta = sent[0]?.meta || {};
  check(
    "container found inside shadow root",
    logs.some((l) => l.includes("JD container via about-the-job heading")),
    logs.find((l) => l.includes("JD container")) ||
      logs.find((l) => l.includes("no JD container"))
  );
  check("description extracted from shadow", (sent[0]?.description || "").includes("staff engineer"));
  check("location found in shadow top card", meta.jurisdictionDetected === "nyc", JSON.stringify(meta.location));
}

{
  console.log("— explicit NYS choice overrides NYC detection —");
  const { sent, saved } = await runCapture({ filingChoice: "nys" });
  const meta = sent[0]?.meta || {};
  check("jurisdiction follows choice", meta.jurisdiction === "nys", meta.jurisdiction);
  check("detection still recorded", meta.jurisdictionDetected === "nyc");
  check("PDF filename NYS-prefixed", saved[0] === "NYS_Violation_InitechLLC.pdf", saved[0]);
}

finish();
