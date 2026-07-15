import type { Server } from "node:http";
import type { AgentHandler, CrawlOptions, CrawlPage } from "../index.js";

export interface MaqamProduct {
  name: string;
  tagline: string;
  description: string;
}

export interface MaqamAdapterCapability {
  id: string;
  name: string;
  boundary: string;
  preventive: string;
  observed: string;
  defaultPosture: string;
}

export interface MaqamCapabilities {
  adapters: MaqamAdapterCapability[];
  controls: string[];
  limitations: string[];
}

export interface MaqamServerOptions {
  publicDir?: string;
  crawlerTool?: AgentHandler<CrawlOptions, CrawlPage[]>;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  allowedUiOrigins?: string[];
  apiToken?: string | null;
  allowPrivateNetworks?: boolean;
  allowCrossOriginCrawls?: boolean;
  maxSeeds?: number;
  port?: number;
  host?: string;
}

export const MAQAM_PRODUCT: MaqamProduct;
export const MAQAM_CAPABILITIES: MaqamCapabilities;
export function createMaqamServer(options?: MaqamServerOptions): Server;
export function startMaqamServer(options?: MaqamServerOptions): Server;
