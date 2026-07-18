import assert from "node:assert/strict";
import { test } from "node:test";
import { MaqamError } from "../../src/framework/errors.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import {
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceUnavailableError,
  createYtDlpYouTubeSourceAdapter
} from "../../src/research/index.js";

const VIDEO_URL = "https://www.youtube.com/watch?v=abc123def45";
const CAPTION_URL = "https://www.youtube.com/api/timedtext?v=abc123def45&lang=en";

function videoFixture(overrides = {}) {
  return {
    id: "abc123def45",
    webpage_url: VIDEO_URL,
    title: "Governed source routing",
    description: "A fixture about accountable research.",
    uploader: "Maqam fixtures",
    channel: "Maqam fixtures",
    channel_id: "fixture-channel",
    duration: 125,
    view_count: 42,
    timestamp: 1_752_796_800,
    language: "en",
    live_status: "not_live",
    subtitles: {
      en: [{ ext: "json3", url: CAPTION_URL }]
    },
    automatic_captions: {
      en: [{ ext: "vtt", url: `${CAPTION_URL}&fmt=vtt` }]
    },
    ...overrides
  };
}

function json3Fixture() {
  return JSON.stringify({
    events: [
      { tStartMs: 1_000, dDurationMs: 900, segs: [{ utf8: "Policy first." }] },
      { tStartMs: 61_000, dDurationMs: 1_000, segs: [{ utf8: "Evidence follows." }] }
    ]
  });
}

test("yt-dlp adapter retrieves public metadata and timestamped captions without media or cookies", async () => {
  const calls = [];
  const captions = [];
  const adapter = createYtDlpYouTubeSourceAdapter({
    runner: async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: JSON.stringify(videoFixture()), stderr: "" };
    },
    captionReader: async (request) => {
      captions.push(request);
      return { body: json3Fixture(), contentType: "application/json" };
    }
  });

  assert.equal(adapter.id, "youtube.yt-dlp");
  assert.equal(adapter.authentication, "none");
  assert.equal(adapter.metadata.developerApiKeyRequired, false);
  assert.equal(adapter.metadata.accessMode, "anonymous-public");
  assert.equal(adapter.metadata.executionMode, "local-cli");
  assert.equal(adapter.metadata.dataBoundary, "local-process-and-direct-source");
  assert.equal(adapter.metadata.browserSessionReuse, false);
  assert.equal(adapter.metadata.downloadsVideoOrAudio, false);
  assert.deepEqual([...adapter.read.governance.effects], ["network:read", "process:execute"]);
  assert.deepEqual([...adapter.read.governance.networkOrigins], ["https://www.youtube.com"]);
  assert.ok(Object.isFrozen(adapter.read.governance));

  const [document] = await adapter.read({ url: VIDEO_URL }, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "yt-dlp");
  assert.equal(calls[0].signal, null);
  assert.ok(Object.isFrozen(calls[0].args));
  assert.ok(calls[0].args.includes("--ignore-config"));
  assert.ok(calls[0].args.includes("--no-config-locations"));
  assert.ok(calls[0].args.includes("--no-plugin-dirs"));
  assert.ok(calls[0].args.includes("--no-remote-components"));
  assert.ok(calls[0].args.includes("--no-cookies"));
  assert.ok(calls[0].args.includes("--no-cookies-from-browser"));
  assert.ok(calls[0].args.includes("--skip-download"));
  assert.equal(calls[0].args.at(-2), "--");
  assert.equal(calls[0].args.at(-1), VIDEO_URL);
  assert.equal(calls[0].args.some((arg) => /write|download-sections|extract-audio/i.test(arg)), false);

  assert.equal(captions.length, 1);
  assert.equal(captions[0].url, CAPTION_URL);
  assert.equal(document.uri, VIDEO_URL);
  assert.equal(document.title, "Governed source routing");
  assert.equal(document.metadata.transcript.kind, "manual");
  assert.equal(document.metadata.transcript.language, "en");
  assert.equal(document.metadata.transcript.cueCount, 2);
  assert.match(document.text, /\[00:01\] Policy first\./);
  assert.match(document.text, /\[01:01\] Evidence follows\./);
  assert.equal(document.publishedAt, "2025-07-18T00:00:00.000Z");
});

test("yt-dlp search is one bounded argument and never requests transcripts", async () => {
  const calls = [];
  let captionCalls = 0;
  const query = "security research; --exec calc $(whoami)";
  const adapter = createYtDlpYouTubeSourceAdapter({
    maxResults: 3,
    runner: async (request) => {
      calls.push(request);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          entries: [
            { id: "aaa111bbb22", title: "One" },
            { id: "ccc333ddd44", title: "Two" }
          ]
        }),
        stderr: ""
      };
    },
    captionReader: async () => {
      captionCalls += 1;
      return json3Fixture();
    }
  });

  const documents = await adapter.read({ query, maxResults: 2 }, {});
  assert.equal(documents.length, 2);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("--flat-playlist"));
  assert.deepEqual(calls[0].args.slice(-2), ["--", `ytsearch2:${query}`]);
  assert.equal(captionCalls, 0);
});

test("yt-dlp doctor is local-only and reports executable state", async () => {
  const calls = [];
  const ready = createYtDlpYouTubeSourceAdapter({
    runner: async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: "2026.07.04\n", stderr: "" };
    }
  });
  const report = await ready.check({ signal: new AbortController().signal, adapter: {} });
  assert.equal(report.status, "ready");
  assert.equal(report.details.version, "2026.07.04");
  assert.equal(report.details.liveVerified, false);
  assert.deepEqual(calls[0].args, ["--ignore-config", "--no-plugin-dirs", "--version"]);

  const unavailable = createYtDlpYouTubeSourceAdapter({
    runner: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
  });
  assert.equal((await unavailable.check({ signal: new AbortController().signal })).status, "unavailable");
});

test("gateway authorizes the adapter's hidden YouTube origin before process dispatch", async () => {
  let dispatches = 0;
  const adapter = createYtDlpYouTubeSourceAdapter({
    runner: async () => {
      dispatches += 1;
      return { exitCode: 0, stdout: JSON.stringify({ entries: [] }), stderr: "" };
    }
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.toolName],
      allowedOrigins: ["https://example.com"]
    })
  });
  gateway.registerTool(adapter.toolName, adapter.read);

  await assert.rejects(
    () => gateway.call(adapter.toolName, { query: "governed research" }),
    (error) => error.code === "POLICY_DENIED"
      && /https:\/\/www\.youtube\.com/.test(error.message)
  );
  assert.equal(dispatches, 0);
});

test("yt-dlp adapter rejects unsafe inputs, caption origins, hostile results, and auth failures", async () => {
  const base = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({ exitCode: 0, stdout: JSON.stringify(videoFixture()), stderr: "" }),
    captionReader: async () => json3Fixture()
  });
  await assert.rejects(() => base.read({}, {}), /exactly one of url or query/);
  await assert.rejects(
    () => base.read({ url: VIDEO_URL, query: "both" }, {}),
    /exactly one of url or query/
  );
  await assert.rejects(() => base.read({ url: "http://www.youtube.com/watch?v=abc123def45" }, {}), /must use HTTPS/);
  await assert.rejects(() => base.read({ url: "https://evil.example/watch?v=abc123def45" }, {}), /YouTube source URL/);
  for (const alias of [
    "https://youtu.be/abc123def45",
    "https://m.youtube.com/watch?v=abc123def45",
    "https://www.youtube-nocookie.com/embed/abc123def45",
    "https://www.youtube.com./watch?v=abc123def45"
  ]) {
    await assert.rejects(
      () => base.read({ url: alias }, {}),
      /canonical www\.youtube\.com origin/
    );
  }
  await assert.rejects(() => base.read({ query: "safe", unknown: true }, {}), /Unknown YouTube source input field/);

  let getterCalls = 0;
  const hostileInput = {};
  Object.defineProperty(hostileInput, "query", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  await assert.rejects(() => base.read(hostileInput, {}), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  const unsafeCaption = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({
      exitCode: 0,
      stdout: JSON.stringify(videoFixture({
        subtitles: { en: [{ ext: "json3", url: "https://evil.example/captions" }] },
        automatic_captions: {}
      })),
      stderr: ""
    })
  });
  await assert.rejects(
    () => unsafeCaption.read({ url: VIDEO_URL }, {}),
    (error) => error.code === "SECURITY_YOUTUBE_CAPTION_URL"
  );

  const hostileResult = {};
  Object.defineProperty(hostileResult, "stdout", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "{}";
    }
  });
  Object.assign(hostileResult, { exitCode: 0, stderr: "" });
  const hostileRunner = createYtDlpYouTubeSourceAdapter({ runner: async () => hostileResult });
  await assert.rejects(() => hostileRunner.read({ query: "safe" }, {}), /own enumerable data property/);

  const auth = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "Sign in to confirm your age. Pass browser cookies."
    })
  });
  await assert.rejects(
    () => auth.read({ url: VIDEO_URL }, {}),
    (error) => error instanceof ResearchSourceAuthenticationRequiredError
  );
});

test("caption parsing is bounded and prefers manual captions over automatic captions", async () => {
  const automaticUrl = `${CAPTION_URL}&kind=asr&fmt=vtt`;
  const adapter = createYtDlpYouTubeSourceAdapter({
    maxTranscriptChars: 1_000,
    maxCaptionBytes: 2_000,
    runner: async () => ({
      exitCode: 0,
      stdout: JSON.stringify(videoFixture({
        subtitles: {},
        automatic_captions: { en: [{ ext: "vtt", url: automaticUrl }] }
      })),
      stderr: ""
    }),
    captionReader: async ({ url }) => {
      assert.equal(url, automaticUrl);
      return "WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nAutomatic caption.\n";
    }
  });
  const [document] = await adapter.read({ url: VIDEO_URL }, {});
  assert.equal(document.metadata.transcript.kind, "automatic");
  assert.equal(document.metadata.transcript.format, "vtt");
  assert.match(document.text, /\[00:02\] Automatic caption\./);

  const oversized = createYtDlpYouTubeSourceAdapter({
    maxCaptionBytes: 1_024,
    runner: async () => ({ exitCode: 0, stdout: JSON.stringify(videoFixture()), stderr: "" }),
    captionReader: async () => "x".repeat(1_025)
  });
  await assert.rejects(
    () => oversized.read({ url: VIDEO_URL }, {}),
    (error) => error.code === "RESEARCH_SOURCE_RESPONSE_TOO_LARGE"
  );
});

test("caption fallback only degrades explicitly unavailable caption failures", async () => {
  const runner = async () => ({
    exitCode: 0,
    stdout: JSON.stringify(videoFixture()),
    stderr: ""
  });
  const unavailable = createYtDlpYouTubeSourceAdapter({
    runner,
    captionReader: async () => {
      throw new ResearchSourceUnavailableError("Caption track is temporarily unavailable.");
    }
  });
  const [metadataOnly] = await unavailable.read({ url: VIDEO_URL, includeTranscript: true }, {});
  assert.equal(metadataOnly.metadata.transcript.status, "not-requested-or-unavailable");

  for (const code of [
    "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
    "RESEARCH_SOURCE_PROTOCOL_INVALID",
    "SECURITY_YOUTUBE_CAPTION_BODY"
  ]) {
    const strict = createYtDlpYouTubeSourceAdapter({
      runner,
      captionReader: async () => {
        throw new MaqamError("Caption boundary failed.", { code });
      }
    });
    await assert.rejects(
      () => strict.read({ url: VIDEO_URL, includeTranscript: true }, {}),
      (error) => error.code === code
    );
  }
});

test("yt-dlp adapter contains malformed timestamps and sparse search entries", async () => {
  const search = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        entries: [
          null,
          { id: "abc123def45", title: "Valid after sparse entry", timestamp: 1e300 },
          undefined
        ]
      }),
      stderr: ""
    })
  });
  const documents = await search.read({ query: "sparse results", maxResults: 3 }, {});
  assert.equal(documents.length, 1);
  assert.equal(documents[0].title, "Valid after sparse entry");
  assert.equal(Object.hasOwn(documents[0], "publishedAt"), false);

  const invalidDate = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({
      exitCode: 0,
      stdout: JSON.stringify(videoFixture({
        timestamp: 1e300,
        upload_date: "20250231",
        subtitles: {},
        automatic_captions: {}
      })),
      stderr: ""
    })
  });
  const [document] = await invalidDate.read({ url: VIDEO_URL, includeTranscript: false }, {});
  assert.equal(Object.hasOwn(document, "publishedAt"), false);

  const nullMetadata = createYtDlpYouTubeSourceAdapter({
    runner: async () => ({ exitCode: 0, stdout: "null", stderr: "" })
  });
  await assert.rejects(
    () => nullMetadata.read({ url: VIDEO_URL, includeTranscript: false }, {}),
    (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
      && /metadata object/.test(error.message)
  );
});
