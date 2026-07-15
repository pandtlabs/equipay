// NYC Commission on Human Rights "Report Discrimination" form, used for
// salary-transparency violations under the NYC Human Rights Law
// (NYC Admin. Code § 8-107(32), Local Law 32 of 2022). The NYS DOL refers
// NYC-employer §194-b claims here.
//
// Unlike the NYS JSF form, this is a plain HTML mailform with stable,
// human-readable input `name`s, so every field is targeted by name. Picking
// "Employment" in the category dropdown triggers the page's own setBasis()
// handler, which injects the "Basis Of Discrimination" checkboxes —
// including "Salary transparency" — that inputMappings then checks.
//
// Deliberately left for the user (and called out in the review panel):
// "Have you filed a complaint with us before?", "How did you hear about the
// Commission?", and the "I acknowledge" checkbox — the latter is a legal
// acknowledgement the user must read, not something to automate.
export const nycAdapter = {
  id: "nyc",
  host: "www.nyc.gov",
  hosts: ["www.nyc.gov", "www1.nyc.gov", "nyc.gov"],
  formUrl: "https://www.nyc.gov/site/cchr/about/report-discrimination.page",

  waitForSelector: "#reportDiscrimination",
  hydrationDelayMs: 400,

  fileInputSelector: 'input[name="FILE1"]',

  textFieldMappings: [
    { inputName: "Your Name", template: "{{complainantFullName}}" },
    { inputName: "Your Email", from: "complainant.email" },
    { inputName: "Your Phone", from: "complainant.phone" },
    { inputName: "Your Address", template: "{{complainantAddress}}" },
    { inputName: "Name of the person(s) and/or business", from: "meta.companyName" },
    { inputName: "Address or general location", from: "meta.location" },
    { inputName: "Date of most recent incident", template: "{{captureDate}}" },
  ],

  // Reveals the basis checkboxes via the page's own onchange handler.
  selectMappings: [
    { name: "Category of Discrimination", value: "Employment" },
  ],

  inputMappings: [
    { name: "Basis Of Discrimination", option: "Salary transparency" },
  ],

  explanationMappings: [],

  commentsField: {
    inputName: "Please explain the issue or problem",
    sanitizer: "none",
    templateLines: [
      "Reporting a job advertisement that does not include a salary range, in violation of the NYC salary transparency law (NYC Admin. Code 8-107(32)).",
      "Job title: {{jobTitle}}",
      "Employer: {{companyName}}",
      "Listed location: {{location}}",
      "Posting URL: {{url}}",
      "The advertisement did not state a minimum and maximum salary or hourly wage. The attached PDF contains the full job posting with its URL and capture timestamp.",
    ],
  },

  reviewPanel: {
    title: "equiPay — review before submitting",
    requirements: {
      title: "Before submitting, confirm:",
      items: [
        "The employer has 4+ employees (at least one working in NYC), or is an employment agency",
        "The job would be performed at least in part in NYC (including remote work done from NYC)",
        "The posting really lacked a good-faith salary range (PDF attached confirms)",
        "Answer what equiPay left blank: “Have you filed a complaint with us before?”, “How did you hear about the Commission?”, and the “I acknowledge” checkbox",
      ],
      warning:
        "Only report if all of the above apply — false or duplicate reports waste Commission resources. This form is a report, not a verified complaint; the CCHR can also be reached at (212) 416-0197.",
    },
    addressLookup: {
      title: "Business address (manual):",
      description:
        "Use one of these to look up {{companyName}}, then refine the “Address or general location” field above:",
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
    switchForm: {
      label: "Job outside NYC? File with the NYS DOL instead",
      jurisdiction: "nys",
    },
    links: [
      {
        label: "NYC CCHR — Salary Transparency overview",
        href: "https://www.nyc.gov/site/cchr/media/pay-transparency.page",
      },
      {
        label: "Salary Transparency Fact Sheet (PDF)",
        href: "https://www.nyc.gov/assets/cchr/downloads/pdf/publications/Salary-Transparency-Factsheet.pdf",
      },
    ],
  },
};
