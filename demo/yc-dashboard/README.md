# Maqam live YC control-plane demo

This is a self-contained, implementation-backed product demo for Maqam.
It runs one software-engineering workflow through the published Qarinah and
Cockroach Crawler packages plus Maqam's local policy, approval, tool gateway,
and evidence ledger.

## The one-minute story

1. A coding agent receives a vendor API migration task.
2. Maqam allows reads but stops the high-risk write.
3. Qarinah compiles the small cited project-memory pack needed for the task.
4. Cockroach Crawler retrieves and hashes the approved migration guide.
5. The installed Codex CLI proposes a typed patch in read-only mode.
6. A changed patch is rejected because its input hash is outside the approval.
7. The exact reviewed patch executes once and passes three checks.
8. Reusing the approval is rejected.
9. Maqam emits one causal receipt linking source, context, policy, approval,
   action, and outcome.

The vendor documentation is a controlled local fixture so the demo remains
reproducible. The sample Git repository persists under `.runs/`. Repository
creation, the failing baseline, Qarinah capture and retrieval, network
admission, crawling, normalization, content identity, the Codex proposal,
manual approval enforcement, the file write, Node tests, replay rejection, and
receipt generation execute for real.

## Run it

```powershell
npm install
npm run check
npm run generate
npm run serve
```

Open <http://127.0.0.1:4177>, choose **Run governed workflow**, inspect the
generated diff, and choose **Approve this exact patch once**. The end dashboard
shows the preserved workspace and receipt hash.

## Record the silent YC demo

The recorder opens the installed Chrome browser visibly on Windows and uses
ffmpeg `gdigrab` to capture the real desktop. It starts the real workflow,
waits for the manual approval point, performs the approval, waits for the
verified receipt, captures a poster, and produces a silent H.264 MP4. Display
pacing happens only after a real stage has completed.

```powershell
npm run record
```

Artifacts are written to `artifacts/`.

- [Real desktop-captured YC demo MP4](artifacts/maqam-yc-control-plane-demo.mp4)
- [Final proof poster](artifacts/maqam-yc-control-plane-poster.png)

Every successful run also writes `governed-receipt.json` inside its preserved
sample repository.
