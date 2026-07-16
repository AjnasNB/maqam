import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const captions = JSON.parse(
  await readFile(resolve(projectDirectory, "public", "captions.json"), "utf8"),
);
const script = JSON.parse(
  await readFile(resolve(projectDirectory, "scripts", "voiceover-script.json"), "utf8"),
);

if (!Array.isArray(captions) || captions.length === 0 || !Array.isArray(script)) {
  throw new Error("Generated captions and the authored voiceover script are required.");
}

let captionIndex = 0;
const cues = script.map((segment, segmentIndex) => {
  const wordCount = String(segment.text).trim().split(/\s+/).length;
  const first = captions[captionIndex];
  const last = captions[captionIndex + wordCount - 1];
  if (!first || !last) {
    throw new Error(`Caption timing is missing for voiceover segment ${segmentIndex + 1}.`);
  }
  captionIndex += wordCount;
  return {
    startMs: first.startMs,
    endMs: last.endMs,
    text: String(segment.text).trim(),
  };
});

if (captionIndex !== captions.length) {
  throw new Error(
    `Authored script consumed ${captionIndex} caption words, but captions.json has ${captions.length}.`,
  );
}

const timecode = (milliseconds, separator) => {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
};

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

const outputDirectory = resolve(projectDirectory, "out");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "maqam-exact-approval-demo.srt"), `${srt}\n`, "utf8"),
  writeFile(resolve(outputDirectory, "maqam-exact-approval-demo.vtt"), vtt, "utf8"),
]);

process.stdout.write(`Exported ${cues.length} portable caption cues to out/.\n`);
