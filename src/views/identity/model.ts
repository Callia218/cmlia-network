export interface Signal {
  id: string;
  source: "browser" | "request" | "network" | "tls";
  value: string | number | boolean | null;
  elapsedMs: number;
  sensitive?: boolean;
}

export interface RequestContext {
  observedAt: string;
  source: "cloudflare" | null;
  network: {
    ip: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    asn: number | null;
    organization: string | null;
    timezone: string | null;
    colo: string | null;
    httpProtocol: string | null;
  };
  tls: {
    version: string | null;
    cipher: string | null;
    ja3: string | null;
    ja4: string | null;
  };
  headers: {
    userAgent: string | null;
    acceptLanguage: string | null;
    secChUa: string | null;
    secChUaPlatform: string | null;
    secChUaMobile: string | null;
    dnt: string | null;
    gpc: string | null;
  };
  unavailable: string[];
}

export interface Comparison {
  id: "userAgent" | "language" | "timezone";
  status: "match" | "different" | "unknown";
  evidence: string[];
}

/** Preserve false and zero; empty or non-finite values are not observations. */
export function signalValue(value: unknown): Signal["value"] {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

const sensitiveIds = new Set([
  "network.ip",
  "tls.ja3",
  "tls.ja4",
  "request.userAgent",
  "browser.userAgent",
  "browser.gpu",
]);

const contextFields = {
  network: [
    "ip",
    "country",
    "region",
    "city",
    "asn",
    "organization",
    "timezone",
    "colo",
    "httpProtocol",
  ],
  tls: ["version", "cipher", "ja3", "ja4"],
  request: [
    "userAgent",
    "acceptLanguage",
    "secChUa",
    "secChUaPlatform",
    "secChUaMobile",
    "dnt",
    "gpc",
  ],
} as const;

/** Use a fixed allowlist, including unavailable rows on failed requests. */
export function contextSignals(
  context: RequestContext | null,
  elapsedMs: number,
): Signal[] {
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.round(elapsedMs))
    : 0;
  const rows: Signal[] = [];
  for (const source of ["network", "tls", "request"] as const) {
    const record = source === "request" ? context?.headers : context?.[source];
    for (const field of contextFields[source]) {
      const id = `${source}.${field}`;
      rows.push({
        id,
        source,
        value: signalValue(record?.[field as keyof typeof record]),
        elapsedMs: elapsed,
        ...(sensitiveIds.has(id) ? { sensitive: true } : {}),
      });
    }
  }
  // Workers exposes no raw TCP SYN packets or HTTP/2 SETTINGS fingerprint.
  for (const [id, source] of [
    ["network.tcpFingerprint", "network"],
    ["network.tcpRoundTrip", "network"],
    ["tls.http2Fingerprint", "tls"],
  ] as const)
    rows.push({ id, source, value: null, elapsedMs: elapsed });
  return rows;
}

function canonicalLanguage(value: string): string | null {
  try {
    return (
      Intl.getCanonicalLocales(
        value.trim().replaceAll("_", "-"),
      )[0]?.toLowerCase() ?? null
    );
  } catch {
    return null;
  }
}

/** Highest quality non-wildcard preference; source order breaks equal weights. */
function preferredLanguage(value: string): string | null {
  const preferences = value.split(",").flatMap((entry, order) => {
    const [language, ...parameters] = entry.trim().split(";");
    const normalized = canonicalLanguage(language);
    if (!normalized) return [];
    let quality = 1;
    for (const parameter of parameters) {
      const [name, raw] = parameter.trim().split("=");
      if (name.toLowerCase() !== "q") continue;
      if (!raw || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) return [];
      quality = Number(raw);
    }
    return quality > 0 ? [{ language: normalized, quality, order }] : [];
  });
  preferences.sort((a, b) => b.quality - a.quality || a.order - b.order);
  return preferences[0]?.language ?? null;
}

function timezoneOffset(timeZone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(now);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value;
    if (offset === "GMT") return 0;
    const match = offset?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    return match
      ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1)
      : null;
  } catch {
    return null;
  }
}

/** Compare only direct evidence; differences never establish a proxy or identity. */
export function compareSignals(
  signals: Signal[],
  now = new Date(),
): Comparison[] {
  const rows = new Map(signals.map((signal) => [signal.id, signal.value]));
  const text = (id: string) => {
    const value = rows.get(id);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const compare = (
    id: Comparison["id"],
    evidence: string[],
    left: string | number | null,
    right: string | number | null,
  ): Comparison => ({
    id,
    evidence,
    status:
      left === null || right === null
        ? "unknown"
        : left === right
          ? "match"
          : "different",
  });
  const language = text("browser.language");
  const accepted = text("request.acceptLanguage");
  const browserZone = text("browser.timezone");
  const networkZone = text("network.timezone");
  return [
    compare(
      "userAgent",
      ["browser.userAgent", "request.userAgent"],
      text("browser.userAgent"),
      text("request.userAgent"),
    ),
    compare(
      "language",
      ["browser.language", "request.acceptLanguage"],
      language ? canonicalLanguage(language) : null,
      accepted ? preferredLanguage(accepted) : null,
    ),
    compare(
      "timezone",
      ["browser.timezone", "network.timezone"],
      browserZone ? timezoneOffset(browserZone, now) : null,
      networkZone ? timezoneOffset(networkZone, now) : null,
    ),
  ];
}

/** Construct a local download payload. This function stores and sends nothing. */
export function exportIdentityReport(
  signals: Signal[],
  comparisons: Comparison[],
  options: { includeSensitive?: boolean } = {},
) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    signals: signals.map((signal) => {
      const sensitive =
        signal.sensitive === true || sensitiveIds.has(signal.id);
      const redacted =
        !options.includeSensitive && sensitive && signal.value !== null;
      return {
        id: signal.id,
        source: signal.source,
        value: redacted ? "[redacted]" : signal.value,
        elapsedMs: signal.elapsedMs,
        sensitive,
        redacted,
      };
    }),
    comparisons: comparisons.map(({ id, status, evidence }) => ({
      id,
      status,
      evidence: [...evidence],
    })),
  };
}
