# Maqam platform copy

These drafts are product facts and editable starting points. Disclose that you maintain the project. Follow each community's current rules and do not coordinate votes.

## Canonical descriptions

**Tagline:** Give AI agents hands without handing them the keys.

**Short:** Maqam puts a guarded door between AI agents and real tools: policy, exact one-use approval, and a verifiable receipt for every registered action.

**GitHub About:** Give AI agents hands without handing them the keys: policy, exact one-use approvals, and verifiable receipts for registered actions.

**npm description:** Give AI agents hands without handing them the keys: policy, exact one-use approvals, and verifiable receipts for registered actions.

## Show HN fact sheet - rewrite personally before posting

Hacker News asks users not to post generated or AI-edited text. Do not paste this section as a submission. Write the final title, body, and comments yourself from these facts.

- Start the title with `Show HN:`.
- The human problem: an approval for a description is not necessarily approval for the exact bytes a tool will execute.
- What you built: a local TypeScript boundary that attaches policy and approval to the registered run, tool, and canonical input hash.
- Runnable proof: `npx -y maqam@0.3.2 demo approval`.
- Demonstrate: changed input fails, the approved input succeeds once, and replay fails.
- Boundary: only calls routed through a registered adapter are governed; Maqam is not an OS sandbox, identity platform, or universal interceptor.
- Ask: which real tool should receive the next public integration fixture, and which bypass attempt should become a regression test?
- Link directly to the runnable repository or product, not a fundraising or signup page.

Possible factual title to rewrite in your own voice:

`Show HN: Maqam - exact one-use approvals for AI agent tools`

## Product Hunt

**Name:** Maqam

**Tagline:** Give AI agents hands without handing them the keys

**Description (under 260 characters):** Maqam is an open-source TypeScript boundary for consequential agent tools. Check policy, bind approval to the exact input, run it once, and keep a reviewable receipt. Local-first, provider-neutral, and no signup.

**Topics:** Developer Tools, Artificial Intelligence, Open Source, Security

**Pricing:** Free

**Maker comment:**

I built Maqam because “the human approved it” is too vague when an agent can change the input between review and execution. Maqam binds approval to the exact registered call, consumes it once by default, and records the result. The public demo shows the mismatch and replay failures, not a staged dashboard. I would value concrete feedback on adapter boundaries, approval storage, and bypass cases.

## X launch thread

1. AI agents need useful tools. They do not need ambient authority. Maqam puts a guarded door between the agent and each registered action.
2. Policy runs before dispatch. If approval is required, it is bound to the run, tool, and canonical input hash - not a loose sentence describing the task.
3. The approved call can run once by default. Changed input and replay are rejected. The result leaves a receipt you can inspect.
4. It works around existing functions, CLI workers, coding agents, browser actions, crawlers, and internal services. Calls that bypass the registered adapter remain outside Maqam.
5. Reproduce the proof: `npx -y maqam@0.3.2 demo approval` - source and limits: https://github.com/AjnasNB/maqam

## LinkedIn

An AI agent can be useful only when it can act. The dangerous shortcut is giving it a general tool and treating a human “yes” as permission for whatever input reaches the tool later.

Maqam makes that boundary explicit. It checks policy, binds approval to the exact registered input, consumes the approval once by default, and records the outcome. Changed input and replay fail in the public demo.

This is not an operating-system sandbox or a claim to intercept every action. It governs the operations a host deliberately routes through `ToolGateway`.

The project is MIT licensed, runs locally on maintained Node.js 22, 24, and 26 releases, and has a five-minute proof: `npx -y maqam@0.3.2 demo approval`.

I am looking for builders willing to put one real consequential tool behind the boundary and report the first friction or bypass they find.

## Reddit or forum discussion

Use only in a community whose rules allow maintainer project posts. Remove promotional calls to star or upvote.

**Title:** I built an exact-input approval boundary for agent tool calls - looking for bypass cases

**Body:** I maintain Maqam, an MIT-licensed TypeScript package that sits in front of registered agent tools. The specific problem is approval drift: the input a human reviews can differ from the input eventually dispatched. Maqam binds approval to the run, tool, and canonical input hash; the approval is one-use by default; changed input and replay are rejected. The local demo is `npx -y maqam@0.3.2 demo approval`. It does not intercept direct OS calls or unregistered tools. I would appreciate technical feedback on the boundary, especially a concrete mutation, replay, adapter, or approval-store failure that should become a test.

## Technical article

**Title:** Your Agent Approval May Not Authorize the Input That Actually Executes

Outline:

1. show the review/dispatch time-of-check-to-time-of-use gap;
2. define canonical input and exact approval scope;
3. demonstrate changed-input rejection;
4. demonstrate one-use consumption and replay rejection;
5. attach outcome and evidence records;
6. state bypass and OS-sandbox limits; and
7. provide a copy-paste reproduction.

Publish the canonical article at `https://maqamagent.com/articles/exact-agent-approvals/` and use canonical links when adapting it for Dev.to, Hashnode, Medium, or HackerNoon.

## YouTube

**Title:** Give AI agents hands without handing them the keys | Maqam in 60 seconds

**Description:** Watch one exact agent-tool approval move through four real states: approval required, altered input rejected, exact input executed once, and replay rejected. Maqam is an open-source TypeScript execution boundary for registered tools. Reproduce it with `npx -y maqam@0.3.2 demo approval`. Source, docs, and limitations: https://maqamagent.com/

## Response bank

**Does Maqam make an agent safe?** No. It governs registered operations through a defined gateway. The model, host, unregistered calls, OS, network, identity, and secrets still need their own controls.

**Why not use a normal confirmation dialog?** A confirmation is useful only if it remains attached to the exact operation that dispatches. Maqam supplies that binding and one-use lifecycle.

**Does evidence prove the answer is true?** No. Evidence records provenance and execution facts. Reviewers still judge the source and claim.

**Is this the AI operating system?** No. It is a user-space action-governance component that could support a future control plane; it does not yet mediate the entire OS.
