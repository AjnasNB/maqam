import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { delimiter, extname, isAbsolute, join, relative, resolve } from "node:path";
import { redactText } from "./audit.js";
import { MaqamError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_TOKENS = 4_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(String(value || ""), "utf8") / 4);
}

function buildStdin(input, mode) {
  if (mode === "none") return null;
  if (mode === "text") {
    if (typeof input === "string") return input;
    return String(input?.prompt ?? input?.text ?? "");
  }
  return JSON.stringify(input);
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
      events.push(JSON.parse(line));
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

function pickEnvironment({ inheritEnv, envAllowlist, env }) {
  let base = {};
  if (inheritEnv && Array.isArray(envAllowlist)) {
    for (const key of envAllowlist) {
      if (process.env[key] !== undefined) base[key] = process.env[key];
    }
  } else if (inheritEnv) {
    base = { ...process.env };
  }
  return { ...base, ...env };
}

function isWithin(root, target) {
  const pathFromRoot = relative(resolve(root), resolve(target));
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function validateCwd(cwd, allowedCwdRoots) {
  if (!cwd || !allowedCwdRoots?.length) return;
  if (!allowedCwdRoots.some((root) => isWithin(root, cwd))) {
    throw new TypeError(`CLI cwd '${cwd}' is outside allowedCwdRoots.`);
  }
}

function resolveCommand(command) {
  if (process.platform !== "win32" || isAbsolute(command) || /[\\/]/.test(command) || extname(command)) {
    return command;
  }

  const pathValue = process.env.Path || process.env.PATH || "";
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

function terminateProcessTree(child) {
  if (!child?.pid || child.killed) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export function createCliAgentTool(options = {}) {
  const {
    name = "cliAgent",
    command,
    args = [],
    cwd,
    allowedCwdRoots = [],
    env = {},
    inheritEnv = true,
    envAllowlist,
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
  validateCwd(cwd, allowedCwdRoots);
  const resolvedCommand = resolveCommand(command);

  return async function cliAgentTool(input = {}, context = {}) {
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
          cwd,
          env: pickEnvironment({ inheritEnv, envAllowlist, env }),
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
      let timer = null;
      const signal = context.signal || null;

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
        terminateProcessTree(child);
        finish(rejectPromise, error);
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
        finish(rejectPromise, cliError(error.message, "CLI_SPAWN_FAILED", {
          name,
          command: resolvedCommand,
          cause: error.code || error.name
        }));
      });

      child.on("close", (exitCode, childSignal) => {
        if (settled) return;

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
          if (parseJson && stdoutText.trim()) result.json = JSON.parse(stdoutText.trim());
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
