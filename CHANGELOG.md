# Changelog

All notable changes to DHCPulse are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-08-13

### Fixed

- Removed an incorrect Microsoft DHCP warning that treated reservations inside the scope distribution range as unsafe.
- Removed the corresponding exclusion proposal so generated change plans follow Microsoft DHCP reservation semantics.
- Centralized workspace rule copy and authoritative references in a tested domain catalog.
- Restored guarded package generation on plain HTTP LAN deployments by adding a local SHA-256 fallback for browsers that withhold WebCrypto outside secure contexts.

### Changed

- Updated workspace tests and example workflows to use genuine gateway and option risks.
- Removed an unused legacy findings component.
- Clarified that the `latest` container tag follows the latest tagged release rather than every commit on `main`.

## [0.1.0] - 2026-08-12

### Added

- Multi-vendor configuration workspace for Microsoft DHCP XML, Kea JSON, ISC dhcpd, and dnsmasq.
- Searchable object inventory, bounded remediation queue, evidence-backed findings, and validated change previews.
- Guarded Microsoft DHCP Preflight, Apply, Verify, and Rollback package generation.
- Specialist DHCP planning, diagnostics, security, comparison, and report utilities.
- Browser-only privacy architecture, hardened container deployment, coverage gates, dependency review, CodeQL, container scanning, SBOMs, and release attestations.

### Security

- Bounded input size and parser structure, XML entity declaration rejection, output redaction, PowerShell literal quoting, stale-export cancellation, and immutable dependency/action/container references.

[Unreleased]: https://github.com/bifrost0x/dhcpulse/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/bifrost0x/dhcpulse/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bifrost0x/dhcpulse/releases/tag/v0.1.0
