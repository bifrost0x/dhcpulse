# Contributing

Thanks for improving DHCPulse. The most useful contributions are small, reproducible, and grounded in documented DHCP behavior or a real operational scenario.

## Before opening a pull request

1. Open an issue for a new planning rule or material workflow change.
2. Explain the topology, expected operator decision, and authoritative reference.
3. Keep the privacy boundary intact: no backend, uploads, trackers, or production identifiers.
4. Add a failing behavioral test before changing domain logic.
5. Keep English and German copy complete for user-visible changes.

## Development

```bash
npm ci
npm run dev
```

Before submitting:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Use clear commit messages and keep unrelated refactoring out of the change. Do not include real customer configurations, lease databases, addresses, client identifiers, or secrets in issues, tests, screenshots, or commits.
