import { spawn } from "node:child_process";
import { AjnasFrameworkError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_TOKENS = 4_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(value || "", "utf8") / 4);
}

function buildStdin(input, mode) {
  if (mode === "none") return null;
  if (mode === "text") return String(input.prompt ?? input.text ?? "");
  return JSON.stringify(input);
}

function cliError(message, code, details = {}) {
  return new AjnasFrameworkError(message, {
    code,
    details
  });
}

export function createCliAgentTool(options = {}) {
  const {
    name = "cliAgent",
    command,
    args = [],
    cwd,
    env = {},
    inheritEnv = true,
    stdin = "json",
    parseJson = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    rejectOnNonZero = true,
    shell = false
  } = options;

  if (!command || typeof command !== "string") {
    throw new TypeError("createCliAgentTool requires a fixed command string.");
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("createCliAgentTool args must be an array of strings.");
  }

  return async function cliAgentTool(input = {}) {
    const stdinBody = buildStdin(input, stdin);
    const approxInputTokens = estimateTokens(stdinBody || "");
    if (maxInputTokens && approxInputTokens > maxInputTokens) {
      throw cliError(`CLI input exceeds maxInputTokens (${approxInputTokens} > ${maxInputTokens}).`, "CLI_INPUT_LIMIT_EXCEEDED", {
        name,
        approxInputTokens,
        maxInputTokens
      });
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env: inheritEnv ? { ...process.env, ...env } : { ...env },
          shell,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        reject(cliError(error.message, "CLI_SPAWN_FAILED", {
          name,
          command,
          cause: error.code || error.name
        }));
        return;
      }

      const stdout = [];
      const stderr = [];
      let outputBytes = 0;
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };

      const stopWithError = (error) => {
        if (!child.killed) child.kill();
        finish(reject, error);
      };

      const timer = setTimeout(() => {
        stopWithError(cliError(`CLI agent '${name}' timed out after ${timeoutMs}ms.`, "CLI_TIMEOUT", {
          name,
          timeoutMs
        }));
      }, timeoutMs);

      const collect = (target, chunk) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > maxOutputBytes) {
          stopWithError(cliError(`CLI output exceeds maxOutputBytes (${outputBytes} > ${maxOutputBytes}).`, "CLI_OUTPUT_LIMIT_EXCEEDED", {
            name,
            maxOutputBytes,
            outputBytes
          }));
          return;
        }
        target.push(Buffer.from(chunk));
      };

      child.stdout.on("data", (chunk) => collect(stdout, chunk));
      child.stderr.on("data", (chunk) => collect(stderr, chunk));

      child.on("error", (error) => {
        finish(reject, cliError(error.message, "CLI_SPAWN_FAILED", {
          name,
          command,
          cause: error.code || error.name
        }));
      });

      child.on("close", (exitCode, signal) => {
        if (settled) return;

        const stdoutText = Buffer.concat(stdout).toString("utf8");
        const stderrText = Buffer.concat(stderr).toString("utf8");
        const result = {
          name,
          command,
          args,
          exitCode,
          signal,
          timedOut: false,
          stdout: stdoutText,
          stderr: stderrText,
          durationMs: Date.now() - startedAt,
          approxInputTokens,
          outputBytes,
          limits: {
            maxInputTokens,
            maxOutputBytes,
            timeoutMs
          }
        };

        if (parseJson && stdoutText.trim()) {
          try {
            result.json = JSON.parse(stdoutText.trim());
          } catch (error) {
            finish(reject, cliError("CLI stdout was not valid JSON.", "CLI_JSON_PARSE_FAILED", {
              name,
              message: error.message
            }));
            return;
          }
        }

        if (rejectOnNonZero && exitCode !== 0) {
          finish(reject, cliError(`CLI agent '${name}' exited with code ${exitCode}.`, "CLI_EXIT_NONZERO", {
            ...result,
            stdout: stdoutText.slice(0, 2048),
            stderr: stderrText.slice(0, 2048)
          }));
          return;
        }

        finish(resolve, result);
      });

      if (stdinBody === null) {
        child.stdin.end();
      } else {
        child.stdin.end(stdinBody);
      }
    });
  };
}

export { estimateTokens as estimateCliInputTokens };
