# Product

## Register

product

## Users

Maqam serves developers, platform engineers, security teams, and compliance reviewers who run agent workflows against source code, internal tools, external services, and public research sources. Their primary job is to let useful automation proceed while keeping permissions, budgets, side effects, evidence, and human decisions visible.

## Product Purpose

Maqam is a provider-neutral governed execution boundary, not a full agent orchestrator. It accepts function workers, object workers, command-line agents, and connectors behind one policy gateway, then records the run, tool decisions, approvals, outputs, evidence, and limits. Success means a reviewer can determine what was requested, what was allowed, what executed, what changed, and which authenticated human approved a sensitive action through the host application.

In one sentence: **Maqam checks policy before a registered agent action, binds approval to the exact call, executes that approved call once, and records evidence for review.**

## Governed Sources

Maqam 0.3 adds an ordered research-source layer for teams that have multiple backends such as public HTTP, RSS/Atom, a licensed provider, or an internal index. The source registry selects a backend, sends its exact tool name through `ToolGateway`, and normalizes the result to one document contract.

The value is consistent governance across otherwise different retrieval systems. The registry does not log into providers, import browser cookies, install external tools, run a browser, bypass anti-bot systems, or make an unregistered operation governed. Direct `routeUngoverned()` use must be labeled as a bypass.

ProductLoop OS remains the wider modular companion ecosystem. Maqam is the guarded execution door; ProductLoop supplies separately consumable runtime, policy, approval, provenance, evaluation, connector, skill, and research modules around it. Their state and contracts do not merge automatically.

## Brand Personality

Precise, calm, accountable. The interface should communicate technical confidence without making absolute security claims or turning an operational tool into a marketing page.

## Anti-references

Avoid decorative agent diagrams with no connection to live state, oversized landing-page heroes, nested cards, vague security badges, hidden enforcement limitations, playful consumer styling, and dashboards dominated by one accent hue.

## Design Principles

- Show the enforcement path before showing outcomes.
- Separate preventive controls from observed or post-run checks.
- Keep high-risk actions explicit, reviewable, and bound to one scope.
- Prefer dense operational clarity over promotional copy.
- Make every status understandable without relying on color alone.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Preserve keyboard access, visible focus, semantic headings and landmarks, sufficient text contrast, reduced-motion behavior, responsive layouts from 320px upward, and text labels alongside all status colors.
