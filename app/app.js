const form = document.querySelector("#research-form");
const statusEl = document.querySelector("#run-status");
const candidatesEl = document.querySelector("#candidates");
const evidenceEl = document.querySelector("#evidence-list");
const traceEl = document.querySelector("#trace-list");
const metricRuntime = document.querySelector("#metric-runtime");
const metricEvidence = document.querySelector("#metric-evidence");
const metricClaims = document.querySelector("#metric-claims");
const metricTools = document.querySelector("#metric-tools");

function setStatus(text, kind = "ready") {
  statusEl.textContent = text;
  statusEl.className = kind === "error" ? "error" : "";
}

function truncate(text, length = 180) {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function candidateTemplate(candidate) {
  return `
    <article>
      <h3>${candidate.name || "Untitled candidate"}</h3>
      <p>${truncate(candidate.whatItDoes || "No summary returned.")}</p>
      <div class="tag-row">
        <a class="tag" href="${candidate.url}" target="_blank" rel="noreferrer">Source</a>
        <span class="tag">${candidate.recommendation || "review"}</span>
      </div>
    </article>
  `;
}

function evidenceTemplate(record) {
  return `
    <article>
      <h3>${record.sourceType}: ${record.source}</h3>
      <p>${truncate(record.excerpt || "No excerpt captured.", 220)}</p>
      <div class="tag-row">
        <span class="tag">${record.tool || "tool"}</span>
        <span class="tag">${Math.round((record.confidence || 0) * 100)}% confidence</span>
      </div>
    </article>
  `;
}

function traceTemplate(item) {
  return `<li>${item.taskId || item.toolName}: ${item.status || item.decision?.status || "completed"}</li>`;
}

function renderRun(payload) {
  const run = payload.run;
  const candidates = run.outputs?.synthesize_report?.candidates || [];
  const evidence = run.evidence?.evidence || [];
  const claims = run.evidence?.claims || [];
  const toolTrace = payload.toolTrace || [];

  candidatesEl.className = candidates.length ? "stack" : "stack empty";
  candidatesEl.innerHTML = candidates.length
    ? candidates.map(candidateTemplate).join("")
    : "No candidates returned.";

  evidenceEl.className = evidence.length ? "stack" : "stack empty";
  evidenceEl.innerHTML = evidence.length
    ? evidence.map(evidenceTemplate).join("")
    : "No evidence records returned.";

  traceEl.innerHTML = [
    ...(run.trace || []).map(traceTemplate),
    ...toolTrace.map(traceTemplate)
  ].join("");

  metricRuntime.textContent = run.status;
  metricEvidence.textContent = `${evidence.length} records`;
  metricClaims.textContent = `${claims.length} checked`;
  metricTools.textContent = `${toolTrace.length} calls`;
  setStatus(run.status === "completed" ? "Completed" : run.status, run.status === "failed" ? "error" : "ready");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const data = new FormData(form);
  const seed = data.get("seed");
  const maxPages = Number(data.get("maxPages"));
  const sameOrigin = data.get("sameOrigin") === "true";

  button.disabled = true;
  setStatus("Running");
  metricRuntime.textContent = "Running";
  candidatesEl.className = "stack empty";
  candidatesEl.textContent = "Collecting sources through policy gateway...";
  evidenceEl.className = "stack empty";
  evidenceEl.textContent = "Waiting for evidence records...";

  try {
    const response = await fetch("/api/runs/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seeds: [seed], maxPages, sameOrigin })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Run failed");
    renderRun(payload);
  } catch (error) {
    setStatus("Error", "error");
    candidatesEl.className = "stack empty error";
    candidatesEl.textContent = error.message || "Unable to run workflow.";
    metricRuntime.textContent = "Error";
  } finally {
    button.disabled = false;
  }
});
