# Security policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Do not publish a suspected vulnerability in a public issue. Use GitHub's private vulnerability reporting feature in the Security tab of this repository. If the reporting button is not available, contact the repository owner through an established private channel first. Include the affected version or commit, reproduction steps, impact, and any suggested mitigation.

Never include real customer configurations, lease databases, hostnames, addresses, client identifiers, credentials, or secrets in a report. Replace operational identifiers with synthetic examples.

You can expect an initial acknowledgment within seven days. Please allow time to validate and prepare a coordinated fix before disclosure.

## Security boundary

DHCPulse is a static planning application. It does not connect to DHCP servers, scan networks, parse uploaded files, or store scenario data. Reports about the security of a third-party hosting provider, browser, or linked documentation site are outside this repository unless the application weakens that boundary.
