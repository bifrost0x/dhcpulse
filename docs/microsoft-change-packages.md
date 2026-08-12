# Microsoft DHCP change packages

DHCPulse can prepare PowerShell artifacts only from a Microsoft DHCP XML workspace. Generation is intentionally narrower than analysis.

## Eligibility

Export remains blocked unless all of the following are true:

- the source is a recognized Microsoft DHCP XML export;
- the export identifies one server;
- the change plan is non-empty and valid as a complete set;
- every target has the required imported facts;
- the validated preview has no blocker finding on a target scope;
- the administrator has acknowledged visible target warnings.

All supported actions come from a closed registry. Free-form PowerShell is never accepted or generated.

## Package contents

| File | Purpose |
| --- | --- |
| `01-Preflight.ps1` | Fails if live state no longer matches the imported before-state or a target already exists |
| `02-Apply.ps1` | Applies operations in dependency-safe order |
| `03-Verify.ps1` | Verifies the expected after-state |
| `04-Rollback.ps1` | Restores operations in reverse dependency order when its guards still pass |
| `CHANGE.md` | Human-readable targets, before/after values, order, and safety boundary |
| `change-set.json` | Exact immutable operation model used for generation |
| `manifest.json` | UTF-8 byte count and SHA-256 digest for every other artifact |

Scripts set strict mode and stop on errors. Values are emitted as PowerShell single-quoted literals with embedded quotes escaped. Reservation removals use scope plus client identity rather than an ambiguous address-only target.

## Safe operating procedure

1. Create a fresh server backup and retain the original XML export.
2. Download every artifact into a restricted working directory.
3. Verify `manifest.json` against the exact downloaded content.
4. Read `CHANGE.md`, then inspect every PowerShell line.
5. Confirm server name, scopes, addresses, identifiers, option values, and execution order against the approved change.
6. Run `01-Preflight.ps1` from an authorized management host.
7. Stop if preflight reports drift. Re-export and rebuild the plan instead of bypassing a guard.
8. Test Apply, Verify, and Rollback in a controlled environment representative of production.
9. Execute the approved Apply and Verify phases using normal change-control procedures.
10. Use Rollback only when required and only while its guards still describe the current state.

DHCPulse does not check credentials, authorization, replication health, failover runtime state, reachability, backups, active leases, or maintenance windows. The administrator remains responsible for all execution and approval decisions.
