import { target, HttpError, upstream } from "./http.js";

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "CAA",
  "HTTPS",
  "SVCB",
];

function domain(value) {
  const normalized = target(value);
  // `target` also accepts public IP addresses for IP tools. DNS diagnostics
  // intentionally accepts hostnames only, so the resolver target is never an
  // IP literal or an arbitrary URL.
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized) || normalized.includes(":"))
    throw new HttpError(400, "DNS 查询需要域名，不支持 IP 地址");
  return normalized;
}

async function queryRecord(name, type) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  url.searchParams.set("do", "1");
  const data = await upstream(url, {
    headers: { Accept: "application/dns-json" },
  });
  if (!data || typeof data.Status !== "number")
    throw new HttpError(502, "DNS 数据源返回格式无效");
  const answers = Array.isArray(data.Answer) ? data.Answer : [];
  return {
    type,
    status: data.Status,
    authenticated: data.AD === true,
    answers: answers.map((answer) => ({
      name: typeof answer.name === "string" ? answer.name : name,
      type: answer.type,
      ttl: Number.isFinite(answer.TTL) ? answer.TTL : undefined,
      data:
        typeof answer.data === "string"
          ? answer.data
          : String(answer.data ?? ""),
    })),
  };
}

export async function inspectDns(value) {
  const name = domain(value);
  const records = await Promise.all(
    DNS_RECORD_TYPES.map((type) => queryRecord(name, type)),
  );
  const dnskey = await queryRecord(name, "DNSKEY");
  const authenticated =
    records.some((record) => record.authenticated) || dnskey.authenticated;
  const anySuccess = records.some((record) => record.status === 0);
  const dnssec = authenticated
    ? "secure"
    : anySuccess
      ? "insecure-or-unverified"
      : "unknown";
  return {
    domain: name,
    queriedAt: new Date().toISOString(),
    dnssec: { status: dnssec, authenticated },
    records,
  };
}

export { domain as normalizeDnsDomain, queryRecord };
