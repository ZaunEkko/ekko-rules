# Publication Gate

Status: **BLOCKED — private maintenance only**

The following items require human completion before making the repository public, publishing Raw
URLs, creating releases, or redistributing generated products.

## License and provenance

- [ ] Map canonical rule segments to attributable upstream sources where evidence permits.
- [ ] Resolve compatibility and obligations across CC-BY-SA-4.0, GPL-2.0, GPL-3.0, and any deeper
      upstream sources referenced by aggregators.
- [ ] Replace or remove every rule whose only evidence is an unlicensed gist or mirror.
- [ ] Prepare complete attribution, modification notices, source references, and required license
      texts for the chosen distribution model.
- [ ] Decide whether a repository-wide license is legally and operationally appropriate.
- [ ] Obtain explicit human approval for publication. Automated checks cannot approve this item.

## Security and privacy

- [ ] Run `python scripts/validate_generated.py` and confirm zero sensitive findings.
- [ ] Confirm no proxy node, server, port, password, UUID, private/public key, token, subscription
      URL, local absolute path, or provider-specific private configuration is present.
- [ ] Review full repository history before first push; generated outputs are clean, but local
      source profiles may contain live credentials.
- [ ] Rotate subscription or node credentials if exposure through local logs or earlier session
      records is a concern.

## Product quality

- [ ] Run all Windows and Linux CI jobs successfully.
- [ ] Confirm `python scripts/generate_profile.py --check` reports no differences.
- [ ] Confirm exact duplicates remain zero, non-strict CIDRs remain zero, and quality metrics do
      not regress.
- [ ] Recompute the Phase 3 reduction and DIRECT-recovery ledgers; confirm the 2,737 historical
      candidates produce 2,732 emitted matchers after the frozen 7-keyword exclusion and 2-rule
      Roblox replacement, contain no `DOMAIN-KEYWORD`, capture zero proxy/manual-first residual
      matchers, and keep every destination-IP matcher on `no-resolve`.
- [ ] Review all `sources/review.yaml` candidates intended for publication, including recovered
      historical ownership and brand-defense entries that are retained only for routing
      compatibility.
- [ ] Verify representative routing behavior in an actual Subconverter and Mihomo client.
- [ ] Decide whether GitHub Raw is the intended long-term delivery mechanism.

## Release operation

- [ ] Review `NOTICE.md`, `docs/PROVENANCE.md`, and `docs/CHANGES.md` for accuracy.
- [ ] Confirm README wording no longer describes the repository as private if visibility changes.
- [ ] Confirm branch protection and required CI checks are configured.
- [ ] Change repository visibility only through a separate, explicit, human-authorized action.
- [ ] Commit, push, tag, and release only through separately authorized actions.

No script in this repository changes GitHub visibility or publishes content.
