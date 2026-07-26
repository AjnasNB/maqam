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
const finalFrame = document.querySelector("#final-frame");
const errorToast = document.querySelector("#error-toast");

const params = new URLSearchParams(location.search);
const speed = Math.max(0.02, Number(params.get("speed") || 1));
const timers = new Set();
let proof = null;
let running = false;

const schedule = [
  { at: 0, id: "task", render: renderTask },
  { at: 5_000, id: "policy", render: renderPolicy },
  { at: 12_000, id: "memory", render: renderMemory },
  { at: 19_000, id: "evidence", render: renderEvidence },
  { at: 27_000, id: "proposal", render: renderProposal },
  { at: 35_000, id: "altered", render: renderAltered },
  { at: 42_000, id: "exact", render: renderExact },
  { at: 48_000, id: "replay", render: renderReplay },
  { at: 53_000, id: "receipt", render: renderReceipt },
  { at: 57_000, id: "final", render: renderFinal }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHash(value, size = 14) {
  if (!value) return "pending";
  const normalized = String(value).replace(/^sha256:/, "");
  return `sha256:${normalized.slice(0, size)}…`;
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
    step.classList.remove("running", "blocked");
    if (stepIndex < index) step.classList.add("complete");
    if (stepIndex === index) step.classList.add(state);
  });
  const verified = Math.min(8, Math.max(0, index + (state === "blocked" ? 0 : 1)));
  progressLabel.textContent = `${verified} / 8 verified`;
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
  proofStatus.textContent = label === "VERIFIED" ? "VERIFIED" : "RECORDING";
  proofStatus.className = `proof-status ${label === "VERIFIED" ? "verified" : "live"}`;
}

function renderTask() {
  setRunLive();
  setTimeline("task");
  setFocus({
    eyebrow: "01 · TASK RECEIVED",
    title: proof.run.title,
    description: proof.run.task,
    meta: [
      { text: "REQUESTED BY coding-agent" },
      { text: proof.run.environment.toUpperCase() },
      { text: "NO TOOL DISPATCHED", tone: "good" }
    ]
  });
}

function renderPolicy() {
  setTimeline("policy");
  setSignal("policy", "Allow with approval", "Exact input · one use");
  completeReceipt("policy");
  setFocus({
    eyebrow: "02 · MAQAM POLICY",
    title: "Read freely. Stop before the write.",
    description: proof.policy.reason,
    body: `
      <div class="approval-proof">
        <div>
          <p class="proof-label">REGISTERED TOOL</p>
          <strong>${escapeHtml(proof.policy.tool)}</strong>
          <code>effect=${escapeHtml(proof.policy.effects.join(","))} · risk=${escapeHtml(proof.policy.risk)}</code>
        </div>
        <div>
          <p class="proof-label">DECISION</p>
          <strong>ALLOW WITH EXACT APPROVAL</strong>
          <code>run_id + tool_name + input_hash</code>
        </div>
      </div>
    `,
    meta: [
      { text: "POLICY BEFORE DISPATCH", tone: "good" },
      { text: "CREATOR-OWNED AUTHORITY" }
    ]
  });
}

function renderMemory() {
  setTimeline("memory");
  setSignal("memory", `${proof.memory.itemCount} cited items`, `~${proof.memory.estimatedTokens} tokens`);
  completeReceipt("context");
  const items = proof.memory.items.map((item) => `
    <div class="memory-item">
      <b>${escapeHtml(item.title)}</b>
      <small>${escapeHtml(item.kind)} · ${escapeHtml(shortHash(item.hash, 9))}</small>
    </div>
  `).join("");
  setFocus({
    eyebrow: "03 · QARINAH PROJECT MEMORY",
    title: "Only the decisions this task needs.",
    description: `${proof.memory.itemCount} evidence-linked records were selected with direct query coverage. The local event chain verified before compilation.`,
    body: `<div class="memory-list">${items}</div>`,
    meta: [
      { text: `~${proof.memory.estimatedTokens} TOKENS`, tone: "good" },
      { text: "DIRECT COVERAGE 10/10", tone: "good" },
      { text: shortHash(proof.memory.manifestHash) }
    ]
  });
}

function renderEvidence() {
  setTimeline("evidence");
  setSignal("evidence", "1 verified record", shortHash(proof.evidence.contentHash, 10));
  completeReceipt("source");
  setFocus({
    eyebrow: "04 · COCKROACH SOURCE EVIDENCE",
    title: "The migration guide becomes a source record.",
    description: "The crawler admitted one approved origin, obeyed robots, bounded requests and bytes, and returned normalized evidence with a content hash.",
    body: `
      <div class="evidence-record">
        <div>
          <p class="proof-label">${escapeHtml(proof.evidence.sourceLabel)}</p>
          <blockquote>“${escapeHtml(proof.evidence.excerpt)}”</blockquote>
        </div>
        <div class="hash-box">
          <p class="proof-label">CONTENT IDENTITY</p>
          <code>${escapeHtml(proof.evidence.contentHash)}</code>
        </div>
      </div>
    `,
    meta: [
      { text: `${proof.evidence.requests} BOUNDED REQUESTS`, tone: "good" },
      { text: `${proof.evidence.bytes} BYTES` },
      { text: "0 FAILURES", tone: "good" }
    ]
  });
}

function renderProposal() {
  setTimeline("proposal");
  const coloredDiff = escapeHtml(proof.proposal.patch)
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) return `<span class="add">${line}</span>`;
      if (line.startsWith("-") && !line.startsWith("---")) return `<span class="remove">${line}</span>`;
      return line;
    })
    .join("\n");
  approvalCard.className = "approval-card requested";
  approvalState.textContent = "Exact approval requested";
  approvalDetail.textContent = `Input ${shortHash(proof.approval.subject.inputHash, 12)}`;
  setFocus({
    eyebrow: "05 · PROPOSED PATCH",
    title: "The agent can propose. It cannot silently write.",
    description: "The patch is bound to the source hash, Qarinah manifest, run, registered tool, and exact input hash before approval.",
    body: `<pre class="diff">${coloredDiff}</pre>`,
    meta: [
      { text: proof.approval.requested.code, tone: "good" },
      { text: "0 EXECUTIONS", tone: "good" },
      { text: "AWAITING HUMAN" }
    ]
  });
}

function renderAltered() {
  setTimeline("altered", "blocked");
  setSignal("action", "0 executions", "Altered input blocked", "blocked");
  approvalCard.className = "approval-card blocked";
  approvalState.textContent = "Changed input rejected";
  approvalDetail.textContent = "The approved input hash no longer matched.";
  setFocus({
    eyebrow: "06 · AUTHORITY DID NOT EXPAND",
    title: "One line changed. The write was blocked.",
    description: proof.approval.alteredInput.reason,
    body: `
      <div class="approval-proof">
        <div>
          <p class="proof-label">APPROVED</p>
          <strong>v2 endpoint + Idempotency-Key</strong>
          <code>${escapeHtml(shortHash(proof.approval.subject.inputHash, 22))}</code>
        </div>
        <div>
          <p class="proof-label">ALTERED</p>
          <strong>Idempotency-Key removed</strong>
          <code>${escapeHtml(proof.approval.alteredInput.code)}</code>
        </div>
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
  setSignal("action", "1 exact execution", "3 migration checks passed", "active");
  completeReceipt("approval");
  completeReceipt("action");
  approvalCard.className = "approval-card approved";
  approvalState.textContent = "Approved input executed once";
  approvalDetail.textContent = "Approval consumed after the successful call.";
  setFocus({
    eyebrow: "07 · EXACT INPUT EXECUTED",
    title: "The reviewed patch ran once - and passed.",
    description: "The stored file matched the authorized content. Three migration checks passed and the approval was consumed.",
    body: `
      <div class="receipt-grid">
        ${proof.proposal.checks.map((check, index) => `
          <div>
            <p class="proof-label">CHECK 0${index + 1}</p>
            <b>${escapeHtml(check)}</b>
            <code>PASS</code>
          </div>
        `).join("")}
      </div>
    `,
    meta: [
      { text: "1 EXECUTION", tone: "good" },
      { text: "1 APPROVAL CONSUMPTION", tone: "good" },
      { text: shortHash(proof.approval.exactInput.result.contentHash) }
    ]
  });
}

function renderReplay() {
  setTimeline("exact");
  setFocus({
    eyebrow: "07B · REPLAY ATTEMPT",
    title: "The same approval could not be used twice.",
    description: "A second call with the already approved input was rejected. Execution count remained one and the output stayed unchanged.",
    body: `
      <div class="approval-proof">
        <div>
          <p class="proof-label">FIRST CALL</p>
          <strong>COMPLETED</strong>
          <code>approval consumptions = 1</code>
        </div>
        <div>
          <p class="proof-label">REPLAY</p>
          <strong>${escapeHtml(proof.approval.replay.code)}</strong>
          <code>executions = ${proof.approval.replay.executions}</code>
        </div>
      </div>
    `,
    meta: [
      { text: "REPLAY BLOCKED", tone: "bad" },
      { text: "OUTPUT UNCHANGED", tone: "good" }
    ]
  });
}

function renderReceipt() {
  setTimeline("receipt");
  setRunLive("VERIFIED");
  completeReceipt("outcome");
  receiptHash.textContent = proof.receipt.receiptHash;
  setFocus({
    eyebrow: "08 · CAUSAL RECEIPT",
    title: "The answer to what happened is one receipt.",
    description: "Source, context, policy, approval, action, and outcome are linked by content identity. Every selected memory and action points back to evidence.",
    body: `
      <div class="receipt-grid">
        ${proof.receipt.chain.map((item) => `
          <div>
            <p class="proof-label">${escapeHtml(item.kind)}</p>
            <b>${escapeHtml(item.label)}</b>
            <code>${escapeHtml(shortHash(item.hash, 12))}</code>
          </div>
        `).join("")}
      </div>
    `,
    meta: [
      { text: `${proof.receipt.evidenceRecords} EVIDENCE RECORDS`, tone: "good" },
      { text: `${proof.receipt.claims} SUPPORTED CLAIM`, tone: "good" },
      { text: `${proof.receipt.unsupportedClaims} UNSUPPORTED CLAIMS`, tone: "good" }
    ]
  });
  app.dataset.state = "complete";
}

function renderFinal() {
  finalFrame.classList.add("visible");
  finalFrame.setAttribute("aria-hidden", "false");
  runButton.disabled = false;
  runButton.querySelector("span").textContent = "REPLAY WORKFLOW";
  running = false;
}

function clearRun() {
  timers.forEach(clearTimeout);
  timers.clear();
  finalFrame.classList.remove("visible");
  finalFrame.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".timeline-step").forEach((step) => {
    step.classList.remove("running", "complete", "blocked");
  });
  document.querySelectorAll(".signal-card").forEach((card) => {
    card.classList.remove("active", "blocked");
  });
  document.querySelectorAll("#receipt-chain li").forEach((item) => item.classList.remove("complete"));
  approvalCard.className = "approval-card";
  receiptHash.textContent = "Pending successful execution";
  progressBar.style.width = "0";
  progressLabel.textContent = "0 / 8 verified";
  app.dataset.state = "running";
}

async function runWorkflow() {
  if (running) return;
  running = true;
  clearRun();
  runButton.disabled = true;
  runButton.querySelector("span").textContent = "RUNNING VERIFIED STACK";
  proofStatus.textContent = "EXECUTING";
  proofStatus.className = "proof-status live";
  runState.textContent = "EXECUTING";
  try {
    const response = await fetch("/api/run", { method: "POST" });
    const result = await response.json();
    if (!response.ok || result.status !== "passed") {
      throw new Error(result.error || "The workflow did not return a verified proof.");
    }
    proof = result;
    document.querySelector("#task-text").textContent = proof.run.task;
    document.querySelector("#run-id").textContent = proof.run.id.toUpperCase();
    document.querySelector("#version-maqam").textContent = proof.packages.maqam;
    document.querySelector("#version-qarinah").textContent = proof.packages.qarinah;
    document.querySelector("#version-crawler").textContent = proof.packages.cockroachCrawler;
    schedule.forEach((entry) => {
      const timer = setTimeout(entry.render, Math.round(entry.at * speed));
      timers.add(timer);
    });
  } catch (error) {
    running = false;
    runButton.disabled = false;
    runButton.querySelector("span").textContent = "RUN GOVERNED WORKFLOW";
    app.dataset.state = "error";
    errorToast.textContent = error instanceof Error ? error.message : String(error);
    errorToast.classList.add("visible");
  }
}

runButton.addEventListener("click", runWorkflow);
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
    if (item.dataset.tab === "approval") {
      document.querySelector('[data-step="altered"]')?.scrollIntoView({ block: "center" });
    }
    if (item.dataset.tab === "receipt") {
      receiptHash.focus?.();
    }
  });
});

if (params.get("autoplay") === "1") {
  window.addEventListener("load", () => setTimeout(runWorkflow, 800), { once: true });
}
