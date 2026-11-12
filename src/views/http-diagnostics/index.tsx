import { useSearchParams } from "react-router-dom";
import { LookupForm } from "@/components/lookup-form";
import { ErrorNotice, Facts, PageHeading, Pending } from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { inspectHttpUrl, type HttpInspection } from "./api";

function statusVariant(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status >= 300 && status < 400) return "info" as const;
  if (status >= 400 && status < 500) return "warning" as const;
  if (status >= 500) return "danger" as const;
  return "secondary" as const;
}

function statusLabel(status: number) {
  if (status >= 200 && status < 300)
    return t("httpDiagnostics.statusClass.success");
  if (status >= 300 && status < 400)
    return t("httpDiagnostics.statusClass.redirect");
  if (status >= 400 && status < 500)
    return t("httpDiagnostics.statusClass.clientError");
  if (status >= 500) return t("httpDiagnostics.statusClass.serverError");
  return t("httpDiagnostics.statusClass.other");
}

function present(value: string | null) {
  return value ? t("httpDiagnostics.present") : t("httpDiagnostics.missing");
}

function inspectionRows(data: HttpInspection) {
  return [
    [t("httpDiagnostics.requestedUrl"), data.requestedUrl],
    [t("httpDiagnostics.finalUrl"), data.finalUrl],
    [t("httpDiagnostics.responseTime"), `${data.responseTimeMs} ms`],
    [t("httpDiagnostics.contentType"), data.contentType ?? "—"],
    [t("httpDiagnostics.contentEncoding"), data.contentEncoding ?? "—"],
    [t("httpDiagnostics.cacheControl"), data.cacheControl ?? "—"],
    [t("httpDiagnostics.etag"), data.etag ?? "—"],
    [t("httpDiagnostics.server"), data.server ?? "—"],
    [t("httpDiagnostics.contentLength"), data.contentLength ?? "—"],
  ] as [string, string][];
}

export default function HttpDiagnosticsPage() {
  const [params, setParams] = useSearchParams();
  const value = params.get("url") ?? "";
  const query = useQuery({
    queryKey: ["http-diagnostics", value],
    enabled: Boolean(value),
    queryFn: ({ signal }) => inspectHttpUrl(value, signal),
    retry: false,
    staleTime: 60_000,
  });
  const lookup = (nextValue: string) => {
    const next = new URLSearchParams(params);
    next.set("url", nextValue.trim());
    setParams(next);
  };
  const data = query.data;

  return (
    <div className="space-y-3">
      <PageHeading title={t("httpDiagnostics.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("httpDiagnostics.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <LookupForm
            value={value}
            placeholder={t("httpDiagnostics.placeholder")}
            busy={query.isFetching}
            onSubmit={lookup}
          />
          <p className="text-xs text-muted-foreground">
            {t("httpDiagnostics.description")}
          </p>
        </CardContent>
      </Card>
      <ErrorNotice error={query.error} />
      {query.isFetching && (
        <p className="py-5 text-center text-sm text-muted-foreground">
          <Pending>{t("httpDiagnostics.loading")}</Pending>
        </p>
      )}
      {data && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 pt-5">
              <Badge variant={statusVariant(data.status)}>
                {data.status} {data.statusText || statusLabel(data.status)}
              </Badge>
              <span className="text-sm font-medium">
                {statusLabel(data.status)}
              </span>
              <span className="min-w-0 break-all text-xs text-muted-foreground">
                {data.finalUrl}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("httpDiagnostics.details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts rows={inspectionRows(data)} valueClassName="max-w-[72%]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("httpDiagnostics.securityHeaders")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts
                rows={[
                  [
                    t("httpDiagnostics.header.hsts"),
                    present(data.headers["strict-transport-security"]),
                  ],
                  [
                    t("httpDiagnostics.header.csp"),
                    present(data.headers["content-security-policy"]),
                  ],
                  [
                    t("httpDiagnostics.header.coop"),
                    present(data.headers["cross-origin-opener-policy"]),
                  ],
                  [
                    t("httpDiagnostics.header.coep"),
                    present(data.headers["cross-origin-embedder-policy"]),
                  ],
                  [
                    t("httpDiagnostics.header.corp"),
                    present(data.headers["cross-origin-resource-policy"]),
                  ],
                  [
                    t("httpDiagnostics.header.permissionsPolicy"),
                    present(data.headers["permissions-policy"]),
                  ],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("httpDiagnostics.redirects")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.redirects.length ? (
                <ol className="space-y-2 text-xs">
                  {data.redirects.map((redirect, index) => (
                    <li
                      key={`${redirect.from}-${index}`}
                      className="rounded-md bg-muted px-2.5 py-2"
                    >
                      <span className="font-semibold">
                        {index + 1}. {redirect.status}
                      </span>
                      <span className="ml-2 break-all">
                        {redirect.from} → {redirect.to}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("httpDiagnostics.noRedirects")}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
