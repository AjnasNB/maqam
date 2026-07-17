import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defineResearchSourceAdapter,
  describeResearchSourceAdapter,
  isResearchSourceAdapter,
  normalizeResearchDocument,
  normalizeResearchDocuments
} from "../../src/research/index.js";

const provenance = {
  adapterId: "web.local",
  channel: "web",
  retrievedAt: "2026-07-18T00:00:00.000Z"
};

test("normalizeResearchDocument returns a detached, frozen v1 document", () => {
  const authors = ["Maqam Team"];
  const metadata = { status: 200, nested: { verified: true } };
  const input = {
    id: "doc-1",
    uri: "https://example.com/path",
    title: "Example",
    text: "Evidence text",
    markdown: "# Evidence",
    contentType: "text/html",
    language: "en",
    authors,
    publishedAt: "2026-07-17T20:30:00+05:30",
    metadata,
    citations: [{ uri: "https://example.com/source", title: "Primary source" }]
  };

  const document = normalizeResearchDocument(input, provenance);
  authors[0] = "attacker";
  metadata.status = 500;
  metadata.nested.verified = false;
  input.text = "mutated";

  assert.equal(document.schemaVersion, "1.0");
  assert.deepEqual({ ...document.source }, { adapterId: "web.local", channel: "web" });
  assert.equal(document.uri, "https://example.com/path");
  assert.equal(document.text, "Evidence text");
  assert.deepEqual([...document.authors], ["Maqam Team"]);
  assert.equal(document.publishedAt, "2026-07-17T15:00:00.000Z");
  assert.equal(document.retrievedAt, "2026-07-18T00:00:00.000Z");
  assert.equal(document.metadata.status, 200);
  assert.equal(document.metadata.nested.verified, true);
  assert.ok(Object.isFrozen(document));
  assert.ok(Object.isFrozen(document.source));
  assert.ok(Object.isFrozen(document.authors));
  assert.ok(Object.isFrozen(document.metadata.nested));
  assert.ok(Object.isFrozen(document.citations[0]));
});

test("normalizeResearchDocuments validates the complete collection before returning it", () => {
  const documents = normalizeResearchDocuments([
    { uri: "https://example.com/a", text: "A" },
    { uri: "https://example.com/b", markdown: "B" }
  ], provenance);
  assert.equal(documents.length, 2);
  assert.equal(documents[1].text, "");
  assert.equal(documents[1].markdown, "B");
  assert.ok(Object.isFrozen(documents));

  assert.throws(
    () => normalizeResearchDocuments([
      { uri: "https://example.com/a", text: "A" },
      { uri: "https://user:secret@example.com/private", text: "unsafe" }
    ], provenance),
    /without credentials/
  );
});

test("ResearchDocument boundaries reject accessors, inheritance, prototypes, and empty evidence", () => {
  let getterCalls = 0;
  const accessor = { uri: "https://example.com", text: "safe" };
  Object.defineProperty(accessor, "metadata", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { forged: true };
    }
  });
  assert.throws(
    () => normalizeResearchDocument(accessor, provenance),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);

  const inherited = Object.create({ text: "forged" });
  inherited.uri = "https://example.com";
  assert.throws(
    () => normalizeResearchDocument(inherited, provenance),
    /plain object/
  );
  assert.throws(
    () => normalizeResearchDocument({ uri: "https://example.com", text: "", markdown: "" }, provenance),
    /non-empty text or markdown/
  );
  assert.throws(
    () => normalizeResearchDocument({ uri: "file:///etc/passwd", text: "unsafe" }, provenance),
    /HTTP\(S\)/
  );
  assert.throws(
    () => normalizeResearchDocument({ uri: "https://example.com", text: "safe", execute: true }, provenance),
    /Unknown ResearchDocument field 'execute'/
  );
  for (const metadata of [null, [], "metadata", 1, true]) {
    assert.throws(
      () => normalizeResearchDocument({ uri: "https://example.com", text: "safe", metadata }, provenance),
      /ResearchDocument metadata must be a plain JSON object/
    );
  }
  for (const [field, message] of [
    ["contentType", /ResearchDocument\.contentType must be a non-empty string/],
    ["authors", /ResearchDocument authors must be an array/],
    ["citations", /ResearchDocument citations must be an array/]
  ]) {
    assert.throws(
      () => normalizeResearchDocument({
        uri: "https://example.com",
        text: "safe",
        [field]: null
      }, provenance),
      message
    );
  }
  assert.throws(
    () => normalizeResearchDocument(
      { uri: "https://example.com", text: "safe" },
      { ...provenance, retrievedAt: null }
    ),
    /retrievedAt must be a non-empty string/
  );
});

test("defineResearchSourceAdapter produces an immutable data-first contract", () => {
  const capabilities = ["read", "citations"];
  const metadata = { owner: "local" };
  const read = async () => [];
  const adapter = defineResearchSourceAdapter({
    id: "web.local",
    channel: "web",
    toolName: "research.web.local",
    label: "Local web",
    priority: 2,
    capabilities,
    metadata,
    read
  });
  capabilities.push("publish");
  metadata.owner = "mutated";

  assert.equal(isResearchSourceAdapter(adapter), true);
  assert.equal(adapter.read, read);
  assert.deepEqual([...adapter.capabilities], ["read", "citations"]);
  assert.equal(adapter.metadata.owner, "local");
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(adapter.capabilities));
  assert.deepEqual({ ...describeResearchSourceAdapter(adapter) }, {
    id: "web.local",
    channel: "web",
    toolName: "research.web.local",
    label: "Local web",
    priority: 2,
    authentication: "none",
    capabilities: adapter.capabilities,
    metadata: adapter.metadata,
    directRead: "explicitly-ungoverned-only",
    check: "unavailable"
  });
});

test("source adapter descriptions label checks as host-supplied", () => {
  const adapter = defineResearchSourceAdapter({
    id: "web.checked",
    channel: "web",
    toolName: "research.web.checked",
    check: async () => ({ status: "ready" })
  });

  assert.equal(describeResearchSourceAdapter(adapter).check, "host-supplied");
});

test("source adapter definitions reject executable configuration and unsafe properties", () => {
  let getterCalls = 0;
  const accessor = {
    id: "unsafe",
    channel: "web",
    toolName: "research.unsafe",
    read: async () => []
  };
  Object.defineProperty(accessor, "authentication", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "none";
    }
  });
  assert.throws(() => defineResearchSourceAdapter(accessor), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  assert.throws(
    () => defineResearchSourceAdapter({
      id: "shell",
      channel: "web",
      toolName: "research.shell",
      read: async () => [],
      command: "curl"
    }),
    /Unknown Research source adapter field 'command'/
  );
  for (const metadata of [null, [], "metadata", 1, true]) {
    assert.throws(
      () => defineResearchSourceAdapter({
        id: "invalid-metadata",
        channel: "web",
        toolName: "research.invalid-metadata",
        metadata
      }),
      /Research source adapter metadata must be a plain JSON object/
    );
  }
  for (const [field, message] of [
    ["priority", /priority must be a safe integer/],
    ["authentication", /authentication must be 'none' or 'required'/],
    ["capabilities", /capabilities must be an array/]
  ]) {
    assert.throws(
      () => defineResearchSourceAdapter({
        id: `invalid-${field}`,
        channel: "web",
        toolName: `research.invalid-${field}`,
        [field]: null
      }),
      message
    );
  }
  assert.throws(
    () => defineResearchSourceAdapter({
      id: "auth",
      channel: "web",
      toolName: "research.auth",
      read: async () => [],
      authentication: "optional"
    }),
    /'none' or 'required'/
  );
  assert.throws(
    () => defineResearchSourceAdapter(Object.create({ id: "inherited" })),
    /plain object/
  );
});
