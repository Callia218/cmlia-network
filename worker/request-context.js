import { clientIp, publicIp } from "./http.js";

function text(value, limit = 256) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function isLocalRequest(request) {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** Summarize this request only; browser headers remain self-reported values. */
export function requestContext(request, { local = false } = {}) {
  const cf =
    !local &&
    !isLocalRequest(request) &&
    request.cf &&
    typeof request.cf === "object" &&
    !Array.isArray(request.cf)
      ? request.cf
      : null;
  let ip = null;
  if (cf) {
    try {
      ip = publicIp(clientIp(request));
    } catch {
      // Missing, local and invalid addresses are unavailable, never examples.
    }
  }
  // Do not compare a truncated header with the complete browser value.
  const header = (name, limit = 1024) => {
    const value = request.headers.get(name);
    return value && value.length <= limit ? text(value, limit) : null;
  };

  return {
    observedAt: new Date().toISOString(),
    source: cf ? "cloudflare" : null,
    network: {
      ip,
      country: text(cf?.country),
      region: text(cf?.region),
      city: text(cf?.city),
      asn:
        Number.isInteger(cf?.asn) && cf.asn > 0 && cf.asn <= 4_294_967_295
          ? cf.asn
          : null,
      organization: text(cf?.asOrganization),
      timezone: text(cf?.timezone),
      colo: text(cf?.colo),
      httpProtocol: text(cf?.httpProtocol),
    },
    tls: {
      version: text(cf?.tlsVersion),
      cipher: text(cf?.tlsCipher),
      ja3: text(cf?.botManagement?.ja3Hash),
      ja4: text(cf?.botManagement?.ja4),
    },
    headers: {
      userAgent: header("User-Agent", 2048),
      acceptLanguage: header("Accept-Language"),
      secChUa: header("Sec-CH-UA"),
      secChUaPlatform: header("Sec-CH-UA-Platform"),
      secChUaMobile: header("Sec-CH-UA-Mobile"),
      dnt: header("DNT", 16),
      gpc: header("Sec-GPC", 16),
    },
    unavailable: ["tcpFingerprint", "tcpRoundTrip", "http2Fingerprint"],
  };
}
