import { spawn } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, extname, isAbsolute, join, relative, resolve } from "node:path";
import { redactText } from "./audit.js";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
import { MaqamError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_TOKENS = 4_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const SAFE_ENV_KEYS = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "ComSpec", "WINDIR",
  "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "NO_COLOR", "CI"
];
const CLI_OPTION_KEYS = [
  "name", "command", "args", "cwd", "allowedCwdRoots", "env", "inheritEnv",
  "envAllowlist", "allowUnsafeEnvInheritance", "stdin", "parseJson",
  "parseJsonLines", "timeoutMs", "maxInputTokens", "maxOutputTokens",
  "maxOutputBytes", "rejectOnNonZero", "shell", "allowUnsafeShell"
];
const AGENT_CONTEXT_KEYS = [
  "runId", "taskId", "goal", "limits", "signal", "authorizedOrigins",
  "authorizationScope", "approvalId", "approvalIds", "requestedBy",
  "approvalEvidence", "evidence", "evidenceLedger", "approvals", "tools",
  "outputs", "trace"
];

function snapshotStringArray(value, label) {
  const snapshot = snapshotOwnDataArray(value, { label });
  for (let index = 0; index < snapshot.length; index += 1) {
    if (typeof snapshot[index] !== "string") {
      throw new TypeError(`${label}[${index}] must be a string.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotEnvironment(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object of string values.`);
  }
  const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  const snapshot = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: keys.filter((key) => typeof key === "string")
  });
  for (const key of Object.keys(snapshot)) {
    if (typeof snapshot[key] !== "string") {
      throw new TypeError(`${label}.${key} must be a string.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotCliOptions(value = {}) {
  const snapshot = snapshotOwnDataRecord(value, {
    label: "CLI agent options",
    recognizedKeys: CLI_OPTION_KEYS
  });
  if (snapshot.args !== undefined) snapshot.args = snapshotStringArray(snapshot.args, "CLI agent options.args");
  if (snapshot.allowedCwdRoots !== undefined) {
    snapshot.allowedCwdRoots = snapshotStringArray(
      snapshot.allowedCwdRoots,
      "CLI agent options.allowedCwdRoots"
    );
  }
  if (snapshot.envAllowlist !== undefined) {
    snapshot.envAllowlist = snapshotStringArray(snapshot.envAllowlist, "CLI agent options.envAllowlist");
  }
  if (snapshot.env !== undefined) snapshot.env = snapshotEnvironment(snapshot.env, "CLI agent options.env");
  for (const key of [
    "inheritEnv", "allowUnsafeEnvInheritance", "parseJson", "parseJsonLines",
    "rejectOnNonZero", "shell", "allowUnsafeShell"
  ]) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "boolean") {
      throw new TypeError(`CLI agent options.${key} must be a boolean.`);
    }
  }
  for (const key of ["name", "command", "cwd"]) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "string") {
      throw new TypeError(`CLI agent options.${key} must be a string.`);
    }
  }
  if (snapshot.stdin !== undefined && !["json", "text", "none"].includes(snapshot.stdin)) {
    throw new TypeError("CLI agent options.stdin must be 'json', 'text', or 'none'.");
  }
  for (const key of ["timeoutMs", "maxInputTokens", "maxOutputTokens", "maxOutputBytes"]) {
    const valueAtKey = snapshot[key];
    if (valueAtKey !== undefined && valueAtKey !== null
      && (typeof valueAtKey !== "number" || !Number.isFinite(valueAtKey) || valueAtKey < 0)) {
      throw new TypeError(`CLI agent options.${key} must be a non-negative finite number or null.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotToolContext(value = {}) {
  return Object.freeze(snapshotOwnDataRecord(value, {
    label: "CLI agent context",
    recognizedKeys: AGENT_CONTEXT_KEYS,
    rejectUnknown: false
  }));
}

function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(String(value || ""), "utf8") / 4);
}

function buildStdin(input, mode) {
  if (mode === "none") return null;
  if (mode === "text") {
    if (typeof input === "string") return input;
    const record = snapshotOwnDataRecord(input ?? {}, {
      label: "CLI text input",
      recognizedKeys: ["prompt", "text"],
      rejectUnknown: false
    });
    const text = record.prompt ?? record.text ?? "";
    if (typeof text !== "string") throw new TypeError("CLI text input prompt/text must be a string.");
    return text;
  }
  return JSON.stringify(snapshotJsonValue(input, { label: "CLI JSON input" }));
}

function cliError(message, code, details = {}) {
  return new MaqamError(message, { code, details });
}

function parseJsonLines(stdout, name) {
  const events = [];
  const lines = stdout.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const parsed = snapshotJsonValue(JSON.parse(line), {
        label: `${name} JSONL event ${index + 1}`,
        freeze: true
      });
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("JSON Lines events must be objects.");
      }
      events.push(parsed);
    } catch (error) {
      throw cliError("CLI stdout contained invalid JSON Lines output.", "CLI_JSONL_PARSE_FAILED", {
        name,
        lineNumber: index + 1,
        excerpt: redactText(line.slice(0, 240)),
        message: error.message
      });
    }
  }
  return events;
}

function pickEnvironment({ inheritEnv, envAllowlist, env, allowUnsafeEnvInheritance }) {
  let base = {};
  if (inheritEnv && allowUnsafeEnvInheritance && envAllowlist === undefined) {
    base = { ...process.env };
  } else {
    const keys = Array.isArray(envAllowlist) ? envAllowlist : SAFE_ENV_KEYS;
    for (const key of keys) {
      if (process.env[key] !== undefined) base[key] = process.env[key];
    }
  }
  return { ...base, ...env };
}

function isWithin(root, target) {
  const pathFromRoot = relative(realpathSync(resolve(root)), realpathSync(resolve(target)));
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function validateCwd(cwd, allowedCwdRoots) {
  const resolvedCwd = realpathSync(resolve(cwd));
  if (!allowedCwdRoots.some((root) => isWithin(root, resolvedCwd))) {
    throw new TypeError(`CLI cwd '${cwd}' is outside allowedCwdRoots.`);
  }
  return resolvedCwd;
}

function resolveCommand(command, environment = process.env) {
  if (process.platform !== "win32" || isAbsolute(command) || /[\\/]/.test(command) || extname(command)) {
    return command;
  }

  const pathValue = environment.Path || environment.PATH || "";
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of [".exe", ".com"]) {
      const candidate = join(directory.replace(/^"|"$/g, ""), `${command}${extension}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        // Ignore inaccessible PATH entries and let spawn report a useful error.
      }
    }
  }
  return command;
}

function waitForChildClose(child, timeoutMs = 1_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, timeoutMs);
    child.once("close", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = waitForChildClose(child);
  if (process.platform === "win32") {
    await new Promise((resolvePromise) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.once("error", () => {
        try { child.kill("SIGKILL"); } catch { /* process already exited */ }
        resolvePromise();
      });
      killer.once("close", resolvePromise);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try { child.kill("SIGKILL"); } catch { /* process already exited */ }
    }
  }
  await closed;
}

export function createCliAgentTool(options = {}) {
  options = snapshotCliOptions(options);
  const {
    name = "cliAgent",
    command,
    args = [],
    cwd = process.cwd(),
    allowedCwdRoots = [process.cwd()],
    env = {},
    inheritEnv = false,
    envAllowlist,
    allowUnsafeEnvInheritance = false,
    stdin = "json",
    parseJson = false,
    parseJsonLines: shouldParseJsonLines = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens = null,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    rejectOnNonZero = true,
    shell = false,
    allowUnsafeShell = false
  } = options;

  if (!command || typeof command !== "string") {
    throw new TypeError("createCliAgentTool requires a fixed command string.");
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("createCliAgentTool args must be an array of strings.");
  }
  if (parseJson && shouldParseJsonLines) {
    throw new TypeError("parseJson and parseJsonLines cannot both be enabled.");
  }
  if (shell && !allowUnsafeShell) {
    throw new TypeError("Shell execution requires allowUnsafeShell: true.");
  }
  if (envAllowlist !== undefined && (!Array.isArray(envAllowlist) || envAllowlist.some((key) => typeof key !== "string"))) {
    throw new TypeError("envAllowlist must be an array of environment variable names.");
  }
  const resolvedCwd = validateCwd(cwd, allowedCwdRoots);
  const resolvedEnvironment = Object.freeze(pickEnvironment({
    inheritEnv,
    envAllowlist,
    env,
    allowUnsafeEnvInheritance
  }));
  const resolvedCommand = resolveCommand(command, resolvedEnvironment);

  return async function cliAgentTool(input = {}, context = {}) {
    context = snapshotToolContext(context);
    const signal = context.signal || null;
    if (signal !== null && !(signal instanceof AbortSignal)) {
      throw new TypeError("CLI agent context.signal must be an AbortSignal.");
    }
    if (signal?.aborted) {
      throw cliError(`CLI agent '${name}' was aborted before launch.`, "CLI_ABORTED", {
        name,
        reason: signal.reason?.message || String(signal.reason || "aborted")
      });
    }
    const stdinBody = buildStdin(input, stdin);
    const approxInputTokens = estimateTokens(stdinBody || "");
    if (Number.isFinite(maxInputTokens) && approxInputTokens > maxInputTokens) {
      throw cliError(`CLI input exceeds maxInputTokens (${approxInputTokens} > ${maxInputTokens}).`, "CLI_INPUT_LIMIT_EXCEEDED", {
        name,
        approxInputTokens,
        maxInputTokens
      });
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const startedAt = Date.now();
      let child;
      try {
        child = spawn(resolvedCommand, args, {
          cwd: resolvedCwd,
          env: { ...resolvedEnvironment },
          shell,
          detached: process.platform !== "win32",
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        rejectPromise(cliError(error.message, "CLI_SPAWN_FAILED", {
          name,
          command: resolvedCommand,
          cause: error.code || error.name
        }));
        return;
      }

      const stdout = [];
      const stderr = [];
      let outputBytes = 0;
      let settled = false;
      let stopping = false;
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      };

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };

      const stopWithError = (error) => {
        if (settled || stopping) return;
        stopping = true;
        cleanup();
        terminateProcessTree(child).finally(() => finish(rejectPromise, error));
      };

      const onAbort = () => stopWithError(cliError(`CLI agent '${name}' was aborted.`, "CLI_ABORTED", {
        name,
        reason: signal?.reason?.message || String(signal?.reason || "aborted")
      }));

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          stopWithError(cliError(`CLI agent '${name}' timed out after ${timeoutMs}ms.`, "CLI_TIMEOUT", {
            name,
            timeoutMs
          }));
        }, timeoutMs);
      }

      const collect = (target, chunk) => {
        if (settled) return;
        outputBytes += chunk.byteLength;
        const approxOutputTokens = Math.ceil(outputBytes / 4);
        if (Number.isFinite(maxOutputBytes) && outputBytes > maxOutputBytes) {
          stopWithError(cliError(`CLI output exceeds maxOutputBytes (${outputBytes} > ${maxOutputBytes}).`, "CLI_OUTPUT_LIMIT_EXCEEDED", {
            name,
            maxOutputBytes,
            outputBytes
          }));
          return;
        }
        if (Number.isFinite(maxOutputTokens) && approxOutputTokens > maxOutputTokens) {
          stopWithError(cliError(`CLI output exceeds maxOutputTokens (${approxOutputTokens} > ${maxOutputTokens}).`, "CLI_OUTPUT_TOKEN_LIMIT_EXCEEDED", {
            name,
            maxOutputTokens,
            approxOutputTokens
          }));
          return;
        }
        target.push(Buffer.from(chunk));
      };

      child.stdout.on("data", (chunk) => collect(stdout, chunk));
      child.stderr.on("data", (chunk) => collect(stderr, chunk));

      child.on("error", (error) => {
        if (stopping) return;
        finish(rejectPromise, cliError(error.message, "CLI_SPAWN_FAILED", {
          name,
          command: resolvedCommand,
          cause: error.code || error.name
        }));
      });

      child.on("close", (exitCode, childSignal) => {
        if (settled || stopping) return;

        const stdoutText = Buffer.concat(stdout).toString("utf8");
        const stderrText = Buffer.concat(stderr).toString("utf8");
        const result = {
          name,
          command: resolvedCommand,
          args: [...args],
          exitCode,
          signal: childSignal,
          timedOut: false,
          stdout: stdoutText,
          stderr: stderrText,
          durationMs: Date.now() - startedAt,
          approxInputTokens,
          approxOutputTokens: Math.ceil(outputBytes / 4),
          outputBytes,
          limits: {
            maxInputTokens,
            maxOutputTokens,
            maxOutputBytes,
            timeoutMs
          }
        };

        try {
          if (parseJson && stdoutText.trim()) {
            result.json = snapshotJsonValue(JSON.parse(stdoutText.trim()), {
              label: `${name} JSON output`,
              freeze: true
            });
          }
          if (shouldParseJsonLines) result.jsonLines = parseJsonLines(stdoutText, name);
        } catch (error) {
          if (error instanceof MaqamError) {
            finish(rejectPromise, error);
          } else {
            finish(rejectPromise, cliError("CLI stdout was not valid JSON.", "CLI_JSON_PARSE_FAILED", {
              name,
              message: error.message
            }));
          }
          return;
        }

        if (rejectOnNonZero && exitCode !== 0) {
          finish(rejectPromise, cliError(`CLI agent '${name}' exited with code ${exitCode}.`, "CLI_EXIT_NONZERO", {
            name,
            command: resolvedCommand,
            args: [...args],
            exitCode,
            signal: childSignal,
            durationMs: result.durationMs,
            approxInputTokens,
            approxOutputTokens: result.approxOutputTokens,
            outputBytes,
            limits: result.limits,
            stdout: redactText(stdoutText.slice(0, 2048)),
            stderr: redactText(stderrText.slice(0, 2048))
          }));
          return;
        }

        finish(resolvePromise, result);
      });

      child.stdin.on("error", (error) => {
        if (!settled && error.code !== "EPIPE") {
          stopWithError(cliError(error.message, "CLI_STDIN_FAILED", { name, cause: error.code || error.name }));
        }
      });

      if (stdinBody === null) child.stdin.end();
      else child.stdin.end(stdinBody);
    });
  };
}

export { estimateTokens as estimateCliInputTokens, parseJsonLines as parseCliJsonLines, resolveCommand as resolveCliCommand };
