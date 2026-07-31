# Ekko Rules

[中文](README.md)

Reusable routing rules and subscription templates for Subconverter and Mihomo. This directory is generated deterministically from sanitized in-repository canonical sources and contains no proxy nodes, passwords, UUIDs, keys, or real subscription URLs.

## Outputs

- `config/ekko-rules.ini`: Default Core online preset without a Clash base override.
- `config/ekko-rules-full.ini`: Core plus the sanitized base; it does not silently enable optional rules.
- `config/ekko-rules-local.ini`: Local Core preset with its base disabled by default.
- `config/ekko-rules-extended.ini`: Core plus optional legacy, brand-defense, and community rules without a base override.
- `config/ekko-rules-extended-local.ini`: Local Extended preset.
- `base/GeneralClashConfig.yml`: Optional sanitized Clash base.
- `Ruleset/*.list`: Classical Subconverter rules.
- `Providers/Ruleset/*.yaml`: Classical Mihomo Rule Providers.
- `Mihomo/reversed-template.yaml`: Default Core Mihomo template.
- `Mihomo/reversed-template-extended.yaml`: Extended Mihomo template.
- `analysis.json`: Structure and quality metrics computed from canonical sources.
- `manifest.json`: Generated-file SHA-256 inventory; it does not recursively hash itself.

## Usage

1. After publication, the Ruleset URL prefix is `https://raw.githubusercontent.com/ZaunEkko/ekko-rules/main/generated/reversed-profile/Ruleset`.
2. Use `config/ekko-rules.ini` for Subconverter. Ports, DNS, TUN, and similar client settings remain externally owned.
3. Mihomo users must replace `PUT_YOUR_SUBSCRIPTION_URL_HERE` in the native template.
4. External clients normally cannot fetch GitHub Raw files anonymously while the repository is private.

## Behavior

- Core contains 51 rulesets, 52 segments, and 44 proxy groups.
- Extended contains 57 rulesets, 58 segments, and 45 proxy groups.
- Messaging and music are split by service while related services may still share an existing policy group.
- AI, social, and developer services have minimal independent groups; the Private layer targets `DIRECT`.
- Every destination-IP rule carries `no-resolve`.
- Same-segment exact duplicates are zero; five non-strict CIDRs were deleted without guessing corrected prefixes.
- Broad regional TLDs, shared cloud ranges, and shared infrastructure were removed from early service-specific policies or moved to general routing.
- DNS, TUN, Hosts, and proxy credentials are outside the core ruleset scope.
