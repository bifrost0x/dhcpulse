# DHCPulse initial release design

## Product purpose

DHCPulse is a privacy-first planning tool for DHCP migrations and configuration changes. It turns lease timing, server topology, relay changes, and lease-database decisions into an understandable cutover timeline, risk assessment, and operational checklist.

The initial release targets Microsoft administrators, security consultants, small organizations, and homelab operators. It is useful without an account, backend, network scan, uploaded configuration file, or telemetry.

## Product promise

A user can describe a DHCP change in a few minutes and answer four practical questions:

1. When will existing clients try their original server, rebind to any available server, and finally lose their lease?
2. Is the proposed cutover safe enough to proceed?
3. Which preparation, cutover, validation, and rollback actions apply to this topology?
4. What assumptions and residual risks must be communicated in the change record?

DHCPulse is a planning model, not a packet-level emulator and not a guarantee of vendor-specific client behavior.

## Privacy and safety boundary

- All calculations run locally in the browser.
- The application has no API, database, authentication, analytics, cookies, file upload, or outbound application request.
- Inputs describe a scenario and should not require hostnames, addresses, client identifiers, or production configuration files.
- The generated Markdown plan is created locally and downloaded by the browser.
- A restrictive Content Security Policy prevents connections to external services in the production build.

## Core workflow

The interface is a single-page planning workspace with five compact sections:

1. **Scenario** - choose migration, server-address change, lease-duration change, DNS-option change, or emergency replacement.
2. **Lease timing** - enter current lease duration and optionally override RFC-style T1 and T2 percentages. Defaults are 50% and 87.5%.
3. **Topology** - describe server address continuity, relay usage and update state, lease transfer, pool overlap, and coexistence.
4. **Client profile** - estimate client count and the share of clients likely to be offline during cutover.
5. **Results** - receive a verdict, lease-event timeline, client-wave estimates, risk findings, phased checklist, rollback guidance, and Markdown export.

Inputs update results immediately. Presets provide realistic examples and double as an onboarding path.

## Calculation model

### Lease events

For a lease duration `L` and optional timing fractions `t1` and `t2`:

- renewal starts at `L * t1` after the last successful lease acquisition;
- rebinding starts at `L * t2`;
- expiry occurs at `L`.

When only an aggregate client count is available, the model assumes online clients are healthy before cutover and evenly distributed across their T1 renewal cycle. Renewal attempts can therefore begin at cutover and complete within T1. If the original server stops answering, rebinding can begin after `T2 - T1` and complete within T2; expiry can begin after `L - T1` and complete within `L`. The tool reports these cutover-relative windows instead of pretending to know each endpoint's exact lease age. Clients already experiencing renewal failures before cutover are outside this aggregate model.

### Cutover consequences

- With the same service address and imported leases, renewal can continue after the replacement service is ready.
- With a new service address, clients may first unicast to the old server and generally need rebinding or a fresh DHCP exchange to discover the replacement.
- Without imported leases, reusing the same address pool can create duplicate-allocation risk until old leases expire. A non-overlapping temporary pool lowers collision risk but still requires capacity.
- Relayed networks depend on IP-helper or relay targets reaching the new service.
- Running both servers with overlapping authoritative pools is a blocking condition unless a deliberately coordinated split-scope design is selected in a future version.
- A shorter configured lease affects new and renewed leases; it does not retroactively shorten already-issued leases.
- Offline clients can return with an old address request and remain a residual risk after the visible cutover window.

### Verdicts

The engine returns one of three operational states:

- **No-go** - a blocking topology or collision condition is present.
- **Caution** - the change can be planned, but one or more time-dependent or operational risks remain.
- **Ready** - the described topology contains no known blocking condition and the generated checklist covers the remaining validation work.

Every verdict includes reasons and never hides assumptions behind a single score.

## Architecture

The application is a static React and TypeScript site built with Vite.

- `src/domain` contains pure, deterministic scenario validation, lease calculations, risk rules, checklist generation, and Markdown export.
- `src/components` contains presentation-focused UI components with semantic HTML and accessible controls.
- `src/content` contains bilingual interface copy and preset scenarios.
- `src/App.tsx` owns user-editable scenario state and composes the workflow.
- No domain module accesses the DOM, browser storage, time, or network.

This separation makes the planning rules independently testable and keeps hosting possible on GitHub Pages or any static web server.

## User experience and visual direction

The visual identity uses a dark, calm operations-console aesthetic without imitating a terminal. A restrained cyan signal color, warm warning colors, high-contrast typography, fine grid texture, and generous spacing communicate precision without visual noise.

The results remain visible beside the form on wide screens and follow the form on narrow screens. The timeline is built from semantic HTML and CSS rather than canvas so it stays responsive and accessible. Motion respects `prefers-reduced-motion`.

English is the default language, with complete German copy available from the header. User input is preserved when switching languages.

## Error handling

- Numeric inputs have explicit bounds and inline messages.
- T1 must be greater than zero and less than T2; T2 must be below 100%.
- Results are withheld when the timing model is invalid.
- Clipboard failures fall back to a downloadable Markdown file.
- Empty or unsupported browser capabilities do not prevent the core calculation.

## Testing strategy

- Unit tests cover lease event mathematics, uniform client-wave estimates, validation boundaries, verdict rules, risk ordering, checklist composition, and Markdown escaping/content.
- Component tests cover presets, language switching, invalid input handling, result rendering, and export actions using real components.
- Production verification includes type checking, linting, unit/component tests, a clean production build, preview-server browser checks at desktop and mobile widths, keyboard navigation, console inspection, and an accessibility scan.

## Initial-release scope

Included:

- Five scenario types and four curated presets
- Aggregate lease-wave estimation
- Server address, relay, lease transfer, pool overlap, coexistence, and offline-client factors
- Explainable verdict and findings
- Phase-based operational checklist and rollback guidance
- English and German interface
- Local Markdown download and clipboard copy
- Static hosting configuration, Docker image, security headers guidance, contributor documentation, and MIT license

Excluded:

- Configuration-file parsing or uploads
- Per-client lease-database imports
- IPv6 DHCPv6 planning
- Split-scope and failover protocol modelling
- Active network discovery, DNS lookup, port scanning, or server connectivity tests
- Vendor command generation
- Accounts, saved projects, shared links, telemetry, or cloud persistence

## Success criteria

The release is complete when a first-time user can load a preset or describe a scenario, understand the verdict and lease timeline without DHCP protocol expertise, export a credible change-plan draft, and verify from the repository that the hosted application sends no scenario data anywhere.
