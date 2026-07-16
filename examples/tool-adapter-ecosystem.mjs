import {
  PolicyEngine,
  ToolGateway,
  defineToolAdapter,
  registerToolAdapter,
  runToolAdapterConformance
} from "../src/index.js";

// These are deterministic host fixtures, not bundled Maqam transport clients.
const issueSdk = {
  async create(input) {
    return { id: "issue_42", title: input.title };
  }
};
const httpTransport = {
  async request({ url, body }) {
    return { status: 202, url, accepted: body.action };
  }
};
const mcpClient = {
  async callTool({ name, arguments: input }) {
    return { tool: name, result: `queued:${input.release}` };
  }
};

const adapters = [
  defineToolAdapter({
    name: "function.slug",
    transport: "function",
    description: "Run a pure host function.",
    effects: [],
    risk: "low",
    invoke: async ({ value }) => ({ value: value.toLowerCase().replaceAll(" ", "-") })
  }),
  defineToolAdapter({
    name: "sdk.issue.create",
    transport: "sdk",
    description: "Call a host-supplied issue SDK.",
    effects: ["network:write"],
    risk: "high",
    invoke: (input) => issueSdk.create(input)
  }),
  defineToolAdapter({
    name: "http.release.enqueue",
    transport: "http",
    description: "Call a host-supplied HTTP transport.",
    effects: ["network:write"],
    risk: "high",
    async invoke(input, context) {
      const origin = new URL(input.endpoint).origin;
      if (!context.authorizedOrigins.includes(origin)) {
        throw new Error(`Origin '${origin}' was not authorized by the gateway.`);
      }
      return httpTransport.request({
        url: input.endpoint,
        body: { action: input.action }
      });
    }
  }),
  defineToolAdapter({
    name: "mcp.release.queue",
    transport: "mcp",
    description: "Call one static MCP tool through a host-supplied client.",
    effects: ["network:write"],
    risk: "high",
    invoke: (input) => mcpClient.callTool({
      name: "queue_release",
      arguments: input
    })
  })
];

const policyEngine = new PolicyEngine({
  allowedTools: adapters.map((adapter) => adapter.name),
  allowedOrigins: ["https://api.example.test"]
});
const gateway = new ToolGateway({ policyEngine });
for (const adapter of adapters) registerToolAdapter(gateway, adapter);

const outputs = {
  function: await gateway.call("function.slug", { value: "Maqam Release" }, { runId: "function_demo" }),
  sdk: await gateway.call("sdk.issue.create", { title: "Review release" }, { runId: "sdk_demo" }),
  http: await gateway.call("http.release.enqueue", {
    endpoint: "https://api.example.test/releases",
    action: "stage"
  }, { runId: "http_demo" }),
  mcp: await gateway.call("mcp.release.queue", { release: "v-next" }, { runId: "mcp_demo" })
};

const conformance = await runToolAdapterConformance(adapters[0], {
  input: { value: "Fixture Value" },
  verifyOutput: (output) => output.value === "fixture-value"
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: "maqam.adapter-ecosystem-demo.v1",
  fixtureClients: true,
  registered: adapters.map(({ name, transport, effects, risk }) => ({
    name,
    transport,
    effects,
    risk
  })),
  outputs,
  conformance,
  limitations: [
    "Maqam supplies the descriptor, policy boundary, approval binding, trace, and evidence capability.",
    "The application supplies every SDK, HTTP, or MCP client and its authentication.",
    "Calls that bypass the registered ToolGateway adapter are outside Maqam governance."
  ]
}, null, 2)}\n`);
