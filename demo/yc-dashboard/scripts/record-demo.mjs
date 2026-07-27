import { spawn, spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  open,
  rm
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const artifactDirectory = resolve(demoDirectory, "artifacts");
const recordingDirectory = resolve(artifactDirectory, ".recordings");
const rawDesktopPath = resolve(recordingDirectory, "maqam-yc-real-desktop.mkv");
const captureLogPath = resolve(recordingDirectory, "ffmpeg-capture.log");
const finalVideoPath = resolve(artifactDirectory, "maqam-yc-real-workflow-demo.mp4");
const canonicalVideoPath = resolve(artifactDirectory, "maqam-yc-control-plane-demo.mp4");
const posterPath = resolve(artifactDirectory, "maqam-yc-real-workflow-poster.png");
const canonicalPosterPath = resolve(artifactDirectory, "maqam-yc-control-plane-poster.png");
const approvalPath = resolve(artifactDirectory, "maqam-yc-real-approval.png");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 4188;
const url = `http://127.0.0.1:${port}/`;

await rm(recordingDirectory, { recursive: true, force: true });
await mkdir(recordingDirectory, { recursive: true });
await mkdir(artifactDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [resolve(scriptDirectory, "serve.mjs"), `--port=${port}`, "--worker=codex", "--pace=1800"],
  {
    cwd: demoDirectory,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }
);
let serverError = "";
server.stderr.setEncoding("utf8");
server.stderr.on("data", (chunk) => {
  serverError += chunk;
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The server may still be binding the local port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(serverError || "The live demo server did not become ready.");
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      rejectExit(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
  });
}

function transcodeDesktopCapture() {
  const conversion = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i", rawDesktopPath,
      "-an",
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      finalVideoPath
    ],
    {
      cwd: demoDirectory,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (conversion.error) throw conversion.error;
  if (conversion.status !== 0) {
    throw new Error(conversion.stderr || `ffmpeg conversion exited with ${conversion.status}.`);
  }
}

let browser;
let capture;
let captureLog;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: false,
    slowMo: 80,
    args: [
      "--start-maximized",
      "--disable-notifications",
      "--disable-session-crashed-bubble",
      "--no-first-run"
    ]
  });
  const context = await browser.newContext({
    viewport: null,
    colorScheme: "dark",
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.bringToFront();
  await page.locator("#run-workflow").waitFor({ state: "visible" });
  await page.waitForTimeout(1_500);

  captureLog = await open(captureLogPath, "w");
  capture = spawn(
    "ffmpeg",
    [
      "-y",
      "-thread_queue_size", "1024",
      "-f", "gdigrab",
      "-framerate", "30",
      "-video_size", "1920x1080",
      "-offset_x", "0",
      "-offset_y", "0",
      "-draw_mouse", "1",
      "-i", "desktop",
      "-an",
      "-c:v", "h264_nvenc",
      "-preset", "p4",
      "-cq", "20",
      "-pix_fmt", "yuv420p",
      "-fps_mode", "cfr",
      rawDesktopPath
    ],
    {
      cwd: demoDirectory,
      stdio: ["pipe", "ignore", captureLog.fd],
      windowsHide: true
    }
  );
  await page.waitForTimeout(1_200);
  if (capture.exitCode !== null) {
    throw new Error(`Desktop capture stopped early. See ${captureLogPath}.`);
  }

  const runButton = page.locator("#run-workflow");
  await runButton.hover();
  await page.waitForTimeout(450);
  await runButton.click();

  const approvalButton = page.locator("#approve-patch");
  await approvalButton.waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3_500);
  await page.screenshot({ path: approvalPath, fullPage: false });
  await approvalButton.hover();
  await page.waitForTimeout(600);
  await approvalButton.click();

  await page.locator('#app[data-state="complete"]').waitFor({
    state: "attached",
    timeout: 90_000
  });
  await page.waitForTimeout(6_500);
  await page.screenshot({ path: posterPath, fullPage: false });

  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
  }

  capture.stdin.write("q\n");
  const captureExit = await waitForExit(capture, 20_000);
  if (captureExit !== 0) {
    throw new Error(`Desktop capture exited with ${captureExit}. See ${captureLogPath}.`);
  }
  capture = null;
  await captureLog.close();
  captureLog = null;
  transcodeDesktopCapture();
  await copyFile(finalVideoPath, canonicalVideoPath);
  await copyFile(posterPath, canonicalPosterPath);
} finally {
  if (capture && capture.exitCode === null) {
    capture.stdin.write("q\n");
    await waitForExit(capture, 10_000).catch(() => capture.kill());
  }
  if (captureLog) await captureLog.close().catch(() => {});
  if (browser) await browser.close();
  server.kill();
}

process.stdout.write([
  `Recorded the visible Windows desktop: ${rawDesktopPath}`,
  `Rendered the real YC workflow: ${finalVideoPath}`,
  `Updated the canonical demo: ${canonicalVideoPath}`,
  `Captured the approval frame: ${approvalPath}`,
  `Captured the final dashboard: ${posterPath}`
].join("\n") + "\n");
