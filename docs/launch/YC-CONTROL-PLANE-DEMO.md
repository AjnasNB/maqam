# Maqam control-plane demo

The YC product demo is one implementation-backed software-engineering run,
not a slide deck and not a set of disconnected feature screens.

## The claim

**Maqam controls what AI agents can access, remember, and do.**

Cockroach Crawler supplies bounded source evidence. Qarinah supplies compact,
cited project memory. Maqam evaluates policy, binds human approval to the
exact action, dispatches the registered tool once, and emits the causal
receipt.

## The 60-second workflow

| Time | Visible event | Runtime proof |
| --- | --- | --- |
| 0-5s | Vendor migration task enters the control plane | A fresh run begins with no tool dispatched |
| 5-12s | Policy allows reads and gates the write | `apply_patch` is registered as a high-risk write |
| 12-19s | Qarinah returns four cited project memories | Local event chain verifies and direct query coverage is 10/10 |
| 19-27s | Cockroach retrieves the migration guide | One admitted origin becomes a normalized, hashed source record |
| 27-35s | The coding agent proposes a patch | The exact input is bound to the run, tool, context, and source |
| 35-42s | An altered patch removes retry safety | Maqam returns `APPROVAL_SCOPE_MISMATCH`; executions remain zero |
| 42-48s | The exact reviewed patch runs | Three migration checks pass; approval is consumed once |
| 48-53s | The same approval is replayed | Maqam returns `APPROVAL_INVALID`; executions remain one |
| 53-60s | The causal receipt appears | Source → context → policy → approval → action → outcome |

## Run and record

```powershell
npm run demo:yc:check
npm run demo:yc:generate
npm run demo:yc:serve
```

Open `http://127.0.0.1:4177` and choose **Run governed workflow**.

To capture the silent 1920×1080 demo:

```powershell
npm run demo:yc:record
```

The MP4, original browser recording, and poster are written to
`demo/yc-dashboard/artifacts/`.

The reviewed repository deliverables are:

- [silent 60-second MP4](../../demo/yc-dashboard/artifacts/maqam-yc-control-plane-demo.mp4)
- [final proof poster](../../demo/yc-dashboard/artifacts/maqam-yc-control-plane-poster.png)
- [machine-readable workflow proof](../../demo/yc-dashboard/public/workflow-proof.json)

## Honest boundary

The product governs operations that enter through registered adapters. The
controlled vendor page in this demo is a deterministic fixture, while the
crawler, context compiler, policy decision, approval scope, write, checks, and
receipt all execute through the real packages and runtime.
