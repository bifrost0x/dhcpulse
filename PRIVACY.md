# Privacy

DHCPulse is designed as a static, local-only application. It has no application backend and does not upload scenario data or imported configuration files.

## What the browser processes

Interactive values are held in JavaScript memory in the current browser tab. The configuration workspace and comparison utility access a user-selected file through the browser File API and read its text in browser memory. The file is rejected above 2 MiB before `File.text()` is called. After a successful workspace import, the raw text is removed from application state; the normalized configuration remains in volatile memory while the workspace is open.

Analyzer and comparison reports are redacted by default when they originate from imported configurations. Redaction is a sharing safeguard, not a guarantee that every possible vendor-specific secret or identifier will be recognized. Review every report before sharing it.

Microsoft workspace change packages are operational artifacts, not shareable redacted reports. They intentionally preserve the server, scope, address, reservation, and option values required for review and execution. They can only be created from a Microsoft XML workspace through allow-listed typed operations and the change-set validator. Treat every generated package like its source configuration and keep it under appropriate access control.

Downloads are created from an in-memory `Blob`. One-shot report downloads use a temporary object URL that is revoked immediately after activation. Guarded package links remain available only while the package view is open so every artifact can be downloaded; DHCPulse revokes all of those object URLs when the view is closed or reset. The browser and operating system control the resulting downloaded files.

Opening another configuration discards the active workspace. Resetting a utility restores its synthetic defaults and clears its current application state. Reloading or closing the tab discards all state. DHCPulse implements no cookies, local storage, session storage, IndexedDB, service worker cache, account, database, or cloud persistence.

## What DHCPulse does not do

The application does not implement:

- file or configuration upload;
- analytics, telemetry, advertising, or error-reporting services;
- active network, DNS, DHCP, server, or connectivity checks;
- application API calls or other application network connections.

The production HTML sets a Content Security Policy with `connect-src 'none'`. The build verification also rejects compiled JavaScript containing fetch, XHR, WebSocket, EventSource, or beacon primitives.

External documentation and source links open only after a user activates them. Those sites then apply their own privacy policies.

## Sensitive configuration data

DHCP configuration can contain addresses, hostnames, MAC addresses, DUIDs, client identifiers, topology names, audit paths, and secret-bearing option values. Local processing does not make that information safe to expose on screen, place in screenshots, copy to the clipboard, or save in a report. Use a trusted browser profile and device, reset or close the tab after use, and protect downloaded files.

## Hosting considerations

A static hosting provider can process ordinary request metadata such as IP address, request time, requested asset, referrer, and user agent. That infrastructure-level processing is controlled by the operator and is not application telemetry. Operators should publish their own privacy notice where required.

If the build or hosting configuration changes, the operator must verify that:

- the deployed application still has no backend, third-party scripts, analytics, telemetry, service worker persistence, or application endpoints;
- the effective response and document CSP still blocks connections with `connect-src 'none'`;
- no reverse proxy, CDN feature, tag manager, injected script, or error-reporting service receives entered or imported data;
- the compiled assets contain no fetch, XHR, WebSocket, EventSource, or beacon primitive;
- browser network inspection shows only the expected same-origin static assets until the user follows an external link.

These checks must be repeated for the actual production host; the repository build cannot attest to hosting-provider behavior.
