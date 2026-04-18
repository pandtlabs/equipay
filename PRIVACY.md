# equiPay Privacy Policy

_Last updated: April 18, 2026_

equiPay is an open-source Chrome extension that helps you file New York Pay Transparency Law (§194-b) complaints with the NYS Department of Labor.

## What data does equiPay collect?

**None that leaves your device.**

equiPay stores two categories of data locally in your browser, using Chrome's built-in `chrome.storage.local` API:

1. **Your claimant profile** — name, email, phone, mailing address — entered by you on the extension's Options page.
2. **Per-capture data** — the job posting's URL, title, employer name, and the generated evidence PDF — created when you click the equiPay toolbar icon on a job posting. This data is overwritten on the next capture.

All of this data lives on your computer, inside your Chrome profile. equiPay does not transmit it to any server, third party, or the extension's authors.

## Does equiPay share data with anyone?

**No.** equiPay makes no network requests to any service operated by P&T Labs LLC or its authors. It does not include analytics, telemetry, crash reporting, advertising identifiers, or tracking pixels.

The extension does open two categories of destination, but only when *you* click the toolbar icon or a button in the review panel:

- **The NYS DOL complaint form** (`apps.labor.ny.gov`) — opened in a new tab so you can review and submit a complaint.
- **Optional lookup helpers** — when you click "NY DOS" or "Web search" in the review panel, equiPay opens those sites in a new tab with the employer's name copied to your clipboard. No data is sent automatically; you search manually.

## Does equiPay access other websites?

equiPay only runs on a page when you explicitly click its toolbar icon (`activeTab` permission) or when you land on the NYS DOL complaint form tab that the extension itself opened. On the job-posting tab, it reads the posting's DOM to extract the job description, employer, and title; on the DOL tab, it pre-fills form fields using your stored profile and capture data.

equiPay does **not** read your browsing history, other open tabs, form data on non-DOL sites, or any page you have not explicitly activated.

## Permissions, in plain language

- `activeTab` — allows the extension to read the tab you clicked on.
- `scripting` — allows the extension to inject its capture and form-fill scripts.
- `downloads` — allows the extension to save the evidence PDF to your Downloads folder.
- `storage` / `unlimitedStorage` — allows the extension to store your claimant profile and the generated PDF locally.
- `tabs` — allows the extension to open the NYS DOL complaint form in a new tab.
- Host permission for `apps.labor.ny.gov` — allows the extension to pre-fill the complaint form on that specific site.

## Open source

equiPay is released under the MIT License. The full source code is available at <https://github.com/pandtlabs/equipay>. You are welcome to audit, fork, or self-build the extension.

## Contact

Privacy or security questions: open an issue at <https://github.com/pandtlabs/equipay/issues>, or see [SECURITY.md](SECURITY.md) for reporting confidential security concerns.

## Changes to this policy

If this policy changes in a material way, the updated version will be published in this repository and the `Last updated` date above will change. There is no user account to notify, and no prior version of your data is retained on our end because we do not retain any.
