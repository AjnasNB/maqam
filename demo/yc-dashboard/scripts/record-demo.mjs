import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const artifactDirectory = resolve(demoDirectory, "artifacts");
const rawDirectory = resolve(artifactDirectory, ".recordings");
const rawVideoPath = resolve(artifactDirectory, "maqam-yc-control-plane-demo.webm");
const finalVideoPath = resolve(artifactDirectory, "maqam-yc-control-plane-demo.mp4");
const posterPath = resolve(artifactDirectory, "maqam-yc-control-plane-poster.png");
const port = 4188;
const url = `http://127.0.0.1:${port}/?autoplay=1`;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await rm(rawDirectory, { recursive: true, force: true });
await mkdir(rawDirectory, { recursive: true });
const server = spawn(
  process.execPath,
  [resolve(scriptDirectory, "serve.mjs"), `--port=${port}`],
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process may still be binding the port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(serverError || "The demo server did not become ready.");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: rawDirectory,
      size: { width: 1920, height: 1080 }
    },
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
  await page.locator('#app[data-state="complete"]').waitFor({
    state: "attached",
    timeout: 70_000
  });
  await page.locator("#final-frame.visible").waitFor({
    state: "visible",
    timeout: 10_000
  });
  await page.waitForTimeout(1_800);
  await page.screenshot({ path: posterPath, fullPage: false });
  const video = page.video();
  await context.close();
  if (!video) throw new Error("Playwright did not create a browser recording.");
  const generatedVideo = await video.path();
  await copyFile(generatedVideo, rawVideoPath);
  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

const conversion = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i", rawVideoPath,
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
  throw new Error(conversion.stderr || `ffmpeg exited with ${conversion.status}.`);
}

await rm(rawDirectory, { recursive: true, force: true });
process.stdout.write([
  `Recorded live dashboard: ${rawVideoPath}`,
  `Rendered silent YC demo: ${finalVideoPath}`,
  `Captured poster: ${posterPath}`
].join("\n") + "\n");
