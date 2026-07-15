// Shared jurisdiction registry — routing metadata only. Used by the action
// popup (script tag) and the service worker (importScripts). Form-specific
// fill config lives in formfill/adapters/; the popup's "Auto-detect" entry
// lives in popup.js; the detection heuristic lives in content.js.
//
// Adding a state: append an entry here, add the adapter in
// formfill/adapters/, and add the host to manifest.json host_permissions.
const EQUIPAY_JURISDICTIONS = [
  {
    id: "nys",
    label: "NYS Department of Labor",
    blurb: "NY State Pay Transparency Law (§194-b)",
    formUrl:
      "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces",
  },
  {
    id: "nyc",
    label: "NYC Commission on Human Rights",
    blurb: "NYC salary transparency (Admin. Code § 8-107(32))",
    formUrl: "https://www.nyc.gov/site/cchr/about/report-discrimination.page",
  },
];
