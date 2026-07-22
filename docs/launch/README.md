# Maqam launch kit

Last verified: 2026-07-22.

## The one-line story

> Give AI agents hands without handing them the keys.

Maqam is the guarded door between an agent and a registered tool that can change real software. It checks policy, binds approval to the exact canonical input, consumes that approval once by default, and leaves a reviewable receipt.

## Who should care

- teams exposing file writes, browser submits, HTTP mutations, CLI workers, or internal services to an agent;
- agent-framework authors who need a provider-neutral execution boundary instead of another planning loop;
- security and platform engineers who want changed-input and replay failures to be explicit; and
- open-source builders who want a local TypeScript package with no Maqam account or hosted control plane.

## Five-minute proof

Run this from a disposable directory with a maintained Node.js 22, 24, or 26 release:

```sh
npx -y maqam@0.3.2 demo approval
```

The proof must show four states: approval required, altered input rejected, exact input accepted once, and replay rejected. Link the matching source, test, npm package, and GitHub release whenever the proof is published.

## Launch order

1. Verify `npm view maqam@0.3.2 version gitHead dist.integrity` and the matching GitHub release.
2. Test the five-minute proof in a signed-out or clean environment.
3. Set the GitHub social preview to `app/assets/maqam-readme-hero.png` and confirm website Open Graph rendering.
4. Publish one personally written Show HN submission while the maintainer is available to answer technical questions.
5. During the next week, publish the exact-approval article, a short terminal demo, and one community-specific technical discussion.
6. Use Product Hunt only after the public demo and install path have been exercised by independent users.
7. Record install failures, completed proofs, returning users, and real governed-tool integrations. Stars are a reach signal, not activation.

Do not launch Maqam, Cockroach Crawler, and Qarinah as three interchangeable agent frameworks. Maqam is the action boundary; Cockroach Crawler is bounded reach; Qarinah is compact evidence-linked memory.

## Files in this kit

- [Platform copy](PLATFORM-COPY.md): descriptions, posts, video copy, and response prompts.
- [Media matrix](MEDIA-MATRIX.md): existing verified artwork and platform assignments.
- [Claims checklist](CLAIMS-CHECKLIST.md): statements that may and may not be made.

## Success measures

| Stage | Useful signal |
| --- | --- |
| Reach | Qualified repository visits and demo views |
| Evaluation | Clean `maqam@0.3.2` installs |
| Activation | A user completes the four-state approval proof |
| Depth | A real tool is registered behind `ToolGateway` |
| Retention | The same team governs a second workflow within 14 days |
| Trust | Reproducible issues, threat-model feedback, and reviewed fixes |

Pause promotion if the registry identity, GitHub tag, proof output, website, or security description disagrees with the released artifact.
