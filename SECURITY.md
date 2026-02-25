# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@deepcitation.com**.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Impact assessment (if known)
- Any potential mitigations you have identified

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix development:** Dependent on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium/Low: Within 30 days

## Scope

The following are in scope:

- The `deepcitation` npm package (source code in `src/`)
- React components exported from the package
- Client-side API communication (`src/client/`)
- Citation parsing logic (`src/parsing/`)

The following are out of scope:

- The DeepCitation API server (api.deepcitation.com) — report separately to security@deepcitation.com
- Example applications in `examples/`
- Documentation site
- Third-party dependencies (report to their respective maintainers)

## Disclosure Policy

We follow coordinated disclosure. We will:

1. Confirm the vulnerability and determine affected versions
2. Develop and test a fix
3. Release the fix and publish a security advisory via GitHub
4. Credit the reporter (unless anonymity is preferred)

## Security Best Practices for Users

- Always use the latest version of `deepcitation`
- Store API keys in environment variables, never in code
- Use HTTPS for all API communication (enforced by default)
- Review the npm provenance attestation on published packages
