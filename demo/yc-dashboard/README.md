# Maqam YC control-plane demo

This is a self-contained, implementation-backed product demo for Maqam.
It runs one software-engineering workflow through the published Qarinah and
Cockroach Crawler packages plus Maqam's local policy, approval, tool gateway,
and evidence ledger.

## The one-minute story

1. A coding agent receives a vendor API migration task.
2. Maqam allows reads but stops the high-risk write.
3. Qarinah compiles the small cited project-memory pack needed for the task.
4. Cockroach Crawler retrieves and hashes the approved migration guide.
5. The agent proposes a patch.
6. A changed patch is rejected because its input hash is outside the approval.
7. The exact reviewed patch executes once and passes three checks.
8. Reusing the approval is rejected.
9. Maqam emits one causal receipt linking source, context, policy, approval,
   action, and outcome.

The vendor documentation is a controlled local fixture so the demo remains
reproducible. Network admission, crawling, normalization, content identity,
context compilation, approval enforcement, the write, tests, and receipt
generation execute for real.

## Run it

```powershell
npm install
npm run check
npm run generate
npm run serve
```

Open <http://127.0.0.1:4177> and choose **Run governed workflow**.

## Record the silent YC demo

The recorder uses the installed Chrome browser and ffmpeg. It opens the real
dashboard, starts the workflow, waits for the verified receipt, captures a
poster, and produces a silent H.264 MP4.

```powershell
npm run record
```

Artifacts are written to `artifacts/`.

- [Silent 60-second MP4](artifacts/maqam-yc-control-plane-demo.mp4)
- [Final proof poster](artifacts/maqam-yc-control-plane-poster.png)
- [Machine-readable workflow proof](public/workflow-proof.json)
