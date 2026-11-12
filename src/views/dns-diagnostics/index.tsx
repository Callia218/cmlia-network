import { useSearchParams } from "react-router-dom";
import { LookupForm } from "@/components/lookup-form";
import { ErrorNotice, PageHeading, Pending } from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { inspectDns, type DnsRecordSet } from "./api";

function statusLabel(status: DnsRecordSet["status"]) {
  if (status === 0) return t("dnsDiagnostics.status.noError");
  if (status === 3) return t("dnsDiagnostics.status.nxdomain");
  return t("dnsDiagnostics.status.error");
}

export default function DnsDiagnosticsPage() {
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain") ?? "";
  const query = useQuery({
    queryKey: ["dns-diagnostics", domain],
    enabled: Boolean(domain),
    queryFn: ({ signal }) => inspectDns(domain, signal),
    retry: false,
    staleTime: 300_000,
  });
  const lookup = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("domain", value.trim());
    setParams(next);
  };
  const data = query.data;
  return (
    <div className="space-y-3">
      <PageHeading title={t("dnsDiagnostics.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("dnsDiagnostics.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <LookupForm
            value={domain}
            placeholder={t("dnsDiagnostics.placeholder")}
            busy={query.isFetching}
            onSubmit={lookup}
          />
          <p className="text-xs text-muted-foreground">
            {t("dnsDiagnostics.description")}
          </p>
        </CardContent>
      </Card>
      <ErrorNotice error={query.error} />
      {query.isFetching && (
        <p className="py-5 text-center text-sm text-muted-foreground">
          <Pending>{t("dnsDiagnostics.loading")}</Pending>
        </p>
      )}
      {data && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 pt-5">
              <strong>{data.domain}</strong>
              <Badge
                variant={
                  data.dnssec.status === "secure"
                    ? "success"
                    : data.dnssec.status === "unknown"
                      ? "secondary"
                      : "warning"
                }
              >
                {data.dnssec.status === "secure"
                  ? t("dnsDiagnostics.dnssec.secure")
                  : data.dnssec.status === "unknown"
                    ? t("dnsDiagnostics.dnssec.unknown")
                    : t("dnsDiagnostics.dnssec.unverified")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t("dnsDiagnostics.checkedAt", [
                  new Date(data.queriedAt).toLocaleString(),
                ])}
              </span>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            {data.records.map((record) => (
              <Card key={record.type}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>{record.type}</CardTitle>
                  <Badge variant="secondary">
                    {statusLabel(record.status)}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {record.answers.length ? (
                    <div className="space-y-2 text-xs">
                      {record.answers.map((answer, index) => (
                        <div
                          key={`${answer.data}-${index}`}
                          className="rounded-md bg-muted px-2.5 py-2 break-all"
                        >
                          <span>{answer.data}</span>
                          {answer.ttl != null && (
                            <span className="ml-2 text-muted-foreground">
                              TTL {answer.ttl}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("dnsDiagnostics.noRecords")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dnsDiagnostics.disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
