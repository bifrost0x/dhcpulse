# Security policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Do not publish a suspected vulnerability in a public issue. Use GitHub's private vulnerability reporting feature in the Security tab of this repository. If private reporting is unavailable, contact the repository owner through an established private channel first.

Include the affected release or commit, reproduction steps using synthetic data, impact, and any suggested mitigation. Never include real customer configurations, lease databases, hostnames, addresses, client identifiers, credentials, or secrets in a report.

You can expect an initial acknowledgment within seven days. Please allow time to validate the issue and coordinate a fix before disclosure.

## Application boundary

DHCPulse is a static browser application. It does not connect to DHCP servers, scan networks, monitor traffic, send packets, or store projects. The production CSP blocks application connections with `connect-src 'none'`. Reports about a third-party browser, hosting provider, reverse proxy, or linked documentation site are outside this repository unless DHCPulse or its documented deployment configuration weakens that boundary.

## Local parser threat model

Configuration text and files are untrusted input even when they never leave the browser.

### Malicious or malformed input

The import adapters validate recognized roots or structures and reject malformed JSON and XML. They use bounded, best-effort subsets of Microsoft DHCP XML, Kea JSON, ISC dhcpd, and dnsmasq syntax; unsupported content can be omitted with warnings. Parser output must not be treated as a complete or authoritative interpretation of a vendor configuration.

Microsoft XML containing `DOCTYPE` or `ENTITY` declarations is rejected before `DOMParser` runs. DHCPulse does not resolve external entities. This reduces XML entity risk but is not a claim that browser XML parsing is safe against every engine-level vulnerability.

### Memory exhaustion

Each pasted input and selected file is limited to 2 MiB of UTF-8 data. Kea object traversal is limited to 20,000 nodes and 64 levels; the ISC tokenizer and parser also enforce complexity and depth bounds. Parsing, normalization, comparison, and rendering still consume browser memory, and a crafted input within those limits can cause a slow or unresponsive tab. Close the tab if processing becomes abnormal.

### Secret exposure

Imported configuration may contain infrastructure identifiers and secrets in fields the bounded adapters do not understand. Analyzer and comparison reports are redacted by default, and report generation replaces entered string values where configured, but redaction is not a data-loss-prevention system. It cannot guarantee recognition of every vendor extension, encoded secret, free-form comment, option value, or sensitive relationship.

Use synthetic samples for reports and bug submissions whenever possible. Inspect downloaded content before sharing, and protect browser history, screenshots, clipboard contents, temporary files, and downloads according to the source data's classification. Microsoft workspace change packages intentionally contain the operational values needed by their guarded PowerShell scripts and are not redacted sharing artifacts.

## Limitations

DHCPulse findings are planning and review assistance. They do not prove that a configuration is valid, secure, deployable, or equivalent across vendors. The application does not perform live reachability checks, vendor schema validation, packet-level simulation, authorization checks, or laboratory testing. Validate material changes with vendor tools, authoritative documentation, backups, and a controlled test environment.
