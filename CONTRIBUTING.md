# Contributing

Thanks for improving DHCPulse. The most useful contributions are small, reproducible, and grounded in documented DHCP behavior or a real operational scenario.

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a pull request

1. Open an issue for a new planning rule or material workflow change.
2. Explain the topology, expected operator decision, and authoritative reference.
3. Keep the privacy boundary intact: no backend, uploads, trackers, or production identifiers.
4. Add a failing behavioral test before changing domain logic.
5. Keep English and German copy complete for user-visible changes.

## Development

Use a Node.js release matching the engine range in `package.json` (22.22.2+, 24.15.0+, or 26+). Install the exact locked dependency graph with `npm ci`; do not commit a lockfile produced by an unsupported runtime.

```bash
npm ci
npm run dev
```

Before submitting:

```bash
npm run check:repo
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

## Pull request expectations

- Keep one operational problem per pull request and explain the user-visible outcome.
- Add a regression test that fails before a domain or security fix and passes afterward.
- Preserve stable error codes and deterministic output where callers rely on them.
- Update English and German UI copy together.
- Update operator documentation when a workflow, input boundary, supported format, or generated artifact changes.
- Keep GitHub Actions and Docker base images pinned to immutable digests or commit SHAs.
- Do not weaken input limits, CSP, redaction, export guards, or the no-backend boundary without explicit design and security review.

Use clear commit messages and keep unrelated refactoring out of the change. Do not include real customer configurations, lease databases, addresses, client identifiers, or secrets in issues, tests, screenshots, or commits.

## Review priorities

Reviews prioritize correctness of generated changes, privacy boundaries, parser safety, accessibility, localization, bounded rendering, and authoritative DHCP behavior over cosmetic refactoring. A passing test suite is required but is not evidence that a new planning rule is operationally correct.
