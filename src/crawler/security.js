import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

// Link-local space is intentionally never covered by the broad private-network
// opt-in because it includes cloud metadata endpoints such as 169.254.169.254.
const EXPLICIT_PRIVATE_RANGES = new Set(["private", "loopback", "uniqueLocal"]);

function stripIpv6Brackets(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function normalizeHostname(hostname) {
  return stripIpv6Brackets(hostname).replace(/\.$/, "").toLowerCase();
}

function securityError(message, details = {}) {
  const error = new Error(message);
  error.name = "CrawlerSecurityError";
  error.code = "CRAWLER_URL_BLOCKED";
  error.details = details;
  return error;
}

export function classifyIpAddress(value) {
  const input = stripIpv6Brackets(String(value || ""));
  if (!ipaddr.isValid(input)) {
    return { address: input, family: 0, range: "invalid", isPublic: false };
  }

  let address = ipaddr.parse(input);
  if (address.kind() === "ipv6" && address.isIPv4MappedAddress()) {
    address = address.toIPv4Address();
  }
  const range = address.range();
  return {
    address: address.toString(),
    family: address.kind() === "ipv4" ? 4 : 6,
    range,
    isPublic: range === "unicast"
  };
}

export function isPublicIpAddress(value) {
  return classifyIpAddress(value).isPublic;
}

function normalizeLookupResults(result) {
  const values = Array.isArray(result) ? result : [result];
  return values.map((item) => {
    if (typeof item === "string") {
      return { address: item, family: isIP(stripIpv6Brackets(item)) };
    }
    return {
      address: item?.address,
      family: Number(item?.family) || isIP(stripIpv6Brackets(item?.address || ""))
    };
  }).filter((item) => item.address && (item.family === 4 || item.family === 6));
}

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new Error("DNS resolution was aborted."));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new Error("DNS resolution was aborted."));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function resolveUrlTarget(value, options = {}) {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw securityError(`Protocol '${url.protocol}' is not allowed.`, { url: url.toString() });
  }
  if (url.username || url.password) {
    throw securityError("URLs containing embedded credentials are not allowed.", {
      origin: url.origin
    });
  }

  const hostname = normalizeHostname(url.hostname);
  const literalFamily = isIP(hostname);
  const lookup = options.lookup || defaultLookup;
  let addresses;
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = normalizeLookupResults(await withAbort(Promise.resolve(lookup(hostname, {
        all: true,
        verbatim: true
      })), options.signal));
    } catch (cause) {
      const error = securityError(`DNS resolution failed for '${hostname}'.`, { hostname });
      error.cause = cause;
      throw error;
    }
  }

  if (!addresses.length) {
    throw securityError(`DNS resolution returned no usable addresses for '${hostname}'.`, { hostname });
  }

  const classified = addresses.map((entry) => ({
    ...entry,
    ...classifyIpAddress(entry.address)
  }));
  {
    const blocked = classified.find((entry) => (
      !entry.isPublic
      && !(options.allowPrivateNetworks && EXPLICIT_PRIVATE_RANGES.has(entry.range))
    ));
    if (blocked) {
      throw securityError(`Address range '${blocked.range}' is not allowed for crawler requests.`, {
        hostname,
        address: blocked.address,
        range: blocked.range
      });
    }
  }

  return {
    url,
    hostname,
    address: classified[0].address,
    family: classified[0].family,
    addresses: classified
  };
}

function createPinnedDispatcher(target) {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (normalizeHostname(hostname) !== target.hostname) {
          callback(securityError("Crawler connection attempted an unvalidated hostname.", {
            expectedHostname: target.hostname,
            actualHostname: normalizeHostname(hostname)
          }));
          return;
        }
        if (options?.all) {
          callback(null, [{ address: target.address, family: target.family }]);
          return;
        }
        callback(null, target.address, target.family);
      }
    }
  });
}

export async function withPinnedFetch(value, requestOptions, securityOptions, consume) {
  const target = await resolveUrlTarget(value, securityOptions);
  const dispatcher = createPinnedDispatcher(target);
  let response = null;
  try {
    response = await undiciFetch(target.url, {
      ...requestOptions,
      redirect: "manual",
      dispatcher
    });
    return await consume(response, target);
  } catch (error) {
    try {
      await response?.body?.cancel();
    } catch {
      // The dispatcher is closed below even if cancellation itself fails.
    }
    throw error;
  } finally {
    await dispatcher.close();
  }
}

export { securityError as createCrawlerSecurityError };
