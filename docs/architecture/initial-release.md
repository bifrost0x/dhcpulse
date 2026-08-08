# DHCPulse workbench architecture

## Release shape

DHCPulse is a static React and TypeScript single-page application built with Vite. A hash-based workbench shell presents ten implemented tools without a router dependency or backend. English and German interface copy is bundled with the application.

The release covers scope and capacity planning, lease transitions, DHCP options, PXE, Windows DHCP failover, DHCPv6, diagnostics, DHCP security, configuration analysis, and semantic configuration comparison. It does not provide DHCP service, IPAM/DDI, live monitoring, active discovery, packet generation, or vendor validation.

## Modular tool shell

`src/components/WorkbenchShell.tsx` owns hash routing, catalog and tool selection, focus movement, locale propagation, and per-tool reset keys. `src/content/tool-catalog.ts` is the authoritative registry for the ten tool IDs, groups, localized names, and descriptions. Each module under `src/tools/` adapts form state to a domain engine and renders results, assumptions, source links, and local report actions.

The shell does not share scenario or import state between tools. Reset remounts the active tool; returning to the catalog unmounts it. This keeps the state lifetime bounded to the current tab and active tool.

## Domain engines

Most planning and validation logic lives in deterministic, typed engines under `src/domain/`. These engines cover IPv4 capacity, lease timing, option handling, PXE decisions, failover, DHCPv6, diagnostics, security rules, semantic comparison, and redaction. Tool components primarily adapt form state and render domain results, but the presentation layer also owns limited orchestration and derived analyzer observations, such as whether an imported configuration contains a detected failover relationship or enabled audit logging. Those observations are bounded heuristics, not complete vendor validation.

Most domain engines are pure and independent of React and the DOM. Browser-specific edges are explicit: the Microsoft XML adapter uses `DOMParser`, and download helpers use `Blob` and temporary object URLs. File selection and `File.text()` remain in the tool components.

## Canonical configuration and adapters

`src/domain/config-model.ts` defines the canonical `DhcpConfiguration` model. It represents servers, DHCPv4 and DHCPv6 scopes, pools, exclusions, reservations, options and inheritance level, policies and classes, relays, failover relationships, DNS update settings, audit settings, provenance, and parser warnings.

Four adapters normalize Microsoft DHCP XML, Kea JSON, ISC dhcpd, and dnsmasq input into that model. Detection is content- and file-name-based. Inputs are capped at 2 MiB; XML entity declarations are rejected; structured Kea and ISC inputs have additional complexity bounds. Every adapter is a bounded analysis subset. Unsupported syntax is omitted and surfaced through parser warnings where detected.

The analyzer summarizes canonical entities and selected observations. The comparison engine matches normalized entities by semantic identity, classifies additions, removals, and changes, assigns migration impact, and redacts values before returning displayable change records.

## Report and redaction path

Tool inputs and findings flow through `buildWorkbenchReport`. The report builder produces deterministic Markdown and JSON structures, sorts findings and sources, replaces configured sensitive values, scrubs string-valued input summaries, and applies pattern-based redaction. The analyzer report contains counts and observations rather than the raw imported model; configuration comparison exposes redacted semantic changes.

Downloads use an in-memory `Blob`. A temporary object URL is created for the browser download and revoked immediately. Reports from imported configurations are redacted by default, but redaction is not guaranteed to recognize every vendor-specific or encoded secret.

## Trust boundaries

```text
Untrusted pasted text or local file
  -> browser File API and size check
  -> format detection and bounded adapter
  -> canonical configuration in tab memory
  -> analyzer or redacted semantic comparison
  -> redacted report builder
  -> local Blob download
```

The source text and canonical configuration remain inside the current browser tab. No application endpoint, persistence layer, service worker, analytics service, or telemetry client exists. Production HTML sets `connect-src 'none'`, and the build verifier rejects compiled network primitives. External documentation requests occur only after a user follows a link. Static hosts remain outside the application trust boundary and can observe ordinary asset requests.

## Deployment controls

Vite emits relative asset paths for root or subpath static hosting. The container build uses digest-pinned Node and unprivileged nginx images. The included Compose service runs with a read-only root filesystem, temporary writable mounts, dropped Linux capabilities, and `no-new-privileges`. `nginx.conf` adds CSP, framing, referrer, content-type, cross-origin, and permissions headers.

Operators who change the build, proxy, CDN, or host must re-establish the privacy and CSP properties documented in `PRIVACY.md`.

## Test strategy

- Domain unit tests cover calculations, validation boundaries, parser fixtures and rejection cases, normalization, comparison impacts, deterministic IDs, redaction, and report serialization.
- React component tests run in Vitest with jsdom and exercise the real workbench shell, navigation, reset behavior, forms, imports, results, and downloads.
- TypeScript project builds and ESLint provide static checks.
- Repository policy tests reject forbidden tracked paths, mutable GitHub Action references, and unpinned Docker base images.
- The production build verifier checks the CSP, relative asset paths, emitted JavaScript presence, and absence of fetch, XHR, WebSocket, EventSource, and beacon primitives.
- Manual browser, accessibility, and deployment checks remain release-operator responsibilities and are not implied by automated results.
