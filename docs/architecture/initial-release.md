# DHCPulse workbench architecture

## Release shape

DHCPulse is a static React and TypeScript single-page application built with Vite. A hash-based shell presents one multi-vendor configuration workspace plus subordinate specialist utilities without a router dependency or backend. English and German interface copy is bundled with the application.

The release covers scope and capacity planning, lease transitions, DHCP options, PXE, Windows DHCP failover, DHCPv6, diagnostics, DHCP security, configuration analysis, and semantic configuration comparison. It does not provide DHCP service, IPAM/DDI, live monitoring, active discovery, packet generation, or vendor validation.

## Workspace-first shell

`src/components/WorkbenchShell.tsx` owns hash routing, the volatile imported session, focus movement, locale propagation, and per-utility reset keys. `#/` is the safe local import entry, `#/workspace` is the active session, and `#/utilities` contains focused calculators and generators. The retired Microsoft utility route resolves to the unified entry rather than maintaining a second state machine.

`src/domain/config-workspace.ts` wraps the normalized configuration, searchable nodes, summaries, findings, scope assessment, and capability boundary in one vendor-neutral contract. `src/domain/remediation-queue.ts` converts grouped findings into bounded Act now, Review, and Observe work, preserves occurrence and scope context, tracks prepared operations, and summarizes package risk for exact targets. Microsoft executable actions are defined only in the closed registry in `src/domain/finding-actions.ts`; non-Microsoft workspaces never expose executable actions.

The shell does not persist workspace or utility state. Opening another configuration discards the imported session; returning to Utilities unmounts a utility. This keeps state lifetime bounded to the current tab.

## Domain engines

Most planning and validation logic lives in deterministic, typed engines under `src/domain/`. These engines cover IPv4 capacity, lease timing, option handling, PXE decisions, failover, DHCPv6, diagnostics, security rules, semantic comparison, and redaction. Tool components primarily adapt form state and render domain results, but the presentation layer also owns limited orchestration and derived analyzer observations, such as whether an imported configuration contains a detected failover relationship or enabled audit logging. Those observations are bounded heuristics, not complete vendor validation.

Most domain engines are pure and independent of React and the DOM. Browser-specific edges are explicit: the Microsoft XML adapter uses `DOMParser`, and download helpers use `Blob` and temporary object URLs. File selection and `File.text()` remain in the tool components.

## Canonical configuration and adapters

`src/domain/config-model.ts` defines the canonical `DhcpConfiguration` model. It represents servers, DHCPv4 and DHCPv6 scopes, pools, exclusions, reservations, options and inheritance level, policies and classes, relays, failover relationships, DNS update settings, audit settings, provenance, and parser warnings.

Four adapters normalize Microsoft DHCP XML, Kea JSON, ISC dhcpd, and dnsmasq input into that model. Detection is content- and file-name-based. Inputs are capped at 2 MiB; XML entity declarations are rejected; structured Kea and ISC inputs have additional complexity bounds. Every adapter is a bounded analysis subset. Unsupported syntax is omitted and surfaced through parser warnings where detected.

The workspace summarizes canonical entities and opens on a bounded overview that explains the product boundary and the progressive review flow. Its remediation queue then provides the primary operational surface. A persistent context panel carries rationale, impact, recommendation, evidence, provenance, relationships, occurrence navigation, and validated change preview without forcing the operator through disconnected forms. Expert findings and bounded object search remain available without rendering the full normalized model. The comparison engine matches normalized entities by semantic identity, classifies additions, removals, and changes, assigns migration impact, and redacts values before returning displayable change records.

## Finding-to-change boundary

Workspace findings carry deterministic IDs, typed evidence, confidence, affected object IDs, operational impact and recommendation keys, and authoritative sources. `finding-actions.ts` maps supported Microsoft findings to either deterministic operations or guided fields whose administrator-supplied values are validated before preview. `inventory-actions.ts` exposes the same closed operation model for supported server, scope, pool, exclusion, reservation, and option objects. Parser warnings, incomplete failover membership, policies, and DHCPv6 stay analysis-only when the imported evidence cannot determine a safe target state. Every operation passes through the change-set validator before package eligibility is evaluated.

Package generation independently requires a Microsoft XML source, a named server, a valid non-empty change set, complete target facts, and no blocker finding on the target scopes. Output contains Preflight, Apply, Verify, Rollback, a change runbook, the immutable change set, and a SHA-256 manifest. No output is executed by the application.

## Report and redaction path

Tool inputs and findings flow through `buildWorkbenchReport`. The report builder produces deterministic Markdown and JSON structures, sorts findings and sources, replaces configured sensitive values, scrubs string-valued input summaries, and applies pattern-based redaction. The analyzer report contains counts and observations rather than the raw imported model; configuration comparison exposes redacted semantic changes.

Downloads use an in-memory `Blob`. A temporary object URL is created for the browser download and revoked immediately. Reports from imported configurations are redacted by default, but redaction is not guaranteed to recognize every vendor-specific or encoded secret.

## Trust boundaries

```text
Untrusted local configuration file
  -> browser File API and size check
  -> format detection and bounded adapter
  -> canonical configuration in tab memory
  -> vendor-neutral workspace and explainable findings
  -> allow-listed Microsoft action, typed validation, package eligibility
  -> local package Blob download
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

## Release supply chain

CI verifies the supported minimum Node.js line and the current build line, enforces coverage thresholds, and validates workflow syntax. Public pull requests also receive dependency review and CodeQL analysis. Container gates use checksum-verified scanner binaries, lint the Dockerfile, scan infrastructure configuration, build the production image, and reject fixable High or Critical image vulnerabilities.

Version tags matching `package.json` trigger reproducible static archives, SHA-256 checksums, a CycloneDX SBOM, GitHub artifact attestations, and native amd64 and arm64 GHCR images with build provenance. The publishing job assembles one multi-architecture manifest only after both native builds and the full static quality gate succeed. Repository-hosted rulesets, secret scanning, private vulnerability reporting, immutable releases, and package visibility remain platform settings that a maintainer must confirm before the first public tag.
