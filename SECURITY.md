# Security Policy

## Reporting a Vulnerability

If you believe you've found a security issue in equiPay, please **do not open a public GitHub issue**. Instead, report it privately via one of:

- GitHub's private vulnerability reporting: <https://github.com/pandtlabs/equipay/security/advisories/new>

When reporting, please include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The version of equiPay and your Chrome version

We'll aim to acknowledge reports within 7 days and address confirmed issues promptly. Once a fix is released, you're welcome to publish details of the finding if you'd like to be credited.

## Scope

equiPay's security surface is small because the extension makes no outbound network requests of its own. The main concerns we want to hear about:

- Exploits that let a malicious website read data from `chrome.storage.local` or the Options page (e.g., XSS in the review panel, prototype pollution, etc.)
- Vulnerabilities in the extension's messaging flow between content scripts and the service worker
- Issues that could cause the extension to file or modify a complaint without the user's explicit action
- Supply-chain concerns in the vendored `jspdf` or `html2canvas` bundles

Out of scope:

- Issues in the NYS DOL complaint form itself — report those to NY DOL
- Issues specific to a job-board site (LinkedIn, Indeed, etc.) — report those to the site
- Social-engineering attacks on end-users
