# DHCPulse

[![CI](https://github.com/bifrost0x/dhcpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/bifrost0x/dhcpulse/actions/workflows/ci.yml)
[![Container security](https://github.com/bifrost0x/dhcpulse/actions/workflows/container-security.yml/badge.svg)](https://github.com/bifrost0x/dhcpulse/actions/workflows/container-security.yml)
[![Secret scan](https://github.com/bifrost0x/dhcpulse/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/bifrost0x/dhcpulse/actions/workflows/secret-scan.yml)
[![CodeQL](https://github.com/bifrost0x/dhcpulse/actions/workflows/codeql.yml/badge.svg)](https://github.com/bifrost0x/dhcpulse/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)

DHCPulse is a local-first DHCP configuration workspace for administrators and security consultants. It turns supported configuration exports into a normalized inventory, prioritized and explainable findings, validated change previews, and guarded Microsoft DHCP PowerShell packages.

No configuration is uploaded. The production application is static, has no backend, storage, analytics, or telemetry, and ships with a Content Security Policy that blocks application network connections.

## What it does

- Imports Microsoft DHCP XML, Kea JSON, ISC `dhcpd.conf`, and dnsmasq configuration.
- Builds a bounded, searchable inventory of scopes, pools, exclusions, reservations, options, policies, relays, failover relationships, and DHCPv6 objects.
- Groups findings into an operational remediation queue with evidence, confidence, impact, sources, and affected objects.
- Lets administrators prepare allow-listed Microsoft DHCP changes from supported findings and inventory objects.
- Validates the complete change set and previews its resulting configuration before export.
- Generates separate Preflight, Apply, Verify, and Rollback PowerShell scripts plus a change record, immutable change set, and SHA-256 manifest.
- Includes specialist utilities for scope capacity, lease transitions, options, PXE, failover, DHCPv6, diagnostics, security review, and semantic configuration comparison.

DHCPulse does not run scripts, connect to DHCP servers, scan networks, provide DHCP service, replace IPAM/DDI, or claim complete vendor validation.

## Start in two minutes

Requirements: Node.js matching the supported engine range in `package.json` (22.22.2+, 24.15.0+, or 26+).

```bash
git clone https://github.com/bifrost0x/dhcpulse.git
cd dhcpulse
npm ci
npm run dev
```

Open the URL printed by Vite, select **Open a configuration**, and use either your export or the fully synthetic sample in [`samples/`](samples/).

The main workflow is:

1. **Overview** - confirm the detected format, coverage, limits, and next action.
2. **Review issues** - inspect prioritized findings and their evidence.
3. **Inventory** - search real objects and prepare supported object-level changes.
4. **Change plan** - review exact targets, rationale, before/after state, validation, and package risk.
5. **Export** - generate guarded artifacts only after all prerequisites and warnings are acknowledged.

The application includes an export guide beside the file picker. Detailed operator instructions are in [Getting started](docs/getting-started.md).

## Supported inputs

| Source | Input | Analysis | Guarded changes |
| --- | --- | --- | --- |
| Microsoft DHCP Server | XML from `Export-DhcpServer` | Yes | Supported allow-listed operations |
| Kea DHCP | JSON configuration | Yes | Analysis only |
| ISC DHCP | `dhcpd.conf` | Yes | Analysis only |
| dnsmasq | DHCP directives | Yes | Analysis only |

Every adapter intentionally implements a bounded analysis subset. Inputs are limited to 2 MiB, structural complexity is bounded, unsupported syntax can be omitted with parser warnings, and includes are not executed. See [Configuration imports](docs/configuration-imports.md).

## Privacy and safety boundary

Configuration data remains in the current browser tab. DHCPulse implements no file upload, account, database, cookies, local storage, IndexedDB, service worker cache, or application API calls. Downloads are created locally from in-memory `Blob` objects.

Configuration exports and generated packages remain sensitive operational data. Local processing prevents application uploads, but it does not make addresses, hostnames, client identifiers, topology names, or downloaded scripts safe to share. Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before using production data.

## Docker

```bash
docker compose up -d --build
```

The container listens on port 8080 and runs as an unprivileged user with a read-only root filesystem, dropped capabilities, `no-new-privileges`, bounded temporary filesystems, a health check, and restrictive response headers. Set `DHCPULSE_PORT` to publish another host port.

Deployment and reverse-proxy requirements are documented in [Deployment](docs/deployment.md).

## Development and verification

```bash
npm ci
npm run check:repo
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

The repository check rejects internal planning artifacts, local tool state, common credential files, mutable GitHub Action references, and Docker base images without immutable digests. Coverage thresholds are enforced in CI. The production build verifier checks the effective CSP and rejects compiled network primitives.

## Releases

Tagged releases publish:

- versioned static ZIP and tar.gz archives;
- SHA-256 checksums and a CycloneDX SBOM;
- signed GitHub artifact attestations;
- a native `linux/amd64` and `linux/arm64` image at `ghcr.io/bifrost0x/dhcpulse` with build provenance and SBOM metadata.

Verification commands are in [Release verification](docs/release-verification.md). Releases are not a substitute for reviewing generated change packages and testing them in a controlled environment.

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration imports](docs/configuration-imports.md)
- [Microsoft change packages](docs/microsoft-change-packages.md)
- [Deployment](docs/deployment.md)
- [Release verification](docs/release-verification.md)
- [Maintainer release procedure](docs/maintainers/releasing.md)
- [Architecture](docs/architecture/initial-release.md)
- [Privacy](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Contributing

Focused, evidence-backed contributions are welcome. Use synthetic data, preserve the browser-only privacy boundary, and add behavioral tests for domain changes. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

## License

DHCPulse is available under the [MIT License](LICENSE).
