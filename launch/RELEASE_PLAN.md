# Maqam Public Release And Distribution Plan

Last updated: 2026-07-16.

The release sequence is designed to produce one verifiable technical launch, learn from it, and then expand distribution. `maqamagent.com` is useful later for durable positioning, guides, and search discovery, but it is not a blocker for the GitHub/npm launch.

## Product And Message

Public product: **Maqam**.

Category: **a lightweight TypeScript governance layer for agent tools and workflows**.

Primary message:

> The agent can act. Maqam binds it to what was approved.

Technical message:

> Route registered agent tools through policy, exact one-use approval, bounded execution, and source-linked evidence.

Use the first line for awareness and the second when implementation detail matters. Neither line implies semantic truth, authenticated reviewer identity, regulatory compliance, or the absence of defects.

Primary audience:

- TypeScript/Node.js developers adding consequential tools to agent products;
- platform engineers building internal automation or release workflows;
- security engineers reviewing agent/tool boundaries; and
- open-source maintainers experimenting with approval and evidence semantics.

Do not launch ProductLoop OS, Cockroach Crawler, or every Ajnas package as parallel top-level products. Mention them only where their separate role helps the reader. Maqam is the focused public brand.

## Stage 0: Release Readiness

Required software evidence:

- clean reviewed commit on `main`;
- full tests, external TypeScript consumer, production audit, signature audit, and exact package-content review;
- green CI on supported Node versions;
- npm candidate version confirmed unused;
- package, tag, and release version aligned;
- no local paths, credentials, generated secrets, or unintended binaries in the tarball;
- provenance and license review updated for every new dependency or media asset; and
- known limits visible in README, security docs, comparison, article, and video.

Required launch assets:

- README hero and concise value statement;
- 60-second H.264/AAC MP4 at 1920x1080 or 1280x720;
- WebVTT or SRT captions and a Markdown/plain-text transcript;
- optimized WebP/PNG poster with descriptive alt text;
- reproducible Remotion source in a private, separate demo package;
- TTS voice file and provenance record for voice, fonts, icons, music, and screenshots;
- five stills: policy path, pending exact approval, changed-input rejection, successful one-use call, and evidence/trace;
- one architecture diagram that distinguishes Maqam from provider and host boundaries;
- benchmark methodology, raw result, environment, fixture, warmup, sample count, and non-generalization disclaimer;
- `Why Maqam`, detailed comparison, public roadmap, technical article, Show HN factual author brief, changelog, and release notes;
- exact npm install command, five-minute quickstart, and clean uninstall/reset instructions; and
- SHA-256 checksums for downloadable launch artifacts where practical.

Video acceptance checks:

- every shown command was run against the release candidate;
- approval mismatch and replay rejection use deterministic fixture output, not invented console screens;
- the browser console is shown only performing functionality it actually exposes;
- captions match the final narration and remain readable at mobile playback size;
- no token, home directory, username, private URL, notification, or unrelated browser tab is visible;
- audio has no clipping and remains intelligible without music;
- final duration is close to 60 seconds without cutting the limitation/CTA frame; and
- poster, first frame, last frame, captions, transcript, and release links agree on the product/version.

## Stage 1: GitHub And npm

Release order:

1. Freeze the candidate commit and record the full SHA.
2. Run the complete local release gate from a clean install.
3. Push `main` and wait for every required CI job to pass at that SHA.
4. Create and push the annotated version tag at the exact green commit.
5. Publish npm from the reviewed repository directory using short-lived authentication or trusted publishing.
6. Verify npm version, integrity, `gitHead`, package files, registry signatures, and absence of local-path metadata.
7. Install from the public registry into a fresh directory and rerun imports, CLI, example, and strict TypeScript checks.
8. Create the GitHub Release and upload the video, poster, captions, transcript, benchmark report/raw output, launch kit, and checksums.
9. Verify versioned README and release-asset links.
10. Only then mark the release as ready for external distribution and deprecate superseded vulnerable versions where appropriate.

GitHub release notes should contain:

- one-sentence value statement;
- what changed in the release;
- exact install command;
- 60-second demo link;
- security/enforcement boundary summary;
- migration information;
- tests and platforms executed;
- MGES version/profile, environment, uncertainty, project-check status, raw artifacts, and the explicit statement that it is not an external standard or certification;
- artifact integrity and commit identity;
- known limitations; and
- links to Why Maqam, comparison, roadmap, article, npm, and security policy.

npm page goals:

- the first screen identifies the product, audience, install command, and demo;
- the README contains a compact Why Maqam and comparison rather than marketing superlatives;
- absolute GitHub links render correctly from npm;
- the package contains core public docs but excludes Remotion dependencies, source footage, MP4, large screenshots, and launch drafts; and
- metadata remains on the GitHub homepage until `maqamagent.com` is live and useful.

## Stage 2: Show HN

Use [SHOW_HN.md](SHOW_HN.md) only as a private factual checklist after public-registry verification. Current HN guidelines prohibit generated or AI-edited text, so the maintainer must independently write every submitted sentence in their own words.

Timing:

- choose a weekday when the maintainer can answer for several hours;
- avoid posting during an outage, security incident, or while release links are still propagating; and
- submit once—do not delete and repeatedly repost to seek a better rank.

Conversation goal:

- learn whether exact approval binding solves a real integration problem;
- find the required persistence and reviewer-identity contract;
- identify the first useful ecosystem adapter; and
- collect reproducible failures and onboarding friction.

The goal is not a particular point total. Technical comments, external reproductions, concrete integration requests, and discovered defects are more useful than passive votes.

Within 24 hours:

- answer substantive questions;
- label confirmed defects and documentation gaps;
- correct inaccurate copy visibly rather than arguing around it;
- add recurring questions to an FAQ or issue; and
- record the baseline metrics listed below.

## Stage 3: Technical Article

Primary article: [exact-agent-approvals.md](../docs/articles/exact-agent-approvals.md).

Benchmark article: [benchmarking-agent-governance.md](../docs/articles/benchmarking-agent-governance.md). Publish it as an engineering-methodology article, not as a speed-ranking announcement. Keep the raw JSON, fixture exclusions, environment, uncertainty interval, and non-standard/non-certification statement adjacent to every compact result.

Publication sequence:

1. Incorporate technical questions and corrections from Show HN.
2. Choose either Dev.to or Hashnode as the canonical first publication.
3. Cross-post to the second platform only with its canonical URL field pointing to the first publication when supported.
4. Adapt the introduction and conclusion for each community, but keep the technical body and limitations consistent.
5. Link to a tagged source file or current release rather than an unreleased branch.
6. Disclose that the author maintains Maqam.

Article assets:

- exact approval lifecycle diagram;
- short runnable fake-publisher example with no external side effect;
- mutation, mismatch, success, and replay terminal stills;
- “prevents / records / host responsibility” table;
- link to the corresponding tests;
- comparison and roadmap links; and
- one 15–25 second excerpt from the launch video without autoplay.

Follow-up article candidates:

- “Approval serialization is not authentication”;
- “How to wrap an OpenAI Agents SDK tool with an exact approval boundary”;
- “Maqam plus LangGraph: durable workflow outside, governed tool inside”;
- “Evidence hashes are provenance, not proof”; and
- “Testing agent boundaries against mutation, replay, and provider truncation.”

## Stage 4: Targeted Communities And Lists

Publish only where the project directly matches the audience and the rules permit self-promotion.

Potential technical communities:

- TypeScript and Node.js communities;
- agent-framework, MCP, and AI-engineering communities;
- application-security and software-supply-chain communities;
- open-source maintainer communities;
- LangGraph, OpenAI Agents SDK, Microsoft Agent Framework, and relevant provider integration forums after a real adapter exists; and
- crawler/browser communities only when the post is specifically about a governed connector rather than generic Maqam promotion.

Potential formats:

- a technical problem/solution post with runnable code;
- a request for review of one adapter contract;
- a postmortem of a concrete security test;
- a comparison that names where alternatives are stronger; or
- an integration contribution that is useful without installing Maqam.

Awesome-list strategy:

1. Read contribution rules and category definitions.
2. Verify Maqam meets age, maintenance, documentation, popularity, or uniqueness requirements.
3. Open one focused pull request with a neutral one-line description.
4. Disclose maintainer affiliation.
5. Do not submit to loosely related lists, fork lists to add the project, or pressure maintainers after rejection.

Newsletter/outreach candidates should receive a concise release summary only when they accept submissions. Never scrape personal email addresses or send bulk unsolicited pitches.

## Stage 5: Product Hunt Later

Product Hunt is a later distribution event, not the first validation channel. Launch there after:

- the GitHub/npm onboarding has been tested by external users;
- the product has a stable visual demo and several concrete use cases;
- common objections and comparisons have documented answers;
- the maintainer can support launch-day questions; and
- a useful landing page exists at `maqamagent.com`.

Launch only **Maqam**. ProductLoop OS and Cockroach Crawler can appear as ecosystem components, not separate same-day products.

Product Hunt asset set:

- concise tagline without “best,” “only,” or “perfect”;
- 240-character description;
- logo and consistent gallery images;
- demo video with captions;
- three use-case cards;
- comparison/boundary card;
- maker comment explaining why it was built and what is still missing; and
- direct GitHub, npm, documentation, security, and roadmap links.

Do not schedule Product Hunt until the website is ready, but do not delay the technical GitHub/npm/Show HN launch for the website.

## Website: Later, Not A Blocker

`maqamagent.com` is a good focused domain. Build it after launch feedback clarifies the best use case and language.

Minimum useful site later:

- home page with value, demo, install, and boundary;
- `/docs` quickstart and integrations;
- `/why-maqam` and `/compare`;
- `/security` and `/roadmap`;
- `/blog` for canonical technical articles; and
- privacy-respecting analytics and no signup wall for documentation.

Until that exists, keep npm and repository metadata pointed at the working GitHub README.

## Metrics

Record baselines immediately before each stage and snapshots at 24 hours, 7 days, and 30 days.

| Area | Metric | Why it matters | Caveat |
| --- | --- | --- | --- |
| Reach | GitHub unique visitors and release-asset downloads | Whether distribution reached relevant readers | Traffic is not adoption |
| Evaluation | GitHub clones, npm package-page views where available, and weekly npm downloads | Whether readers attempted evaluation | Bots, CI, and mirrors inflate counts |
| Activation | External reports of completing the five-minute example | Whether onboarding works | Collect through voluntary issue/discussion prompt; no hidden telemetry |
| Technical interest | Substantive Show HN comments, reproducible questions, and adapter requests | Whether the problem resonates | Sentiment and rank are noisy |
| Adoption | Public dependent repositories, integration PRs, and repeat npm downloads | Whether use extends beyond a one-time look | Public dependency data is incomplete |
| Quality | Fresh-install failures, documentation confusion, confirmed defects, and median response time | Whether users can succeed safely | Low reports can also mean low usage |
| Community | External contributors, issue participants, and merged third-party PRs | Whether the project can grow beyond one maintainer | Stars alone are not community |
| Retention | Users returning with a second use case or release | Stronger signal than launch traffic | Requires voluntary qualitative follow-up |

Suggested outcome targets for the first 30 days are intentionally behavior-based:

- five independent users complete the governed example;
- three users describe a real tool or workflow they would place behind the boundary;
- at least one external adapter or conformance-test contribution begins;
- every reproducible install/security defect receives triage; and
- documentation is revised for recurring confusion.

Treat these as learning targets, not claims of market traction.

## Anti-Spam Rules

- One announcement per community unless a later release has material new value.
- Read and obey each community's self-promotion rules.
- Disclose maintainer affiliation every time.
- Tailor the post to the community's technical problem; do not paste identical marketing copy everywhere.
- Prefer runnable education to launch language.
- Do not buy votes, coordinate upvotes, create sockpuppets, mass-DM users, scrape emails, or automate replies.
- Do not mention competitors merely to intercept their search traffic or enter their communities without a genuine integration.
- Do not submit to an awesome list that does not clearly fit.
- Stop following up when a maintainer, moderator, or recipient declines.
- Correct mistakes publicly and retain critical comments.
- Never use download, star, or benchmark numbers without date, source, methodology, and limitations.

## Message Guardrails

Use:

- “exact run/tool/input-bound approval at the registered gateway”;
- “one-use approval consumption by default”;
- “source-linked evidence and claim records”;
- “local, provider-neutral TypeScript governance layer”;
- “works alongside existing runtimes”; and
- “tests provide evidence for covered cases.”

Avoid:

- “the only agent governance framework”;
- “the best or most secure agent platform”;
- “perfect,” “unhackable,” “enterprise-ready,” or “compliant”;
- “proves the model output is true”;
- “controls any agent” without the registered-adapter qualification;
- “human-approved” without explaining reviewer authentication is host-supplied; and
- benchmark claims that compare unlike products or hide the environment.

## Post-Launch Decision Gate

After 30 days, choose the next investment from observed evidence:

- build the most requested adapter if users can name a real boundary and acceptance test;
- prioritize durable state if identity, replay, and recovery block adoption;
- improve onboarding if users understand the value but cannot complete the example;
- narrow positioning if traffic is high but relevant technical engagement is low; or
- pause distribution and fix reliability/security issues before adding surface area.

The website, Product Hunt, and paid promotion come after this decision—not before it.
