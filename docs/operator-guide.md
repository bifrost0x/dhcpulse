# Operator guide

This guide explains the primary DHCPulse workflow from a configuration export to a reviewable change package. It uses the bundled synthetic Microsoft estate, so you can follow every step without production data.

## What DHCPulse does during a session

DHCPulse reads the selected file in the current browser tab, normalizes supported objects, and removes the raw text from application state after a successful workspace import. It does not connect to a DHCP server, execute a command, or upload the file.

The workflow has five screens:

1. **Overview** confirms what was recognized.
2. **Review issues** prioritizes conditions that need attention.
3. **Inventory** exposes the imported objects and their relationships.
4. **Change plan** reviews validated operations that you deliberately added.
5. **Export** generates a guarded Microsoft PowerShell package when the plan is eligible.

Kea, ISC dhcpd, and dnsmasq workspaces support analysis and inventory. Executable packages are limited to supported Microsoft DHCP XML imports.

## 1. Start safely

For a first run, start DHCPulse and select **Open Microsoft example**. The sample includes enough scopes, reservations, options, exclusions, policies, DHCPv6 objects, and failover data to exercise the full interface.

For a real Microsoft export, run the following with an account that can read the DHCP configuration:

```powershell
Import-Module DhcpServer
$ExportPath = Join-Path $env:TEMP 'dhcpulse-export.xml'
Export-DhcpServer -ComputerName $env:COMPUTERNAME -File $ExportPath -Force
$ExportPath
```

Do not add `-Leases`. DHCPulse does not need active leases for this workflow, and including them can make the export exceed the 2 MiB input limit.

Before continuing with production data:

- use a trusted browser profile and device;
- keep the export outside shared or synchronized folders where possible;
- do not attach the export to an issue or discussion;
- plan how the export and generated package will be deleted or retained securely.

## 2. Confirm the import in Overview

![DHCPulse configuration overview](assets/screenshots/workspace-overview.png)

Start with the three status cards and the object counts.

Check the following:

- **Import coverage** reports the expected vendor and plausible object counts.
- **Assessment** separates blockers, warnings, and informational findings.
- **Package boundary** states whether Microsoft actions are available.
- Scope, reservation, option, and finding counts are plausible for the source estate.

Parser warnings describe incomplete or uncertain coverage. They are separate from operational findings. Stop if the wrong format was detected or if an object category that matters to your review is absent.

## 3. Work the prioritized issue queue

![DHCPulse prioritized issue review](assets/screenshots/review-issues.png)

Use the filters to narrow the queue by scope, severity, or whether DHCPulse can prepare a supported change.

For each relevant issue:

1. Read **Why flagged**.
2. Compare **Evidence** with the source or approved design.
3. Read **Operational impact** and **Recommendation**.
4. Move between occurrences when the same rule affects multiple objects.
5. Open the affected object when you need its full configuration context.

Severity is an operational review priority, not a vulnerability score. A blocker means the imported state conflicts with a guarded workflow assumption; it does not prove exploitability.

When **Available changes** is shown, select an action and enter the required values. DHCPulse first creates a read-only preview. Nothing enters the plan until you review the before/after state and activate **Add to change plan**.

## 4. Explore the inventory

![DHCPulse object inventory](assets/screenshots/object-inventory.png)

The category buttons filter the object list immediately. Search accepts names, addresses, networks, option values, and client identifiers that exist in the imported model.

Select an object to inspect:

- normalized facts;
- source provenance;
- effective options;
- related objects;
- findings that affect it;
- supported object-level changes.

The visible list is intentionally bounded. Refine the category or search when the estate contains more than the displayed limit.

Supported Microsoft operations include bounded scope, exclusion, reservation, option, and scope-clone changes. An action is hidden or blocked when the importer did not establish all required target facts.

## 5. Review the change plan

The change plan contains only operations that passed their individual preview validation. DHCPulse then validates the complete plan again because two individually valid operations can conflict when combined.

Review every entry for:

- exact server and scope target;
- rationale and source finding where applicable;
- before and after values;
- validation state;
- related target risk;
- dependency ordering.

Remove or revise an operation if the result is not exactly what the approved change requires. DHCPulse never applies a suggestion automatically.

## 6. Generate and inspect the package

Export remains blocked until the Microsoft source, target facts, complete plan, and warning acknowledgements satisfy the package boundary.

An eligible package contains:

| Artifact | Review purpose |
| --- | --- |
| `01-Preflight.ps1` | Detects drift from the imported before-state |
| `02-Apply.ps1` | Applies operations in dependency-safe order |
| `03-Verify.ps1` | Confirms the expected after-state |
| `04-Rollback.ps1` | Restores operations in reverse dependency order when guards still pass |
| `CHANGE.md` | Human-readable targets and before/after review |
| `change-set.json` | Exact immutable operation model |
| `manifest.json` | UTF-8 sizes and SHA-256 digests |

Download every artifact into a restricted working directory. Read `CHANGE.md`, inspect all PowerShell content, verify the manifest, and test Preflight, Apply, Verify, and Rollback in a controlled environment.

DHCPulse cannot verify credentials, Microsoft authorization, failover runtime state, backups, active leases, change windows, or network reachability. Normal approval and change-control procedures still apply.

## 7. End the session

Use **Open another configuration**, reload the page, or close the tab to discard the current in-memory workspace. Protect or remove the downloaded source and package according to your operational policy.

## Troubleshooting

### The file is rejected above 2 MiB

Export only the required Microsoft scope by adding `-ScopeId` to `Export-DhcpServer`, or prepare a smaller controlled configuration for analysis. Do not remove the client-side limit in a production build.

### Expected objects are missing

Review import coverage and parser warnings. Includes, vendor extensions, expressions, and some precedence rules are intentionally not expanded. See [Configuration imports](configuration-imports.md).

### No change is available

Confirm that the source is Microsoft DHCP XML and that the selected object contains all required imported facts. Analysis-only vendors and unsupported findings do not expose executable actions.

### Export remains blocked

Open **Change plan** and **Export**. Resolve invalid operations, blocker findings on targets, missing server identity, and unacknowledged warnings. Do not bypass a package guard.

### The generated script no longer matches the server

Do not edit around a failed Preflight guard. Create a fresh export, rebuild the plan, and repeat the review.
