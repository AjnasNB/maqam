import { MEDIA_OBJECTS } from "../src/index.js";

const origin = new URL(process.env.MAQAM_SITE_ORIGIN || "https://maqamagent.com");
const entries = Object.entries(MEDIA_OBJECTS);

const results = await Promise.all(entries.map(async ([pathname, descriptor]) => {
  const url = new URL(pathname, origin);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "maqam-live-media-check/1.0" }
    });
    const expectedType = descriptor.contentType.split(";")[0];
    const actualType = (response.headers.get("content-type") || "").split(";")[0];
    const length = Number(response.headers.get("content-length") || 0);
    const encoding = response.headers.get("content-encoding");
    const errors = [];
    if (response.status !== 200) errors.push(`status ${response.status}`);
    if (actualType !== expectedType) errors.push(`content-type ${actualType || "missing"}, expected ${expectedType}`);
    if ((!Number.isFinite(length) || length <= 0) && !encoding) errors.push("missing positive content-length");
    return { pathname, errors };
  } catch (error) {
    return { pathname, errors: [error instanceof Error ? error.message : String(error)] };
  }
}));

const failures = results.filter(({ errors }) => errors.length > 0);
if (failures.length > 0) {
  console.error(`Live media check failed for ${failures.length} of ${entries.length} registered paths:`);
  for (const { pathname, errors } of failures) console.error(`- ${pathname}: ${errors.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log(`Live media check passed: ${entries.length} registered paths returned the expected non-empty content.`);
}
