# DHCPulse

DHCPulse is a static, local-only DHCP workbench for planning address pools and lease changes, preparing options and PXE settings, reviewing failover and DHCPv6 designs, troubleshooting symptoms, checking security controls, and comparing vendor configurations before a change window.

It is useful when you need an explainable second opinion without sending production configuration to an application backend. DHCPulse is not a DHCP server, IPAM/DDI system, live monitor, active scanner, packet generator, or substitute for vendor validation and lab testing.

## Implemented tools

| Tool | Practical use |
| --- | --- |
| Microsoft DHCP Config Workspace | Open an `Export-DhcpServer` XML file as a scope-first estate, search across owned objects, review grouped findings in paginated scope details, stage validated object-specific changes, and generate guarded Preflight, Apply, Verify, and Rollback PowerShell artifacts. |
| Scope and capacity | Design IPv4 pools, exclusions, reservations, and capacity margins. |
| Lease transition | Model T1, T2, expiry, client waves, cutover risks, and rollback steps. |
| DHCP options | Find, encode, decode, and validate common DHCPv4 and DHCPv6 options. |
| PXE boot | Review architecture matching, boot settings, ProxyDHCP risks, and vendor-specific example snippets. |
| Failover design | Assess Windows DHCP failover mode, timers, capacity, readiness, and validation steps. |
| DHCPv6 | Review RA flags, address and prefix lifetimes, relay evidence, DUID/IAID assumptions, and delegated-prefix capacity. |
| Diagnostics | Rank likely causes from entered symptoms and evidence, then provide targeted checks and sources. |
| DHCP security | Review control evidence for infrastructure, service, network, and operational safeguards. |
| Configuration analyzer | Import a supported configuration locally and summarize scopes, pools, reservations, options, parser warnings, and selected migration or security observations. |
| Configuration comparison | Normalize two supported configurations and report redacted semantic additions, removals, changes, and migration impacts. |

All tools run in the browser. Reports are assembled locally and downloaded through a temporary object URL. Imported-configuration reports are redacted by default.

The Microsoft workspace is deliberately different from the standalone planners: it starts with the administrator's existing configuration and presents a compact scope table instead of dumping every imported object. Search results retain their owning-scope context; reservations, options, and findings load only in the active scope tab, with at most 50 list rows per page. Import coverage, assessment findings, and target-specific package eligibility are shown separately. Generated change packages contain real infrastructure values, execute nothing automatically, and must be reviewed and tested before use. The package includes a human-readable change record, the immutable change set, and a SHA-256 manifest alongside the four PowerShell phases.

A large, entirely synthetic Microsoft export is available in [`samples/`](samples/) for regression and upload testing.

## Configuration imports

The Microsoft workspace, analyzer, and comparison tools accept pasted text or local files in these formats:

- Microsoft DHCP Server XML exports
- Kea JSON, including the supported comment forms
- ISC `dhcpd.conf`
- dnsmasq DHCP directives

Auto-detection uses recognizable content and selected file-name extensions. Each file or pasted input is limited to 2 MiB of UTF-8 data. Microsoft XML containing `DOCTYPE` or `ENTITY` declarations is rejected.

The adapters intentionally parse a bounded analysis subset. Unsupported elements, keys, directives, statements, and expression-language details can be omitted and are reported as parser warnings where detected. They do not execute includes, expand every vendor extension, reproduce configuration precedence in full, or guarantee complete schema fidelity. Always compare findings with the source configuration and vendor tooling.

Configuration files can contain sensitive infrastructure data, including addresses, hostnames, client identifiers, topology labels, audit paths, and embedded option values. Local processing prevents application uploads, but it does not make that data non-sensitive. Use a trusted browser and host, keep downloaded reports under appropriate access control, and inspect redaction before sharing.

Use **Reset** to restore the current tool's synthetic defaults and clear its current in-memory state. Leaving a tool or reloading or closing the tab also discards application state. DHCPulse does not persist projects or imports.

## Privacy and security boundary

DHCPulse is a static application with no application backend, accounts, storage, analytics, telemetry, or application network connections. Scenario and imported configuration data stay in the current browser tab. The production Content Security Policy sets `connect-src 'none'`.

External documentation and source links open only after the user activates them. A hosting provider can still process ordinary web-server request metadata. Read [PRIVACY.md](PRIVACY.md) for the exact data boundary and [SECURITY.md](SECURITY.md) for the parser threat model and disclosure process.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Testing

```bash
npm run check:repo
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
```

The build step also checks the production CSP and rejects JavaScript assets containing fetch, XHR, WebSocket, EventSource, or beacon primitives.

## Run with Docker Compose

```bash
docker compose up -d --build
```

The container runs unprivileged on port 8080 with a read-only root filesystem, dropped capabilities, `no-new-privileges`, and restrictive response headers. Set `DHCPULSE_PORT` to publish a different host port.

## Static hosting

```bash
npm ci
npm run build
```

Publish the contents of `dist/`. Relative asset paths support a domain root or repository subpath. Preserve the CSP and other security headers when configuring the host; see [PRIVACY.md](PRIVACY.md) before changing the build or hosting model.

## Authoritative references

DHCPulse links findings to the relevant source in each tool. Core references include:

- [RFC 2131 - Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131.html)
- [IANA BOOTP/DHCP Parameters](https://www.iana.org/assignments/bootp-dhcp-parameters/)
- [RFC 9915 - Dynamic Host Configuration Protocol for IPv6](https://www.rfc-editor.org/rfc/rfc9915.html)
- [Microsoft DHCP documentation](https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-top)
- [Kea Administrator Reference Manual](https://kea.readthedocs.io/en/latest/arm/config.html)
- [ISC DHCP configuration reference](https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcpdconf)
- [dnsmasq manual](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a focused change. Report security concerns through the private process in [SECURITY.md](SECURITY.md). Usage questions belong in GitHub Discussions; [SUPPORT.md](SUPPORT.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) describe the project boundaries.

## License

[MIT](LICENSE)
