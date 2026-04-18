(async () => {
  // Cache the jsPDF constructor locally so subsequent async work isn't
  // sensitive to window.jspdf being touched by the page.
  const jsPDFCtor =
    window.jspdf?.jsPDF || window.jsPDF || window.jspdf?.default || null;
  console.log(
    `equiPay: startup — jsPDF ${jsPDFCtor ? "OK" : "MISSING"}, window.jspdf keys: ${Object.keys(window.jspdf || {}).join(",") || "(none)"}`
  );

  const text = (el) => el?.innerText?.trim() || null;
  const attr = (sel, name) =>
    document.querySelector(sel)?.getAttribute(name) || null;

  // ——— Per-site parsers ———
  const PARSERS = [
    {
      name: "linkedin",
      match: (url) => /(^|\.)linkedin\.com\/jobs\//i.test(url),
      parse: () => {
        const url = new URL(location.href);
        let jobId = url.searchParams.get("currentJobId");
        if (!jobId) {
          const m = url.pathname.match(/\/jobs\/view\/(\d+)/);
          if (m) jobId = m[1];
        }
        const canonicalUrl = jobId
          ? `https://www.linkedin.com/jobs/view/${jobId}/`
          : location.href;
        return {
          jdContainer:
            document.querySelector("#job-details") ||
            document.querySelector(".jobs-description-content__text"),
          companyName:
            text(document.querySelector(".job-details-jobs-unified-top-card__company-name")) ||
            text(document.querySelector(".jobs-unified-top-card__company-name")),
          jobTitle:
            text(document.querySelector(".job-details-jobs-unified-top-card__job-title")) ||
            text(document.querySelector(".jobs-unified-top-card__job-title")),
          location:
            text(document.querySelector(".job-details-jobs-unified-top-card__bullet")) ||
            text(document.querySelector(".jobs-unified-top-card__bullet")),
          url: canonicalUrl,
        };
      },
    },
    {
      name: "indeed",
      match: (url) => /(^|\.)indeed\.[a-z.]+\/(viewjob|jobs|m\/)/i.test(url),
      parse: () => ({
        jdContainer: document.querySelector("#jobDescriptionText"),
        companyName:
          text(document.querySelector('[data-testid="inlineHeader-companyName"]')) ||
          text(document.querySelector('[data-company-name="true"]')),
        jobTitle:
          text(document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')) ||
          text(document.querySelector("h1.jobsearch-JobInfoHeader-title")),
        location: text(
          document.querySelector('[data-testid="inlineHeader-companyLocation"]')
        ),
      }),
    },
    {
      name: "glassdoor",
      match: (url) => /(^|\.)glassdoor\.[a-z.]+\/(job-listing|Job)/i.test(url),
      parse: () => ({
        jdContainer:
          document.querySelector(".jobDescriptionContent") ||
          document.querySelector('[class*="JobDetails_jobDescription"]'),
        companyName:
          text(document.querySelector('[data-test="employer-name"]')) ||
          text(document.querySelector('[class*="EmployerProfile_employerName"]')),
        jobTitle: text(document.querySelector('[data-test="job-title"]')),
        location: text(document.querySelector('[data-test="location"]')),
      }),
    },
    {
      name: "ziprecruiter",
      match: (url) => /(^|\.)ziprecruiter\.[a-z.]+\/(jobs|job|c)/i.test(url),
      parse: () => ({
        jdContainer:
          document.querySelector("#job_description") ||
          document.querySelector(".job_description") ||
          document.querySelector('[class*="job_description"]'),
        companyName:
          text(document.querySelector('[data-testid="job-card-company"]')) ||
          text(document.querySelector(".hiring_company_text")),
        jobTitle:
          text(document.querySelector('[data-testid="job-title"]')) ||
          text(document.querySelector("h1.job_title")),
        location: text(document.querySelector('[data-testid="job-card-location"]')),
      }),
    },
    {
      name: "monster",
      match: (url) => /(^|\.)monster\.[a-z.]+\/(job-openings|jobs)/i.test(url),
      parse: () => ({
        jdContainer:
          document.querySelector('[data-testid="svx-description-container"]') ||
          document.querySelector(".job-description"),
        companyName: text(
          document.querySelector('[data-testid="svx-job-header-company-name"]')
        ),
        jobTitle: text(
          document.querySelector('[data-testid="svx-job-header-title"]')
        ),
        location: text(
          document.querySelector('[data-testid="svx-job-header-location"]')
        ),
      }),
    },
    {
      name: "greenhouse",
      match: (url) => /greenhouse\.io\//i.test(url),
      parse: () => ({
        jdContainer:
          document.querySelector("#content") ||
          document.querySelector(".content") ||
          document.querySelector("#main_fields"),
        companyName:
          text(document.querySelector(".company-name")) ||
          attr('meta[property="og:site_name"]', "content"),
        jobTitle:
          text(document.querySelector(".app-title")) ||
          text(document.querySelector("h1")),
        location: text(document.querySelector(".location")),
      }),
    },
    {
      name: "lever",
      match: (url) => /(^|\.)lever\.co\//i.test(url),
      parse: () => ({
        jdContainer:
          document.querySelector(".posting-page") ||
          document.querySelector(".content") ||
          document.querySelector(".posting"),
        companyName:
          attr(".main-header-logo img", "alt") ||
          location.pathname.split("/").filter(Boolean)[0] ||
          null,
        jobTitle:
          text(document.querySelector(".posting-headline h2")) ||
          text(document.querySelector("h2")),
        location: text(document.querySelector(".posting-categories .location")),
      }),
    },
    {
      name: "workday",
      match: (url) => /myworkdayjobs\.com\//i.test(url),
      parse: () => ({
        jdContainer: document.querySelector(
          '[data-automation-id="jobPostingDescription"]'
        ),
        companyName: (() => {
          const host = location.hostname.split(".")[0];
          return host && host !== "www" ? host : null;
        })(),
        jobTitle: text(
          document.querySelector('[data-automation-id="jobPostingHeader"]')
        ),
        location: text(
          document.querySelector('[data-automation-id="locations"]')
        ),
      }),
    },
  ];

  function genericFallback() {
    const preferred = [
      document.querySelector("main article"),
      document.querySelector('[role="main"] article'),
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      document.querySelector("article"),
    ].filter(Boolean);

    let jdContainer = preferred[0] || null;
    if (!jdContainer) {
      let best = null;
      let bestLen = 0;
      document.querySelectorAll("div, section").forEach((el) => {
        const len = (el.innerText || "").length;
        if (len > bestLen && len < 50000) {
          bestLen = len;
          best = el;
        }
      });
      jdContainer = best;
    }

    return {
      jdContainer,
      companyName:
        attr('meta[property="og:site_name"]', "content") ||
        location.hostname.replace(/^www\./, "").split(".")[0],
      jobTitle:
        attr('meta[property="og:title"]', "content") || document.title,
      location: null,
    };
  }

  function pickParser(url) {
    return PARSERS.find((p) => p.match(url)) || null;
  }

  function sanitize(value) {
    return (value || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  }

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Neutralize overflow + height caps on ancestors of `target` so the
  // content expands into the document flow. Needed for sites (LinkedIn,
  // Glassdoor) where the job description lives inside an inner scroll pane.
  function expandScrollAncestors(target) {
    const undos = [];
    const clipValues = ["auto", "scroll", "overlay", "hidden", "clip"];
    const clips = (s) =>
      clipValues.includes(s.overflow) ||
      clipValues.includes(s.overflowY) ||
      clipValues.includes(s.overflowX);

    const touched = [];
    let el = target;
    while (el) {
      const s = getComputedStyle(el);
      const isBodyOrHtml =
        el === document.body || el === document.documentElement;
      const hasCappedHeight =
        s.height.endsWith("px") || s.maxHeight !== "none" ||
        s.height.includes("vh");
      if (clips(s) || isBodyOrHtml || hasCappedHeight) {
        undos.push({
          el,
          prev: {
            overflow: el.style.overflow,
            overflowY: el.style.overflowY,
            overflowX: el.style.overflowX,
            height: el.style.height,
            maxHeight: el.style.maxHeight,
            minHeight: el.style.minHeight,
          },
        });
        el.style.overflow = "visible";
        el.style.overflowY = "visible";
        el.style.overflowX = "visible";
        if (!isBodyOrHtml) {
          el.style.height = "auto";
          el.style.maxHeight = "none";
          el.style.minHeight = "0";
        }
        touched.push(
          `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(/\s+/).slice(0, 2).join(".") : ""}`
        );
      }
      el = el.parentElement;
    }
    console.log(`equiPay: expanded ancestors: ${touched.join(" > ")}`);
    return undos;
  }

  // ——— Capture the JD element via html2canvas ———
  // Rasterizes a specific DOM subtree at its natural rendered size, ignoring
  // viewport, scroll panes, and page layout. We still expand ancestor
  // overflow briefly so the target's scrollHeight renders in full.
  async function captureFullPage(target) {
    if (!target) throw new Error("no target element to capture");
    if (typeof html2canvas !== "function") {
      throw new Error("html2canvas not loaded");
    }

    const styleUndos = expandScrollAncestors(target);
    const originalScroll = window.scrollY;

    try {
      await sleep(400); // let layout settle after un-clipping

      const rect = target.getBoundingClientRect();
      console.log(
        `equiPay: capturing JD element — rect ${Math.round(rect.width)}×${Math.round(rect.height)}, scroll ${target.scrollWidth}×${target.scrollHeight}`
      );

      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 0,
        // Render the element at its natural content size regardless of where
        // it sits in the viewport.
        width: Math.max(target.scrollWidth, target.offsetWidth),
        height: Math.max(target.scrollHeight, target.offsetHeight),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        // Strip all background/list-style images and suppress <img> loads in
        // the cloned subtree so html2canvas doesn't fire off dozens of
        // failing subresource fetches into LinkedIn's instrumented network
        // wrapper.
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement("style");
          style.textContent = `
            *, *::before, *::after {
              background-image: none !important;
              list-style-image: none !important;
              mask-image: none !important;
              -webkit-mask-image: none !important;
              border-image-source: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);
          clonedDoc.querySelectorAll("img").forEach((img) => {
            img.removeAttribute("src");
            img.removeAttribute("srcset");
          });
        },
      });

      console.log(
        `equiPay: html2canvas produced ${canvas.width}×${canvas.height}`
      );
      return canvas.toDataURL("image/png");
    } finally {
      styleUndos.forEach(({ el, prev }) => {
        el.style.overflow = prev.overflow;
        el.style.overflowY = prev.overflowY;
        el.style.overflowX = prev.overflowX;
        el.style.height = prev.height;
        el.style.maxHeight = prev.maxHeight;
        el.style.minHeight = prev.minHeight;
      });
      window.scrollTo(0, originalScroll);
    }
  }

  // ——— Build evidence PDF directly via jsPDF ———
  // Bypasses html2canvas, which otherwise clones the whole page (pulling in
  // every ad/tracking pixel as an image load) just to rasterize our wrapper.
  async function renderEvidencePDF(pngDataUrl, meta, filename) {
    if (!jsPDFCtor) throw new Error("jsPDF constructor not found in bundle");

    const doc = new jsPDFCtor({
      unit: "in",
      format: "letter",
      orientation: "portrait",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 0.5;
    const drawWidth = pageWidth - margin * 2;

    // Header block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("equiPay — Job Posting Evidence", margin, margin + 0.15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let y = margin + 0.45;
    const headerLines = [
      `Source URL: ${meta.url}`,
      `Captured: ${meta.timestamp}`,
      `Captured by: equiPay browser extension`,
      `Page title: ${meta.title}`,
      `Employer: ${meta.companyName || "(unknown)"}`,
      `Job title: ${meta.jobTitle || "(unknown)"}`,
    ];
    if (meta.location) headerLines.push(`Listed location: ${meta.location}`);

    for (const line of headerLines) {
      const wrapped = doc.splitTextToSize(line, drawWidth);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 0.15 + 0.03;
    }
    y += 0.1;
    doc.setDrawColor(120);
    doc.line(margin, y, pageWidth - margin, y);
    y += 0.15;

    // Paginate the screenshot
    const img = await loadImage(pngDataUrl);
    const totalDrawHeight = drawWidth * (img.height / img.width); // inches
    const pxPerInch = img.height / totalDrawHeight; // physical px per PDF inch
    console.log(
      `equiPay: PDF image ${img.width}×${img.height}px → ${drawWidth.toFixed(2)}×${totalDrawHeight.toFixed(2)}in, approx ${Math.ceil(totalDrawHeight / 10)} page(s)`
    );

    let remainingInches = totalDrawHeight;
    let srcYpx = 0;
    let firstPage = true;

    while (remainingInches > 0.01) {
      const availableInches = firstPage
        ? pageHeight - y - margin
        : pageHeight - margin * 2;
      const chunkInches = Math.min(availableInches, remainingInches);
      const chunkPx = Math.round(chunkInches * pxPerInch);

      const chunkCanvas = document.createElement("canvas");
      chunkCanvas.width = img.width;
      chunkCanvas.height = chunkPx;
      const cctx = chunkCanvas.getContext("2d");
      cctx.fillStyle = "white";
      cctx.fillRect(0, 0, chunkCanvas.width, chunkCanvas.height);
      cctx.drawImage(img, 0, -srcYpx);
      const chunkData = chunkCanvas.toDataURL("image/jpeg", 0.88);

      doc.addImage(
        chunkData,
        "JPEG",
        margin,
        firstPage ? y : margin,
        drawWidth,
        chunkInches
      );

      srcYpx += chunkPx;
      remainingInches -= chunkInches;
      firstPage = false;
      if (remainingInches > 0.01) doc.addPage();
    }

    doc.save(filename);
    return doc.output("datauristring"); // "data:application/pdf;base64,..."
  }

  // ——— Main ———
  if (!jsPDFCtor) {
    alert(
      "equiPay: jsPDF library failed to load. Confirm jspdf.umd.min.js is present."
    );
    return;
  }

  const parser = pickParser(location.href);
  const parsed = parser ? parser.parse() : genericFallback();

  const meta = {
    url: parsed.url || location.href,
    hostname: location.hostname,
    title: document.title,
    companyName: parsed.companyName?.trim() || null,
    jobTitle: parsed.jobTitle?.trim() || null,
    location: parsed.location?.trim() || null,
    timestamp: new Date().toISOString(),
  };

  const description = parsed.jdContainer
    ? parsed.jdContainer.innerText.trim().slice(0, 2500)
    : null;

  let pngDataUrl;
  try {
    pngDataUrl = await captureFullPage(parsed.jdContainer);
  } catch (err) {
    console.error("equiPay: screenshot capture failed", err);
    alert(
      "equiPay: could not capture a full-page screenshot. See the DevTools console."
    );
    return;
  }

  const safeCompany = sanitize(meta.companyName) || "UnknownCompany";
  const filename = `NYS_Violation_${safeCompany}.pdf`;

  let pdfDataUrl = null;
  try {
    pdfDataUrl = await renderEvidencePDF(pngDataUrl, meta, filename);
  } catch (err) {
    console.error("equiPay: PDF generation failed", err);
    alert("equiPay: PDF generation failed. See the DevTools console.");
    return;
  }

  chrome.runtime.sendMessage({
    type: "CAPTURE_COMPLETE",
    meta,
    description,
    pdfFilename: filename,
    pdfDataUrl,
  });
})();
