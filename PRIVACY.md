# Privacy

DHCPulse is designed so that a hosted instance does not need to receive scenario data.

## Data processing

All scenario state and calculations exist only in the current browser tab. DHCPulse does not implement:

- a server-side API or database;
- user accounts or authentication;
- cookies, local storage, or session storage;
- analytics, telemetry, advertising, or error-reporting services;
- file or configuration uploads;
- active network, DNS, DHCP, or connectivity checks.

The application does not ask for production hostnames, IP addresses, MAC addresses, client identifiers, or secrets. A Markdown plan is assembled in browser memory and either copied through the browser clipboard permission or downloaded as a local file.

The production Content Security Policy sets `connect-src 'none'`, preventing application scripts from opening network connections even if a future regression attempted one.

## Hosting considerations

The static hosting provider can still process ordinary web-server metadata such as an IP address, request time, requested asset, and user agent. That infrastructure-level processing is controlled by the operator and is not part of DHCPulse itself. Operators should publish their own hosting privacy notice where required.

External documentation and source links are opened only after a user activates them.

## Verify the claim

Build the project, serve `dist/`, and inspect the browser network panel. Initial page loading fetches only same-origin HTML, JavaScript, CSS, and the logo. Editing a scenario, switching language, copying, and generating a Markdown file create no network request.
