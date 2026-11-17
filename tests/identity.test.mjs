import assert from "node:assert/strict";
import { test } from "node:test";
import { collectBrowserSignals } from "../src/views/identity/collect.ts";
import {
  compareSignals,
  contextSignals,
  exportIdentityReport,
  signalValue,
} from "../src/views/identity/model.ts";

const signal = (id, value, sensitive = false) => ({
  id,
  value,
  sensitive,
  source: id.split(".")[0],
  elapsedMs: 1,
});
const comparison = (id, rows, now) =>
  compareSignals(rows, now).find((row) => row.id === id);

test("identity comparisons require available evidence and never treat missing data as a match", () => {
  assert.ok(compareSignals([]).every((item) => item.status === "unknown"));
  assert.equal(
    comparison("userAgent", [
      signal("browser.userAgent", "Browser"),
      signal("request.userAgent", null),
    ]).status,
    "unknown",
  );
  assert.equal(
    comparison("userAgent", [
      signal("browser.userAgent", "Browser"),
      signal("request.userAgent", "Browser"),
    ]).status,
    "match",
  );
  assert.equal(
    comparison("userAgent", [
      signal("browser.userAgent", "Browser"),
      signal("request.userAgent", "Other"),
    ]).status,
    "different",
  );
});

test("language comparison respects quality, zero weights, canonical spelling and invalid preferences", () => {
  const check = (header, language = "zh-CN") =>
    comparison("language", [
      signal("browser.language", language),
      signal("request.acceptLanguage", header),
    ]).status;
  assert.equal(check("en;q=0, zh-cn;q=0.8, fr;q=0.2"), "match");
  assert.equal(check("fr;q=0.2, zh_CN;q=0.8"), "match");
  assert.equal(check("en;q=0.9, zh-CN;q=0.8"), "different");
  assert.equal(check("zh-CN;q=0"), "unknown");
  assert.equal(check("*;q=1"), "unknown");
  assert.equal(check("zh-CN;q=garbage"), "unknown");
  assert.equal(check("zh-TW"), "different");
});

test("timezone comparison uses offsets at the same instant and respects DST", () => {
  const check = (left, right, date = "2026-11-17T12:00:00Z") =>
    comparison(
      "timezone",
      [signal("browser.timezone", left), signal("network.timezone", right)],
      new Date(date),
    ).status;
  assert.equal(check("Asia/Shanghai", "Asia/Hong_Kong"), "match");
  assert.equal(check("US/Eastern", "America/New_York"), "match");
  assert.equal(
    check("America/Phoenix", "America/Denver", "2026-01-15T12:00:00Z"),
    "match",
  );
  assert.equal(
    check("America/Phoenix", "America/Denver", "2026-07-15T12:00:00Z"),
    "different",
  );
  assert.equal(check("Invalid/Zone", "UTC"), "unknown");
  assert.equal(check(null, "UTC"), "unknown");
});

test("request mapping has a fixed allowlist and preserves unavailable fields", () => {
  const empty = contextSignals(null, 10);
  assert.equal(empty.length, 23);
  assert.ok(empty.every((row) => row.value === null));
  const context = {
    network: { ip: "1.1.1.1", asn: 13335 },
    tls: { ja3: "sample" },
    headers: {
      userAgent: "Browser",
      cookie: "SECRET",
      authorization: "SECRET",
    },
  };
  const rows = contextSignals(context, 24.8);
  assert.equal(rows.find((row) => row.id === "network.asn").value, 13335);
  assert.equal(rows.find((row) => row.id === "network.ip").sensitive, true);
  assert.ok(rows.every((row) => row.elapsedMs === 25));
  assert.ok(!JSON.stringify(rows).includes("SECRET"));
  assert.equal(
    rows.find((row) => row.id === "network.tcpFingerprint").value,
    null,
  );
});

test("identity exports redact sensitive data by default without modifying live data", () => {
  const rows = [
    signal("network.ip", "1.1.1.1"),
    signal("tls.ja4", "fingerprint"),
    signal("browser.gpu", "Exact GPU"),
    signal("browser.userAgent", "Exact UA"),
    signal("request.userAgent", "Request UA"),
    signal("custom", "sensitive", true),
    signal("browser.cookies", false),
    signal("browser.touchPoints", 0),
    signal("tls.ja3", null),
  ];
  const comparisons = compareSignals(rows);
  const report = exportIdentityReport(rows, comparisons);
  assert.equal(report.schemaVersion, 1);
  assert.ok(!Number.isNaN(Date.parse(report.generatedAt)));
  assert.ok(
    report.signals
      .slice(0, 6)
      .every((row) => row.redacted && row.value === "[redacted]"),
  );
  assert.equal(report.signals[6].value, false);
  assert.equal(report.signals[7].value, 0);
  assert.equal(report.signals[8].value, null);
  assert.equal(report.signals[8].redacted, false);
  assert.equal(rows[0].value, "1.1.1.1");
  assert.equal(
    exportIdentityReport(rows, comparisons, { includeSensitive: true })
      .signals[0].value,
    "1.1.1.1",
  );
  report.comparisons[0].evidence.push("mutated");
  assert.ok(!comparisons[0].evidence.includes("mutated"));
});

function withGlobals(values, run) {
  const originals = new Map(
    Object.keys(values).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  try {
    for (const [key, value] of Object.entries(values))
      Object.defineProperty(globalThis, key, { value, configurable: true });
    return run();
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("browser collection isolates throwing getters, preserves false/zero, and never requests permissions or persists data", () => {
  let externalCalls = 0;
  const forbidden = () => {
    externalCalls++;
    throw new Error("must not call");
  };
  withGlobals(
    {
      navigator: {
        get userAgent() {
          throw new Error("restricted");
        },
        platform: "Test",
        language: "en-US",
        languages: ["en-US"],
        hardwareConcurrency: 0,
        maxTouchPoints: 0,
        cookieEnabled: false,
        globalPrivacyControl: false,
        onLine: false,
        geolocation: { getCurrentPosition: forbidden },
        mediaDevices: { getUserMedia: forbidden },
        userAgentData: { platform: "Test", brands: [], mobile: false },
      },
      screen: { width: 1280, height: 720, colorDepth: 24 },
      window: {
        innerWidth: 600,
        innerHeight: 400,
        isSecureContext: false,
        crossOriginIsolated: false,
        matchMedia: () => ({ matches: false }),
      },
      document: {
        createElement() {
          throw new Error("Canvas restricted");
        },
      },
      localStorage: { setItem: forbidden },
      fetch: forbidden,
    },
    () => {
      const rows = collectBrowserSignals();
      const get = (id) => rows.find((row) => row.id === `browser.${id}`).value;
      assert.equal(rows.length, 27);
      assert.equal(get("userAgent"), null);
      assert.equal(get("gpu"), null);
      assert.equal(get("platform"), "Test");
      assert.equal(get("memoryGiB"), null);
      assert.equal(get("cookies"), false);
      assert.equal(get("gpc"), false);
      assert.equal(get("touchPoints"), 0);
      assert.equal(get("logicalProcessors"), 0);
      assert.equal(get("clientHintsMobile"), false);
      assert.equal(get("screen"), "1280 × 720");
      assert.ok(
        rows.every(
          (row) => Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0,
        ),
      );
    },
  );
  assert.equal(externalCalls, 0);
  assert.equal(signalValue(NaN), null);
  assert.equal(signalValue(Infinity), null);
  assert.equal(signalValue(" "), null);
});

test("GPU collection releases its WebGL context on success and read failure", () => {
  for (const fails of [false, true]) {
    let released = 0;
    withGlobals(
      {
        document: {
          createElement: () => ({
            getContext: () => ({
              RENDERER: 1,
              getExtension: (name) =>
                name === "WEBGL_debug_renderer_info"
                  ? { UNMASKED_RENDERER_WEBGL: 2 }
                  : {
                      loseContext: () => {
                        released++;
                      },
                    },
              getParameter: () => {
                if (fails) throw new Error("restricted");
                return "Test GPU";
              },
            }),
          }),
        },
      },
      () => {
        const gpu = collectBrowserSignals().find(
          (row) => row.id === "browser.gpu",
        );
        assert.equal(gpu.value, fails ? null : "Test GPU");
        assert.equal(gpu.sensitive, true);
      },
    );
    assert.equal(released, 1);
  }
});
