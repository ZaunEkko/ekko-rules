# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo.

## Scope

Ekko Rules follows the responsibility boundary of ACL4SSR online presets:

- it stores no user nodes, subscription credentials, or proxy server details;
- the core preset does not own ports, DNS, TUN, controller settings, or other fields above `proxies`;
- it maintains proxy groups, node filtering, rulesets, precedence, and policy mappings;
- it generates both Subconverter `.list` files and Mihomo classical Rule Providers.

The in-repository `sources/` tree is canonical. `generated/reversed-profile/` is deterministic output and must not be edited manually. Normal generation and validation no longer depend on an external expanded profile containing node credentials.

## Layout

```text
sources/
├── manifest.yaml              43 ordered rule segments
├── proxy-groups.yaml          42 ordered proxy groups
├── base.yaml                  optional sanitized base
├── rules/*.list               42 canonical rule files
├── upstreams.yaml             pinned lineage, licenses, and evidence hashes
├── quality-baseline.yaml      duplicate, CIDR, and first-match gates
└── review.yaml                non-generating review queue

scripts/
├── profile_model.py           model, validation, rendering, behavior analysis
├── generate_profile.py        sole production generator
├── validate_generated.py      independent product validator
└── reverse_profile.py         migration-only legacy importer

generated/reversed-profile/
├── config/                    Subconverter presets
├── Ruleset/                   classical Subconverter rules
├── Providers/Ruleset/         classical Mihomo Rule Providers
├── Mihomo/                    native Mihomo template
├── base/                      optional Clash base
├── analysis.json              metrics computed from current sources
└── manifest.json              product inventory and SHA-256 hashes
```

## Subconverter presets

| File | Purpose | Overrides Clash base |
|---|---|---:|
| `config/ekko-rules.ini` | Recommended core online preset | No |
| `config/ekko-rules-full.ini` | Optional full preset | Yes |
| `config/ekko-rules-local.ini` | Local Subconverter preset | No by default |

The subscription dynamically supplies `proxies`; `custom_proxy_group` uses `.*` to add current nodes; the Subconverter server or client owns ports, DNS, TUN, and similar settings.

## Generate

Python 3.12 is required:

```bash
python -m pip install -r requirements.txt
python scripts/generate_profile.py
```

The generator renders and validates an empty same-volume staging directory before replacing the official output. A failed render keeps the previous directory. Output contains no timestamps, random values, or local absolute paths.

Check committed output without modifying it:

```bash
python scripts/generate_profile.py --check
```

## Validate and test

```bash
python scripts/validate_generated.py
python -m unittest discover -s tests -v
```

The gates cover:

- source schema, 42 groups, 43 segments, two non-contiguous music segments, and FINAL order;
- all target, slug, URL/local path, member-order, and base-switch details in three INI files;
- Mihomo providers, `RULE-SET/MATCH`, groups, and subscription placeholder;
- ordered line equality for all 42 `.list`/Provider pairs;
- closed product set, SHA-256, deterministic double rendering, and stale-file detection;
- `no-resolve` on every destination-IP rule and strict CIDR syntax;
- exact duplicates, first-match coverage baseline, and representative routing behavior;
- scans for nodes, credentials, UUIDs, tokens, real subscriptions, and absolute paths.

## Current rules

- 42 rule files, 43 ordered segments, and 42 proxy groups;
- 15,541 rules including FINAL;
- 2,205 destination-IP rules, all carrying `no-resolve`;
- zero same-segment exact duplicates;
- zero non-strict CIDRs;
- strict first-match unreachable union reduced from 2,734 at bootstrap to 2,489.

See [`docs/CHANGES.md`](docs/CHANGES.md) for individual changes and first-match differences. Uncertain, legacy, brand-defense, and personal/community entries remain in `sources/review.yaml`; one NXDOMAIN, 403, timeout, or TLS error is never sufficient for automatic deletion.

## Legacy importer

Only use this when migrating another expanded profile:

```bash
python scripts/reverse_profile.py expanded-profile.yaml candidate-sources
```

The output must not already exist. It creates review-only candidate `sources/`, never overwrites official `generated/`, and cannot recover original upstream boundaries. Provenance must be completed before considering publication.

## Private repository and publication gate

The repository remains private. GitHub Raw URLs target `ZaunEkko/ekko-rules` on `main`, but external Subconverter/Mihomo clients normally cannot fetch private Raw files anonymously.

No unified redistribution license is granted yet. Nothing automatically commits, pushes, publishes, or changes repository visibility. Before publication, complete:

- [`NOTICE.md`](NOTICE.md)
- [`docs/PROVENANCE.md`](docs/PROVENANCE.md)
- [`docs/PUBLICATION-GATE.md`](docs/PUBLICATION-GATE.md)

DNS and TUN remain client responsibilities. `no-resolve` prevents an IP rule from resolving a domain merely to obtain a match target, but it does not replace DNS hijacking, encrypted DNS, `strict-route`, or other client-side leak prevention.
