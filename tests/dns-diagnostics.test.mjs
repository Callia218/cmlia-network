import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectDns, normalizeDnsDomain } from "../worker/dns-diagnostics.js";

test("DNS diagnostics accepts domains and rejects URL or IP targets", () => {
  assert.equal(normalizeDnsDomain("Example.COM."), "example.com");
  assert.throws(() => normalizeDnsDomain("https://example.com"), /域名/);
  assert.throws(() => normalizeDnsDomain("1.1.1.1"), /域名/);
});

test("DNS diagnostics queries the allowlisted record set and reports DNSSEC", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({
      Status: 0,
      AD: true,
      Answer: [{ name: "example.com.", type: 1, TTL: 300, data: "192.0.2.1" }],
    });
  };
  try {
    const result = await inspectDns("example.com");
    assert.equal(result.domain, "example.com");
    assert.equal(result.records.length, 9);
    assert.equal(result.dnssec.status, "secure");
    assert.equal(result.records[0].answers[0].data, "192.0.2.1");
    assert.equal(calls.length, 10);
    assert.ok(
      calls.every((url) =>
        url.startsWith("https://cloudflare-dns.com/dns-query?"),
      ),
    );
    assert.ok(
      calls.some((url) => new URL(url).searchParams.get("type") === "DNSKEY"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
