import { waitFor, sleep } from "./lib/dom.js";
import {
  fillInputByName,
  fillTextInputByName,
  fillSelectByName,
  fillExplanationNearInput,
  findSection,
  fillByLabel,
} from "./lib/inputs.js";
import { attemptFileUpload, highlightFileInput } from "./lib/file-upload.js";
import { showReviewPanel, buildSubstitutions, substitute } from "./lib/review-panel.js";
import { sanitize } from "./lib/sanitizers.js";
import { pickAdapterForHost } from "./adapters/index.js";

(async () => {
  console.log("equiPay: formfill bundle running on", location.href);

  const adapter = pickAdapterForHost(location.host);
  if (!adapter) {
    console.log(
      `equiPay: no form adapter registered for host ${location.host} — exiting`
    );
    return;
  }
  console.log(`equiPay: using adapter id=${adapter.id}`);

  let pendingFill, complainant;
  try {
    const got = await chrome.storage.local.get(["pendingFill", "complainant"]);
    pendingFill = got.pendingFill;
    complainant = got.complainant || {};
  } catch (err) {
    console.error("equiPay: storage read failed", err);
    return;
  }
  if (!pendingFill) {
    console.warn("equiPay: no pending capture data in chrome.storage.local");
    return;
  }
  const { meta, pdfFilename, pdfDataUrl } = pendingFill;

  try {
    await waitFor(() => document.querySelector(adapter.waitForSelector || "form"));
  } catch {
    console.error("equiPay: adapter waitForSelector never appeared");
    return;
  }
  await sleep(adapter.hydrationDelayMs ?? 600);

  const dataSources = { meta, complainant };
  // No company fallback here: an unknown company must leave {{companyName}}
  // unresolved so template lines referencing it get dropped, not filled with
  // placeholder prose. (The review panel builds its own subs with a
  // human-friendly fallback.)
  const subs = buildSubstitutions({
    meta,
    company: meta?.companyName || null,
    complainant,
  });

  // ——— Text fields ———
  // A mapping resolves its value from `from` (a data path with `|` fallback
  // chains) or `template` (a literal with {{substitutions}}), and targets
  // its input via `inputName` (stable name attribute) or `labels` (label
  // text, optionally scoped by `section` heading keywords).
  let textAttempted = 0;
  let textFilled = 0;
  for (const m of adapter.textFieldMappings || []) {
    let value;
    if (m.template) {
      const rendered = substitute(m.template, subs).trim();
      // Skip if any placeholder failed to resolve — never write literal
      // "{{...}}" into a form field.
      value = rendered && !/\{\{\w+\}\}/.test(rendered) ? rendered : null;
    } else {
      value = resolveValue(m.from, dataSources);
    }
    if (!value) continue;
    textAttempted++;
    let filled;
    if (m.inputName) {
      filled = fillTextInputByName(m.inputName, value);
    } else {
      const scope = m.section ? findSection(m.section) : document;
      filled = fillByLabel(scope, m.labels, value, m.preferTag);
    }
    if (filled) {
      textFilled++;
      await sleep(120);
    } else {
      console.log(
        `equiPay: could not fill text field ${JSON.stringify(m.inputName || m.labels)}`
      );
    }
  }

  // ——— Selects (dropdowns by stable name) ———
  // Runs before radios/checkboxes: a select's onchange may reveal the
  // inputs that inputMappings target (e.g. NYC's basis-of-discrimination
  // checkboxes appear after picking a category).
  let selectsFilled = 0;
  for (const m of adapter.selectMappings || []) {
    if (fillSelectByName(m.name, m.value)) {
      selectsFilled++;
      await sleep(400);
    } else {
      console.log(
        `equiPay: could not fill select name=${JSON.stringify(m.name)} value=${JSON.stringify(m.value)}`
      );
    }
  }

  // ——— Radios / checkboxes ———
  let inputsAttempted = 0;
  let inputsFilled = 0;
  for (const m of adapter.inputMappings || []) {
    inputsAttempted++;
    if (fillInputByName(m.name, m.option)) {
      inputsFilled++;
      await sleep(500);
    } else {
      console.log(
        `equiPay: could not fill input name=${JSON.stringify(m.name)} option=${JSON.stringify(m.option)}`
      );
    }
  }

  // ——— Conditional explanation textareas ———
  await sleep(400);
  let explanationsFilled = 0;
  for (const e of adapter.explanationMappings || []) {
    if (fillExplanationNearInput(e.nearInputName, e.text)) {
      explanationsFilled++;
    }
  }

  // ——— Comments / additional information field ———
  let commentsFilled = false;
  if (adapter.commentsField) {
    const cf = adapter.commentsField;
    const rendered = (cf.templateLines || [])
      .map((line) => substitute(line, subs))
      .filter((line) => line && !/^\s*$/.test(line) && !/\{\{\w+\}\}/.test(line))
      .join("\n");
    const cleaned = sanitize(cf.sanitizer || "none", rendered);
    if (cf.inputName) {
      commentsFilled = fillTextInputByName(cf.inputName, cleaned);
    } else {
      commentsFilled = fillByLabel(document, cf.labels, cleaned, cf.preferTag);
    }
  }

  // ——— File upload ———
  let uploadStatus = "skipped";
  if (pdfDataUrl && pdfFilename) {
    try {
      uploadStatus = (await attemptFileUpload(
        pdfDataUrl,
        pdfFilename,
        adapter.fileInputSelector
      ))
        ? "auto-uploaded"
        : "manual";
    } catch (err) {
      console.error("equiPay: file upload attempt threw", err);
      uploadStatus = "manual";
    }
    if (uploadStatus === "manual") {
      highlightFileInput(adapter.fileInputSelector);
    }
  }

  console.log(
    `equiPay: adapter=${adapter.id} — ` +
      `text ${textFilled}/${textAttempted}, ` +
      `selects ${selectsFilled}/${(adapter.selectMappings || []).length}, ` +
      `inputs ${inputsFilled}/${inputsAttempted}, ` +
      `explanations ${explanationsFilled}, ` +
      `comments ${commentsFilled ? "filled" : "missed"}, ` +
      `upload ${uploadStatus}`
  );

  showReviewPanel({
    adapter,
    meta,
    pdfFilename,
    pdfDataUrl,
    uploadStatus,
  });
})();

// Resolve a "from" path like "complainant.firstName" or a fallback chain
// "complainant.email|complainant.phone". Returns the first non-empty value.
function resolveValue(path, sources) {
  if (!path) return null;
  for (const chain of String(path).split("|")) {
    const [rootKey, ...rest] = chain.trim().split(".");
    let cur = sources[rootKey];
    for (const key of rest) {
      if (cur == null) break;
      cur = cur[key];
    }
    if (cur != null && String(cur).trim() !== "") return cur;
  }
  return null;
}
