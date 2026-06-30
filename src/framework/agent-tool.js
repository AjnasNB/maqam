function resolveAgentInvoker(agent) {
  if (typeof agent === "function") return agent;
  if (agent && typeof agent.run === "function") return agent.run.bind(agent);
  if (agent && typeof agent.invoke === "function") return agent.invoke.bind(agent);
  if (agent && typeof agent.call === "function") return agent.call.bind(agent);
  throw new TypeError("createAgentTool requires a function agent or an object with run, invoke, or call.");
}

function recordAgentEvidence(result, context, agentName) {
  const ledger = context.evidenceLedger || context.evidence;
  if (!ledger || !result || typeof result !== "object") return;

  for (const item of result.evidence || []) {
    ledger.addEvidence({
      runId: context.runId || item.runId || null,
      taskId: context.taskId || item.taskId || null,
      tool: context.toolName || agentName,
      ...item
    });
  }

  for (const item of result.claims || []) {
    ledger.addClaim({
      runId: context.runId || item.runId || null,
      taskId: context.taskId || item.taskId || null,
      ...item
    });
  }
}

export function createAgentTool(agent, options = {}) {
  const invoke = resolveAgentInvoker(agent);
  const agentName = options.name || agent?.name || "agent";

  return async function agentTool(input = {}, context = {}) {
    const result = await invoke(input, {
      ...context,
      agentName
    });
    recordAgentEvidence(result, context, agentName);
    return result;
  };
}
