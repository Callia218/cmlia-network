import { HttpError, target } from "./http.js";

const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;
const HEADER_NAMES = [
  "strict-transport-security",
  "content-security-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
];

function normalizeUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new HttpError(400, "请输入 HTTP 或 HTTPS URL");
  if (value.length > MAX_URL_LENGTH) throw new HttpError(400, "URL 过长");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HttpError(400, "请输入有效的 HTTP 或 HTTPS URL");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new HttpError(400, "仅支持 HTTP 和 HTTPS URL");
  if (url.username || url.password)
    throw new HttpError(400, "URL 不允许包含用户名或密码");
  if (
    url.port &&
    !(
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    )
  )
    throw new HttpError(400, "不支持自定义端口");
  // URL.hostname includes brackets for IPv6 literals in the Worker runtime.
  // Strip them before the shared public-target validator, then let URL restore
  // the canonical bracketed form when assigning the hostname back.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  url.hostname = target(hostname);
  url.port = "";
  url.hash = "";
  return url;
}

function headerSummary(headers) {
  return Object.fromEntries(
    HEADER_NAMES.map((name) => [name, headers.get(name) ?? null]),
  );
}

function responseSummary(response, startedAt) {
  const headers = response.headers;
  return {
    status: response.status,
    statusText: response.statusText,
    headers: headerSummary(headers),
    contentType: headers.get("content-type"),
    contentEncoding: headers.get("content-encoding"),
    cacheControl: headers.get("cache-control"),
    etag: headers.get("etag"),
    server: headers.get("server"),
    contentLength: headers.get("content-length"),
    responseTimeMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

function redirectUrl(location, base) {
  try {
    const next = new URL(location, base);
    if (!["http:", "https:"].includes(next.protocol)) return null;
    if (next.username || next.password || next.port) return null;
    next.hostname = target(next.hostname.replace(/^\[|\]$/g, ""));
    next.hash = "";
    return next;
  } catch {
    return null;
  }
}

async function fetchResponse(current, signal) {
  const request = (withRange) =>
    fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "*/*",
        ...(withRange ? { Range: "bytes=0-0" } : {}),
        "User-Agent": "CMLIA-Network-HTTP-Diagnostics/1.0",
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
  let response = await request(true);
  // Some origins reject byte ranges with 416 even though the resource is
  // reachable. Retry without Range so the diagnostic reflects the origin's
  // actual GET response; the body is still cancelled before it is read.
  if (response.status === 416) {
    await response.body?.cancel().catch(() => {});
    response = await request(false);
  }
  return response;
}

/** Inspect a public HTTP(S) URL from the Worker edge. */
export async function inspectHttpUrl(value, { signal } = {}) {
  const requestedUrl = normalizeUrl(value);
  let current = requestedUrl;
  const redirects = [];
  const startedAt = performance.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetchResponse(current, signal);
    } catch {
      throw new HttpError(502, "目标站点连接失败或超时");
    }
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
      await response.body?.cancel().catch(() => {});
      return {
        requestedUrl: requestedUrl.toString(),
        finalUrl: current.toString(),
        redirects,
        ...responseSummary(response, startedAt),
      };
    }
    await response.body?.cancel().catch(() => {});
    if (hop === MAX_REDIRECTS) throw new HttpError(502, "重定向次数超过限制");
    const next = redirectUrl(location, current);
    if (!next) throw new HttpError(502, "重定向目标不是受支持的公网 URL");
    redirects.push({
      status: response.status,
      from: current.toString(),
      to: next.toString(),
    });
    current = next;
  }
  throw new HttpError(502, "目标站点连接失败");
}

export { normalizeUrl, headerSummary };
