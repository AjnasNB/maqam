import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withPinnedFetch } from "../../crawler/security.js";
import { MaqamError } from "../../framework/errors.js";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../../framework/boundary.js";
import { defineResearchSourceAdapter } from "../source-adapter.js";
import {
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceUnavailableError
} from "../source-error.js";

const execFileAsync = promisify(execFile);
const OPTION_KEYS = new Set([
  "command", "runner", "captionReader", "timeoutMs", "captionTimeoutMs",
  "maxOutputBytes", "maxCaptionBytes", "maxTranscriptChars", "maxResults",
  "languages"
]);
const INPUT_KEYS = new Set([
  "url", "query", "maxResults", "languages", "includeTranscript"
]);
const RUNNER_RESULT_KEYS = new Set(["exitCode", "stdout", "stderr"]);
const MAX_RESULTS = 25;
const MAX_LANGUAGES = 20;
const MAX_QUERY_LENGTH = 10_000;
const MAX_COMMAND_LENGTH = 10_000;
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const MAX_CAPTION_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 5_000_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const YOUTUBE_ORIGIN = "https://www.youtube.com";
const YOUTUBE_HOST = "www.youtube.com";

function positiveInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function boundedString(value, label, maximumLength) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function languageList(value, label) {
  const values = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_LANGUAGES
  });
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    const language = boundedString(values[index], `${label}[${index}]`, 50);
    if (!/^[a-z0-9](?:[a-z0-9._*-]*[a-z0-9*])?$/i.test(language)) {
      throw new TypeError(`${label}[${index}] is not a supported language selector.`);
    }
    if (!result.includes(language)) result.push(language);
  }
  if (!result.length) throw new TypeError(`${label} must contain at least one language.`);
  return Object.freeze(result);
}

function youtubeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("YouTube source URL must be an absolute HTTPS URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || hostname !== YOUTUBE_HOST) {
    throw new TypeError(
      `YouTube source URL must use HTTPS on the canonical ${YOUTUBE_HOST} origin without credentials.`
    );
  }
  url.hash = "";
  return url;
}

function routeInput(value, config) {
  const input = snapshotOwnDataRecord(value, {
    label: "YouTube source input",
    recognizedKeys: INPUT_KEYS
  });
  const hasUrl = input.url !== undefined;
  const hasQuery = input.query !== undefined;
  if (hasUrl === hasQuery) {
    throw new TypeError("YouTube source input requires exactly one of url or query.");
  }
  if (input.includeTranscript !== undefined && typeof input.includeTranscript !== "boolean") {
    throw new TypeError("YouTube source input includeTranscript must be a boolean.");
  }
  const languages = input.languages === undefined
    ? config.languages
    : languageList(input.languages, "YouTube source input languages");
  if (hasUrl) {
    return Object.freeze({
      mode: "read",
      url: youtubeUrl(input.url),
      query: null,
      maxResults: 1,
      languages,
      includeTranscript: input.includeTranscript !== false
    });
  }
  const query = boundedString(input.query, "YouTube source query", MAX_QUERY_LENGTH).trim();
  return Object.freeze({
    mode: "search",
    url: null,
    query,
    maxResults: positiveInteger(
      input.maxResults ?? config.maxResults,
      "YouTube source input maxResults",
      1,
      config.maxResults
    ),
    languages,
    includeTranscript: false
  });
}

function childEnvironment() {
  const environment = Object.create(null);
  for (const name of [
    "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP",
    "TMPDIR", "COMSPEC"
  ]) {
    if (typeof process.env[name] === "string") environment[name] = process.env[name];
  }
  environment.PYTHONIOENCODING = "utf-8";
  environment.NO_COLOR = "1";
  return environment;
}

async function defaultRunner({ command, args, timeoutMs, maxOutputBytes, signal }) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: childEnvironment(),
      encoding: "utf8",
      maxBuffer: maxOutputBytes,
      timeout: timeoutMs,
      windowsHide: true,
      shell: false,
      ...(signal ? { signal } : {})
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (error?.code === "ENOENT") throw error;
    if (signal?.aborted) throw signal.reason;
    if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new MaqamError("yt-dlp output exceeded the configured byte limit.", {
        code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
        details: { maximumBytes: maxOutputBytes }
      });
    }
    if (error?.killed || error?.code === "ETIMEDOUT") {
      throw new ResearchSourceUnavailableError(`yt-dlp timed out after ${timeoutMs}ms.`, {
        cause: error,
        details: { timeoutMs }
      });
    }
    if (typeof error?.code === "number") {
      return {
        exitCode: error.code,
        stdout: typeof error.stdout === "string" ? error.stdout : "",
        stderr: typeof error.stderr === "string" ? error.stderr : ""
      };
    }
    throw error;
  }
}

function runnerResult(value) {
  const result = snapshotOwnDataRecord(value, {
    label: "yt-dlp runner result",
    recognizedKeys: RUNNER_RESULT_KEYS
  });
  if (!Number.isSafeInteger(result.exitCode)) {
    throw new TypeError("yt-dlp runner result exitCode must be a safe integer.");
  }
  for (const key of ["stdout", "stderr"]) {
    if (typeof result[key] !== "string") {
      throw new TypeError(`yt-dlp runner result ${key} must be a string.`);
    }
  }
  return Object.freeze(result);
}

function adapterOptions(value) {
  const input = snapshotOwnDataRecord(value, {
    label: "yt-dlp YouTube adapter options",
    recognizedKeys: OPTION_KEYS
  });
  for (const key of ["runner", "captionReader"]) {
    if (input[key] !== undefined && typeof input[key] !== "function") {
      throw new TypeError(`yt-dlp YouTube adapter ${key} must be a function.`);
    }
  }
  const command = boundedString(
    input.command ?? "yt-dlp",
    "yt-dlp YouTube adapter command",
    MAX_COMMAND_LENGTH
  );
  if (/\r|\n|\0/.test(command)) {
    throw new TypeError("yt-dlp YouTube adapter command cannot contain control characters.");
  }
  return Object.freeze({
    command,
    runner: input.runner ?? defaultRunner,
    captionReader: input.captionReader ?? defaultCaptionReader,
    timeoutMs: positiveInteger(
      input.timeoutMs ?? 120_000,
      "yt-dlp YouTube adapter timeoutMs",
      100,
      MAX_TIMEOUT_MS
    ),
    captionTimeoutMs: positiveInteger(
      input.captionTimeoutMs ?? 30_000,
      "yt-dlp YouTube adapter captionTimeoutMs",
      100,
      MAX_TIMEOUT_MS
    ),
    maxOutputBytes: positiveInteger(
      input.maxOutputBytes ?? 10 * 1024 * 1024,
      "yt-dlp YouTube adapter maxOutputBytes",
      1_024,
      MAX_OUTPUT_BYTES
    ),
    maxCaptionBytes: positiveInteger(
      input.maxCaptionBytes ?? 5 * 1024 * 1024,
      "yt-dlp YouTube adapter maxCaptionBytes",
      1_024,
      MAX_CAPTION_BYTES
    ),
    maxTranscriptChars: positiveInteger(
      input.maxTranscriptChars ?? 1_000_000,
      "yt-dlp YouTube adapter maxTranscriptChars",
      1_000,
      MAX_TRANSCRIPT_CHARS
    ),
    maxResults: positiveInteger(
      input.maxResults ?? 10,
      "yt-dlp YouTube adapter maxResults",
      1,
      MAX_RESULTS
    ),
    languages: input.languages === undefined
      ? Object.freeze(["en", "en-US", "en-GB"])
      : languageList(input.languages, "yt-dlp YouTube adapter languages")
  });
}

function baseArgs() {
  return [
    "--ignore-config",
    "--no-config-locations",
    "--no-plugin-dirs",
    "--no-remote-components",
    "--no-cookies",
    "--no-cookies-from-browser",
    "--no-cache-dir",
    "--no-mark-watched",
    "--no-warnings",
    "--no-progress",
    "--color",
    "no_color",
    "--quiet",
    "--skip-download",
    "--dump-single-json",
    "--js-runtimes",
    "node"
  ];
}

function operationArgs(request) {
  if (request.mode === "search") {
    return [
      ...baseArgs(),
      "--flat-playlist",
      "--playlist-end",
      String(request.maxResults),
      "--",
      `ytsearch${request.maxResults}:${request.query}`
    ];
  }
  return [...baseArgs(), "--no-playlist", "--", request.url.toString()];
}

function safeMessage(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/(?:cookie|authorization|token|signature)=\S+/gi, "[REDACTED]")
    .slice(0, 1_000);
}

function ytDlpFailure(result) {
  const detail = safeMessage(result.stderr || result.stdout || `exit ${result.exitCode}`);
  if (/sign in|login|cookie|authentication|members-only|age.restrict/i.test(detail)) {
    return new ResearchSourceAuthenticationRequiredError(
      "YouTube requires an authenticated session for this content.",
      { details: { backend: "yt-dlp", exitCode: result.exitCode } }
    );
  }
  if (/unsupported url|invalid url|not a valid url/i.test(detail)) {
    return new MaqamError("yt-dlp rejected the YouTube URL.", {
      code: "RESEARCH_SOURCE_INPUT_REJECTED",
      details: { backend: "yt-dlp", exitCode: result.exitCode }
    });
  }
  return new ResearchSourceUnavailableError(
    `yt-dlp could not retrieve public YouTube data: ${detail || "unknown error"}`,
    { details: { backend: "yt-dlp", exitCode: result.exitCode } }
  );
}

async function runYtDlp(config, args, signal) {
  let raw;
  try {
    raw = await config.runner({
      command: config.command,
      args: Object.freeze([...args]),
      timeoutMs: config.timeoutMs,
      maxOutputBytes: config.maxOutputBytes,
      signal
    });
  } catch (cause) {
    if (signal?.aborted) throw signal.reason;
    if (cause?.code === "ENOENT") {
      throw new ResearchSourceUnavailableError(
        "yt-dlp is not installed or is not executable on PATH.",
        { cause, details: { backend: "yt-dlp" } }
      );
    }
    if (cause instanceof MaqamError) throw cause;
    throw new ResearchSourceUnavailableError("yt-dlp could not be started.", {
      cause,
      details: { backend: "yt-dlp" }
    });
  }
  const result = runnerResult(raw);
  if (Buffer.byteLength(result.stdout, "utf8") > config.maxOutputBytes
    || Buffer.byteLength(result.stderr, "utf8") > config.maxOutputBytes) {
    throw new MaqamError("yt-dlp output exceeded the configured byte limit.", {
      code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
      details: { maximumBytes: config.maxOutputBytes }
    });
  }
  if (result.exitCode !== 0) throw ytDlpFailure(result);
  try {
    return snapshotJsonValue(JSON.parse(result.stdout.replace(/^\uFEFF/, "")), {
      label: "yt-dlp JSON output",
      maximumDepth: 100,
      maximumNodes: 500_000,
      maximumCollectionSize: 100_000,
      maximumStringLength: 5_000_000,
      allowNullPrototype: true,
      freeze: true
    });
  } catch (cause) {
    if (cause instanceof MaqamError) throw cause;
    throw new MaqamError("yt-dlp returned malformed JSON output.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID",
      cause
    });
  }
}

async function boundedBody(response, maximumBytes) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > maximumBytes) {
    await response.body?.cancel?.();
    throw new MaqamError("YouTube caption response exceeded the configured byte limit.", {
      code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
      details: { maximumBytes, contentLength: length }
    });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.byteLength;
    if (size > maximumBytes) {
      await response.body?.cancel?.();
      throw new MaqamError("YouTube caption response exceeded the configured byte limit.", {
        code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
        details: { maximumBytes }
      });
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function defaultCaptionReader({ url, timeoutMs, maxBytes, signal }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  const forward = (source) => controller.abort(
    source.reason instanceof Error ? source.reason : new Error("Caption request was aborted.")
  );
  const onParentAbort = () => forward(signal);
  const onTimeout = () => forward(timeout);
  if (signal) {
    if (signal.aborted) onParentAbort();
    else signal.addEventListener("abort", onParentAbort, { once: true });
  }
  timeout.addEventListener("abort", onTimeout, { once: true });
  try {
    return await withPinnedFetch(url, {
      method: "GET",
      headers: {
        accept: "application/json,text/vtt,text/plain;q=0.8",
        "user-agent": "Maqam/0.3 YouTube research adapter"
      },
      signal: controller.signal
    }, {
      signal: controller.signal,
      allowPrivateNetworks: false
    }, async (response) => {
      if (!response.ok) {
        await response.body?.cancel?.();
        throw new ResearchSourceUnavailableError(
          `YouTube caption endpoint returned HTTP ${response.status}.`,
          { details: { status: response.status, origin: new URL(url).origin } }
        );
      }
      return {
        body: await boundedBody(response, maxBytes),
        contentType: response.headers.get("content-type") || ""
      };
    });
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new MaqamError("YouTube caption request was aborted.", {
            code: "RESEARCH_SOURCE_ABORTED"
          });
    }
    // Classified protocol, size, and security failures must not become a
    // metadata-only success merely because the deadline fired concurrently.
    if (error instanceof MaqamError || error?.code === "CRAWLER_URL_BLOCKED") throw error;
    if (timeout.aborted) {
      throw new ResearchSourceUnavailableError(
        `YouTube caption request timed out after ${timeoutMs}ms.`,
        { cause: error, details: { timeoutMs } }
      );
    }
    throw new ResearchSourceUnavailableError("YouTube captions are temporarily unavailable.", {
      cause: error,
      details: { origin: new URL(url).origin }
    });
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
    timeout.removeEventListener("abort", onTimeout);
  }
}

function captionHost(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === YOUTUBE_HOST;
}

function chooseLanguage(captions, preferences, fallbackLanguage) {
  if (!captions || typeof captions !== "object" || Array.isArray(captions)) return null;
  const available = Object.keys(captions).filter((language) => language !== "live_chat");
  const candidates = [...preferences, fallbackLanguage].filter(Boolean);
  for (const candidate of candidates) {
    if (available.includes(candidate)) return candidate;
    const prefix = available.find((language) => language.toLowerCase().startsWith(`${candidate.toLowerCase()}-`));
    if (prefix) return prefix;
  }
  return available[0] ?? null;
}

function captionChoice(info, languages) {
  for (const [kind, captions] of [
    ["manual", info.subtitles],
    ["automatic", info.automatic_captions]
  ]) {
    const language = chooseLanguage(captions, languages, info.language);
    if (!language || !Array.isArray(captions[language])) continue;
    const formats = captions[language];
    const format = formats.find((entry) => entry?.ext === "json3" && typeof entry.url === "string")
      ?? formats.find((entry) => entry?.ext === "vtt" && typeof entry.url === "string");
    if (!format) continue;
    let url;
    try {
      url = new URL(format.url);
    } catch {
      throw new MaqamError("yt-dlp returned an invalid caption URL.", {
        code: "SECURITY_YOUTUBE_CAPTION_URL"
      });
    }
    if (url.protocol !== "https:" || url.username || url.password || !captionHost(url)) {
      throw new MaqamError("yt-dlp returned a caption URL outside the approved YouTube boundary.", {
        code: "SECURITY_YOUTUBE_CAPTION_URL",
        details: { origin: url.origin }
      });
    }
    return { kind, language, format: format.ext, url };
  }
  return null;
}

function cueText(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVttMarkup(value) {
  const source = String(value || "");
  let result = "";
  let insideTag = false;
  for (const character of source) {
    if (insideTag) {
      if (character === ">") insideTag = false;
      continue;
    }
    if (character === "<") {
      insideTag = true;
      continue;
    }
    result += character;
  }
  return result;
}

function json3Transcript(body, maximumCharacters) {
  let value;
  try {
    value = JSON.parse(body);
  } catch (cause) {
    throw new MaqamError("YouTube returned malformed json3 captions.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID",
      cause
    });
  }
  if (!value || !Array.isArray(value.events)) {
    throw new MaqamError("YouTube json3 captions did not contain events.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  const cues = [];
  let characters = 0;
  for (const event of value.events.slice(0, 100_000)) {
    if (!event || !Array.isArray(event.segs)) continue;
    const text = cueText(event.segs.map((segment) => segment?.utf8 || "").join(""));
    if (!text || text === cues.at(-1)?.text) continue;
    const startMs = Number.isFinite(event.tStartMs) ? Math.max(0, Math.floor(event.tStartMs)) : 0;
    const durationMs = Number.isFinite(event.dDurationMs)
      ? Math.max(0, Math.floor(event.dDurationMs))
      : 0;
    if (characters + text.length > maximumCharacters) break;
    cues.push({ startMs, durationMs, text });
    characters += text.length;
  }
  return cues;
}

function vttTranscript(body, maximumCharacters) {
  const cues = [];
  let characters = 0;
  const blocks = body.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timing = lines.findIndex((line) => line.includes(" --> "));
    if (timing === -1) continue;
    const text = cueText(stripVttMarkup(lines.slice(timing + 1).join(" ")));
    if (!text || text === cues.at(-1)?.text) continue;
    const match = lines[timing].match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s+-->/);
    const startMs = match
      ? Math.round(((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1_000)
      : 0;
    if (characters + text.length > maximumCharacters) break;
    cues.push({ startMs, durationMs: 0, text });
    characters += text.length;
  }
  return cues;
}

function timestampLabel(milliseconds) {
  const seconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function publishedAt(info) {
  if (Number.isFinite(info.timestamp)) {
    const timestamp = new Date(info.timestamp * 1_000);
    if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString();
  }
  if (typeof info.upload_date === "string" && /^\d{8}$/.test(info.upload_date)) {
    const date = `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}T00:00:00.000Z`;
    const parsed = new Date(date);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString() === date) return date;
  }
  return null;
}

function videoUri(info) {
  if (!info || typeof info !== "object" || Array.isArray(info)) return null;
  for (const candidate of [info.webpage_url, info.original_url, info.url]) {
    if (typeof candidate !== "string") continue;
    try {
      return youtubeUrl(candidate).toString();
    } catch {
      // Flat playlist entries commonly expose only an id; try the next form.
    }
  }
  if (typeof info.id === "string" && /^[a-z0-9_-]{6,32}$/i.test(info.id)) {
    return `${YOUTUBE_ORIGIN}/watch?v=${encodeURIComponent(info.id)}`;
  }
  return null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function videoDocument(info, transcript = null) {
  if (!info || typeof info !== "object" || Array.isArray(info)) return null;
  const uri = videoUri(info);
  if (!uri) return null;
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim().slice(0, 100_000) : null;
  const description = typeof info.description === "string" ? info.description.trim().slice(0, 1_000_000) : "";
  const transcriptText = transcript?.cues?.length
    ? transcript.cues.map((cue) => `[${timestampLabel(cue.startMs)}] ${cue.text}`).join("\n")
    : "";
  const body = [description, transcriptText].filter(Boolean).join("\n\n")
    || title
    || `YouTube video ${info.id || uri}`;
  const author = [info.uploader, info.channel].find((value) => typeof value === "string" && value.trim());
  const publication = publishedAt(info);
  return {
    id: typeof info.id === "string" ? info.id.slice(0, 100_000) : uri,
    uri,
    title,
    text: body.slice(0, MAX_TRANSCRIPT_CHARS),
    markdown: transcriptText
      ? `# ${title || "YouTube video"}\n\n${description}\n\n## Transcript\n\n${transcriptText}`.slice(0, MAX_TRANSCRIPT_CHARS)
      : null,
    contentType: transcriptText ? "text/markdown" : "text/plain",
    language: transcript?.language || (typeof info.language === "string" ? info.language : null),
    authors: author ? [author.slice(0, 100_000)] : [],
    ...(publication ? { publishedAt: publication } : {}),
    metadata: {
      provider: "youtube-via-yt-dlp",
      developerApiKeyRequired: false,
      unofficialBestEffort: true,
      videoId: typeof info.id === "string" ? info.id : null,
      durationSeconds: safeInteger(info.duration),
      viewCount: safeInteger(info.view_count),
      channel: typeof info.channel === "string" ? info.channel.slice(0, 100_000) : null,
      channelId: typeof info.channel_id === "string" ? info.channel_id.slice(0, 100_000) : null,
      liveStatus: typeof info.live_status === "string" ? info.live_status.slice(0, 200) : null,
      transcript: transcript
        ? {
            status: transcript.cues.length ? "available" : "empty",
            language: transcript.language,
            kind: transcript.kind,
            format: transcript.format,
            cueCount: transcript.cues.length
          }
        : { status: "not-requested-or-unavailable" }
    },
    citations: [{ uri, title }]
  };
}

async function transcriptFor(info, request, config, context) {
  if (!request.includeTranscript) return null;
  const choice = captionChoice(info, request.languages);
  if (!choice) return null;
  const scope = context?.authorizationScope;
  if (scope?.originsExplicit === true
    && !scope.originsUnrestricted
    && !context.authorizedOrigins?.includes(choice.url.origin)) {
    throw new MaqamError("YouTube caption origin is outside the authorized origin scope.", {
      code: "SECURITY_YOUTUBE_CAPTION_ORIGIN",
      details: { origin: choice.url.origin }
    });
  }
  let response;
  try {
    response = await config.captionReader({
      url: choice.url.toString(),
      timeoutMs: config.captionTimeoutMs,
      maxBytes: config.maxCaptionBytes,
      signal: context?.signal ?? null
    });
  } catch (error) {
    if (error instanceof ResearchSourceUnavailableError) return null;
    throw error;
  }
  let body;
  if (typeof response === "string") {
    body = response;
  } else {
    const snapshot = snapshotOwnDataRecord(response, {
      label: "YouTube caption reader response",
      recognizedKeys: new Set(["body", "contentType"])
    });
    body = snapshot.body;
  }
  if (typeof body !== "string") {
    throw new MaqamError("YouTube caption reader must return a string or { body }.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  if (Buffer.byteLength(body, "utf8") > config.maxCaptionBytes) {
    throw new MaqamError("YouTube caption response exceeded the configured byte limit.", {
      code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
      details: { maximumBytes: config.maxCaptionBytes }
    });
  }
  const cues = choice.format === "json3"
    ? json3Transcript(body, config.maxTranscriptChars)
    : vttTranscript(body, config.maxTranscriptChars);
  return { ...choice, cues };
}

async function readYouTube(config, input, context) {
  const request = routeInput(input, config);
  const info = await runYtDlp(config, operationArgs(request), context?.signal ?? null);
  if (request.mode === "search") {
    const entries = Array.isArray(info?.entries) ? info.entries : [];
    const documents = entries
      .slice(0, request.maxResults)
      .map((entry) => videoDocument(entry))
      .filter(Boolean);
    if (!documents.length) {
      throw new ResearchSourceUnavailableError("yt-dlp returned no YouTube search results.");
    }
    return documents;
  }
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new MaqamError("yt-dlp did not return a YouTube metadata object.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  const transcript = await transcriptFor(info, request, config, context);
  const document = videoDocument(info, transcript);
  if (!document) {
    throw new MaqamError("yt-dlp did not return a canonical YouTube video identity.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  return [document];
}

function declareGovernance(handler) {
  Object.defineProperty(handler, "governance", {
    value: Object.freeze({
      effects: Object.freeze(["network:read", "process:execute"]),
      networkOrigins: Object.freeze([YOUTUBE_ORIGIN]),
      risk: "medium"
    }),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return handler;
}

/**
 * Create an opt-in YouTube metadata, search, and caption adapter backed by a
 * separately installed yt-dlp executable. It never imports browser cookies,
 * reads yt-dlp config, downloads video/audio, or enables remote components.
 */
export function createYtDlpYouTubeSourceAdapter(options = {}) {
  const config = adapterOptions(options);
  const read = declareGovernance(
    async (input = {}, context = {}) => readYouTube(config, input, context)
  );
  return defineResearchSourceAdapter({
    id: "youtube.yt-dlp",
    channel: "youtube",
    toolName: "research.youtube.yt-dlp",
    label: "Public YouTube metadata and captions through governed yt-dlp",
    priority: 100,
    authentication: "none",
    capabilities: ["read", "search", "video", "captions", "transcript"],
    metadata: {
      backend: "yt-dlp",
      accessMode: "anonymous-public",
      executionMode: "local-cli",
      dataBoundary: "local-process-and-direct-source",
      contentIsUntrusted: true,
      separatelyInstalled: true,
      developerApiKeyRequired: false,
      browserSessionReuse: false,
      downloadsVideoOrAudio: false,
      unofficialBestEffort: true
    },
    check: async (context = {}) => {
      try {
        const raw = await config.runner({
          command: config.command,
          args: Object.freeze(["--ignore-config", "--no-plugin-dirs", "--version"]),
          timeoutMs: Math.min(config.timeoutMs, 10_000),
          maxOutputBytes: 100_000,
          signal: context.signal ?? null
        });
        const result = runnerResult(raw);
        const version = result.stdout.trim().slice(0, 200);
        if (result.exitCode !== 0 || !version) {
          return {
            status: "unavailable",
            message: "yt-dlp is installed but its local version probe failed.",
            details: { executableReady: false, liveVerified: false }
          };
        }
        return {
          status: "ready",
          message: "yt-dlp is executable; this local probe does not contact YouTube.",
          details: {
            executableReady: true,
            version,
            liveVerified: false,
            developerApiKeyRequired: false,
            accessMode: "anonymous-public"
          }
        };
      } catch {
        return {
          status: "unavailable",
          message: "yt-dlp is not installed or is not executable.",
          details: { executableReady: false, liveVerified: false }
        };
      }
    },
    read
  });
}

export const YOUTUBE_PUBLIC_ORIGIN = YOUTUBE_ORIGIN;
