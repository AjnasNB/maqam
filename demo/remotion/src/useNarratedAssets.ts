import type { Caption } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";

export type NarrationId = "productloop" | "crawler";

export type NarrationScene = {
  readonly scene: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly narrationStartMs: number;
  readonly narrationEndMs: number;
};

type NarratedAssets = {
  readonly captions: readonly Caption[];
  readonly scenes: readonly NarrationScene[];
  readonly durationMs: number;
  readonly audioFile: string;
};

type VoiceoverMetadata = {
  readonly provider: string;
  readonly durationMs: number;
  readonly cloudServiceUsed: boolean;
  readonly assetId: string;
};

const COMPOSITION_DURATION_MS = 55_000;

const expectedScenes: Record<NarrationId, readonly string[]> = {
  productloop: ["hook", "modules", "default", "approval", "bridges", "maqam", "boundaries", "final"],
  crawler: ["hook", "limits", "network", "scope", "output", "detail", "gateway", "final"],
};

const isCaptionArray = (value: unknown): value is Caption[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (caption, index) =>
      caption !== null &&
      typeof caption === "object" &&
      typeof caption.text === "string" &&
      typeof caption.startMs === "number" &&
      caption.startMs >= 0 &&
      typeof caption.endMs === "number" &&
      caption.endMs > caption.startMs &&
      caption.endMs <= COMPOSITION_DURATION_MS &&
      caption.timestampMs === null &&
      caption.confidence === null &&
      (index === 0 || caption.startMs >= value[index - 1].startMs),
  );

const isMetadata = (value: unknown, id: NarrationId): value is VoiceoverMetadata => {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<VoiceoverMetadata>;
  return (
    metadata.provider === "Microsoft System.Speech (local Windows SAPI)" &&
    metadata.cloudServiceUsed === false &&
    metadata.assetId === id &&
    typeof metadata.durationMs === "number" &&
    metadata.durationMs >= 45_000 &&
    metadata.durationMs <= COMPOSITION_DURATION_MS
  );
};

const isFacts = (value: unknown, id: NarrationId): boolean => {
  if (!value || typeof value !== "object") return false;
  const facts = value as { schema?: unknown; source?: { fingerprint?: unknown } };
  return (
    facts.schema === (id === "productloop"
      ? "productloop.video.facts/v1"
      : "maqam.crawler.video.facts/v1") &&
    typeof facts.source?.fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(facts.source.fingerprint)
  );
};

const isSceneArray = (value: unknown, id: NarrationId): value is NarrationScene[] => {
  if (!Array.isArray(value) || value.length !== expectedScenes[id].length) return false;
  return value.every((scene, index) => {
    if (!scene || typeof scene !== "object") return false;
    const candidate = scene as Partial<NarrationScene>;
    return (
      candidate.scene === expectedScenes[id][index] &&
      typeof candidate.startMs === "number" &&
      typeof candidate.endMs === "number" &&
      typeof candidate.narrationStartMs === "number" &&
      typeof candidate.narrationEndMs === "number" &&
      candidate.startMs >= 0 &&
      candidate.endMs > candidate.startMs &&
      candidate.endMs <= COMPOSITION_DURATION_MS &&
      candidate.narrationStartMs >= candidate.startMs &&
      candidate.narrationEndMs <= candidate.endMs &&
      (index === 0 ? candidate.startMs === 0 : candidate.startMs === value[index - 1].endMs)
    );
  });
};

const waveDurationMs = (buffer: ArrayBuffer): number | null => {
  if (buffer.byteLength <= 44) return null;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WAVE") return null;
  let byteRate: number | null = null;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const chunkId = ascii(offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + size > buffer.byteLength) return null;
    if (chunkId === "fmt " && size >= 12) byteRate = view.getUint32(dataOffset + 8, true);
    if (chunkId === "data") dataBytes += size;
    offset = dataOffset + size + (size % 2);
  }
  return byteRate && dataBytes ? (dataBytes / byteRate) * 1000 : null;
};

export const useNarratedAssets = (id: NarrationId): NarratedAssets | null => {
  const [assets, setAssets] = useState<NarratedAssets | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading ${id} narration assets`));

  const load = useCallback(async () => {
    try {
      const audioFile = `${id}-voiceover.wav`;
      const [captionsResponse, scenesResponse, metadataResponse, factsResponse, audioResponse] = await Promise.all([
        fetch(staticFile(`${id}-captions.json`)),
        fetch(staticFile(`${id}-scenes.json`)),
        fetch(staticFile(`${id}-voiceover-metadata.json`)),
        fetch(staticFile(`${id}-facts.json`)),
        fetch(staticFile(audioFile)),
      ]);
      if (
        !captionsResponse.ok ||
        !scenesResponse.ok ||
        !metadataResponse.ok ||
        !factsResponse.ok ||
        !audioResponse.ok
      ) {
        throw new Error(`${id} render requires generated captions, scenes, metadata, and audio.`);
      }
      const [captions, scenes, metadata, facts, audio] = await Promise.all([
        captionsResponse.json() as Promise<unknown>,
        scenesResponse.json() as Promise<unknown>,
        metadataResponse.json() as Promise<unknown>,
        factsResponse.json() as Promise<unknown>,
        audioResponse.arrayBuffer(),
      ]);
      if (!isCaptionArray(captions)) throw new Error(`${id} captions are invalid.`);
      if (!isSceneArray(scenes, id)) throw new Error(`${id} scene timing is invalid.`);
      if (!isMetadata(metadata, id)) throw new Error(`${id} voiceover metadata is invalid.`);
      if (!isFacts(facts, id)) throw new Error(`${id} source facts are invalid.`);
      const actualDurationMs = waveDurationMs(audio);
      if (actualDurationMs === null || Math.abs(actualDurationMs - metadata.durationMs) > 2) {
        throw new Error(`${id} WAVE duration does not match its metadata.`);
      }
      setAssets({ captions, scenes, durationMs: metadata.durationMs, audioFile });
      continueRender(handle);
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [cancelRender, continueRender, handle, id]);

  useEffect(() => {
    void load();
  }, [load]);

  return assets;
};

export { COMPOSITION_DURATION_MS };
