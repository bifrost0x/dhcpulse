# DHCPulse

DHCPulse is a static, local-only configuration workspace for understanding DHCP environments and preparing safer changes. Open a Microsoft DHCP XML, Kea JSON, ISC `dhcpd.conf`, or dnsmasq configuration to get one normalized overview, prioritized findings, and a searchable object inventory. Supported Microsoft findings can be turned into validated Preflight, Apply, Verify, and Rollback PowerShell artifacts.

It is useful when you need an explainable second opinion without sending production configuration to an application backend. DHCPulse is not a DHCP server, IPAM/DDI system, live monitor, active scanner, packet generator, or substitute for vendor validation and lab testing.

## Primary workflow

1. Open a local configuration or the bundled realistic Microsoft example.
2. Start on **Overview**, which explains the import result, the product boundary, and the four-step review flow.
3. Open **Review issues** and work through **Act now**, **Review**, and **Observe**. Filter by scope, severity, actionability, or rule, then inspect evidence, provenance, related objects, and repeated occurrences.
4. For supported Microsoft XML issues, preview an allow-listed typed change before adding it to the local **Change plan**. Adding the same issue twice remains idempotent.
5. Review exact scope, rationale, before/after state, and validation before opening **Export**. The export view explains missing prerequisites instead of presenting an inactive action.
6. Generate, download, and inspect the guarded package. DHCPulse never connects to or changes the server.

Kea, ISC dhcpd, and dnsmasq receive the same analysis and object workflow. Executable changes remain Microsoft-only because their package generation is bound to the typed Microsoft DHCP PowerShell model and validated source facts.

## Specialist utilities

| Tool | Practical use |
| --- | --- |
| Scope and capacity | Design IPv4 pools, exclusions, reservations, and capacity margins. |
| Lease transition | Model T1, T2, expiry, client waves, cutover risks, and rollback steps. |
| DHCP options | Find, encode, decode, and validate common DHCPv4 and DHCPv6 options. |
| PXE boot | Review architecture matching, boot settings, ProxyDHCP risks, and vendor-specific example snippets. |
| Failover design | Assess Windows DHCP failover mode, timers, capacity, readiness, and validation steps. |
| DHCPv6 | Review RA flags, address and prefix lifetimes, relay evidence, DUID/IAID assumptions, and delegated-prefix capacity. |
| Diagnostics | Rank likely causes from entered symptoms and evidence, then provide targeted checks and sources. |
| DHCP security | Review control evidence for infrastructure, service, network, and operational safeguards. |
| Configuration comparison | Normalize two supported configurations and report redacted semantic additions, removals, changes, and migration impacts. |

All tools run in the browser. Reports are assembled locally and downloaded through a temporary object URL. Imported-configuration reports are redacted by default.

The configuration workspace does not dump a large environment into the page. Its overview explains what was imported and directs the operator into one progressive flow: **Overview → Review issues → Inventory → Change plan → Export**. The issue queue groups findings by rule, ranks operational work, keeps occurrence and scope context visible, and limits every section to 50 rule groups. Repeated occurrences remain navigable, while objects load through a bounded search. Import coverage, expert analysis, and package readiness remain separate. Before acknowledgement, package readiness lists exact target scopes and grouped blocker and warning rules. Generated change packages contain real infrastructure values, execute nothing automatically, and must be reviewed and tested before use. The package includes a human-readable change record, the immutable change set, and a SHA-256 manifest alongside the four PowerShell phases.

A large, entirely synthetic Microsoft export is available in [`samples/`](samples/) for regression and upload testing.

## Configuration imports

The primary workspace accepts local files in these formats; the comparison utility also accepts pasted text:

- Microsoft DHCP Server XML exports
- Kea JSON, including the supported comment forms
- ISC `dhcpd.conf`
- dnsmasq DHCP directives

Auto-detection uses recognizable content and selected file-name extensions. Each file or pasted input is limited to 2 MiB of UTF-8 data. Microsoft XML containing `DOCTYPE` or `ENTITY` declarations is rejected.

The adapters intentionally parse a bounded analysis subset. Unsupported elements, keys, directives, statements, and expression-language details can be omitted and are reported as parser warnings where detected. They do not execute includes, expand every vendor extension, reproduce configuration precedence in full, or guarantee complete schema fidelity. Always compare findings with the source configuration and vendor tooling.

Configuration files can contain sensitive infrastructure data, including addresses, hostnames, client identifiers, topology labels, audit paths, and embedded option values. Local processing prevents application uploads, but it does not make that data non-sensitive. Use a trusted browser and host, keep downloaded reports under appropriate access control, and inspect redaction before sharing.

Use **Open another configuration** to discard the active workspace. Leaving a utility resets its isolated state; reloading or closing the tab discards all application state. DHCPulse does not persist projects or imports.

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
