# Security scan triage, October 13, 2026

This record explains the findings from the first public-repository CodeQL scan.
It is bounded engineering review, not a security certification.

## Fixed: demo resource limits

The YC demo previously retained every progress event. Its history now keeps the
latest 512 events while sequence numbers continue increasing. A regression test
emits more than the limit and checks both bounded retention and ordering. The
proposal process also stops when combined stdout/stderr exceeds 1 MiB; its
90-second execution timeout remains in force.

The reported resource-exhaustion dataflow also reached the demo pacing timer.
Operator/query-supplied pacing is now clamped to 0–1000 ms, with a second check at
the timer boundary. A regression verifies that a later mutation cannot schedule
an unbounded delay.

## Trusted operator inputs

- `src/framework/cli-agent-tool.js`: the constructor receives a fixed command and
  argument vector from the application operator, snapshots configuration, resolves
  the executable, and validates working-directory/environment policy. Agent input
  goes to stdin, not into the command or arguments. Shell execution defaults to
  false and requires explicit `allowUnsafeShell` when selected. That opt-in is
  deliberately unsafe and must never be derived from agent or network input.
- `demo/yc-dashboard/scripts/workflow.mjs`: the proposal worker uses the locally
  installed coding CLI selected by the operator's environment, an argument vector
  and stdin. `spawn` does not enable a shell. The demo is a local, single-operator
  example, not an authenticated enterprise control plane.
- `examples/govern-approved-write.mjs`: the example's folder comes from the local
  operator's command-line argument. The verified filename is the fixed
  `maqam-proof.txt` beneath that selected workspace. There is no remote
  attacker-supplied filename. This example is intended for a throwaway workspace.

CodeQL's generic user-input labels on those three command/folder paths do not
establish a remote injection vulnerability in the documented interface. They are
triaged as false positives for that interface. If an application exposes these
operator configuration values to an untrusted caller, it introduces a new trust
boundary and needs its own validation and review.

## Dependency evidence

The root, both demos and isolated Google ADK fixture pass their full npm audits.
The public dependency graph records `adm-zip` 0.6.1 and `undici` 7.30.0; `hono` and
the old Undici 6.x path are absent from the current fixture lockfile. Residual
alerts referring to those replaced versions are triaged against the checked
lockfile and dependency graph, rather than assuming the alerts prove the current
tree is vulnerable. Scanning and push protection remain enabled.
