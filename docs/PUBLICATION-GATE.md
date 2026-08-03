# Publication Gate

Status: **PREPARED — visibility change remains manual**

The repository now has an MIT license, a closed single-product layout, deterministic generation, and local validation. Making the GitHub repository public remains an outward-facing operation and must be performed separately and explicitly.

## Completed in the publication-preparation branch

- [x] Add a repository-wide MIT `LICENSE`.
- [x] Update `NOTICE.md` and `docs/PROVENANCE.md` with factual source-overlap, trademark, and disclaimer language.
- [x] Reduce the live product to one Subconverter entry and one Mihomo template backed by the same 61 rulesets.
- [x] Remove Full, local, Extended, EMBY community, Spotify legacy, Qobuz brand-defense, and repository base-config products.
- [x] Remove automatic-latency groups and Mihomo proxy-provider health probing.
- [x] Pin GitHub Actions to immutable full commit SHAs.
- [x] Enforce anchored domain matching for every DIRECT-default policy.
- [x] Confirm all 206 destination-IP rules carry `no-resolve` and all CIDRs are strict.
- [x] Preserve and validate the immutable Phase 2/3 migration and DIRECT-recovery ledgers.
- [x] Validate the generated closed file set, SHA-256 manifest, sensitive-content gate, and deterministic clean render.
- [x] Review the full Git history and Actions logs for live credentials; findings were false positives or masked values.

## Required before merging this preparation branch

- [x] Run the complete Python test suite on Windows and Linux CI.
- [x] Confirm `python scripts/validate_generated.py` passes with zero sensitive findings.
- [x] Confirm `python scripts/generate_profile.py --check` reports no differences.
- [x] Verify the sole Subconverter artifact with `subconverter.exe -g --artifact`.
- [x] Verify the sole Mihomo template with an isolated local-file Provider configuration and `verge-mihomo.exe -t` only.
- [x] Confirm no validation process or port 25500 listener remains.
- [x] Review the final PR diff and merge only after required CI succeeds.

## Separate public-visibility operation

After the preparation PR is merged, the public switch must be a separate explicit action:

- [ ] Confirm README and Raw URLs are correct on `main`.
- [ ] Optionally remove the historical remote `phase-2-classification` branch to simplify the public branch list.
- [ ] Change repository visibility to Public.
- [ ] Immediately configure a branch ruleset requiring Windows and Linux validation checks.
- [ ] Enable Dependabot alerts, secret scanning, and push protection where available.
- [ ] Recheck public Raw access for both documented entry points.

No repository script changes GitHub visibility, publishes a release, changes system proxy/DNS/TUN/routes, or starts a Mihomo service.
