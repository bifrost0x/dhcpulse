# Release verification

Official DHCPulse releases contain static archives, checksums, a CycloneDX SBOM, GitHub artifact attestations, and a multi-architecture GHCR image.

Replace `v0.1.0` in the examples with the release you are verifying.

## Static artifacts

```bash
mkdir dhcpulse-release
cd dhcpulse-release
gh release download v0.1.0 --repo bifrost0x/dhcpulse
sha256sum --check SHA256SUMS
gh attestation verify dhcpulse-0.1.0-static.zip --repo bifrost0x/dhcpulse
gh attestation verify dhcpulse-0.1.0-static.tar.gz --repo bifrost0x/dhcpulse
gh attestation verify dhcpulse-0.1.0.sbom.cdx.json --repo bifrost0x/dhcpulse
```

The checksum file covers both static archives and the SBOM. Inspect the GitHub Release page and confirm the tag, source commit, and workflow identity shown by attestation verification.

## Container image

```bash
docker pull ghcr.io/bifrost0x/dhcpulse:0.1.0
docker buildx imagetools inspect ghcr.io/bifrost0x/dhcpulse:0.1.0
gh attestation verify oci://ghcr.io/bifrost0x/dhcpulse:0.1.0 --owner bifrost0x
```

The manifest must contain `linux/amd64` and `linux/arm64`. For a fixed deployment, record and deploy the verified `sha256:` manifest digest rather than a mutable convenience tag.

## Local source verification

```bash
git clone https://github.com/bifrost0x/dhcpulse.git
cd dhcpulse
git checkout v0.1.0
npm ci
npm run check:repo
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

Attestations establish which workflow produced an artifact from a repository subject. They do not replace code review, vulnerability management, operational testing, or review of generated DHCP change packages.
