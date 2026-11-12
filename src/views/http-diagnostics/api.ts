import { endpoint } from "@/lib/network";

export interface HttpRedirect {
  status: number;
  from: string;
  to: string;
}

export type HttpSecurityHeaders = Record<
  | "strict-transport-security"
  | "content-security-policy"
  | "cross-origin-opener-policy"
  | "cross-origin-embedder-policy"
  | "cross-origin-resource-policy"
  | "permissions-policy",
  string | null
>;

export interface HttpInspection {
  requestedUrl: string;
  finalUrl: string;
  redirects: HttpRedirect[];
  status: number;
  statusText: string;
  headers: HttpSecurityHeaders;
  contentType: string | null;
  contentEncoding: string | null;
  cacheControl: string | null;
  etag: string | null;
  server: string | null;
  contentLength: string | null;
  responseTimeMs: number;
}

export const inspectHttpUrl = (url: string, signal: AbortSignal) =>
  endpoint<HttpInspection>(`/http/inspect?url=${encodeURIComponent(url)}`, {
    signal,
  });
