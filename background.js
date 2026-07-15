// Complaint-form destinations by jurisdiction. NYC salary-transparency
// violations are enforced by the NYC Commission on Human Rights (NYCHRL
// § 8-107(32)); everywhere else in NY state it's the NYS DOL (§194-b).
const FORM_URLS = {
  nys: "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces",
  nyc: "https://www.nyc.gov/site/cchr/about/report-discrimination.page",
};

const PENDING_FILL_KEY = "pendingFill";

// ——— Action click: inject capture pipeline ———
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/jspdf.umd.min.js", "vendor/html2canvas-pro.min.js", "content.js"],
    });
  } catch (err) {
    console.error("equiPay: failed to inject capture scripts", err);
  }
});

// ——— Message router ———
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "CAPTURE_COMPLETE") {
    openFormTabAndFill(msg);
  } else if (msg?.type === "OPEN_ALTERNATE_FORM") {
    // Review panel's "wrong agency" switch button. The capture data is still
    // in storage, so just open the other jurisdiction's form and fill it.
    console.log("equiPay: switching to alternate form", msg.jurisdiction);
    openFormTab(msg.jurisdiction);
  }
  return false;
});

async function openFormTabAndFill({
  meta,
  description,
  pdfFilename,
  pdfDataUrl,
}) {
  console.log("equiPay: CAPTURE_COMPLETE received, stashing capture data", {
    company: meta?.companyName,
    jurisdiction: meta?.jurisdiction,
    pdfFilename,
    pdfBytes: pdfDataUrl ? Math.round(pdfDataUrl.length * 0.75) : 0,
  });
  await chrome.storage.local.set({
    [PENDING_FILL_KEY]: {
      meta,
      description,
      pdfFilename,
      pdfDataUrl,
      ts: Date.now(),
    },
  });

  await openFormTab(meta?.jurisdiction);
}

// Open the complaint form for `jurisdiction` and inject the form-fill bundle
// once the tab finishes loading.
async function openFormTab(jurisdiction) {
  const url = FORM_URLS[jurisdiction] || FORM_URLS.nys;
  const createdTab = await chrome.tabs.create({ url });
  console.log("equiPay: opened form tab", { tabId: createdTab.id, url });

  let injected = false;
  const inject = async () => {
    if (injected) return;
    injected = true;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    console.log("equiPay: form tab loaded, injecting form-fill bundle", {
      tabId: createdTab.id,
    });
    try {
      await chrome.scripting.executeScript({
        target: { tabId: createdTab.id },
        files: ["dist/formfill.js"],
      });
      console.log("equiPay: dist/formfill.js injected");
    } catch (err) {
      console.error("equiPay: failed to inject form-fill", err);
    }
  };

  const onUpdated = (tabId, changeInfo) => {
    if (tabId !== createdTab.id || changeInfo.status !== "complete") return;
    inject();
  };
  chrome.tabs.onUpdated.addListener(onUpdated);

  // Cover the race where the tab finished loading before the listener above
  // was registered.
  try {
    const tab = await chrome.tabs.get(createdTab.id);
    if (tab.status === "complete") inject();
  } catch {
    /* tab already closed */
  }
}
