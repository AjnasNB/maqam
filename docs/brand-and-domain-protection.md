# Maqam brand and domain protection

This runbook separates the open-source software license from control of the official product identity and delivery channels.

## Protected identity

- Product name: Maqam
- Canonical domain: `maqamagent.com`
- Canonical source: `github.com/AjnasNB/maqam`
- Canonical npm package: `maqam`
- Official paper: DOI `10.5281/zenodo.21851251`

The `0.4` Community source line is Apache-2.0 licensed; published versions through `0.3.3` retain their MIT grants. The official name, logo, repository, package identity, signing credentials, domains, and release channels remain controlled project assets. See [TRADEMARKS.md](../TRADEMARKS.md) and the [license transition](license-transition.md).

## Domain controls

The operator should keep all of these controls enabled and review them quarterly:

1. Registrar transfer lock and automatic renewal.
2. Registrar account protected by a hardware security key, recovery codes stored offline, and no shared login.
3. DNSSEC enabled and confirmed by a published DS record.
4. Cloudflare account access limited to named operators with least privilege.
5. DNS changes reviewed against the canonical zone and recorded with date, operator, and purpose.
6. CAA records limited to the certificate authorities actually used.
7. SPF, DKIM, DMARC, MTA-STS, and TLS reporting configured before sending mail from the domain.
8. Defensive registrations evaluated for high-risk spelling variants, without redirecting unrelated third-party names.

## Release-channel controls

- GitHub requires two-factor authentication, protected branches, required review, and signed or otherwise verifiable release provenance.
- npm uses trusted publishing, two-factor authentication, a minimal owner list, and exact package-name monitoring.
- Zenodo deposits bind immutable paper bytes and checksums to the published DOI.
- The website build fails if its product version, canonical URLs, or public evidence disagree with the reviewed release state.

## Trademark filing preparation

Before filing, perform a professional clearance search in each target market and identify the exact owner, filing jurisdiction, goods and services, first-use dates, and specimens. A domain registration is not a trademark registration. International expansion through the Madrid System requires an eligible national or regional application or registration first.

Do not use the registered symbol until registration has issued for the relevant goods or services. Preserve dated specimens showing Maqam used as the source identifier for downloadable software and software services.
