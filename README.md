# DHCPulse

**Know the lease wave before the change window.**

DHCPulse is an open-source, privacy-first planner for DHCP migrations and configuration changes. Describe the lease timing and topology, then get an explainable go/no-go assessment, client-wave timeline, cutover checklist, rollback guidance, and a locally generated Markdown change plan.

It is built for Microsoft administrators, security consultants, small organizations, and homelab operators who need a credible change plan without uploading production configuration.

## Why DHCPulse exists

DHCP changes often look simple until existing leases, T1/T2 timing, a new server address, routed segments, or overlapping address pools enter the picture. Vendor migration guides explain platform steps, but they do not turn a specific topology into a client-facing time window and operational risk assessment.

DHCPulse answers:

- How many clients are expected to attempt renewal in the first hour, and when can rebinding or expiry begin?
- When can every currently valid lease have reached T1, T2, and expiry?
- Does this topology create duplicate-allocation or reachability risk?
- Which preparation, validation, and rollback steps apply to this change?

## Privacy by architecture

DHCPulse is a static web application.

- No backend or API
- No accounts, cookies, analytics, telemetry, or browser storage
- No configuration or lease-file uploads
- No hostnames, addresses, client identifiers, or secrets required
- No application network requests; production CSP uses `connect-src 'none'`
- Markdown plans are generated and downloaded locally

See [PRIVACY.md](PRIVACY.md) for the complete boundary.

## Planning model

The default lease model uses the common DHCPv4 timing defined by [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html):

- T1 renewal at 50% of the lease lifetime
- T2 rebinding at 87.5%
- Expiry at 100%

Both timing percentages are editable because servers may supply different values. When only a total client estimate is available, DHCPulse assumes online clients are healthy before cutover and evenly distributed across their T1 renewal cycle. It derives the earliest and latest renewal, rebinding, and expiry windows after cutover and clearly labels every client count as an estimate.

Important limitations:

- A shorter configured lease does not retroactively shorten leases already issued.
- Client and server implementations can differ from the default model.
- DHCPulse is a planning aid, not a packet emulator, live validation tool, or substitute for vendor documentation and a tested rollback.
- The initial release models DHCPv4 only. DHCPv6, failover protocols, split-scope designs, and lease-file parsing are outside the current scope.

The full design is documented in [docs/architecture/initial-release.md](docs/architecture/initial-release.md).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

## Deploy

### Static hosting

```bash
npm ci
npm run build
```

Publish the contents of `dist/`. Relative asset paths allow deployment at a domain root or repository subpath.

The included GitHub Pages workflow builds and deploys on `main` or can be started manually after Pages is configured to use GitHub Actions.

### Docker

```bash
docker build -t dhcpulse .
docker run --rm -p 8080:8080 dhcpulse
```

The final image runs unprivileged on port 8080 and serves restrictive security headers from [nginx.conf](nginx.conf).

For a persistent, read-only deployment with automatic restart:

```bash
docker compose up -d --build
```

Set `DHCPULSE_PORT` to publish a different host port.

## Contributing

Bug reports, validated DHCP edge cases, translations, accessibility improvements, and focused risk rules are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Security concerns belong in the private process described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
