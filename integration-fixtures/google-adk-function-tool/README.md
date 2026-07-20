# Google ADK FunctionTool integration fixture

This private workspace exercises one offline Google ADK `FunctionTool` call routed through Maqam's `ToolGateway`.

## Scope

- The fixture is not part of the published `maqam` npm tarball.
- `@google/adk` is isolated here instead of being added to the root package dependency graph.
- The test performs no Google, Gemini, network, database, MCP, or credentialed operation.
- The fixture proves only the local `FunctionTool` callback-to-gateway shape and policy allow/deny behavior.

## Dependency posture

- Direct dependency: `@google/adk@1.2.0`, Apache-2.0.
- Install command used by CI: `npm --prefix integration-fixtures/google-adk-function-tool ci --ignore-scripts`.
- `--ignore-scripts` is intentional. The resolved tree contains packages that declare install scripts, including `@google/genai`, `protobufjs`, and `sqlite3`; the offline fixture does not require install-time native compilation.
- The fixture uses npm `overrides` to keep vulnerable unused transitive paths on patched versions while preserving the `FunctionTool` API exercised here.

## Verification commands

Run from the repository root:

```bash
npm run install:google-adk-fixture
npm run audit:google-adk-fixture
npm run test:google-adk-fixture
```

These commands are wired into the main CI Node matrix for Node 22, 24, and 26.

## Release boundary

This fixture is release evidence for an optional integration pattern. It is not a provider certification, provider partnership, native ADK integration, or production approval bridge.
