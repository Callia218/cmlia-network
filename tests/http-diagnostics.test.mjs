import assert from "node:assert/strict";
import { test } from "node:test";
import {
  headerSummary,
  inspectHttpUrl,
  normalizeUrl,
} from "../worker/http-diagnostics.js";
import { HttpError } from "../worker/http.js";

test("HTTP diagnostics normalizes public HTTP(S) URLs and rejects unsafe targets", () => {
  assert.equal(
    normalizeUrl(" HTTPS://Example.COM/path#fragment ").toString(),
    "https://example.com/path",
  );
  assert.equal(
    normalizeUrl("https://[2606:4700:4700::1111]/").hostname,
    "[2606:4700:4700::1111]",
  );
  for (const value of [
    "",
    "ftp://example.com",
    "http://127.0.0.1",
    "http://localhost",
    "https://example.com:8443",
    "https://user:pass@example.com",
  ]) {
    assert.throws(() => normalizeUrl(value), HttpError, value);
  }
});

test("HTTP diagnostics follows bounded redirects and returns response metadata", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://example.com/start")
      return new Response(null, {
        status: 301,
        headers: { location: "/final" },
      });
    return new Response("ok", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-length": "2",
        "cache-control": "max-age=60",
        etag: '"abc"',
        server: "test-origin",
        "strict-transport-security": "max-age=31536000",
        "content-security-policy": "default-src 'self'",
      },
    });
  };
  try {
    const result = await inspectHttpUrl("https://example.com/start");
    assert.equal(result.status, 200);
    assert.equal(result.requestedUrl, "https://example.com/start");
    assert.equal(result.finalUrl, "https://example.com/final");
    assert.deepEqual(result.redirects, [
      {
        status: 301,
        from: "https://example.com/start",
        to: "https://example.com/final",
      },
    ]);
    assert.equal(result.contentType, "text/plain; charset=utf-8");
    assert.equal(
      result.headers["strict-transport-security"],
      "max-age=31536000",
    );
    assert.equal(result.headers["permissions-policy"], null);
    assert.deepEqual(calls, [
      "https://example.com/start",
      "https://example.com/final",
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP diagnostics returns HTTP error statuses and blocks unsafe redirect targets", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("missing", { status: 404, statusText: "Not Found" });
  try {
    const result = await inspectHttpUrl("https://example.com/missing");
    assert.equal(result.status, 404);
    assert.equal(result.statusText, "Not Found");
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    });
  try {
    await assert.rejects(
      () => inspectHttpUrl("https://example.com/redirect"),
      (error) => error instanceof HttpError && error.status === 502,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP diagnostics retries a range-rejecting origin without the range header", async () => {
  const original = globalThis.fetch;
  const ranges = [];
  globalThis.fetch = async (_url, init) => {
    ranges.push(new Headers(init.headers).get("range"));
    if (ranges.length === 1) return new Response(null, { status: 416 });
    return new Response("ok", { status: 200 });
  };
  try {
    const result = await inspectHttpUrl("https://example.com/large");
    assert.equal(result.status, 200);
    assert.deepEqual(ranges, ["bytes=0-0", null]);
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP diagnostics exposes only the selected security headers", () => {
  const headers = new Headers({
    "strict-transport-security": "max-age=10",
    server: "hidden",
  });
  assert.deepEqual(headerSummary(headers), {
    "strict-transport-security": "max-age=10",
    "content-security-policy": null,
    "cross-origin-opener-policy": null,
    "cross-origin-embedder-policy": null,
    "cross-origin-resource-policy": null,
    "permissions-policy": null,
  });
});
