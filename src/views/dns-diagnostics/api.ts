import { endpoint } from "@/lib/network";

export interface DnsAnswer {
  name: string;
  type: number;
  ttl?: number;
  data: string;
}
export interface DnsRecordSet {
  type: string;
  status: number;
  authenticated: boolean;
  answers: DnsAnswer[];
}
export interface DnsDiagnostics {
  domain: string;
  queriedAt: string;
  dnssec: {
    status: "secure" | "insecure-or-unverified" | "unknown";
    authenticated: boolean;
  };
  records: DnsRecordSet[];
}
export const inspectDns = (domain: string, signal: AbortSignal) =>
  endpoint<DnsDiagnostics>(`/dns/records/${encodeURIComponent(domain)}`, {
    signal,
  });
