// NYS DOL Pay Transparency (§194-b) complaint form.
// Pure declarative config — no logic here. If the form needs behavior
// that doesn't exist yet, extend formfill/lib/* and add a config flag.
export const nyAdapter = {
  id: "ny",
  host: "apps.labor.ny.gov",
  formUrl:
    "https://apps.labor.ny.gov/DOL_Complaint_Form/SalaryComplaint.faces",

  waitForSelector: "form",
  hydrationDelayMs: 600,

  fileInputSelector: 'input[type="file"]',

  // Text inputs located by label-text within a section.
  textFieldMappings: [
    { section: ["claimant", "your information", "contact"], labels: ["first name", "first"], from: "complainant.firstName" },
    { section: ["claimant", "your information", "contact"], labels: ["last name", "last"], from: "complainant.lastName" },
    { section: ["claimant", "your information", "contact"], labels: ["email"], from: "complainant.email" },
    { section: ["claimant", "your information", "contact"], labels: ["best contact info", "best contact", "contact info", "preferred contact"], from: "complainant.email|complainant.phone" },
    { section: ["claimant", "your information", "contact"], labels: ["phone", "telephone"], from: "complainant.phone" },
    { section: ["claimant", "your information", "contact"], labels: ["address line 1", "address 1", "street address", "mailing address"], from: "complainant.address1" },
    { section: ["claimant", "your information", "contact"], labels: ["address line 2", "address 2", "apt", "suite", "unit"], from: "complainant.address2" },
    { section: ["claimant", "your information", "contact"], labels: ["city"], from: "complainant.city" },
    { section: ["claimant", "your information", "contact"], labels: ["zip", "postal"], from: "complainant.zip" },
    { section: ["business information", "employer", "business"], labels: ["business name", "employer name", "company name", "name of business"], from: "meta.companyName" },
  ],

  // Radio/checkbox groups located by JSF input `name`. Stable across renders.
  inputMappings: [
    { name: "typeComplainantSel", option: "Applicant" },
    { name: "chooseFormB", option: "No" }, // Pay Equity (§194)
    { name: "chooseFormC", option: "No" }, // Salary History (§194-a)
    { name: "chooseFormA", option: "Yes" }, // Pay Transparency (§194-b)
    { name: "isLocationNYSSel", option: "Yes" },
    { name: "fourOrMoreSel", option: "Yes" },
    { name: "newOrInternal", option: "New employment" },
    { name: "typeAd", option: "Social media post" },
    { name: "whoPosts", option: "Employer" },
    { name: "rangeOfPay", option: "No" },
    { name: "jobDescProvided", option: "Yes" },
    { name: "wrongTreatSel", option: "No" },
  ],

  // Conditional "please explain" textareas that reveal after a specific
  // answer. The orchestrator walks up from the anchor radio to find the
  // newly-visible empty textarea.
  explanationMappings: [
    {
      nearInputName: "rangeOfPay",
      text: "The job posting did not include any salary or pay range, minimum/maximum compensation figures, or any other indication of the compensation offered. No range was disclosed in any portion of the advertisement.",
    },
  ],

  // Free-text "additional information" / "comments" field.
  commentsField: {
    labels: ["additional comments", "comments", "additional information", "explanation"],
    preferTag: "textarea",
    sanitizer: "alphanumDotSlash",
    templateLines: [
      "Job title {{jobTitle}}",
      "Employer {{companyName}}",
      "Listed location {{location}}",
      "Source {{bareUrl}}",
      "The attached PDF contains the full job posting with its URL and capture timestamp",
    ],
  },

  // Post-fill review panel content.
  reviewPanel: {
    title: "equiPay — review before submitting",
    requirements: {
      title: "Before submitting, confirm:",
      items: [
        "The employer has 4 or more employees",
        "The job is based in NY or reports to a NY supervisor",
        "The posting really lacked a pay range (PDF attached confirms)",
        "Your claimant info (above) is accurate",
      ],
      warning:
        "Only file a complaint if all four apply — false or duplicate reports waste state resources.",
    },
    addressLookup: {
      title: "Business address (manual):",
      description:
        "Use one of these to look up {{companyName}}, then paste into the Business section below:",
      buttons: [
        {
          label: "🔍 NY DOS",
          action: "clipboardAndOpen",
          url: "https://apps.dos.ny.gov/publicInquiry/",
        },
        {
          label: "🌐 Web search",
          action: "webSearch",
          query: "{{companyName}} corporate address headquarters",
        },
      ],
    },
    links: [
      {
        label: "NY DOL — Pay Transparency overview",
        href: "https://dol.ny.gov/pay-transparency",
      },
      {
        label: "NY Labor Law §194-b (statute)",
        href: "https://www.nysenate.gov/legislation/laws/LAB/194-B",
      },
    ],
  },
};
