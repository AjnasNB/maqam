const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

export const MEDIA_OBJECTS = Object.freeze({
  "/media/maqam-exact-approval-demo.mp4": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4",
    contentType: "video/mp4"
  }),
  "/media/maqam-demo-poster.png": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-demo-poster.png",
    contentType: "image/png"
  }),
  "/media/maqam-exact-approval-demo.vtt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt",
    contentType: "text/vtt; charset=utf-8"
  }),
  "/media/maqam-exact-approval-demo.srt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.srt",
    contentType: "application/x-subrip; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4",
    contentType: "video/mp4"
  }),
  "/media/releases/maqam/v0.2.4/maqam-demo-poster.png": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-demo-poster.png",
    contentType: "image/png"
  }),
  "/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt",
    contentType: "text/vtt; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.srt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-exact-approval-demo.srt",
    contentType: "application/x-subrip; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.mp4": Object.freeze({
    key: "releases/maqam/v0.2.4/productloop-os-ecosystem-overview.mp4",
    contentType: "video/mp4"
  }),
  "/media/releases/maqam/v0.2.4/productloop-os-ecosystem-poster.png": Object.freeze({
    key: "releases/maqam/v0.2.4/productloop-os-ecosystem-poster.png",
    contentType: "image/png"
  }),
  "/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.vtt": Object.freeze({
    key: "releases/maqam/v0.2.4/productloop-os-ecosystem-overview.vtt",
    contentType: "text/vtt; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.srt": Object.freeze({
    key: "releases/maqam/v0.2.4/productloop-os-ecosystem-overview.srt",
    contentType: "application/x-subrip; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.mp4": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-crawler-governed-research.mp4",
    contentType: "video/mp4"
  }),
  "/media/releases/maqam/v0.2.4/maqam-crawler-governed-research-poster.png": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-crawler-governed-research-poster.png",
    contentType: "image/png"
  }),
  "/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.vtt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-crawler-governed-research.vtt",
    contentType: "text/vtt; charset=utf-8"
  }),
  "/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.srt": Object.freeze({
    key: "releases/maqam/v0.2.4/maqam-crawler-governed-research.srt",
    contentType: "application/x-subrip; charset=utf-8"
  }),
  "/media/01-scope-mismatch.png": Object.freeze({
    key: "releases/maqam/v0.2.4/01-scope-mismatch.png",
    contentType: "image/png"
  }),
  "/media/02-exact-execution.png": Object.freeze({
    key: "releases/maqam/v0.2.4/02-exact-execution.png",
    contentType: "image/png"
  }),
  "/media/03-evidence-linked.png": Object.freeze({
    key: "releases/maqam/v0.2.4/03-evidence-linked.png",
    contentType: "image/png"
  }),
  "/media/04-benchmark-method.png": Object.freeze({
    key: "releases/maqam/v0.2.4/04-benchmark-method.png",
    contentType: "image/png"
  }),
  "/media/05-ecosystem-boundary.png": Object.freeze({
    key: "releases/maqam/v0.2.4/05-ecosystem-boundary.png",
    contentType: "image/png"
  }),
  "/media/mges-performance.json": Object.freeze({
    key: "releases/maqam/v0.2.4/mges-performance-windows-node24.json",
    contentType: "application/json; charset=utf-8"
  }),
  "/media/mges-conformance.json": Object.freeze({
    key: "releases/maqam/v0.2.4/mges-conformance-windows-node24.json",
    contentType: "application/json; charset=utf-8"
  })
});

const withSecurityHeaders = (response) => {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(name, value);
  }
  return secured;
};

const parseEtags = (value) => value
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const weakTag = (value) => value.replace(/^W\//, "");

const weakEtagMatches = (header, current) => {
  const tags = parseEtags(header);
  return tags.includes("*") || tags.some((tag) => weakTag(tag) === weakTag(current));
};

const strongEtagMatches = (header, current) => {
  const tags = parseEtags(header);
  return tags.includes("*") || tags.some((tag) => !tag.startsWith("W/") && tag === current);
};

const parseHttpDate = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const uploadedAtSecond = (metadata) => Math.floor(metadata.uploaded.getTime() / 1000) * 1000;

const preconditionStatus = (request, metadata) => {
  const ifMatch = request.headers.get("If-Match");
  if (ifMatch && !strongEtagMatches(ifMatch, metadata.httpEtag)) return 412;

  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since");
  if (!ifMatch && ifUnmodifiedSince) {
    const date = parseHttpDate(ifUnmodifiedSince);
    if (date !== null && uploadedAtSecond(metadata) > date) return 412;
  }

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && weakEtagMatches(ifNoneMatch, metadata.httpEtag)) return 304;

  const ifModifiedSince = request.headers.get("If-Modified-Since");
  if (!ifNoneMatch && ifModifiedSince) {
    const date = parseHttpDate(ifModifiedSince);
    if (date !== null && uploadedAtSecond(metadata) <= date) return 304;
  }

  return null;
};

export const parseByteRange = (value, size) => {
  if (!value || !value.startsWith("bytes=")) return null;

  const expression = value.slice(6).trim();
  if (!expression || expression.includes(",") || !/^\d*-\d*$/.test(expression)) {
    return { invalid: true };
  }

  const [startText, endText] = expression.split("-");
  if (!startText && !endText) return { invalid: true };

  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size <= 0) return { invalid: true };
    const length = Math.min(suffix, size);
    return { offset: size - length, length, end: size - 1 };
  }

  const offset = Number(startText);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) return { invalid: true };

  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return { invalid: true };

  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
};

const ifRangeAllowsRange = (request, metadata) => {
  const value = request.headers.get("If-Range");
  if (!value) return true;
  if (value.startsWith("W/")) return false;
  if (value.startsWith("\"")) return value === metadata.httpEtag;
  const date = parseHttpDate(value);
  return date !== null && uploadedAtSecond(metadata) <= date;
};

const mediaHeaders = (metadata, descriptor) => {
  const headers = new Headers();
  metadata.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Type", descriptor.contentType);
  headers.set("ETag", metadata.httpEtag);
  headers.set("Last-Modified", metadata.uploaded.toUTCString());
  return headers;
};

export const serveMedia = async (request, env, descriptor) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withSecurityHeaders(new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    }));
  }

  const metadata = await env.MEDIA.head(descriptor.key);
  if (!metadata) return withSecurityHeaders(new Response("Media not found", { status: 404 }));

  const headers = mediaHeaders(metadata, descriptor);
  const condition = preconditionStatus(request, metadata);
  if (condition !== null) {
    return withSecurityHeaders(new Response(null, { status: condition, headers }));
  }

  const requestedRange = parseByteRange(request.headers.get("Range"), metadata.size);
  const range = requestedRange && ifRangeAllowsRange(request, metadata) ? requestedRange : null;
  if (range?.invalid) {
    headers.set("Content-Range", `bytes */${metadata.size}`);
    headers.set("Content-Length", "0");
    return withSecurityHeaders(new Response(null, { status: 416, headers }));
  }

  const partial = Boolean(range);
  if (partial) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${metadata.size}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(metadata.size));
  }

  if (request.method === "HEAD") {
    return withSecurityHeaders(new Response(null, {
      status: partial ? 206 : 200,
      headers
    }));
  }

  const options = { onlyIf: { etagMatches: metadata.etag } };
  if (partial) options.range = { offset: range.offset, length: range.length };

  const object = await env.MEDIA.get(descriptor.key, options);
  if (!object) return withSecurityHeaders(new Response("Media not found", { status: 404 }));
  if (!("body" in object)) return withSecurityHeaders(new Response("Media changed during request", { status: 412 }));

  return withSecurityHeaders(new Response(object.body, {
    status: partial ? 206 : 200,
    headers
  }));
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() === "www.maqamagent.com") {
      url.protocol = "https:";
      url.hostname = "maqamagent.com";
      url.port = "";
      return withSecurityHeaders(new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "public, max-age=3600",
          Location: url.toString()
        }
      }));
    }

    const descriptor = MEDIA_OBJECTS[url.pathname];
    if (descriptor) return serveMedia(request, env, descriptor);
    if (url.pathname.startsWith("/media/")) {
      return withSecurityHeaders(new Response("Media not found", { status: 404 }));
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" }
      }));
    }

    const asset = await env.ASSETS.fetch(request);
    const response = withSecurityHeaders(asset);
    const type = response.headers.get("Content-Type") || "";
    if (type.includes("text/html")) {
      response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    }
    return response;
  }
};
