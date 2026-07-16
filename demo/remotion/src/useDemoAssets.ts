import type { Caption } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { isBenchmarkProof, type BenchmarkProof } from "./benchmark";
import { isDemoProof, type DemoProof } from "./proof";

type DemoAssets = {
  readonly proof: DemoProof;
  readonly benchmark: BenchmarkProof;
  readonly captions: readonly Caption[];
  readonly voiceoverAvailable: true;
};

type VoiceoverMetadata = {
  readonly provider: string;
  readonly durationMs: number;
  readonly cloudServiceUsed: boolean;
};

const isCaptionArray = (value: unknown): value is Caption[] => {
  return (
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
        caption.endMs <= 60000 &&
        (index === 0 || caption.startMs >= value[index - 1].startMs),
    )
  );
};

const isVoiceoverMetadata = (value: unknown): value is VoiceoverMetadata => {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<VoiceoverMetadata>;
  return (
    metadata.provider === "Microsoft System.Speech (local Windows SAPI)" &&
    metadata.cloudServiceUsed === false &&
    typeof metadata.durationMs === "number" &&
    metadata.durationMs > 0 &&
    metadata.durationMs <= 59800
  );
};

const waveDurationMs = (buffer: ArrayBuffer): number | null => {
  if (buffer.byteLength <= 44) return null;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WAVE") return null;

  let byteRate: number | null = null;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const id = ascii(offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + size > buffer.byteLength) return null;
    if (id === "fmt " && size >= 12) byteRate = view.getUint32(dataOffset + 8, true);
    if (id === "data") dataBytes += size;
    offset = dataOffset + size + (size % 2);
  }
  if (byteRate === null || byteRate <= 0 || dataBytes <= 0) return null;
  return (dataBytes / byteRate) * 1000;
};

export const useDemoAssets = (): DemoAssets | null => {
  const [assets, setAssets] = useState<DemoAssets | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading verified Maqam proof assets"));

  const load = useCallback(async () => {
    try {
      const [
        proofResponse,
        benchmarkResponse,
        captionsResponse,
        voiceoverResponse,
        metadataResponse,
      ] =
        await Promise.all([
          fetch(staticFile("demo-proof.json")),
          fetch(staticFile("benchmark-proof.json")),
          fetch(staticFile("captions.json")),
          fetch(staticFile("voiceover.wav")),
          fetch(staticFile("voiceover-metadata.json")),
        ]);

      if (
        !proofResponse.ok ||
        !benchmarkResponse.ok ||
        !captionsResponse.ok ||
        !voiceoverResponse.ok ||
        !metadataResponse.ok
      ) {
        throw new Error(
          "Release render requires generated CLI proof, benchmark proof, captions, voiceover, and voiceover metadata.",
        );
      }

      const [
        loadedProof,
        loadedBenchmark,
        loadedCaptions,
        voiceoverBuffer,
        loadedMetadata,
      ]: [
        unknown,
        unknown,
        unknown,
        ArrayBuffer,
        unknown,
      ] = await Promise.all([
        proofResponse.json(),
        benchmarkResponse.json(),
        captionsResponse.json(),
        voiceoverResponse.arrayBuffer(),
        metadataResponse.json(),
      ]);

      if (!isDemoProof(loadedProof)) {
        throw new Error("demo-proof.json is not the reviewed deterministic Maqam CLI proof.");
      }
      if (!isBenchmarkProof(loadedBenchmark)) {
        throw new Error("benchmark-proof.json is not the reviewed MGES evidence summary.");
      }
      if (!isCaptionArray(loadedCaptions)) {
        throw new Error("captions.json is missing or has invalid caption timings.");
      }
      const audioDurationMs = waveDurationMs(voiceoverBuffer);
      if (audioDurationMs === null) {
        throw new Error("voiceover.wav is missing or is not a valid RIFF/WAVE asset.");
      }
      if (!isVoiceoverMetadata(loadedMetadata)) {
        throw new Error("voiceover-metadata.json does not describe the expected local SAPI asset.");
      }
      if (Math.abs(audioDurationMs - loadedMetadata.durationMs) > 2) {
        throw new Error("voiceover.wav duration does not match voiceover-metadata.json.");
      }

      setAssets({
        proof: loadedProof,
        benchmark: loadedBenchmark,
        captions: loadedCaptions,
        voiceoverAvailable: true,
      });
      continueRender(handle);
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [cancelRender, continueRender, handle]);

  useEffect(() => {
    void load();
  }, [load]);

  return assets;
};
