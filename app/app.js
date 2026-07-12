const form = document.querySelector("#research-form");
const statusEl = document.querySelector("#run-status");
const candidatesEl = document.querySelector("#candidates");
const evidenceEl = document.querySelector("#evidence-list");
const traceEl = document.querySelector("#trace-list");
const metricRuntime = document.querySelector("#metric-runtime");
const metricEvidence = document.querySelector("#metric-evidence");
const metricClaims = document.querySelector("#metric-claims");
const metricTools = document.querySelector("#metric-tools");
const capabilityStatus = document.querySelector("#capability-status");
const capabilityTable = document.querySelector("#capability-table");
const capabilityLimitations = document.querySelector("#capability-limitations");

function setStatus(text, kind = "ready") {
  statusEl.textContent = text;
  statusEl.className = kind === "error" ? "error" : "";
}

function truncate(text, length = 180) {
  if (!text) return "";
  const value = String(text);
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function element(tag, text, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function tag(text, href = null) {
  const node = element(href ? "a" : "span", text, "tag");
  if (href) {
    node.href = href;
    node.target = "_blank";
    node.rel = "noreferrer";
  }
  return node;
}

function candidateNode(candidate) {
  const article = document.createElement("article");
  article.append(
    element("h3", candidate.name || "Untitled candidate"),
    element("p", truncate(candidate.whatItDoes || "No summary returned."))
  );
  const tags = element("div", undefined, "tag-row");
  const sourceUrl = safeSourceUrl(candidate.url);
  tags.append(
    tag(sourceUrl ? "Open source" : "Source unavailable", sourceUrl),
    tag(candidate.recommendation || "review")
  );
  article.append(tags);
  return article;
}

function evidenceNode(record) {
  const article = document.createElement("article");
  article.append(
    element("h3", `${record.sourceType || "source"}: ${record.source || "unknown"}`),
    element("p", truncate(record.excerpt || "No excerpt captured.", 220))
  );
  const tags = element("div", undefined, "tag-row");
  tags.append(
    tag(record.tool || "tool"),
    tag(`${Math.round((Number(record.confidence) || 0) * 100)}% confidence`)
  );
  article.append(tags);
  return article;
}

function traceNode(item) {
  return element("li", `${item.taskId || item.toolName || "step"}: ${item.status || item.decision?.status || "completed"}`);
}

function renderCollection(container, items, render, emptyMessage) {
  container.replaceChildren();
  container.className = items.length ? "stack" : "stack empty";
  if (!items.length) {
    container.textContent = emptyMessage;
    return;
  }
  container.append(...items.map(render));
}

function renderRun(payload) {
  const run = payload.run;
  const candidates = run.outputs?.synthesize_report?.candidates || [];
  const evidence = run.evidence?.evidence || [];
  const claims = run.evidence?.claims || [];
  const toolTrace = payload.toolTrace || [];

  renderCollection(candidatesEl, candidates, candidateNode, "No candidates returned.");
  renderCollection(evidenceEl, evidence, evidenceNode, "No evidence records returned.");
  traceEl.replaceChildren(...[
    ...(run.trace || []),
    ...toolTrace
  ].map(traceNode));

  metricRuntime.textContent = run.status;
  metricEvidence.textContent = `${evidence.length} records`;
  metricClaims.textContent = `${claims.length} checked`;
  metricTools.textContent = `${toolTrace.length} calls`;
  setStatus(run.status === "completed" ? "Completed" : run.status, run.status === "failed" ? "error" : "ready");
}

function capabilityRow(adapter) {
  const row = document.createElement("tr");
  for (const value of [adapter.name, adapter.boundary, adapter.preventive, adapter.observed, adapter.defaultPosture]) {
    row.append(element("td", value || "Not declared"));
  }
  return row;
}

async function loadCapabilities() {
  try {
    const response = await fetch("/api/capabilities");
    if (!response.ok) throw new Error("Capability endpoint unavailable");
    const payload = await response.json();
    const adapters = payload.capabilities?.adapters || [];
    const limitations = payload.capabilities?.limitations || [];

    capabilityTable.replaceChildren(...adapters.map(capabilityRow));
    capabilityLimitations.replaceChildren(...limitations.map((item) => element("li", item)));
    capabilityStatus.textContent = `${adapters.length} adapters`;
    capabilityStatus.className = "status-badge is-ready";
  } catch {
    const row = document.createElement("tr");
    const cell = element("td", "Capability data is unavailable. The research example remains usable.");
    cell.colSpan = 5;
    row.append(cell);
    capabilityTable.replaceChildren(row);
    capabilityStatus.textContent = "Unavailable";
    capabilityStatus.className = "status-badge is-error";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const data = new FormData(form);
  const seed = data.get("seed");
  const maxPages = Number(data.get("maxPages"));
  const sameOrigin = data.get("sameOrigin") === "true";

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setStatus("Running");
  metricRuntime.textContent = "Running";
  candidatesEl.className = "stack empty";
  candidatesEl.textContent = "Collecting sources through the policy gateway...";
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
    button.removeAttribute("aria-busy");
  }
});

loadCapabilities();
