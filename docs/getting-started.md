# Getting started

This guide takes an administrator from a supported configuration export to a reviewed DHCPulse workspace. Nothing is uploaded and DHCPulse does not connect to a DHCP server.

## 1. Open DHCPulse

Use one of the following startup paths.

### npm development server

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/`. Vite binds to all interfaces so that another device on the same trusted network can use the network URL printed in the terminal. Do not expose the development server directly to the internet. If port 5173 is occupied, use the fallback URL printed by Vite.

### Production-like npm preview

```bash
npm ci
npm start
```

Open `http://localhost:4173/`. This command creates a verified production build before starting the local preview server. The preview server is intended for local validation, not public hosting.

### Docker Compose

```bash
docker compose pull
docker compose up -d --wait
```

Open `http://localhost:8080/` after Compose reports the service as healthy. The default Compose file pulls the official `ghcr.io/bifrost0x/dhcpulse:latest` image and never builds the checkout. To use another host port, set `DHCPULSE_PORT`, for example:

```bash
DHCPULSE_PORT=9080 docker compose up -d --wait
```

Then open `http://localhost:9080/`. Use `docker compose ps` for status and `docker compose logs dhcpulse` if startup does not complete.

For an intentional local source build, use the separate developer override:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build --wait
```

## 2. Create a supported input

### Microsoft DHCP Server

Run Windows PowerShell as an administrator on a management system with the DHCP Server PowerShell module installed. Exporting configuration requires appropriate rights on the target server.

```powershell
Import-Module DhcpServer
Export-DhcpServer -ComputerName "dhcp01.example.com" -File "C:\Temp\dhcpulse-export.xml" -Force
```

Use your actual server name and protect the resulting XML like other infrastructure configuration. The optional `-Leases` switch is not required for DHCPulse and can make the export substantially larger. DHCPulse accepts files up to 2 MiB.

If the command is unavailable on a workstation, install the Microsoft DHCP management tools (RSAT) or run the export on an authorized management host. Do not paste production XML into an issue or discussion.

### Kea DHCP

Select the JSON configuration consumed by `kea-dhcp4` or `kea-dhcp6`. DHCPulse does not resolve include files, environment substitutions, or every Kea expression, so use a self-contained synthetic copy when testing and review parser warnings after import.

Validate the source with the matching Kea version before relying on it operationally:

```bash
kea-dhcp4 -t /path/to/kea-dhcp4.conf
```

### ISC dhcpd

Select the relevant `dhcpd.conf`. Includes are not followed. If the deployment splits configuration across files, create a controlled synthetic combined copy or analyze the relevant file and treat coverage warnings explicitly.

### dnsmasq

Select a configuration file containing the relevant `dhcp-range`, `dhcp-host`, `dhcp-option`, and related directives. DHCPulse does not read other files referenced by dnsmasq.

## 3. Import and confirm coverage

1. Select **Open a configuration**.
2. Confirm the detected vendor and format.
3. Review the import coverage separately from findings.
4. Stop if the wrong format was detected or essential objects are missing.
5. Treat parser warnings as coverage limits, not as proof that the source is invalid.

The bundled [`samples/microsoft-dhcp-realistic-large.xml`](../samples/microsoft-dhcp-realistic-large.xml) is synthetic and intended for exploring the complete Microsoft workflow without exposing production data.

## 4. Work through the workspace

- **Overview** summarizes what was imported and identifies the next useful action.
- **Review issues** groups repeated findings and lets you inspect one occurrence at a time with evidence and source references.
- **Inventory** searches scopes and dependent objects without rendering the entire estate at once.
- **Change plan** contains only changes that passed the typed preview validator.
- **Export** is available only for supported Microsoft XML workspaces with an eligible, non-empty plan.

Finding severity expresses operational review priority. It is not a vulnerability score and does not prove exploitability.

## 5. Handle generated files safely

Generated Microsoft packages intentionally contain real server names, addresses, client identifiers, options, and scope values. Download all artifacts into a restricted working directory, compare them with the approved change request, and test them against a lab or controlled target. Follow [Microsoft change packages](microsoft-change-packages.md) before execution.

Use **Open another configuration**, reload the page, or close the tab to discard the current in-memory workspace.
