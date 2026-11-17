import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../.worker-test/index.js";
import { requestContext } from "../worker/request-context.js";

function request({
  headers = {},
  cf,
  url = "https://tools.example.com/api/browser/request-context",
} = {}) {
  const req = new Request(url, { headers });
  if (cf !== undefined) Object.defineProperty(req, "cf", { value: cf });
  return req;
}

test("request context distinguishes trusted edge metadata from client headers", () => {
  const before = Date.now();
  const result = requestContext(
    request({
      headers: {
        "CF-Connecting-IP": "2606:4700:4700::1111",
        "User-Agent": "Example Browser",
        "Accept-Language": "en-GB,en;q=0.9",
        "Sec-CH-UA": '"Example";v="1"',
        "Sec-CH-UA-Platform": '"Linux"',
        "Sec-CH-UA-Mobile": "?0",
        DNT: "1",
        "Sec-GPC": "1",
      },
      cf: {
        country: "GB",
        region: "England",
        city: "London",
        asn: 13335,
        asOrganization: "Example network",
        timezone: "Europe/London",
        colo: "LHR",
        httpProtocol: "HTTP/2",
        tlsVersion: "TLSv1.3",
        tlsCipher: "AEAD-AES128-GCM-SHA256",
        botManagement: { ja3Hash: "test-ja3", ja4: "test-ja4" },
      },
    }),
  );
  assert.equal(result.source, "cloudflare");
  assert.deepEqual(result.network, {
    ip: "2606:4700:4700::1111",
    country: "GB",
    region: "England",
    city: "London",
    asn: 13335,
    organization: "Example network",
    timezone: "Europe/London",
    colo: "LHR",
    httpProtocol: "HTTP/2",
  });
  assert.deepEqual(result.tls, {
    version: "TLSv1.3",
    cipher: "AEAD-AES128-GCM-SHA256",
    ja3: "test-ja3",
    ja4: "test-ja4",
  });
  assert.equal(result.headers.userAgent, "Example Browser");
  assert.equal(result.headers.acceptLanguage, "en-GB,en;q=0.9");
  assert.equal(result.headers.secChUaPlatform, '"Linux"');
  assert.equal(result.headers.gpc, "1");
  assert.ok(Date.parse(result.observedAt) >= before);
  assert.ok(Date.parse(result.observedAt) <= Date.now());
  assert.deepEqual(result.unavailable, [
    "tcpFingerprint",
    "tcpRoundTrip",
    "http2Fingerprint",
  ]);
});

test("missing edge metadata cannot be replaced by spoofed request headers", () => {
  const result = requestContext(
    request({
      headers: {
        "CF-Connecting-IP": "1.1.1.1",
        "CF-IPCountry": "GB",
        Forwarded: "for=8.8.8.8",
        "X-Forwarded-For": "8.8.8.8",
        JA3: "spoofed",
        JA4: "spoofed",
        "User-Agent": "self-reported",
      },
    }),
  );
  assert.equal(result.source, null);
  assert.ok(Object.values(result.network).every((value) => value === null));
  assert.ok(Object.values(result.tls).every((value) => value === null));
  assert.equal(result.headers.userAgent, "self-reported");
});

test("local development and invalid visitor addresses never become a public identity", () => {
  for (const address of [
    "127.0.0.1",
    "198.18.0.1",
    "203.0.113.1",
    "::1",
    "bad-address",
    "",
  ]) {
    const result = requestContext(
      request({ cf: {}, headers: { "CF-Connecting-IP": address } }),
    );
    assert.equal(result.network.ip, null, address);
  }
  const input = {
    cf: { country: "GB", tlsVersion: "TLSv1.3" },
    headers: { "CF-Connecting-IP": "1.1.1.1" },
  };
  for (const localRequest of [
    request({ ...input, url: "http://localhost/api/browser/request-context" }),
    request({ ...input, url: "http://127.0.0.1/api/browser/request-context" }),
  ]) {
    const result = requestContext(localRequest);
    assert.equal(result.source, null);
    assert.equal(result.network.ip, null);
    assert.equal(result.tls.version, null);
  }
  assert.equal(requestContext(request(input), { local: true }).source, null);
  const missing = requestContext(
    request({ cf: { asn: "13335", city: "", botManagement: {} } }),
  );
  assert.equal(missing.network.asn, null);
  assert.equal(missing.network.city, null);
  assert.equal(missing.tls.ja4, null);
});

test("only bounded allowlisted headers are returned and credentials are excluded", () => {
  const result = requestContext(
    request({
      headers: {
        "User-Agent": "x".repeat(4096),
        "Accept-Language": "y".repeat(2048),
        DNT: "z".repeat(128),
        Cookie: "private-cookie",
        Authorization: "Bearer private-token",
        "X-Api-Key": "private-key",
        Forwarded: "private-proxy",
        Referer: "https://private.example.com/",
      },
    }),
  );
  assert.equal(result.headers.userAgent, null);
  assert.equal(result.headers.acceptLanguage, null);
  assert.equal(result.headers.dnt, null);
  assert.deepEqual(Object.keys(result.headers), [
    "userAgent",
    "acceptLanguage",
    "secChUa",
    "secChUaPlatform",
    "secChUaMobile",
    "dnt",
    "gpc",
  ]);
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("request context route is read-only, non-cacheable and makes no upstream calls", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected upstream call");
  };
  try {
    const env = { API_LIMITER: { limit: async () => ({ success: true }) } };
    const response = await worker.fetch(
      request({
        cf: { colo: "LHR" },
        headers: { "CF-Connecting-IP": "1.1.1.1" },
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).network.ip, "1.1.1.1");
    const localResponse = await worker.fetch(
      request({ cf: {}, headers: { "CF-Connecting-IP": "1.1.1.1" } }),
      { ...env, LOCAL_DEV: "true" },
    );
    assert.equal((await localResponse.json()).source, null);
    const post = await worker.fetch(
      new Request("https://tools.example.com/api/browser/request-context", {
        method: "POST",
      }),
      env,
    );
    assert.equal(post.status, 405);
    const crossOrigin = await worker.fetch(
      request({ headers: { Origin: "https://other.example.com" } }),
      env,
    );
    assert.equal(crossOrigin.status, 403);
  } finally {
    globalThis.fetch = original;
  }
});
