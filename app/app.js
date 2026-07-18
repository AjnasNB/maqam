const form = document.querySelector("#research-form");
const modeEl = document.querySelector("#source-mode");
const sourceInput = document.querySelector("#source-input");
const sourceInputLabel = document.querySelector("#source-input-label");
const statusEl = document.querySelector("#run-status");
const formMessage = document.querySelector("#form-message");
const runButton = document.querySelector("#run-button");
const checkButton = document.querySelector("#check-source");
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
const accessTitle = document.querySelector("#access-title");
const accessDetail = document.querySelector("#access-detail");

const optionFields = {
  maxResults: document.querySelector("#result-count-field"),
  languages: document.querySelector("#language-field"),
  transcript: document.querySelector("#transcript-field"),
  maxPages: document.querySelector("#page-count-field"),
  sameOrigin: document.querySelector("#same-origin-field")
};

const MODES = Object.freeze({
  "web-search": Object.freeze({
    label: "Search query",
    type: "search",
    value: "governed agent approvals",
    placeholder: "What should Maqam research?",
    button: "Search with governance",
    channel: "web-search",
    backend: "web-search.exa-hosted-mcp",
    fields: ["maxResults"],
    accessTitle: "Hosted anonymous access",
    accessDetail: "Your query and IP address are sent to Exa's hosted MCP service. No developer API key is required; shared limits and service availability still apply."
  }),
  "youtube-search": Object.freeze({
    label: "YouTube search query",
    type: "search",
    value: "governed agent approvals",
    placeholder: "Search public YouTube metadata",
    button: "Search YouTube",
    channel: "youtube",
    backend: "youtube.yt-dlp",
    fields: ["maxResults"],
    accessTitle: "Anonymous public + local process",
    accessDetail: "Maqam starts only the reviewed executable explicitly configured with --yt-dlp-command (or MAQAM_YT_DLP_COMMAND), without cookies, plugins, remote components, or media download. YouTube can still limit or block requests."
  }),
  "youtube-url": Object.freeze({
    label: "Public YouTube URL",
    type: "url",
    value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    placeholder: "https://www.youtube.com/watch?v=...",
    button: "Read video evidence",
    channel: "youtube",
    backend: "youtube.yt-dlp",
    fields: ["languages", "transcript"],
    accessTitle: "Anonymous public + local process",
    accessDetail: "The server must explicitly configure an absolute --yt-dlp-command path. Metadata and available captions then use no browser cookies or developer API key; captions may still be missing, inaccurate, limited, or unavailable."
  }),
  "crawl-url": Object.freeze({
    label: "Seed URL",
    type: "url",
    value: "https://github.com/apify/crawlee",
    placeholder: "https://example.com",
    button: "Run bounded crawl",
    fields: ["maxPages", "sameOrigin"],
    accessTitle: "Direct public network access",
    accessDetail: "Maqam fetches the declared public URL through its crawler policy. Robots rules, private-network blocking, origin limits, and page budgets remain enforced."
  })
});

function apiHeaders({ json = false } = {}) {
  const headers = new Headers();
  if (json) headers.set("content-type", "application/json");
  const token = form.elements.apiToken.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: apiHeaders({ json: options.body !== undefined })
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setStatus(text, kind = "ready") {
  statusEl.textContent = text;
  statusEl.className = kind === "error" ? "error" : "";
}

function showMessage(text = "", kind = "error") {
  formMessage.hidden = !text;
  formMessage.textContent = text;
  formMessage.className = `form-message${kind === "info" ? " is-info" : ""}`;
}

function truncate(text, length = 240) {
  if (!text) return "";
  const value = String(text);
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function element(tagName, text, className = "") {
  const node = document.createElement(tagName);
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
  const title = candidate.title || candidate.name || "Untitled result";
  const summary = candidate.text || candidate.whatItDoes || candidate.markdown || "No summary returned.";
  const sourceUrl = safeSourceUrl(candidate.uri || candidate.url);
  const article = document.createElement("article");
  article.append(element("h3", title), element("p", truncate(summary)));
  const tags = element("div", undefined, "tag-row");
  tags.append(
    tag(sourceUrl ? "Open source" : "Source unavailable", sourceUrl),
    tag(candidate.source?.adapterId || candidate.recommendation || candidate.contentType || "review")
  );
  article.append(tags);
  return article;
}

function evidenceNode(record) {
  const article = document.createElement("article");
  article.append(
    element("h3", record.title || `${record.sourceType || "source"}: ${record.source || "unknown"}`),
    element("p", truncate(record.excerpt || record.detail || "No excerpt captured.", 260))
  );
  const tags = element("div", undefined, "tag-row");
  for (const value of record.tags || [record.tool || "tool"]) tags.append(tag(value));
  if (record.confidence !== undefined) {
    tags.append(tag(`${Math.round((Number(record.confidence) || 0) * 100)}% confidence`));
  }
  article.append(tags);
  return article;
}

function traceNode(item) {
  const identity = item.taskId || item.toolName || item.adapterId || "step";
  return element("li", `${identity}: ${item.status || item.decision?.status || "completed"}`);
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

function renderWorkflowRun(payload) {
  const run = payload.run;
  const candidates = run.outputs?.synthesize_report?.candidates || [];
  const evidence = run.evidence?.evidence || [];
  const claims = run.evidence?.claims || [];
  const toolTrace = payload.toolTrace || [];

  renderCollection(candidatesEl, candidates, candidateNode, "No candidates returned.");
  renderCollection(evidenceEl, evidence, evidenceNode, "No evidence records returned.");
  traceEl.replaceChildren(...[...(run.trace || []), ...toolTrace].map(traceNode));
  metricRuntime.textContent = run.status;
  metricEvidence.textContent = `${evidence.length} records`;
  metricClaims.textContent = `${claims.length} checked`;
  metricTools.textContent = `${toolTrace.length} calls`;
  setStatus(run.status === "completed" ? "Completed" : run.status, run.status === "failed" ? "error" : "ready");
}

function renderSourceRun(payload) {
  const source = payload.source || {};
  const documents = source.documents || [];
  const attempts = source.attempts || [];
  const trace = payload.toolTrace || [];
  const metadata = source.adapter?.metadata || {};
  const evidence = [{
    title: source.adapter?.label || source.adapter?.id || "Selected source adapter",
    detail: `Access: ${metadata.accessMode || "declared"}. Execution: ${metadata.executionMode || "declared"}. Data boundary: ${metadata.dataBoundary || "declared"}.`,
    tags: [source.adapter?.authentication === "none" ? "no developer key" : "credentialed", source.governance?.mode || "governed"]
  }, ...attempts.map((attempt) => ({
    title: attempt.adapterId || "Source attempt",
    detail: attempt.classification?.message || `Adapter attempt ${attempt.status}.`,
    tags: [attempt.status || "unknown", attempt.toolName || "source"]
  }))];

  renderCollection(candidatesEl, documents, candidateNode, "No public documents returned.");
  renderCollection(evidenceEl, evidence, evidenceNode, "No route evidence returned.");
  traceEl.replaceChildren(...[...attempts, ...trace].map(traceNode));
  metricRuntime.textContent = "completed";
  metricEvidence.textContent = `${documents.length} documents`;
  metricClaims.textContent = `${attempts.length} attempts`;
  metricTools.textContent = `${trace.length} calls`;
  setStatus("Completed");
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
    const payload = await apiRequest("/api/capabilities");
    const adapters = payload.capabilities?.adapters || [];
    const limitations = payload.capabilities?.limitations || [];
    capabilityTable.replaceChildren(...adapters.map(capabilityRow));
    capabilityLimitations.replaceChildren(...limitations.map((item) => element("li", item)));
    capabilityStatus.textContent = `${adapters.length} adapters`;
    capabilityStatus.className = "status-badge is-ready";
  } catch {
    const row = document.createElement("tr");
    const cell = element("td", "Capability data is unavailable. Add the server API token above if authentication is enabled.");
    cell.colSpan = 5;
    row.append(cell);
    capabilityTable.replaceChildren(row);
    capabilityStatus.textContent = "Unavailable";
    capabilityStatus.className = "status-badge is-error";
  }
}

function configureMode({ preserveValue = false } = {}) {
  const mode = MODES[modeEl.value];
  for (const [field, node] of Object.entries(optionFields)) node.hidden = !mode.fields.includes(field);
  sourceInputLabel.textContent = mode.label;
  sourceInput.type = mode.type;
  sourceInput.placeholder = mode.placeholder;
  if (!preserveValue) sourceInput.value = mode.value;
  runButton.textContent = mode.button;
  accessTitle.textContent = mode.accessTitle;
  accessDetail.textContent = mode.accessDetail;
  checkButton.hidden = modeEl.value === "crawl-url";
  setStatus("Ready");
  showMessage();
}

function sourceRequest(data, mode) {
  const maxResults = Number(data.get("maxResults"));
  if (mode === MODES["web-search"]) {
    return {
      channel: mode.channel,
      input: { query: data.get("sourceInput"), numResults: maxResults },
      backendPreference: [mode.backend]
    };
  }
  if (mode === MODES["youtube-search"]) {
    return {
      channel: mode.channel,
      input: { query: data.get("sourceInput"), maxResults },
      backendPreference: [mode.backend]
    };
  }
  const languages = String(data.get("languages") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    channel: mode.channel,
    input: {
      url: data.get("sourceInput"),
      includeTranscript: data.get("includeTranscript") === "true",
      ...(languages.length ? { languages } : {})
    },
    backendPreference: [mode.backend]
  };
}

function startLoading(message) {
  showMessage();
  setStatus("Running");
  metricRuntime.textContent = "Running";
  candidatesEl.className = "stack empty";
  candidatesEl.textContent = message;
  evidenceEl.className = "stack empty";
  evidenceEl.textContent = "Waiting for governed route evidence...";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const mode = MODES[modeEl.value];
  runButton.disabled = true;
  runButton.setAttribute("aria-busy", "true");
  startLoading("Collecting public sources through the policy gateway...");

  try {
    if (modeEl.value === "crawl-url") {
      const payload = await apiRequest("/api/runs/research", {
        method: "POST",
        body: JSON.stringify({
          seeds: [data.get("sourceInput")],
          maxPages: Number(data.get("maxPages")),
          sameOrigin: data.get("sameOrigin") === "true"
        })
      });
      renderWorkflowRun(payload);
    } else {
      const payload = await apiRequest("/api/runs/source", {
        method: "POST",
        body: JSON.stringify(sourceRequest(data, mode))
      });
      renderSourceRun(payload);
    }
  } catch (error) {
    setStatus("Error", "error");
    showMessage(error.status === 401
      ? "This server requires authentication. Enter its MAQAM_API_TOKEN value under API authentication and try again."
      : (error.message || "Unable to run the governed source."));
    candidatesEl.className = "stack empty error";
    candidatesEl.textContent = "The source run did not complete.";
    metricRuntime.textContent = "Error";
  } finally {
    runButton.disabled = false;
    runButton.removeAttribute("aria-busy");
  }
});

checkButton.addEventListener("click", async () => {
  const mode = MODES[modeEl.value];
  if (!mode.channel) return;
  checkButton.disabled = true;
  checkButton.setAttribute("aria-busy", "true");
  setStatus("Checking");
  showMessage();
  try {
    const query = new URLSearchParams({ channel: mode.channel, adapterId: mode.backend, timeoutMs: "8000" });
    const payload = await apiRequest(`/api/sources/status?${query}`);
    const check = payload.doctor?.checks?.[0];
    const state = check?.status || payload.doctor?.status || "unknown";
    setStatus(state === "ready" ? "Source ready" : "Unavailable", state === "ready" ? "ready" : "error");
    showMessage(
      check?.message || "The bounded offline source check completed.",
      state === "ready" ? "info" : "error"
    );
  } catch (error) {
    setStatus("Check failed", "error");
    showMessage(error.status === 401
      ? "Enter this server's API token, then check the source again."
      : (error.message || "Source check failed."));
  } finally {
    checkButton.disabled = false;
    checkButton.removeAttribute("aria-busy");
  }
});

modeEl.addEventListener("change", () => configureMode());
form.elements.apiToken.addEventListener("change", loadCapabilities);
configureMode({ preserveValue: true });
loadCapabilities();
