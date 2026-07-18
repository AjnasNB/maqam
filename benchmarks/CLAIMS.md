# MGES result presentation and claim templates

Use this checklist whenever an MGES result appears in a README, release note, article, conference slide, demo video, social post, procurement response, or comparison page.

## Required fields

Every performance claim must include, in the claim or an immediately adjacent artifact:

- MGES version and profile;
- Maqam/source version or source fingerprint;
- Node version, operating system, architecture and processor;
- median value and unit;
- the defined uncertainty interval and what it applies to;
- observation count;
- coefficient of variation and publication-check status;
- fixture scope and major exclusions;
- a link to the raw JSON;
- an explicit statement that the result is not a competitor benchmark or SLA.

Every conformance claim must include:

- MGES version and profile;
- passed, failed and total fixture counts;
- source fingerprint or clean commit;
- raw JSON;
- an explicit statement that the result is project-defined regression evidence, not a security score, penetration test, formal proof or certification.

## Approved compact performance wording

> MGES v1.1.0 local-call profile on Node 24.15.0 / Windows x64 / Ryzen 7 4800H: 124.303 microseconds median per governed call (95% bootstrap interval for the sample median: 123.712-125.695; 30 fresh-process observations; governed CV 2.010%; required project checks PASS). Local in-process component benchmark; excludes model, network, storage and concurrency; not a competitor benchmark or SLA. [Raw JSON](results/2026-07-18-mges-performance-windows-node24.json).

The current raw artifact records clean source commit `bceaebfa2a4059bc63acd23eccf4fafee794a295`. Prefix a future result with **“Provisional result:”** whenever its artifact reports `workingTreeDirty: true` or it has not passed the declared required project checks.

## Approved compact conformance wording

> MGES v1.1.0 governance-boundary profile: 14/14 project-defined fixtures passed on the recorded source fingerprint. Regression evidence only—not a security score, penetration test, formal proof, compliance result or certification. [Raw JSON](results/2026-07-18-mges-conformance-windows-node24.json).

## Video card

Use no more than these three levels:

```text
124.303 microseconds/call median
123.712-125.695 microseconds · 95% bootstrap interval · 30 observations
Local Node 24/Windows component fixture; no model/network/storage; not a competitor benchmark or SLA
```

For conformance:

```text
14 / 14 MGES fixtures passed
Exact approval scope · replay denial · atomic consumption · evidence attribution
Project-defined regression evidence; not a security certification
```

Do not show only the first line. The scope line must remain legible for long enough to read. Do not animate or crop the caveat away in vertical derivatives.

## Release-note block

```markdown
### Evaluation evidence

- MGES version/profile: ...
- Source commit/fingerprint: ...
- Environment: ...
- Governed median: ...
- 95% interval for sample median: ...
- Observations and CV: ...
- Publication checks: ...
- Conformance: ... passed / ... failed / ... total
- Raw performance artifact: ...
- Raw conformance artifact: ...

Scope: local in-process component fixture. Excludes model inference, network,
filesystem, durable storage, human review and concurrent load. MGES is
project-defined; these results are not a competitor ranking, SLA, penetration
test, security score, compliance assessment or certification.
```

## Comparison rule

Do not put another product in an MGES performance table unless all products:

1. execute the same representative payload and effect;
2. enforce the same policy and exact approval obligations;
3. produce equivalent trace and evidence outputs;
4. use the same persistence and process model;
5. run through public, reviewed adapters;
6. use the same hardware/runtime protocol and predeclared analysis;
7. publish all raw observations, configuration and unstable runs.

If those conditions are absent, publish a capability comparison and keep performance figures out of it.

## Prohibited or misleading forms

- “Globally accepted benchmark.”
- “NIST benchmark,” “SPEC benchmark,” or “OWASP-certified.”
- “Maqam is 137 microseconds” without the fixture and environment.
- “7,843 calls/second throughput” without saying sequential rate at the observed median.
- “14/14 secure.”
- A ratio to the trivial direct handler.
- A competitor speed claim from unmatched product defaults.
- A point estimate without uncertainty and raw data.
- A PASS claim when the artifact says `publicationCandidate: false`.
- A clean-commit claim when the artifact says `workingTreeDirty: true`.

## Before publication

- Confirm the raw artifacts are downloadable and their hashes are recorded in release checksums.
- Confirm the displayed values exactly match the JSON.
- Confirm all MGES project publication checks pass.
- Confirm the artifact identifies the clean measured commit whose fingerprinted source matches the release and which remains an ancestor of the tagged evidence-only release commit; otherwise label it provisional and cite the source fingerprint.
- Run the conformance profile again on the release artifact.
- Keep the methodology, article and raw artifacts linked from the claim.
- Archive any failed or REVIEW run used to change calibration; do not substitute a silent threshold change.
