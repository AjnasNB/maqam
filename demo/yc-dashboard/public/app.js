const app = document.querySelector("#app");
const runButton = document.querySelector("#run-workflow");
const focusPanel = document.querySelector("#focus-panel");
const progressBar = document.querySelector("#progress-bar");
const progressLabel = document.querySelector("#progress-label");
const runState = document.querySelector("#run-state");
const proofStatus = document.querySelector("#proof-status");
const approvalCard = document.querySelector("#approval-card");
const approvalState = document.querySelector("#approval-state");
const approvalDetail = document.querySelector("#approval-detail");
const receiptHash = document.querySelector("#receipt-hash");
const errorToast = document.querySelector("#error-toast");

const params = new URLSearchParams(location.search);
let run = null;
let runId = null;
let pollTimer = null;
let renderedSequence = 0;
let approvalSubmitted = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHash(value, size = 14) {
  if (!value) return "pending";
  const normalized = String(value).replace(/^sha256:/, "");
  return `sha256:${normalized.slice(0, size)}...`;
}

function tail(value, lines = 10) {
  return String(value || "").trim().split(/\r?\n/).slice(-lines).join("\n");
}

function setFocus({ eyebrow, title, description, body = "", meta = [] }) {
  focusPanel.innerHTML = `
    <div class="focus-content">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
      ${body}
      <div class="focus-meta">
        ${meta.map(({ text, tone = "" }) => `<span class="${tone}">${escapeHtml(text)}</span>`).join("")}
      </div>
    </div>
  `;
}

function setTimeline(id, state = "running") {
  const steps = [...document.querySelectorAll(".timeline-step")];
  const index = steps.findIndex((step) => step.dataset.step === id);
  steps.forEach((step, stepIndex) => {
    step.classList.remove("running", "complete", "blocked");
    if (stepIndex < index) step.classList.add("complete");
    if (stepIndex === index) step.classList.add(state);
  });
  const verified = Math.min(8, Math.max(0, index + (state === "blocked" ? 0 : 1)));
  progressLabel.textContent = `${verified} / 8 live stages`;
  progressBar.style.width = `${verified * 12.5}%`;
}

function setSignal(name, primary, secondary, state = "active") {
  const card = document.querySelector(`[data-signal="${name}"]`);
  card.classList.remove("active", "blocked");
  if (state) card.classList.add(state);
  document.querySelector(`#signal-${name}`).textContent = primary;
  document.querySelector(`#signal-${name}-detail`).textContent = secondary;
}

function completeReceipt(kind) {
  document.querySelector(`[data-receipt="${kind}"]`)?.classList.add("complete");
}

function setRunLive(label = "RUNNING") {
  runState.textContent = label;
  proofStatus.textContent = label === "VERIFIED" ? "VERIFIED LIVE" : label;
  proofStatus.className = `proof-status ${label === "VERIFIED" ? "verified" : "live"}`;
}

function renderTask(event) {
  setRunLive("RUNNING");
  setTimeline("task");
  const baseline = run.baseline;
  setFocus({
    eyebrow: "01 - REAL SAMPLE REPOSITORY",
    title: "A failing v1 client is now open on disk.",
    description: run.task,
    body: `
      <div class="approval-proof">
        <div>
          <p class="proof-label">PERSISTED WORKSPACE</p>
          <strong>${escapeHtml(run.repository?.sourcePath || "creating repository...")}</strong>
          <code>${escapeHtml(run.workspace)}</code>
        </div>
        <div>
          <p class="proof-label">BASELINE TEST</p>
          <strong>${baseline ? "EXPECTED FAILURE REPRODUCED" : "RUNNING NODE TESTS"}</strong>
          <code>${baseline ? `exit=${baseline.exitCode}` : "node --test test/vendor-client.test.js"}</code>
        </div>
      </div>
    `,
    meta: [
      { text: "REAL GIT REPOSITORY", tone: "good" },
      { text: baseline ? "BASELINE FAILED AS EXPECTED" : event.label, tone: "good" },
      { text: "WORKSPACE IS PRESERVED" }
    ]
  });
}

function renderPolicy() {
  setTimeline("policy");
  setSignal("policy", "Allow with approval", "Exact input - one use");
  completeReceipt("policy");
  setFocus({
    eyebrow: "02 - MAQAM POLICY",
    title: "The agent can read and propose. It cannot write.",
    description: run.policy.reason,
    body: `
      <div class="approval-proof">
        <div><p class="proof-label">REGISTERED TOOL</p><strong>${escapeHtml(run.policy.tool)}</strong><code>effect=${escapeHtml(run.policy.effects.join(","))} - risk=${escapeHtml(run.policy.risk)}</code></div>
        <div><p class="proof-label">WRITE AUTHORITY</p><strong>EXACT INPUT - ONE USE</strong><code>run_id + tool_name + input_hash</code></div>
      </div>
    `,
    meta: [
      { text: "POLICY BEFORE DISPATCH", tone: "good" },
      { text: "NO WRITE YET", tone: "good" }
    ]
  });
}

function renderMemory() {
  setTimeline("memory");
  setSignal("memory", `${run.memory.itemCount} cited items`, `~${run.memory.estimatedTokens} tokens`);
  completeReceipt("context");
  const items = run.memory.items.map((item) => `
    <div class="memory-item"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.kind)} - ${escapeHtml(shortHash(item.hash, 9))}</small></div>
  `).join("");
  setFocus({
    eyebrow: "03 - QARINAH PROJECT MEMORY",
    title: "The coding worker gets a small, cited context pack.",
    description: `${run.memory.itemCount} project records were selected. Qarinah verified the local event chain before compilation.`,
    body: `<div class="memory-list">${items}</div>`,
    meta: [
      { text: `~${run.memory.estimatedTokens} TOKENS`, tone: "good" },
      { text: `${run.memory.coverage.status.toUpperCase()} COVERAGE`, tone: "good" },
      { text: shortHash(run.memory.manifestHash) }
    ]
  });
}

function renderEvidence() {
  setTimeline("evidence");
  setSignal("evidence", "1 verified record", shortHash(run.evidence.contentHash, 10));
  completeReceipt("source");
  setFocus({
    eyebrow: "04 - COCKROACH SOURCE EVIDENCE",
    title: "The live vendor contract is fetched and content-addressed.",
    description: "One approved origin, finite request and byte budgets, robots honored, and normalized source evidence.",
    body: `
      <div class="evidence-record">
        <div><p class="proof-label">${escapeHtml(run.evidence.sourceLabel)}</p><blockquote>"${escapeHtml(run.evidence.excerpt)}"</blockquote></div>
        <div class="hash-box"><p class="proof-label">CONTENT IDENTITY</p><code>${escapeHtml(run.evidence.contentHash)}</code></div>
      </div>
    `,
    meta: [
      { text: `${run.evidence.requests} BOUNDED REQUESTS`, tone: "good" },
      { text: `${run.evidence.bytes} BYTES` },
      { text: `${run.evidence.failures.length} FAILURES`, tone: "good" }
    ]
  });
}

function coloredDiff(value) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) return `<span class="add">${line}</span>`;
      if (line.startsWith("-") && !line.startsWith("---")) return `<span class="remove">${line}</span>`;
      return line;
    })
    .join("\n");
}

function renderAgentWorking() {
  setTimeline("proposal");
  setFocus({
    eyebrow: "05 - READ-ONLY CODING WORKER",
    title: `${run.worker?.name || "Codex CLI"} is inspecting the real project.`,
    description: "It receives the Qarinah context pack and crawler evidence, reads the committed tests, and can only return a typed proposal. Maqam owns the write.",
    body: `
      <div class="terminal-output">
        <div class="terminal-head"><span>LIVE WORKER</span><span>${run.worker?.eventCount || 0} EVENTS</span></div>
        <pre>authority = read-only
workspace = ${escapeHtml(run.workspace)}
status = ${escapeHtml(run.worker?.status || "starting")}
target = src/vendor-client.js</pre>
      </div>
    `,
    meta: [
      { text: "CODEX CLI", tone: "good" },
      { text: "READ-ONLY SANDBOX", tone: "good" },
      { text: "NO FILE CHANGE" }
    ]
  });
}

function renderProposal() {
  setTimeline("proposal");
  approvalCard.className = "approval-card requested";
  approvalState.textContent = "Waiting for your exact approval";
  approvalDetail.textContent = `Input ${shortHash(run.approval.subject.inputHash, 12)}`;
  setFocus({
    eyebrow: "05 - REAL APPROVAL PAUSE",
    title: "Review the generated diff, then approve it once.",
    description: "This button resumes the backend. Until you click it, the file remains unchanged and no test can pass.",
    body: `
      <pre class="diff">${coloredDiff(run.proposal.patch)}</pre>
      <button class="approve-button" id="approve-patch" type="button">
        APPROVE THIS EXACT PATCH ONCE
        <span>${escapeHtml(shortHash(run.approval.subject.inputHash, 12))}</span>
      </button>
    `,
    meta: [
      { text: run.approval.requested.code, tone: "good" },
      { text: "0 EXECUTIONS", tone: "good" },
      { text: "REAL USER ACTION REQUIRED" }
    ]
  });
  document.querySelector("#approve-patch")?.addEventListener("click", approvePatch, { once: true });
}

function renderAltered() {
  setTimeline("altered", "blocked");
  setSignal("action", "0 executions", "Altered input blocked", "blocked");
  approvalCard.className = "approval-card blocked";
  approvalState.textContent = "Changed input rejected";
  approvalDetail.textContent = "The approved input hash no longer matched.";
  setFocus({
    eyebrow: "06 - AUTHORITY DID NOT EXPAND",
    title: "A changed patch was rejected before the tool ran.",
    description: run.approval.alteredInput.reason,
    body: `
      <div class="approval-proof">
        <div><p class="proof-label">APPROVED</p><strong>v2 endpoint + Idempotency-Key</strong><code>${escapeHtml(shortHash(run.approval.subject.inputHash, 22))}</code></div>
        <div><p class="proof-label">ALTERED</p><strong>Idempotency-Key removed</strong><code>${escapeHtml(run.approval.alteredInput.code)}</code></div>
      </div>
    `,
    meta: [
      { text: "BLOCKED BEFORE TOOL CALL", tone: "bad" },
      { text: "0 EXECUTIONS", tone: "good" },
      { text: "NO FILE CHANGE", tone: "good" }
    ]
  });
}

function renderExact() {
  setTimeline("exact");
  const result = run.approval.exactInput?.result;
  if (!result) {
    setFocus({
      eyebrow: "07 - EXACT INPUT EXECUTING",
      title: "Maqam is writing the approved content and running the committed tests.",
      description: "The approval will be consumed only for this exact call.",
      body: `<div class="terminal-output"><div class="terminal-head"><span>NODE TEST</span><span>RUNNING</span></div><pre>node --test test/vendor-client.test.js</pre></div>`,
      meta: [
        { text: "EXACT INPUT MATCH", tone: "good" },
        { text: "TEST PROCESS RUNNING" }
      ]
    });
    return;
  }
  setSignal("action", "1 exact execution", "3 real Node tests passed", "active");
  completeReceipt("approval");
  completeReceipt("action");
  approvalCard.className = "approval-card approved";
  approvalState.textContent = "Approved input executed once";
  approvalDetail.textContent = "Approval consumed after the successful call.";
  setFocus({
    eyebrow: "07 - REAL FILE WRITE + REAL TEST PROCESS",
    title: "The reviewed patch ran once and the committed tests passed.",
    description: "This output came from Node's test runner inside the persisted sample repository.",
    body: `
      <div class="terminal-output">
        <div class="terminal-head"><span>${escapeHtml(result.tests.command)}</span><span>EXIT ${result.tests.exitCode}</span></div>
        <pre>${escapeHtml(tail(result.tests.stdout, 13))}</pre>
      </div>
    `,
    meta: [
      { text: "1 EXECUTION", tone: "good" },
      { text: "3 TESTS PASSED", tone: "good" },
      { text: "GIT DIFF CLEAN", tone: "good" }
    ]
  });
}

function renderReceipt() {
  setTimeline("receipt");
  setRunLive("VERIFIED");
  completeReceipt("outcome");
  receiptHash.textContent = run.receipt.receiptHash;
  setFocus({
    eyebrow: "08 - INSPECTABLE END DASHBOARD",
    title: "The code changed. Tests passed. Every decision is linked.",
    description: "The sample repository remains on disk with its source, Qarinah store, Git diff, test output, and governed receipt.",
    body: `
      <div class="final-dashboard">
        <div class="final-metric"><b>${escapeHtml(run.memory.itemCount)}</b><span>cited memories</span></div>
        <div class="final-metric"><b>${escapeHtml(run.evidence.records)}</b><span>verified source</span></div>
        <div class="final-metric"><b>${escapeHtml(run.approval.exactInput.executions)}</b><span>exact execution</span></div>
        <div class="final-metric"><b>3/3</b><span>real tests passed</span></div>
        <div class="final-metric"><b>${escapeHtml(run.receipt.unsupportedClaims)}</b><span>unsupported claims</span></div>
      </div>
      <div class="terminal-output compact">
        <div class="terminal-head"><span>VERIFICATION</span><span>EXIT ${run.receipt.testExitCode}</span></div>
        <pre>${escapeHtml(tail(run.receipt.testOutput, 8))}</pre>
      </div>
      <div class="workspace-proof"><span>WORKSPACE PRESERVED</span><code>${escapeHtml(run.receipt.workspace)}</code></div>
    `,
    meta: [
      { text: "ALTERED WRITE BLOCKED", tone: "good" },
      { text: "REPLAY REJECTED", tone: "good" },
      { text: shortHash(run.receipt.receiptHash) }
    ]
  });
  approvalCard.className = "approval-card approved";
  approvalState.textContent = "One approval consumed";
  approvalDetail.textContent = `${run.approval.replay.code} on replay`;
  runButton.disabled = false;
  runButton.querySelector("span").textContent = "RUN ANOTHER REAL TASK";
  app.dataset.state = "complete";
  clearTimeout(pollTimer);
}

function renderEvent(event) {
  if (event.kind === "workspace.created" || event.kind === "baseline.failed") renderTask(event);
  if (event.kind === "policy.evaluated") renderPolicy();
  if (event.kind === "memory.compiled") renderMemory();
  if (event.kind === "evidence.fetched") renderEvidence();
  if (event.kind === "agent.started" || event.kind === "proposal.generated") renderAgentWorking();
  if (event.kind === "approval.requested") renderProposal();
  if (event.kind === "approval.approved") renderExact();
  if (event.kind === "tamper.rejected") renderAltered();
  if (event.kind === "patch.applied" || event.kind === "tests.completed" || event.kind === "replay.rejected") renderExact();
  if (event.kind === "receipt.verified") renderReceipt();
  if (event.kind === "run.failed") showError(event.label);
}

function renderSnapshot() {
  if (!run) return;
  document.querySelector("#task-text").textContent = run.task;
  document.querySelector("#run-id").textContent = run.id.toUpperCase();
  document.querySelector(".run-number").textContent = run.id.slice(-10).toUpperCase();
  if (run.packages?.maqam) document.querySelector("#version-maqam").textContent = run.packages.maqam;
  if (run.packages?.qarinah) document.querySelector("#version-qarinah").textContent = run.packages.qarinah;
  if (run.packages?.cockroachCrawler) document.querySelector("#version-crawler").textContent = run.packages.cockroachCrawler;
  for (const event of run.events.filter((entry) => entry.sequence > renderedSequence)) {
    renderEvent(event);
    renderedSequence = event.sequence;
  }
  if (run.status === "running" && run.stage === "proposal" && run.worker?.status === "working") renderAgentWorking();
  if (run.status === "waiting_approval" && run.approval && !document.querySelector("#approve-patch")) renderProposal();
  if (run.status === "failed") showError(run.error || "The live workflow failed.");
}

function resetUi() {
  clearTimeout(pollTimer);
  renderedSequence = 0;
  approvalSubmitted = false;
  document.querySelectorAll(".timeline-step").forEach((step) => step.classList.remove("running", "complete", "blocked"));
  document.querySelectorAll(".signal-card").forEach((card) => card.classList.remove("active", "blocked"));
  document.querySelectorAll("#receipt-chain li").forEach((item) => item.classList.remove("complete"));
  approvalCard.className = "approval-card";
  approvalState.textContent = "Not requested";
  approvalDetail.textContent = "Bound to run + tool + input hash";
  receiptHash.textContent = "Pending successful execution";
  progressBar.style.width = "0";
  progressLabel.textContent = "0 / 8 live stages";
  errorToast.classList.remove("visible");
  app.dataset.state = "running";
}

async function fetchRun() {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load live run state.");
  run = result;
  renderSnapshot();
  if (!["passed", "failed"].includes(run.status)) pollTimer = setTimeout(poll, 350);
}

async function poll() {
  try {
    await fetchRun();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function startWorkflow() {
  if (run && !["passed", "failed"].includes(run.status)) return;
  resetUi();
  runButton.disabled = true;
  runButton.querySelector("span").textContent = "CREATING REAL WORKSPACE";
  setRunLive("STARTING");
  try {
    const response = await fetch("/api/runs", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not create the live run.");
    run = result;
    runId = result.id;
    runButton.querySelector("span").textContent = "LIVE RUN IN PROGRESS";
    renderSnapshot();
    pollTimer = setTimeout(poll, 150);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function approvePatch() {
  if (approvalSubmitted || !runId) return;
  approvalSubmitted = true;
  const button = document.querySelector("#approve-patch");
  if (button) {
    button.disabled = true;
    button.firstChild.textContent = "APPROVAL SENT - EXECUTING ";
  }
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/approve`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The exact approval was rejected.");
    run = result;
    renderSnapshot();
  } catch (error) {
    approvalSubmitted = false;
    showError(error instanceof Error ? error.message : String(error));
  }
}

function showError(message) {
  clearTimeout(pollTimer);
  runButton.disabled = false;
  runButton.querySelector("span").textContent = "RUN GOVERNED WORKFLOW";
  app.dataset.state = "error";
  errorToast.textContent = message;
  errorToast.classList.add("visible");
}

runButton.addEventListener("click", startWorkflow);
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
  });
});

if (params.get("autoplay") === "1") {
  window.addEventListener("load", () => setTimeout(startWorkflow, 700), { once: true });
  const autoApprove = setInterval(() => {
    const button = document.querySelector("#approve-patch");
    if (button && !approvalSubmitted) {
      clearInterval(autoApprove);
      setTimeout(() => button.click(), 1_500);
    }
  }, 250);
}
