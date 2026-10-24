# Maqam 0.4.0-rc.1 release candidate

This candidate establishes the Apache-2.0 Maqam Community line and adds policy design tools without removing the 0.3 governance surface.

## Additions

- `createPolicyPreset()` provides immutable, fail-closed starter policies for local development, team delivery, and production.
- `simulatePolicyWorkflow()` provides side-effect-free workflow simulation for a goal and up to 1,000 proposed calls without dispatching a tool.
- The package includes `LICENSE`, `NOTICE`, and an explicit license-transition record.

Presets require exact tool and origin allowlists. They never enable every tool or origin. Registered adapters must still declare accurate effects, origins, and risk. A simulation is a design report, not an execution authorization or security certification.

## Release channel

This document describes a candidate only. Do not publish it as `latest` or call it stable before exact-head CI, package-consumer tests, license checks, maintainer approval, registry provenance verification, and the matching annotated prerelease tag are complete. Stable `0.3.3` remains licensed under MIT.
