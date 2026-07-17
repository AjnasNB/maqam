import {
  PolicyEngine,
  ResearchSourceRegistry,
  ToolGateway,
  createRssAtomSourceAdapter,
  defineResearchToolCaller
} from "maqam";

const feedUrl = "https://feeds.example.com/engineering.xml";
const fixture = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Engineering notes</title>
    <link>https://example.com/engineering</link>
    <description>Offline source-routing fixture.</description>
    <item>
      <guid>approval-boundary-1</guid>
      <title>Bind approval to the exact call</title>
      <link>https://example.com/engineering/exact-call</link>
      <description>Policy runs before the registered source tool.</description>
    </item>
  </channel>
</rss>`;

// A production reader should use Maqam's bounded crawler or another reviewed
// HTTP adapter. This deterministic fixture performs no network request.
const rss = createRssAtomSourceAdapter(async ({ url }) => ({
  body: fixture,
  finalUrl: url,
  status: 200,
  contentType: "application/rss+xml",
  retrievedAt: "2026-07-18T00:00:00.000Z"
}));

const policyEngine = new PolicyEngine({
  allowedTools: [rss.toolName],
  allowedOrigins: [new URL(feedUrl).origin],
  maxToolCalls: 2
});
const gateway = new ToolGateway({ policyEngine });
gateway.registerTool(rss.toolName, rss.read, {
  effects: ["network:read"],
  risk: "low",
  sourceAdapter: {
    id: rss.id,
    channel: rss.channel
  }
});

const toolCaller = defineResearchToolCaller({
  call: gateway.call.bind(gateway)
});
const sources = new ResearchSourceRegistry({
  adapters: [rss],
  toolCaller
});

const result = await sources.route({
  channel: "rss-atom",
  input: { url: feedUrl }
}, {
  runId: "governed_sources_fixture",
  goal: {
    objective: "Read one reviewed engineering feed",
    allowedTools: [rss.toolName],
    allowedOrigins: [new URL(feedUrl).origin]
  }
});

const doctor = await sources.doctor();
console.log(JSON.stringify({ result, doctor, trace: gateway.trace }, null, 2));

// sources.routeUngoverned(...) exists only for explicit direct integration.
// It bypasses ToolGateway policy, approvals, call ceilings, and trace capture.
