# Request context API

`GET /api/browser/request-context` returns observations about the incoming request for the CMLIA Network identity page. No parameters, API keys, or external services are required. The endpoint applies the existing same-origin and rate-limit rules and returns `Cache-Control: no-store`.

## Contract

The response contains:

| Field                                                                                              | Type                     | Meaning                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `observedAt`                                                                                       | ISO date string          | Time the Worker built this response                                                                        |
| `source`                                                                                           | `"cloudflare"` or `null` | Whether trusted `request.cf` metadata is available                                                         |
| `network.ip`                                                                                       | string or `null`         | Public visitor IP, validated using the shared IP validator                                                 |
| `network.country`, `region`, `city`, `organization`, `timezone`, `colo`, `httpProtocol`            | string or `null`         | Trusted incoming Cloudflare metadata; `country` is the country code, `colo` is the edge location           |
| `network.asn`                                                                                      | integer or `null`        | Positive 32-bit ASN from Cloudflare                                                                        |
| `tls.version`, `cipher`, `ja3`, `ja4`                                                              | string or `null`         | Incoming TLS metadata; fingerprint fields depend on account features                                       |
| `headers.userAgent`, `acceptLanguage`, `secChUa`, `secChUaPlatform`, `secChUaMobile`, `dnt`, `gpc` | string or `null`         | Allowlisted client headers; these are self-reported, not verified identity                                 |
| `unavailable`                                                                                      | string array             | Always includes `tcpFingerprint`, `tcpRoundTrip`, `http2Fingerprint`, which this deployment cannot observe |

Metadata strings are capped at 256 characters. User-Agent allows up to 2048 characters, other client headers up to 1024, and DNT/GPC up to 16. Overlong headers become `null` instead of being truncated and creating artificial comparison differences. Empty, absent or invalid values also become `null`; missing values do not imply success or failure.

Only the allowlisted headers are returned. Cookie, Authorization, API keys, Referer, and Forwarded headers are excluded. The endpoint does not store the observation or contact another service. Infrastructure-level logs remain governed by the deployment configuration.

Without trusted Cloudflare metadata, all network and TLS fields are `null`, even if a caller supplies Cloudflare-looking headers. Localhost requests and `LOCAL_DEV=true` also disable trusted metadata, including local emulation. Client header values remain visible locally. GeoIP is approximate egress location and does not establish a person's physical location; HTTP protocol describes this request and does not supply an HTTP/2 fingerprint.

Unsupported methods return 405, cross-origin requests return 403, and rate-limited requests return 429 under the existing Worker API rules.

## Verification

Build the Worker with `pnpm exec wrangler deploy --dry-run --outdir .worker-test`, then run `node --test tests/request-context.test.mjs`. The tests cover metadata, absent values, forged headers without trusted metadata, invalid/local IPs, local mode, strict header allowlisting, bounds, no upstream requests, response caching, origin rules and methods.
