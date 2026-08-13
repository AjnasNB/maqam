# Project execution flow

> A bounded chronological view of permitted agent and tool events. Hidden reasoning is never included.

- Workspace: `ws_31906e62a01b7f0a197ecb36cf7facdd`
- Steps shown: 2 (latest 500 maximum)

## 0. Project structure snapshot

- Kind: `artifact`
- Actor: `tool:qarinah\-project\-structure`
- Time: 2026-08-13T13:20:52.120Z
- Evidence: `evt_b9fbbcdc-0a64-4c02-989f-74342e717fd3` · `sha256:5430e2dd91eef8e27d50b996583503b8d1842d73f80c96eccb688c4effaf26a8`

    Observed 290 files and 81 directories. Changes: 290 added, 0 changed, 0 deleted, 0 renamed. Indexed paths: - .github/dependabot.yml - .github/ISSUE_TEMPLATE/bug_report.yml - .github/ISSUE_TEMPLATE/config.yml - .github/ISSUE_TEMPLATE/feature_request.yml - .github/ISSUE_TEMPLATE/integration_request.yml - .github/PUBLISHING.md - .github/PULL_REQUEST_TEMPLATE.md - .github/workflows/ci.yml - .github/workflows/mges-evidence.yml - .github/workflows/publish-npm.yml - .github/workflows/verify-website.yml - app/app.js - app/index.html - app/styles.css - benchmarks/_governance-worker.mjs - benchmarks/CLAIMS.md - benchmarks/governance-conformance.mjs - benchmarks/governance-overhead.mjs - benchmarks/governance-suite.mjs - benchmarks/README.md - benchmarks/results/2026-07-16-mges-conformance-windows-node24.json - benchmarks/results/2026-07-16-mges-performance-windows-node24.json - benchmarks/results/2026-07-16-windows-node24.json - benchmarks/results/2026-07-18-mges-conformance-windows-node24-governed-public-research-280e43cd.json - benchmarks/results/2026-07-18-mges-conformance-windows-node24-governed-public-research-c58cb850.json - benchmarks/results/2026-07-18-mges-conformance-windows-node24-main-545fe8bb.json - benchmarks/results/2026-07-18-mges-conformance-windows-node24.json - benchmarks/results/2026-07-18-mges-performance-windows-node24-governed-public-research-280e43cd.json - benchmarks/results/2026-07-18-mges-performance-windows-node24-governed-public-research-c58cb850-attempt2.json - benchmarks/results/2026-07-18-mges-performance-windows-node24-governed-public-research-c58cb850.json - benchmarks/results/2026-07-18-mges-performance-windows-node24-main-545fe8bb.json - benchmarks/results/2026-07-18-mges-performance-windows-node24.json - benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-29c1b9ec.json - benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-a96413c4.json - benchmarks/results/2026-07-19-mges-conformance-windows-node24-main-5...

## 1. Adopt Apache\-2\.0 for the Maqam 0\.4 Community line

- Kind: `decision`
- Actor: `human:local\-user`
- Time: 2026-08-13T13:21:05.987Z
- Evidence: `evt_5a23ebbf-80c1-460d-8740-ba9240f02539` · `sha256:5febf0bd2db31fb5020b4ed8ba46204264b74c3cb028d55738a2475c9fae6583`

    Published versions through 0.3.3 retain their MIT grants. The 0.4 Community line adds Apache patent terms, NOTICE, DCO sign-off, fail-closed policy presets, and no-dispatch workflow simulation. Maqam Enterprise remains a separate private product that consumes the package API.
