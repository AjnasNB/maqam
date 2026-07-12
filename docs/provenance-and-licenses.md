# Provenance and License Notes

Maqam is an original Ajnas implementation under the MIT license.

## Original implementation

The package source, docs, examples, CLI behavior, runtime APIs, policy checks, evidence ledger, skill registry, and crawler integration are written as original Ajnas work.

The design is informed by public patterns in agent runtimes, tool gateways, MCP-style connectors, policy gates, human approval workflows, evidence capture, and compliant crawling, but Maqam does not vendor or paste third-party source code.

## Third-Party Source Boundary

No third-party source code, documentation, examples, logos, generated assets, proprietary names, or project branding should be copied into this package.

Permissive open-source projects may be cloned or installed for inspection, testing, comparison, and learning during research. That inspection must preserve upstream license and NOTICE files in the review area and must not strip attribution.

## Runtime Dependencies

Maqam uses npm dependencies declared in `package.json`. Their resolved package licenses are recorded by npm in `package-lock.json`.

Current direct dependencies:

- `cheerio`: HTML parsing for crawler extraction.
- `robots-parser`: robots.txt compliance checks.
- `turndown`: HTML-to-Markdown conversion for agent-friendly output.

## Compliance Rules

- Respect robots.txt by default.
- Do not bypass login walls, paywalls, anti-bot systems, CAPTCHA, private content, or authorization boundaries.
- Do not publish from an automation without explicit user approval for the exact release.
- Keep release evidence: tests, package dry run output, changelog, and publish command.
- Keep Maqam's license as MIT unless the package owner explicitly approves a different license before release.

## Inspiration Log

Recent Ajnas research reviewed permissive OSS patterns around agent runtimes, policy layers, provenance, evaluation, MCP tooling, browser agents, and crawler infrastructure. Those projects are used as inspiration for original APIs and product direction, not as copied implementation.

Verified inspiration references:

- Qwen-Agent: Apache-2.0, used only as inspiration for agent runtime/product framing.
- PageAgent: MIT, used only as inspiration for browser-agent and release-gate evaluation framing.
- Qwen Code: Apache-2.0, noted as a public terminal coding-agent reference for provider-neutral model configuration. No source code, docs, examples, or branding are copied.
