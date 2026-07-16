# Show HN Author Brief

This is a factual launch brief, not submission copy.

**Do not paste, paraphrase, or ask a tool to polish text from this file for Hacker News.** The current [HN Guidelines](https://news.ycombinator.com/newsguidelines.html) say not to post generated or AI-edited text. The maintainer must write the actual title, submission text, and comments independently in their own words.

Use this file only to verify facts, remember links, and avoid unsupported claims. Read the current [Show HN guidance](https://news.ycombinator.com/showhn.html) immediately before submitting.

## Is Maqam Appropriate For Show HN?

Yes, after the release is public and runnable without a model key or hosted signup:

- the repository contains working code;
- `npm install maqam` installs the public package;
- `maqam demo approval` gives visitors something concrete to try;
- the 60-second release video demonstrates executed output; and
- the maintainer can stay available to answer technical questions.

Do not submit until the npm version, GitHub tag, release assets, CI run, and linked documents are public.

## Title Constraints

Write the title yourself. It should:

- begin with `Show HN:`;
- name Maqam;
- describe one concrete capability, not a superlative; and
- remain short enough to scan.

Possible factual ingredients—not title copy—are: TypeScript, exact input-bound approval, one-use approval consumption, and source-linked evidence.

## Submission URL

Use the runnable public repository unless `maqamagent.com` is already live and more useful:

```text
https://github.com/AjnasNB/maqam
```

## Facts The Author Can Explain

Choose only the facts that matter to your own story:

- Maqam is an MIT-licensed TypeScript governance package for registered agent and workflow tool calls.
- A configured high-risk call first returns `APPROVAL_REQUIRED`.
- The gateway snapshots finite JSON input and binds the approval subject to `runId`, `toolName`, and a canonical input hash.
- Changed input is rejected with `APPROVAL_SCOPE_MISMATCH` before the demo handler executes.
- The exact approved demo input executes, and the approval is consumed once by default.
- Reusing that approval is rejected with `APPROVAL_INVALID`.
- Handlers and workflows can explicitly record source evidence and link same-run claims to it.
- The deterministic demo uses a real temporary-file write and cleans up afterward.
- The core policy, approval, gateway, evidence, demo, and benchmark require no model key or hosted account.
- MGES v1 publishes separate local-call performance and deterministic governance-boundary profiles, including raw observations, source fingerprints, uncertainty, and project stability checks.
- Optional Codex CLI and Claude Code adapters require those tools to be installed and authenticated separately.

## Facts About The Problem

Use your own experience and wording. Relevant technical failure modes include:

- a boolean approval does not necessarily identify the payload that executes;
- input can change after a reviewer sees it;
- reusable approval ids can authorize more than the reviewer intended;
- policy can inspect one object while a handler receives a later mutation; and
- a friendly approval summary can drift from the executable payload.

## Honest Limits To Mention

At least the most relevant limits should appear in the author's own submission or early comment:

- runtime, approval, trace, and evidence state is currently in-process;
- `ApprovalQueue` does not authenticate reviewer identity;
- restored approval JSON must come from trusted, integrity-protected host storage;
- evidence links record provenance and do not prove source truth or semantic entailment;
- only calls routed through registered adapters are governed;
- Maqam does not replace provider permissions, an operating-system sandbox, durable workflow execution, or a full browser/crawl platform; and
- passing tests is evidence for covered behavior, not proof of defect-free software.
- MGES is a Maqam project benchmark, not a globally standardized benchmark, competitor ranking, security score, penetration test, SLA, compliance assessment, or certification.

## Comparison Facts

If comparison is relevant, state where the other project is stronger:

- [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) is the closest broad governance comparison and is much broader in identity, trust, policy, compliance, languages, and operational governance; it is a public preview.
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) is a stronger starting point for a full TypeScript agent loop and already has first-class human approval.
- [LangGraph](https://github.com/langchain-ai/langgraph) is stronger for durable, branching, checkpointed orchestration and human interrupts.
- [Invariant](https://github.com/invariantlabs-ai/invariant) and [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) are stronger for contextual traffic and model-facing guardrails.
- [Open Policy Agent](https://github.com/open-policy-agent/opa) is a mature general policy-as-code engine.
- [Firecrawl](https://github.com/firecrawl/firecrawl), [Crawl4AI](https://github.com/unclecode/crawl4ai), and [Crawlee](https://github.com/apify/crawlee) are stronger when browser or crawl operations are the product center.
- HumanLayer's public repository now says its old code is deprecated; do not present that repository as the current open-source HumanLayer product.

The dated source review is in [docs/comparison.md](../docs/comparison.md).

## Reproduction Commands

Run these yourself before submitting. The author can then describe what actually happened in their own words:

```bash
git clone https://github.com/AjnasNB/maqam.git
cd maqam
npm ci
npm run demo:approval
npm test
npm run test:consumer-types
npm audit --omit=dev
npm pack --dry-run
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

Public install check:

```bash
npx -y maqam demo approval
```

## Links To Have Ready

- Repository: <https://github.com/AjnasNB/maqam>
- npm: <https://www.npmjs.com/package/maqam>
- Latest release and video: <https://github.com/AjnasNB/maqam/releases/latest>
- Why Maqam: <https://github.com/AjnasNB/maqam/blob/main/docs/why-maqam.md>
- Detailed comparison: <https://github.com/AjnasNB/maqam/blob/main/docs/comparison.md>
- Public roadmap: <https://github.com/AjnasNB/maqam/blob/main/ROADMAP.md>
- Technical article: <https://github.com/AjnasNB/maqam/blob/main/docs/articles/exact-agent-approvals.md>
- Benchmark methodology and raw artifacts: <https://github.com/AjnasNB/maqam/blob/main/benchmarks/README.md>
- Benchmarking article: <https://github.com/AjnasNB/maqam/blob/main/docs/articles/benchmarking-agent-governance.md>
- Security policy: <https://github.com/AjnasNB/maqam/blob/main/SECURITY.md>

## Questions Worth Answering Personally

These are prompts for the maintainer, not generated comment copy:

- Why did you build exact call-bound approval instead of a reusable approved flag?
- Which real workflow made the gap visible?
- What surprised you while implementing canonical input snapshots?
- What durable store and identity semantics would you trust?
- Which adapter should come first: MCP, OpenAI Agents SDK, LangGraph, or Microsoft Agent Framework?
- What part of the design are you least certain about?

## Final Checklist

- Write every submitted sentence yourself without copying or AI editing.
- Confirm the repository and npm package are publicly runnable.
- Confirm the tag and npm `gitHead` identify the same commit.
- Confirm the release video, poster, captions, transcript, benchmark, and checksums resolve.
- Remove unreleased claims, placeholders, private paths, and credentials.
- Do not coordinate votes or ask anyone to upvote.
- Be available for the discussion and answer criticism with reproducible evidence.
- If you do not know an answer, say so.
