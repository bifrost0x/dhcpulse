# Configuration imports

DHCPulse normalizes four vendor formats into one typed configuration model. The model is designed for analysis and change planning, not for lossless round-tripping.

## Support matrix

| Format | Recognized content | Important limits |
| --- | --- | --- |
| Microsoft DHCP XML | Servers, IPv4/IPv6 scopes, pools, exclusions, reservations, options, policies, relays, failover, DNS and audit facts | Requires recognizable DHCP export XML; entity declarations are rejected; executable changes require a named Microsoft server |
| Kea JSON | DHCP4/DHCP6 subnets, pools, reservations, option data, relay and selected HA/DDNS facts | Comments are supported in bounded forms; hooks, expressions, includes, and every extension are not interpreted |
| ISC dhcpd | Subnets, ranges, reservations, options, selected policies and failover declarations | Bounded tokenizer and nesting; includes and arbitrary expressions are not executed |
| dnsmasq | DHCP ranges, hosts, options, tags and selected PXE/relay directives | Directive subset only; referenced files and full tag precedence are not expanded |

## Input boundaries

- A selected file is rejected above 2 MiB before `File.text()` is called.
- Pasted comparison input is limited to the same UTF-8 size.
- Structured parsers enforce depth and node or token limits.
- Microsoft XML containing `DOCTYPE` or `ENTITY` is rejected before browser XML parsing.
- Malformed recognized JSON, XML, and bounded ISC syntax is rejected with a stable import error.
- Inputs are never executed and include directives are never followed.

These controls reduce denial-of-service and injection risk but cannot make the browser immune to every malicious input. Close the tab if processing becomes abnormal.

## Detection and provenance

Auto-detection uses recognizable content and selected filename extensions. Explicit format selection in the comparison utility takes precedence. Canonical objects retain source provenance where the adapter can establish it, and findings link to authoritative references.

Import coverage, parser warnings, and analysis findings answer different questions:

- **Coverage** describes what object categories were recognized.
- **Parser warnings** identify omitted or uncertain syntax.
- **Findings** apply bounded operational rules to recognized facts.

Do not interpret a clean finding list as confirmation that the complete vendor configuration was parsed or validated.

## Sensitive values

Configuration files may contain topology, hostnames, MAC addresses, DUIDs, client identifiers, audit paths, free-form comments, or secret-bearing option values. Analyzer and comparison downloads redact recognized values by default, but redaction is not a data-loss-prevention system. Microsoft change packages are intentionally not redacted because they need exact operational values.

Use synthetic data in bug reports, screenshots, and public discussions.
