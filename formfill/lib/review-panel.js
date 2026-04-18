import { escapeHtml } from "./dom.js";

// Render the post-fill review panel from an adapter's declarative config.
// Adapter controls: title, requirements list, warning, evidence-PDF label,
// address-lookup buttons, footer links.
export function showReviewPanel({
  adapter,
  meta,
  pdfFilename,
  pdfDataUrl,
  uploadStatus,
}) {
  document.getElementById("equipay-review-panel")?.remove();

  const company = (meta?.companyName || "the employer").trim();
  const subs = buildSubstitutions({ meta, company });

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

  const rp = adapter.reviewPanel;
  panel.innerHTML = `
    <div style="padding:12px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px;">
      <strong style="font-size:14px;flex:1;">${escapeHtml(rp.title)}</strong>
      <button id="equipay-dismiss" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:0 4px;line-height:1;">&times;</button>
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid #eee;background:#fff8e0;">
      <strong style="color:#7a5a00;">⚠️ ${escapeHtml(rp.requirements.title)}</strong>
      <ul style="margin:6px 0 0 18px;padding:0;">
        ${rp.requirements.items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}
      </ul>
      ${rp.requirements.warning ? `
        <div style="margin-top:8px;font-size:12px;color:#555;">
          ${escapeHtml(rp.requirements.warning)}
        </div>` : ""}
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid #eee;">
      <div style="margin-bottom:6px;"><strong>📎 Evidence PDF:</strong> ${uploadLine}</div>
      <div style="font-size:12px;color:#555;margin-bottom:8px;">
        Filename: <code style="background:#f4f4f4;padding:1px 4px;border-radius:3px;">${escapeHtml(pdfFilename || "")}</code>
      </div>
      ${pdfDataUrl ? `<button id="equipay-view-pdf" class="equipay-btn">👁️ Preview PDF</button>` : ""}
    </div>

    ${rp.addressLookup ? `
      <div style="padding:12px 14px;border-bottom:1px solid #eee;">
        <strong>🏢 ${escapeHtml(rp.addressLookup.title)}</strong>
        <div style="font-size:12px;color:#555;margin:4px 0 8px;">
          ${escapeHtml(substitute(rp.addressLookup.description || "", subs))}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${rp.addressLookup.buttons.map((b, i) => `
            <button data-equipay-action="${escapeHtml(b.action)}"
                    data-equipay-target="${escapeHtml(substitute(b.url || b.query || "", subs))}"
                    data-equipay-copy="${escapeHtml(company)}"
                    class="equipay-btn">
              ${escapeHtml(b.label)}
            </button>`).join("")}
          ${meta?.url ? `
            <button data-equipay-action="openUrl"
                    data-equipay-target="${escapeHtml(meta.url)}"
                    class="equipay-btn">↗ Job posting</button>` : ""}
        </div>
      </div>` : ""}

    ${rp.links && rp.links.length ? `
      <div style="padding:12px 14px;font-size:12px;color:#555;">
        ${rp.links.map((l) => `
          <a href="${escapeHtml(l.href)}" target="_blank" rel="noopener" style="color:#2a6df4;text-decoration:none;">
            📖 ${escapeHtml(l.label)}
          </a><br />`).join("")}
      </div>` : ""}
  `;

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
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        console.error("equiPay: PDF preview failed", err);
      }
    }
  );
  panel.querySelectorAll("[data-equipay-action]").forEach((btn) => {
    btn.addEventListener("click", () => runPanelAction(btn));
  });
}

function runPanelAction(btn) {
  const action = btn.getAttribute("data-equipay-action");
  const target = btn.getAttribute("data-equipay-target");
  const copy = btn.getAttribute("data-equipay-copy");

  switch (action) {
    case "clipboardAndOpen":
      if (copy) navigator.clipboard?.writeText(copy).catch(() => {});
      if (target) window.open(target, "_blank", "noopener");
      break;
    case "webSearch":
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(target)}`,
        "_blank",
        "noopener"
      );
      break;
    case "openUrl":
      window.open(target, "_blank", "noopener");
      break;
    default:
      console.warn(`equiPay: unknown panel action "${action}"`);
  }
}

function buildSubstitutions({ meta, company }) {
  return {
    companyName: company,
    jobTitle: meta?.jobTitle || "",
    location: meta?.location || "",
    bareUrl: (meta?.url || "").replace(/^https?:\/\//i, ""),
    url: meta?.url || "",
  };
}

function substitute(template, subs) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) =>
    subs[key] != null ? String(subs[key]) : ""
  );
}

export { substitute, buildSubstitutions };
