import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(projectDirectory, "public");
const outputDirectory = resolve(projectDirectory, "out");
const compositionDurationMs = 55_000;

const configs = [
  {
    id: "productloop",
    output: "productloop-os-ecosystem-overview",
    scenes: ["hook", "modules", "default", "approval", "bridges", "maqam", "boundaries", "final"],
    factsSchema: "productloop.video.facts/v1",
  },
  {
    id: "crawler",
    output: "maqam-crawler-governed-research",
    scenes: ["hook", "limits", "network", "scope", "output", "detail", "gateway", "final"],
    factsSchema: "maqam.crawler.video.facts/v1",
  },
];

const waveDurationMs = (buffer, label) => {
  if (
    buffer.length <= 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(`${label} is not a non-empty RIFF/WAVE asset.`);
  }
  let byteRate = null;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + size > buffer.length) throw new Error(`${label} has a truncated ${id} chunk.`);
    if (id === "fmt " && size >= 12) byteRate = buffer.readUInt32LE(dataOffset + 8);
    if (id === "data") dataBytes += size;
    offset = dataOffset + size + (size % 2);
  }
  if (!Number.isFinite(byteRate) || byteRate <= 0 || dataBytes <= 0) {
    throw new Error(`${label} is missing a valid format or data chunk.`);
  }
  return (dataBytes / byteRate) * 1000;
};

for (const config of configs) {
  const [captions, scenes, metadata, facts, audio, script, srt, vtt] = await Promise.all([
    readFile(resolve(publicDirectory, `${config.id}-captions.json`), "utf8").then(JSON.parse),
    readFile(resolve(publicDirectory, `${config.id}-scenes.json`), "utf8").then(JSON.parse),
    readFile(resolve(publicDirectory, `${config.id}-voiceover-metadata.json`), "utf8").then(JSON.parse),
    readFile(resolve(publicDirectory, `${config.id}-facts.json`), "utf8").then(JSON.parse),
    readFile(resolve(publicDirectory, `${config.id}-voiceover.wav`)),
    readFile(resolve(projectDirectory, "scripts", `${config.id}-voiceover-script.json`), "utf8").then(JSON.parse),
    readFile(resolve(outputDirectory, `${config.output}.srt`), "utf8"),
    readFile(resolve(outputDirectory, `${config.output}.vtt`), "utf8"),
  ]);

  if (
    metadata.provider !== "Microsoft System.Speech (local Windows SAPI)" ||
    metadata.cloudServiceUsed !== false ||
    metadata.assetId !== config.id ||
    metadata.rate !== 4 ||
    metadata.volume !== 96 ||
    !Number.isFinite(metadata.durationMs) ||
    metadata.durationMs < 45_000 ||
    metadata.durationMs > compositionDurationMs
  ) {
    throw new Error(`${config.id} voiceover metadata is invalid.`);
  }
  const actualDuration = waveDurationMs(audio, `${config.id}-voiceover.wav`);
  if (Math.abs(actualDuration - metadata.durationMs) > 2) {
    throw new Error(`${config.id} audio duration does not match metadata.`);
  }

  if (!Array.isArray(captions) || captions.length < 100) {
    throw new Error(`${config.id} captions are missing or unexpectedly short.`);
  }
  captions.forEach((caption, index) => {
    if (
      typeof caption.text !== "string" ||
      typeof caption.startMs !== "number" ||
      typeof caption.endMs !== "number" ||
      caption.startMs < 0 ||
      caption.endMs <= caption.startMs ||
      caption.endMs > metadata.durationMs ||
      caption.timestampMs !== null ||
      caption.confidence !== null ||
      (index > 0 && caption.startMs < captions[index - 1].startMs)
    ) {
      throw new Error(`${config.id} caption ${index} is invalid.`);
    }
  });

  if (!Array.isArray(script) || !Array.isArray(scenes) || scenes.length !== config.scenes.length) {
    throw new Error(`${config.id} script or scene timing is invalid.`);
  }
  scenes.forEach((scene, index) => {
    if (
      script[index]?.scene !== config.scenes[index] ||
      scene.scene !== config.scenes[index] ||
      scene.startMs !== (index === 0 ? 0 : scenes[index - 1].endMs) ||
      scene.endMs <= scene.startMs ||
      scene.endMs > compositionDurationMs ||
      scene.narrationStartMs < scene.startMs ||
      scene.narrationEndMs > scene.endMs
    ) {
      throw new Error(`${config.id} scene ${index} is invalid or not contiguous.`);
    }
  });
  if (scenes.at(-1)?.endMs !== compositionDurationMs) {
    throw new Error(`${config.id} final scene does not fill the 55-second composition.`);
  }

  if (
    facts.schema !== config.factsSchema ||
    !/^[a-f0-9]{64}$/.test(facts.source?.fingerprint || "") ||
    typeof facts.source?.commit !== "string"
  ) {
    throw new Error(`${config.id} source facts are invalid.`);
  }
  if (
    config.id === "productloop" &&
    (
      facts.modules?.length !== 9 ||
      facts.claims?.defaultDenyComposition !== true ||
      facts.claims?.explicitMaqamCrawlerAdapter !== true ||
      facts.claims?.automaticToolRegistration !== false ||
      facts.claims?.sharedDistributedTransaction !== false ||
      facts.claims?.bundledModelOrLiveBrowser !== false
    )
  ) {
    throw new Error("ProductLoop facts do not support the narrated boundaries.");
  }
  if (
    config.id === "crawler" &&
    (
      facts.claims?.transport !== "http-html" ||
      facts.claims?.browserJavaScriptExecution !== false ||
      facts.claims?.robotsDefault !== true ||
      facts.claims?.sameOriginDefault !== true ||
      facts.claims?.publicNetworkDefault !== true ||
      facts.claims?.redirectValidation !== true ||
      facts.claims?.dnsPinning !== true ||
      facts.claims?.governedEffect !== "network:read"
    )
  ) {
    throw new Error("Crawler facts do not support the narrated boundaries.");
  }
  if (!/^1\r?\n00:00:/u.test(srt) || !vtt.startsWith("WEBVTT\n\n")) {
    throw new Error(`${config.id} portable captions are invalid.`);
  }

  process.stdout.write(
    `${config.id}: ${metadata.durationMs} ms SAPI, ${captions.length} captions, ${scenes.length} scenes, facts ${facts.source.fingerprint.slice(0, 12)}.\n`,
  );
}
