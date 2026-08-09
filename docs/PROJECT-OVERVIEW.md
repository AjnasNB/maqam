# Maqam project overview

> This is first-party project documentation. It is a factual synopsis of the
> public software and its stated boundaries, not an independent review or a
> source that establishes Wikipedia notability.

## What it is

Maqam is an open-source TypeScript governance boundary for AI-agent and
automation workflows. A host registers operations with Maqam so that policy,
approval, execution, and receipt generation can occur through one explicit
path.

## What it does

- evaluates declared policy before a registered operation runs;
- binds a human approval to the exact run, tool, and canonical input;
- consumes an approval once by default and rejects altered input or replay;
- records dispatches, denials, approval use, and evidence links as reviewable
  receipts; and
- provides adapters for functions, command-line workers, coding agents,
  browser actions, crawlers, and research sources.

## Why it exists

A general approval such as “allow this task” may not identify the exact bytes a
tool eventually receives. Maqam exists to let applications bind review to the
specific registered action that executes and retain a record of that decision.

## Practical strengths and boundaries

Maqam is useful when an application needs explicit policy, exact-input
approval, one-use dispatch, and inspectable execution records without adopting
a particular model provider. It governs only operations deliberately routed
through a registered adapter. It does not intercept direct operating-system
calls, turn an unsafe tool into a safe one, provide organizational identity, or
replace browser isolation and host security controls.

## Stewardship and release record

Project citation metadata credits [Ajnas N B](https://github.com/AjnasNB) as
the author.

- Current stable software release: [Maqam 0.3.3](https://github.com/AjnasNB/maqam/releases/tag/v0.3.3)
- Package: [maqam on npm](https://www.npmjs.com/package/maqam)
- License: [MIT License](https://github.com/AjnasNB/maqam/blob/main/LICENSE)
- Source: [github.com/AjnasNB/maqam](https://github.com/AjnasNB/maqam)
- Website: [maqamagent.com](https://maqamagent.com/)
- Citation metadata: [CITATION.cff](https://github.com/AjnasNB/maqam/blob/main/CITATION.cff)

Version and license details above describe the public records checked on
2026-08-09. Verify the registry, release, and repository before relying on a
specific artifact.
