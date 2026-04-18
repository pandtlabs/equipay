const NYS_DOL_COMPLAINT_URL =
  "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces";

const PENDING_FILL_KEY = "pendingFill";

// ——— Action click: inject capture pipeline ———
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/jspdf.umd.min.js", "vendor/html2canvas.min.js", "content.js"],
    });
  } catch (err) {
    console.error("equiPay: failed to inject capture scripts", err);
  }
});

// ——— Message router ———
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "CAPTURE_COMPLETE") {
    openFormTabAndFill(msg);
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

  const onUpdated = async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (!tab?.url?.includes("apps.labor.ny.gov")) return;
    if (tabId !== createdTab?.id) return;
    console.log("equiPay: DOL tab loaded, injecting formfill.js", { tabId });
    chrome.tabs.onUpdated.removeListener(onUpdated);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["formfill.js"],
      });
      console.log("equiPay: formfill.js injected");
    } catch (err) {
      console.error("equiPay: failed to inject form-fill", err);
    }
  };
  chrome.tabs.onUpdated.addListener(onUpdated);

  const createdTab = await chrome.tabs.create({ url: NYS_DOL_COMPLAINT_URL });
  console.log("equiPay: opened DOL tab", { tabId: createdTab.id });
}
