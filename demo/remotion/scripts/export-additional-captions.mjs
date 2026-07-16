import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(projectDirectory, "public");
const outputDirectory = resolve(projectDirectory, "out");
const compositionDurationMs = 55_000;

const videos = [
  {
    id: "productloop",
    script: "productloop-voiceover-script.json",
    output: "productloop-os-ecosystem-overview",
  },
  {
    id: "crawler",
    script: "crawler-voiceover-script.json",
    output: "maqam-crawler-governed-research",
  },
];

const presentationText = (value) =>
  String(value)
    .trim()
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ""));

const timecode = (milliseconds, separator) => {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
};

await mkdir(outputDirectory, { recursive: true });

for (const video of videos) {
  const captions = JSON.parse(
    await readFile(resolve(publicDirectory, `${video.id}-captions.json`), "utf8"),
  );
  const script = JSON.parse(
    await readFile(resolve(projectDirectory, "scripts", video.script), "utf8"),
  );
  if (!Array.isArray(captions) || captions.length === 0 || !Array.isArray(script)) {
    throw new Error(`${video.id} captions and voiceover script are required.`);
  }

  let captionIndex = 0;
  const cues = script.map((segment, segmentIndex) => {
    const wordCount = presentationText(segment.text).split(/\s+/).length;
    const first = captions[captionIndex];
    const last = captions[captionIndex + wordCount - 1];
    if (!first || !last) {
      throw new Error(`${video.id} caption timing is missing for segment ${segmentIndex + 1}.`);
    }
    captionIndex += wordCount;
    return {
      scene: segment.scene,
      startMs: first.startMs,
      endMs: last.endMs,
      text: presentationText(segment.text),
    };
  });
  if (captionIndex !== captions.length) {
    throw new Error(
      `${video.id} script consumed ${captionIndex} caption words, but captions JSON has ${captions.length}.`,
    );
  }

  const scenes = cues.map((cue, index) => ({
    scene: cue.scene,
    startMs: index === 0 ? 0 : cue.startMs,
    endMs: index + 1 < cues.length ? cues[index + 1].startMs : compositionDurationMs,
    narrationStartMs: cue.startMs,
    narrationEndMs: cue.endMs,
  }));
  if (scenes.some((scene) => scene.endMs <= scene.startMs || scene.endMs > compositionDurationMs)) {
    throw new Error(`${video.id} generated invalid scene timing.`);
  }

  const srt = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timecode(cue.startMs, ",")} --> ${timecode(cue.endMs, ",")}\n${cue.text}`,
    )
    .join("\n\n");
  const vtt = `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${timecode(cue.startMs, ".")} --> ${timecode(cue.endMs, ".")}\n${cue.text}`,
    )
    .join("\n\n")}\n`;

  await Promise.all([
    writeFile(resolve(outputDirectory, `${video.output}.srt`), `${srt}\n`, "utf8"),
    writeFile(resolve(outputDirectory, `${video.output}.vtt`), vtt, "utf8"),
    writeFile(
      resolve(publicDirectory, `${video.id}-scenes.json`),
      `${JSON.stringify(scenes, null, 2)}\n`,
      "utf8",
    ),
  ]);
  process.stdout.write(
    `Exported ${video.id}: ${cues.length} portable cues and ${scenes.length} timed scenes.\n`,
  );
}
