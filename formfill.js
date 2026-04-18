(async () => {
  console.log("equiPay: formfill.js running on", location.href);

  let pendingFill, complainant;
  try {
    const got = await chrome.storage.local.get(["pendingFill", "complainant"]);
    pendingFill = got.pendingFill;
    complainant = got.complainant || {};
  } catch (err) {
    console.error("equiPay: storage read failed", err);
    return;
  }
  console.log("equiPay: pendingFill present?", !!pendingFill, "complainant keys:", Object.keys(complainant));

  if (!pendingFill) {
    console.warn("equiPay: no pending capture data in chrome.storage.local");
    return;
  }

  const { meta, description, pdfFilename, pdfDataUrl } = pendingFill;

  try {
    await waitFor(() => document.querySelector("form"));
  } catch {
    console.error("equiPay: no form detected on DOL page");
    return;
  }
  const labelCount = document.querySelectorAll("label").length;
  console.log(`equiPay: form ready, ${labelCount} labels present; settling for JSF hydration`);
  await sleep(600); // let JSF hydrate its ViewState hooks

  const claimantSection = findSection([
    "claimant",
    "your information",
    "contact",
  ]);
  const businessSection = findSection([
    "business information",
    "employer",
    "business",
  ]);

  const mappings = [
    { scope: claimantSection, labels: ["first name", "first"], value: complainant.firstName },
    { scope: claimantSection, labels: ["last name", "last"], value: complainant.lastName },
    { scope: claimantSection, labels: ["email"], value: complainant.email },
    { scope: claimantSection, labels: ["best contact info", "best contact", "contact info", "preferred contact"], value: complainant.email || complainant.phone },
    { scope: claimantSection, labels: ["phone", "telephone"], value: complainant.phone },
    { scope: claimantSection, labels: ["address line 1", "address 1", "street address", "mailing address"], value: complainant.address1 },
    { scope: claimantSection, labels: ["address line 2", "address 2", "apt", "suite", "unit"], value: complainant.address2 },
    { scope: claimantSection, labels: ["city"], value: complainant.city },
    { scope: claimantSection, labels: ["zip", "postal"], value: complainant.zip },
    { scope: businessSection, labels: ["business name", "employer name", "company name", "name of business"], value: meta.companyName },
  ];

  // Additional comments is usually a big textarea near the end. Try both scopes.
  mappings.push({
    scope: document,
    labels: ["additional comments", "comments", "additional information", "explanation"],
    value: buildCommentsText({ meta, description, pdfFilename }),
    prefer: "textarea",
  });

  let attempted = 0;
  let filled = 0;
  for (const m of mappings) {
    if (!m.value) continue;
    attempted++;
    const ok = fillByLabel(m.scope || document, m.labels, m.value, m.prefer);
    if (ok) {
      filled++;
      await sleep(120); // breathing room for JSF AJAX updates
    }
  }

  // ——— Radio / checkbox fills by JSF input `name` ———
  // Names come from the actual form (captured via devtools), so matching is
  // exact and doesn't rely on prompt-text heuristics.
  const inputMappings = [
    // Top-level routing. The user is filing a Pay Transparency (194-b)
    // complaint, so answer the other two complaint-type gates with No.
    { name: "typeComplainantSel", option: "Applicant" },
    { name: "chooseFormB", option: "No" }, // Pay Equity (§194)
    { name: "chooseFormC", option: "No" }, // Salary History (§194-a)
    { name: "chooseFormA", option: "Yes" }, // Pay Transparency (§194-b)

    // 194-b jurisdictional prerequisites (both required for the law to apply).
    { name: "isLocationNYSSel", option: "Yes" },
    { name: "fourOrMoreSel", option: "Yes" },

    // Posting details.
    { name: "newOrInternal", option: "New employment" },
    { name: "typeAd", option: "Social media post" },
    { name: "whoPosts", option: "Employer" },
    { name: "rangeOfPay", option: "No" },
    { name: "jobDescProvided", option: "Yes" },
    { name: "wrongTreatSel", option: "No" },
  ];

  // Standardized explanation text to drop into the "please explain" textarea
  // near the `rangeOfPay = No` answer.
  const explanationMappings = [
    {
      nearInputName: "rangeOfPay",
      text: "The job posting did not include any salary or pay range, minimum/maximum compensation figures, or any other indication of the compensation offered. No range was disclosed in any portion of the advertisement.",
    },
  ];

  let inputsAttempted = 0;
  let inputsFilled = 0;
  for (const m of inputMappings) {
    inputsAttempted++;
    const ok = fillInputByName(m.name, m.option);
    if (ok) {
      inputsFilled++;
      await sleep(500); // JSF AJAX-updates conditional sections after a click
    } else {
      console.log(
        `equiPay: could not fill input name=${JSON.stringify(m.name)} option=${JSON.stringify(m.option)}`
      );
    }
  }

  // Conditional explanation textareas (revealed only after a preceding radio
  // answer). Give JSF a beat to render them.
  await sleep(400);
  let explanationsFilled = 0;
  for (const e of explanationMappings) {
    if (fillExplanationNearInput(e.nearInputName, e.text)) {
      explanationsFilled++;
    }
  }

  // Try to pre-populate the file upload, then fall back to highlighting it.
  let uploadStatus = "skipped";
  if (pdfDataUrl && pdfFilename) {
    try {
      uploadStatus = (await attemptFileUpload(pdfDataUrl, pdfFilename))
        ? "auto-uploaded"
        : "manual";
    } catch (err) {
      console.error("equiPay: file upload attempt threw", err);
      uploadStatus = "manual";
    }
    if (uploadStatus === "manual") {
      highlightFileInput();
    }
  }

  console.log(
    `equiPay: pre-filled ${filled}/${attempted} text fields, ` +
      `${inputsFilled}/${inputsAttempted} radios/checkboxes, ` +
      `${explanationsFilled} explanation textareas. ` +
      `File upload: ${uploadStatus}.`
  );

  showReviewPanel({ meta, pdfFilename, pdfDataUrl, uploadStatus });

  if (filled === 0) {
    console.warn(
      "equiPay: no fields matched. The DOL form structure may have changed."
    );
  }

  // ——— helpers ———

  function buildCommentsText({ meta, description, pdfFilename }) {
    const lines = [
      `Job posting URL: ${meta.url}`,
      `Captured: ${meta.timestamp}`,
    ];
    if (meta.jobTitle) lines.push(`Job title: ${meta.jobTitle}`);
    if (meta.companyName) lines.push(`Employer: ${meta.companyName}`);
    if (meta.location) lines.push(`Listed location: ${meta.location}`);
    if (pdfFilename) lines.push(`Evidence file: ${pdfFilename}`);
    lines.push("");
    lines.push("--- Job description excerpt ---");
    lines.push(description || "(see attached PDF for full posting)");
    return lines.join("\n");
  }

  function fillInputByName(name, optionText) {
    const inputs = [
      ...document.querySelectorAll(
        `input[type='radio'][name="${CSS.escape(name)}"], ` +
          `input[type='checkbox'][name="${CSS.escape(name)}"]`
      ),
    ];
    if (!inputs.length) return false;
    const wanted = optionText.trim().toLowerCase();
    // Exact text match first
    for (const input of inputs) {
      const t = getTextForInput(input).trim().toLowerCase();
      if (t === wanted) {
        setRadioChecked(input);
        return true;
      }
    }
    // Fallback: contains
    for (const input of inputs) {
      const t = getTextForInput(input).trim().toLowerCase();
      if (t && t.includes(wanted)) {
        setRadioChecked(input);
        return true;
      }
    }
    return false;
  }

  function fillExplanationNearInput(radioName, text) {
    const anchor = document.querySelector(
      `input[name="${CSS.escape(radioName)}"]`
    );
    if (!anchor) return false;
    // Walk up from the radio looking for an empty, visible textarea — the
    // "please explain" field lives in the same question container.
    let el = anchor.parentElement;
    for (let depth = 0; el && depth < 7; depth++, el = el.parentElement) {
      const ta = el.querySelector("textarea");
      if (ta && ta.offsetParent !== null && !(ta.value || "").trim()) {
        setValue(ta, text);
        return true;
      }
    }
    return false;
  }

  function getTextForInput(input) {
    if (input.id) {
      const lbl = document.querySelector(
        `label[for="${CSS.escape(input.id)}"]`
      );
      if (lbl) return lbl.textContent || "";
    }
    const wrapping = input.closest("label");
    if (wrapping) return wrapping.textContent || "";
    // Table layouts: <tr><td><input/></td><td>Option text</td></tr>
    const td = input.closest("td");
    if (td) {
      const next = td.nextElementSibling;
      if (next && next.textContent.trim()) return next.textContent;
      const prev = td.previousElementSibling;
      if (prev && prev.textContent.trim() && !prev.querySelector("input")) {
        return prev.textContent;
      }
    }
    // Next / previous sibling text
    let sib = input.nextSibling;
    while (sib) {
      if (sib.nodeType === Node.TEXT_NODE && sib.textContent.trim()) return sib.textContent;
      if (sib.nodeType === Node.ELEMENT_NODE && (sib.textContent || "").trim()) return sib.textContent;
      sib = sib.nextSibling;
    }
    return input.value || "";
  }

  function setRadioChecked(input) {
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // JSF often listens for click events via onclick handlers
    input.click?.();
  }

  async function attemptFileUpload(dataUrl, filename) {
    const input = document.querySelector('input[type="file"]');
    if (!input) {
      console.warn("equiPay: no <input type=file> found on page");
      return false;
    }
    if (input.disabled || input.readOnly) return false;

    // Decode the base64 data URL to a Blob → File.
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "application/pdf" });

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Give JSF / PrimeFaces a beat to react.
    await sleep(1500);

    // If the form kept our file (didn't silently reset) and it still matches,
    // consider it a success. If PrimeFaces's custom upload widget clears it
    // out, we'll fall back to the highlighted manual-drag path.
    const stillThere =
      input.files && input.files.length > 0 && input.files[0].name === filename;
    console.log(
      `equiPay: DataTransfer upload ${stillThere ? "ACCEPTED" : "REJECTED"} — file input name=${JSON.stringify(input.name || input.id)}`
    );
    return stillThere;
  }

  function highlightFileInput() {
    const input = document.querySelector('input[type="file"]');
    if (!input) return;
    const anchor =
      input.closest("fieldset, .form-group, tr, .row, div") || input;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevOutline = anchor.style.outline;
    const prevOffset = anchor.style.outlineOffset;
    anchor.style.outline = "3px solid #ffb100";
    anchor.style.outlineOffset = "4px";
    setTimeout(() => {
      anchor.style.outline = prevOutline;
      anchor.style.outlineOffset = prevOffset;
    }, 10000);
  }

  function showReviewPanel({ meta, pdfFilename, pdfDataUrl, uploadStatus }) {
    // Remove any previous panel.
    document.getElementById("equipay-review-panel")?.remove();

    const company = (meta?.companyName || "the employer").trim();
    const panel = document.createElement("div");
    panel.id = "equipay-review-panel";
    panel.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "right:20px",
      "z-index:2147483647",
      "width:340px",
      "max-height:80vh",
      "overflow-y:auto",
      "background:#ffffff",
      "color:#222",
      "border:1px solid #d0d0d0",
      "border-radius:8px",
      "box-shadow:0 8px 24px rgba(0,0,0,0.18)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
      "font-size:13px",
      "line-height:1.45",
    ].join(";");

    const uploadLine =
      uploadStatus === "auto-uploaded"
        ? `<span style="color:#2a8a3a;">✓ auto-uploaded</span>`
        : uploadStatus === "manual"
        ? `<span style="color:#c67a00;">drag "${escapeHtml(pdfFilename || "the PDF")}" into the highlighted field</span>`
        : "—";

    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px;">
        <strong style="font-size:14px;flex:1;">equiPay — review before submitting</strong>
        <button id="equipay-dismiss" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:0 4px;line-height:1;">&times;</button>
      </div>

      <div style="padding:12px 14px;border-bottom:1px solid #eee;background:#fff8e0;">
        <strong style="color:#7a5a00;">⚠️ Before submitting, confirm:</strong>
        <ul style="margin:6px 0 0 18px;padding:0;">
          <li>The employer has <strong>4 or more employees</strong></li>
          <li>The job is <strong>based in NY</strong> or reports to a NY supervisor</li>
          <li>The posting really <strong>lacked a pay range</strong> (PDF attached confirms)</li>
          <li>Your <strong>claimant info</strong> (above) is accurate</li>
        </ul>
        <div style="margin-top:8px;font-size:12px;color:#555;">
          Only file a complaint if all four apply — false or duplicate reports waste state resources.
        </div>
      </div>

      <div style="padding:12px 14px;border-bottom:1px solid #eee;">
        <div style="margin-bottom:6px;"><strong>📎 Evidence PDF:</strong> ${uploadLine}</div>
        <div style="font-size:12px;color:#555;margin-bottom:8px;">
          Filename: <code style="background:#f4f4f4;padding:1px 4px;border-radius:3px;">${escapeHtml(pdfFilename || "NYS_Violation.pdf")}</code>
        </div>
        ${pdfDataUrl ? `<button id="equipay-view-pdf" class="equipay-btn">👁️ Preview PDF</button>` : ""}
      </div>

      <div style="padding:12px 14px;border-bottom:1px solid #eee;">
        <strong>🏢 Business address (manual):</strong>
        <div style="font-size:12px;color:#555;margin:4px 0 8px;">
          Use one of these to look up <strong>${escapeHtml(company)}</strong>, then paste into the Business section below:
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button id="equipay-lookup-dos" class="equipay-btn">🔍 NY DOS</button>
          <button id="equipay-lookup-google" class="equipay-btn">🌐 Web search</button>
          ${meta?.url ? `<button id="equipay-open-posting" class="equipay-btn">↗ Job posting</button>` : ""}
        </div>
      </div>

      <div style="padding:12px 14px;font-size:12px;color:#555;">
        <a href="https://dol.ny.gov/pay-transparency" target="_blank" rel="noopener" style="color:#2a6df4;text-decoration:none;">📖 NY DOL — Pay Transparency overview</a><br />
        <a href="https://www.nysenate.gov/legislation/laws/LAB/194-B" target="_blank" rel="noopener" style="color:#2a6df4;text-decoration:none;">📖 NY Labor Law §194-b (statute)</a>
      </div>
    `;

    // Inject button styles.
    const style = document.createElement("style");
    style.textContent = `
      #equipay-review-panel .equipay-btn {
        background:#fff;border:1px solid #bbb;border-radius:4px;
        padding:5px 10px;font-size:12px;cursor:pointer;color:#333;
      }
      #equipay-review-panel .equipay-btn:hover { background:#f4f4f4; }
    `;
    panel.appendChild(style);

    document.body.appendChild(panel);

    panel.querySelector("#equipay-dismiss")?.addEventListener("click", () =>
      panel.remove()
    );
    panel.querySelector("#equipay-view-pdf")?.addEventListener(
      "click",
      async () => {
        if (!pdfDataUrl) return;
        try {
          const blob = await (await fetch(pdfDataUrl)).blob();
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank", "noopener");
          // Revoke after a delay so the new tab has time to load.
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
          console.error("equiPay: PDF preview failed", err);
        }
      }
    );
    panel.querySelector("#equipay-lookup-dos")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(company).catch(() => {});
      window.open("https://apps.dos.ny.gov/publicInquiry/", "_blank", "noopener");
    });
    panel.querySelector("#equipay-lookup-google")?.addEventListener(
      "click",
      () => {
        const q = encodeURIComponent(`${company} corporate address headquarters`);
        window.open(
          `https://www.google.com/search?q=${q}`,
          "_blank",
          "noopener"
        );
      }
    );
    panel.querySelector("#equipay-open-posting")?.addEventListener(
      "click",
      () => {
        window.open(meta.url, "_blank", "noopener");
      }
    );
  }

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function findSection(headingKeywords) {
    const all = [
      ...document.querySelectorAll("h1, h2, h3, h4, h5, legend"),
    ];
    for (const wanted of headingKeywords) {
      const found = all.find((h) =>
        h.textContent.trim().toLowerCase().includes(wanted)
      );
      if (found) {
        return (
          found.closest("fieldset, section, [role='region']") ||
          found.parentElement ||
          document
        );
      }
    }
    return document;
  }

  function fillByLabel(scope, labelTexts, value, preferTag) {
    const labels = [...scope.querySelectorAll("label")];
    for (const wanted of labelTexts) {
      const match = labels.find((l) => {
        const t = l.textContent.trim().toLowerCase();
        return t === wanted || t.startsWith(wanted + " ") || t === wanted + ":";
      });
      if (match) {
        const input = getInputForLabel(match, preferTag);
        if (input) {
          setValue(input, value);
          return true;
        }
      }
    }
    // Fallback: loose contains-match
    for (const wanted of labelTexts) {
      const match = labels.find((l) =>
        l.textContent.trim().toLowerCase().includes(wanted)
      );
      if (match) {
        const input = getInputForLabel(match, preferTag);
        if (input) {
          setValue(input, value);
          return true;
        }
      }
    }
    return false;
  }

  function getInputForLabel(label, preferTag) {
    const forId = label.getAttribute("for");
    if (forId) {
      const el = document.getElementById(forId);
      if (el && isFillable(el, preferTag)) return el;
    }
    const nested = label.querySelector("input, textarea, select");
    if (nested && isFillable(nested, preferTag)) return nested;
    let el = label.parentElement;
    for (let i = 0; i < 3 && el; i++) {
      const found = el.querySelector("input, textarea, select");
      if (found && isFillable(found, preferTag)) return found;
      el = el.parentElement;
    }
    return null;
  }

  function isFillable(el, preferTag) {
    if (el.disabled || el.readOnly) return false;
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "file" || type === "hidden") return false;
    if (preferTag && el.tagName.toLowerCase() !== preferTag) return false;
    return true;
  }

  function setValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function waitFor(predicate, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (predicate()) return resolve();
        if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
        setTimeout(check, 100);
      };
      check();
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
