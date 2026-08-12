# Releasing DHCPulse

Only a maintainer with repository and package permissions can publish a release. Releases must come from a reviewed commit on `main`; never tag a pull-request head directly.

## Repository prerequisites

Before the first public release:

- make the repository public;
- enable private vulnerability reporting;
- enable Dependabot alerts and security updates;
- enable CodeQL default or workflow scanning;
- enable secret scanning and push protection;
- enable immutable releases;
- require the CI, CodeQL, dependency review, and container security checks through a `main` ruleset;
- confirm Actions retains read-only default workflow permissions and requires full-SHA action pinning;
- confirm the `ghcr.io/bifrost0x/dhcpulse` package inherits the intended visibility.

These settings are repository controls and are not established by source files alone.

## Prepare the version

1. Confirm all dependency updates and security alerts are reviewed.
2. Set the same semantic version in `package.json` and `package-lock.json`.
3. Move relevant changelog entries from **Unreleased** to a dated version heading.
4. Verify operator documentation, supported inputs, security limitations, and sample checksums.
5. Merge the release preparation through the protected `main` branch.

From a clean checkout of the resulting `origin/main`:

```bash
npm ci
npm run check:repo
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:ci
npm run build
docker build --pull --tag dhcpulse:release-check .
```

Run the same container and secret scanners used by CI, then confirm every required GitHub check is successful on the exact main commit.

## Tag and publish

Create an annotated tag that exactly matches the package version and push only that tag:

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git tag --annotate v0.1.0 --message "DHCPulse v0.1.0"
git push origin v0.1.0
```

The tag starts the release workflow. It refuses a version mismatch or a commit outside `origin/main`, reruns every quality gate, publishes deterministic static archives and the multi-architecture GHCR image, creates checksums and a source-timestamp-normalized SBOM, attests artifacts and images, and creates the GitHub Release.

## Verify and announce

1. Wait for the complete release workflow.
2. Confirm the GitHub Release points to the intended commit and is immutable.
3. Download and verify every artifact using [Release verification](../release-verification.md).
4. Inspect the GHCR manifest for both supported architectures and verify its attestation.
5. Test the published container with a read-only root filesystem and the bundled synthetic sample.
6. Publish documentation or announcement links only after those checks pass.

If any stage fails, do not move or reuse the tag. Fix the cause on `main`, increment the patch version, and create a new release.
