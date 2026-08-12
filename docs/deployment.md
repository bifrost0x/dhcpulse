# Deployment

DHCPulse is a static single-page application. It requires no application server, database, account system, persistence volume, or outbound application connectivity.

## Container deployment

```bash
docker compose pull
docker compose up -d --wait
docker compose ps
```

The included Compose service pulls `ghcr.io/bifrost0x/dhcpulse:latest`, publishes container port 8080, runs as UID/GID 101, drops all Linux capabilities, uses `no-new-privileges`, mounts only bounded temporary filesystems as writable, and keeps the root filesystem read-only. For controlled deployments, copy the file and replace `latest` with a versioned image tag or immutable digest.

To use another host port:

```bash
DHCPULSE_PORT=18080 docker compose up -d --wait
```

The health check requests `http://127.0.0.1:8080/` inside the container.

To build the checked-out source intentionally, use the isolated developer override instead of the public deployment path:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build --wait
```

## Static hosting

```bash
npm ci
npm run build
```

Publish only the contents of `dist/`. Assets use relative paths and the application uses hash routing, so no server-side route rewrite is needed beyond serving `index.html` at the deployment root.

Preserve or strengthen these response controls from [`nginx.conf`](../nginx.conf):

- `Content-Security-Policy` with `connect-src 'none'`, `object-src 'none'`, `form-action 'none'`, and `frame-ancestors 'none'`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Resource-Policy: same-origin`;
- `Permissions-Policy` denying camera, geolocation, microphone, payment, and USB;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- framing protection.

Do not add analytics, telemetry, tag managers, remote scripts, service workers, error-reporting clients, or upload endpoints without treating that as a material privacy and architecture change.

## Reverse proxies and public domains

- Terminate TLS with a maintained reverse proxy or static host.
- Redirect HTTP to HTTPS.
- Preserve the application CSP instead of replacing it with a weaker provider default.
- Disable provider-side script injection and automatic analytics.
- Publish an operator privacy notice covering ordinary request logs and retention.
- Confirm with browser developer tools that loading and using DHCPulse requests only same-origin static assets until an external documentation link is activated.
- Keep generated change packages outside the web root.

GitHub Pages deployment is intentionally manual through the repository workflow so a domain and hosting privacy decision can be made before first publication.

## Update procedure

Pin production deployments to a release version or image digest. Verify checksums and attestations as described in [Release verification](release-verification.md), review release notes, test the new version, then replace the container or static asset set atomically. Do not build production from an unreviewed pull-request branch.
