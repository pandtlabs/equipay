// Action popup: pick which agency to file with, then kick off the capture
// on the active tab. The choice is remembered (chrome.storage.local
// `filingChoice`) and read by content.js when it stamps meta.jurisdiction.
const AUTO_CHOICE = {
  id: "auto",
  label: "Auto-detect agency",
  blurb: "NYC-based postings → NYC CCHR; everywhere else → NYS DOL",
};

const statusEl = document.getElementById("status");
const choicesEl = document.getElementById("choices");

async function init() {
  const { filingChoice = "auto" } = await chrome.storage.local.get(
    "filingChoice"
  );
  for (const choice of [AUTO_CHOICE, ...EQUIPAY_JURISDICTIONS]) {
    const btn = document.createElement("button");
    btn.className =
      "choice" + (choice.id === filingChoice ? " remembered" : "");
    const label = document.createElement("strong");
    label.textContent = choice.label;
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = choice.blurb || "";
    btn.append(label, sub);
    btn.addEventListener("click", () => capture(choice.id));
    choicesEl.appendChild(btn);
  }
}

async function capture(choiceId) {
  statusEl.style.color = "#555";
  statusEl.textContent = "Capturing…";
  try {
    await chrome.storage.local.set({ filingChoice: choiceId });
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) throw new Error("no active tab");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "tt-shim.js", // must precede the vendor libs (Trusted Types fallback)
        "vendor/jspdf.umd.min.js",
        "vendor/html2canvas-pro.min.js",
        "content.js",
      ],
    });
    window.close();
  } catch (err) {
    console.error("equiPay: capture from popup failed", err);
    statusEl.style.color = "#b00020";
    statusEl.textContent =
      "Can't capture this page — open the job posting in a normal tab and try again.";
  }
}

document
  .getElementById("options")
  .addEventListener("click", () => chrome.runtime.openOptionsPage());

init();
