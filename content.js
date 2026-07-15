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

  // Structured-data fallback: many job boards (including LinkedIn's
  // logged-out views) embed a schema.org JobPosting as JSON-LD. It survives
  // frontend redesigns that break CSS-class selectors.
  function readJobPostingLD() {
    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        const data = JSON.parse(script.textContent);
        const nodes = Array.isArray(data) ? data : data["@graph"] || [data];
        for (const node of nodes) {
          if (node && node["@type"] === "JobPosting") return node;
        }
      } catch {
        /* malformed JSON-LD — keep looking */
      }
    }
    return null;
  }

  function ldLocation(ld) {
    let loc = ld?.jobLocation;
    if (Array.isArray(loc)) loc = loc[0];
    const address = loc?.address;
    if (!address) return null;
    return (
      [address.addressLocality, address.addressRegion]
        .filter(Boolean)
        .join(", ") || null
    );
  }

  // querySelector variants that pierce open shadow roots — newer LinkedIn
  // surfaces render panes inside web components, invisible to plain
  // document.querySelector.
  function collectShadowRoots(root, out) {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        collectShadowRoots(el.shadowRoot, out);
      }
    }
    return out;
  }
  function deepQuery(selector) {
    for (const root of [document, ...collectShadowRoots(document, [])]) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }
  function deepQueryAll(selector) {
    return [document, ...collectShadowRoots(document, [])].flatMap((root) => [
      ...root.querySelectorAll(selector),
    ]);
  }

  // parentElement that hops shadow boundaries (shadow-root child → host).
  function parentOf(el) {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode?.();
    return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot
      ? root.host
      : null;
  }

  // Class-name-independent JD locator: every recent LinkedIn layout heads
  // the description with "About the job". Walk up from that heading to the
  // smallest ancestor that holds the full description text, so the capture
  // stays tight even when we don't recognize any class names.
  function containerFromAboutHeading() {
    const heading = deepQueryAll("h1, h2, h3, h4, h5, strong").find((el) =>
      /^\s*about the job\s*$/i.test(el.textContent || "")
    );
    if (!heading) return null;
    let el = parentOf(heading);
    for (let depth = 0; el && depth < 8; depth++, el = parentOf(el)) {
      if ((el.innerText || "").trim().length > 600) return el;
    }
    return null;
  }

  // Resolve the first matching [label, locator] pair and log which strategy
  // won, so console reports from the field tell us what the DOM looks like.
  function resolveContainer(strategies) {
    for (const [label, locate] of strategies) {
      const el = locate();
      if (el) {
        console.log(`equiPay: JD container via ${label}`);
        return el;
      }
    }
    return null;
  }

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
        // LinkedIn renames its top-card/description classes every redesign;
        // keep a chain of every generation we've seen (logged-in + guest
        // views), then fall back to selector-independent sources: the
        // document title ("Job Title | Company | LinkedIn"), the top card's
        // /company/ profile link, and JSON-LD (guest views).
        const ld = readJobPostingLD();
        const fromTitle = (() => {
          const m = document.title
            .replace(/^\(\d+\)\s*/, "") // notification-count prefix
            .match(/^(.*?)\s*\|\s*(.*?)\s*\|\s*LinkedIn\s*$/i);
          return m
            ? { jobTitle: m[1].trim(), companyName: m[2].trim() }
            : {};
        })();
        const companyFromLink = (() => {
          const scope =
            deepQuery('[class*="top-card"]') ||
            deepQuery("main") ||
            document;
          const link = scope.querySelector('a[href*="/company/"]');
          const t = link?.innerText?.trim().split("\n")[0].trim();
          return t && t.length > 1 && t.length < 120 ? t : null;
        })();
        // Location by text shape rather than class name: scan the top card
        // for "City, ST" or "… Metropolitan Area". Keeps NYC-vs-NYS routing
        // working when the location span's class changes.
        const locFromTopCard = (() => {
          const t = deepQuery('[class*="top-card"]')?.innerText || "";
          const m =
            t.match(
              /([A-Z][A-Za-z.'&-]*(?:\s+[A-Z&][A-Za-z.'&-]*)*,\s*[A-Z]{2})(?![A-Za-z])/
            ) ||
            t.match(/((?:Greater\s+)?[A-Z][A-Za-z ]+Metropolitan Area|Greater [A-Za-z ]+ Area)/);
          return m ? m[1].trim() : null;
        })();
        return {
          jdContainer: resolveContainer([
            ["#job-details", () => deepQuery("#job-details")],
            [".jobs-description-content__text", () => deepQuery(".jobs-description-content__text")],
            [".jobs-description__content", () => deepQuery(".jobs-description__content")],
            ['[class*="jobs-description"]', () => deepQuery('[class*="jobs-description"]')],
            // Class-independent: works on the 2026 /jobs/search-results/
            // two-pane layout where none of the known classes exist. All
            // locators pierce open shadow roots via deepQuery.
            ["about-the-job heading", containerFromAboutHeading],
            // Details-pane wrapper — looser than the heading walk, but far
            // tighter than falling back to <main> (which includes the list).
            ['[class*="job-details"]', () => deepQuery('[class*="job-details"]')],
            // Logged-out / guest views.
            [".show-more-less-html__markup", () => deepQuery(".show-more-less-html__markup")],
            [".description__text", () => deepQuery(".description__text")],
          ]),
          companyName:
            text(document.querySelector(".job-details-jobs-unified-top-card__company-name")) ||
            text(document.querySelector(".jobs-unified-top-card__company-name")) ||
            text(document.querySelector('[class*="top-card"] [class*="company-name"]')) ||
            text(document.querySelector(".topcard__org-name-link")) ||
            ld?.hiringOrganization?.name ||
            fromTitle.companyName ||
            companyFromLink ||
            null,
          jobTitle:
            text(document.querySelector(".job-details-jobs-unified-top-card__job-title")) ||
            text(document.querySelector(".jobs-unified-top-card__job-title")) ||
            text(document.querySelector(".top-card-layout__title")) ||
            ld?.title ||
            fromTitle.jobTitle ||
            null,
          location:
            text(document.querySelector(".job-details-jobs-unified-top-card__bullet")) ||
            text(document.querySelector(".jobs-unified-top-card__bullet")) ||
            text(document.querySelector(".topcard__flavor--bullet")) ||
            ldLocation(ld) ||
            locFromTopCard,
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

    const ld = readJobPostingLD();
    return {
      jdContainer,
      companyName:
        ld?.hiringOrganization?.name ||
        attr('meta[property="og:site_name"]', "content") ||
        location.hostname.replace(/^www\./, "").split(".")[0],
      jobTitle:
        ld?.title ||
        attr('meta[property="og:title"]', "content") ||
        document.title,
      location: ldLocation(ld),
    };
  }

  // NYC salary-transparency violations are enforced by the NYC Commission on
  // Human Rights, not the NYS DOL (the DOL bounces NYC-employer claims to
  // the CCHR). Route by the posting's listed location; the review panel has
  // a switch button for when this heuristic guesses wrong.
  function detectJurisdiction(locationStr) {
    const s = (locationStr || "").toLowerCase();
    const nycPatterns = [
      /new york,?\s*(ny|new york)\b/,
      /\bnyc\b/,
      /new york city/,
      /manhattan/,
      /brooklyn/,
      /\bqueens\b/,
      /\bbronx\b/,
      /staten island/,
    ];
    return nycPatterns.some((re) => re.test(s)) ? "nyc" : "nys";
  }

  function pickParser(url) {
    return PARSERS.find((p) => p.match(url)) || null;
  }

  function sanitize(value) {
    return (value || "").trim().replace(/[^a-zA-Z0-9]/g, "");
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
      el = parentOf(el); // hops shadow boundaries too
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
  // When the screenshot failed (`pngDataUrl` null), falls back to rendering
  // the extracted job-description text so evidence capture still succeeds.
  async function renderEvidencePDF({ pngDataUrl, textFallback, meta, filename }) {
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
    if (!pngDataUrl) {
      headerLines.push(
        "Note: screenshot rendering was unavailable on this page; the job description below was extracted as text from the posting DOM at the capture timestamp."
      );
    }

    for (const line of headerLines) {
      const wrapped = doc.splitTextToSize(line, drawWidth);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 0.15 + 0.03;
    }
    y += 0.1;
    doc.setDrawColor(120);
    doc.line(margin, y, pageWidth - margin, y);
    y += 0.15;

    if (!pngDataUrl) {
      // Text-only fallback: paginate the extracted description.
      doc.setFontSize(9);
      const lineHeight = 0.16;
      y += 0.05;
      const lines = doc.splitTextToSize(textFallback, drawWidth);
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
      doc.save(filename);
      return doc.output("datauristring");
    }

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

  // If the site-specific parser's selectors went stale, salvage the capture
  // with the generic container heuristic instead of failing outright.
  let jdContainer = parsed.jdContainer;
  if (!jdContainer) {
    console.warn(
      `equiPay: ${parser?.name || "generic"} parser found no JD container — falling back to generic heuristic`
    );
    jdContainer = genericFallback().jdContainer;
  }

  const meta = {
    url: parsed.url || location.href,
    hostname: location.hostname,
    title: document.title,
    companyName: parsed.companyName?.trim() || null,
    jobTitle: parsed.jobTitle?.trim() || null,
    location: parsed.location?.trim() || null,
    timestamp: new Date().toISOString(),
  };
  // The popup's agency picker overrides location-based detection ("auto").
  // Both values ride along so the review panel can flag a mismatch.
  meta.jurisdictionDetected = detectJurisdiction(meta.location);
  let filingChoice = "auto";
  try {
    const stored = await chrome.storage.local.get("filingChoice");
    filingChoice = stored.filingChoice || "auto";
  } catch {
    /* storage unavailable — fall back to detection */
  }
  meta.jurisdiction =
    filingChoice !== "auto" ? filingChoice : meta.jurisdictionDetected;
  console.log(
    `equiPay: jurisdiction=${meta.jurisdiction} (choice=${filingChoice}, detected=${meta.jurisdictionDetected})`
  );

  const jdFullText = jdContainer?.innerText?.trim() || "";
  const description = jdFullText ? jdFullText.slice(0, 2500) : null;

  let pngDataUrl = null;
  try {
    pngDataUrl = await captureFullPage(jdContainer);
  } catch (err) {
    console.error(
      "equiPay: screenshot capture failed — falling back to text-only PDF",
      err
    );
  }

  if (!pngDataUrl && !jdFullText) {
    alert(
      "equiPay: could not capture this posting (no screenshot and no readable job description). See the DevTools console."
    );
    return;
  }

  const safeCompany = sanitize(meta.companyName) || "UnknownCompany";
  const filename = `${meta.jurisdiction === "nyc" ? "NYC" : "NYS"}_Violation_${safeCompany}.pdf`;

  let pdfDataUrl = null;
  try {
    pdfDataUrl = await renderEvidencePDF({
      pngDataUrl,
      textFallback: jdFullText.slice(0, 60000),
      meta,
      filename,
    });
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
