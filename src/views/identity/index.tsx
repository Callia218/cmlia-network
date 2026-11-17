import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNotice, PageHeading } from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t, isMessageKey } from "@/i18n";
import { endpoint } from "@/lib/network";
import { hideIpAtom } from "@/store/privacy";
import { useAtomValue } from "jotai";
import {
  ArrowUpRight,
  Check,
  Download,
  Eye,
  Fingerprint,
  Globe,
  LockKeyhole,
  RotateCw,
  ScanLine,
} from "lucide-react";
import { collectBrowserSignals } from "./collect";
import {
  compareSignals,
  contextSignals,
  exportIdentityReport,
  type RequestContext,
  type Signal,
} from "./model";

const sources = ["network", "tls", "request", "browser"] as const;
const sourceIcons = {
  network: Globe,
  tls: LockKeyhole,
  request: Eye,
  browser: Fingerprint,
};
const sourceLabels = {
  network: "identity.source.network",
  tls: "identity.source.tls",
  request: "identity.source.request",
  browser: "identity.source.browser",
} as const;
const compareLabels = {
  userAgent: "identity.compare.userAgent",
  language: "identity.compare.language",
  timezone: "identity.compare.timezone",
} as const;
const compareNotes = {
  userAgent: "identity.compare.userAgentNote",
  language: "identity.compare.languageNote",
  timezone: "identity.compare.timezoneNote",
} as const;

function labelOf(id: string) {
  const key = `identity.field.${id}`;
  return isMessageKey(key) ? t(key) : id;
}

export default function IdentityPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [error, setError] = useState<Error>();
  const [observedAt, setObservedAt] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Signal["source"] | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const hidden = useAtomValue(hideIpAtom);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const start = performance.now();
      const timestamp = new Date().toISOString();
      const local = collectBrowserSignals();
      setSignals(local);
      setObservedAt(timestamp);
      setError(undefined);
      setBusy(true);
      try {
        const context = await endpoint<RequestContext>(
          "/browser/request-context",
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (active)
          setSignals([
            ...local,
            ...contextSignals(context, Math.round(performance.now() - start)),
          ]);
      } catch {
        if (active) {
          setSignals([
            ...local,
            ...contextSignals(null, Math.round(performance.now() - start)),
          ]);
          setError(new Error(t("identity.requestFailed")));
        }
      } finally {
        if (active) setBusy(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [round]);

  const comparisons = compareSignals(signals, new Date(observedAt || 0));
  const available = signals.filter((item) => item.value !== null);
  const differences = comparisons.filter(
    (item) => item.status === "different",
  ).length;
  const byId = new Map(signals.map((item) => [item.id, item]));
  const valueOf = (id: string) => {
    const item = byId.get(id);
    if (!item || item.value === null) return t("identity.unavailable");
    if (hidden && item.sensitive) return t("identity.hidden");
    if (typeof item.value === "boolean")
      return t(item.value ? "identity.yes" : "identity.no");
    return String(item.value);
  };
  const filtered = signals.filter(
    (item) =>
      (sourceFilter === "all" || item.source === sourceFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "available"
          ? item.value !== null
          : item.value === null)),
  );
  function download() {
    const report = exportIdentityReport(signals, comparisons, {
      includeSensitive: includeSensitive && !hidden,
    });
    const blob = new Blob(
      [JSON.stringify({ ...report, observedAt }, null, 2)],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `cmlia-identity-${observedAt.slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <div className="space-y-5 pb-3">
      <PageHeading title={`${t("identity.title")} · CMLIA Network`} />
      <section
        className="relative overflow-hidden rounded-3xl bg-[#0b2539] p-6 text-white sm:p-8"
        aria-labelledby="identity-title"
      >
        <div className="mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-cyan-200">
          <ScanLine className="size-4" aria-hidden="true" /> CMLIA / IDENTITY
          OBSERVATORY
        </div>
        <h2
          id="identity-title"
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {t("identity.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
          {t("identity.intro")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setRound((value) => value + 1)}
            disabled={busy}
            className="bg-cyan-200 text-slate-950 hover:bg-cyan-100"
          >
            <RotateCw
              className={
                busy
                  ? "size-4 animate-spin motion-reduce:animate-none"
                  : "size-4"
              }
              aria-hidden="true"
            />
            {t(busy ? "identity.reading" : "identity.refresh")}
          </Button>
          <span className="text-xs text-slate-300">
            {t("identity.permissionNote")}
          </span>
        </div>
        <div
          className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-5"
          aria-live="polite"
          aria-atomic="true"
        >
          {[
            [String(available.length), t("identity.observed")],
            [
              String(signals.length - available.length),
              t("identity.unavailable"),
            ],
            [String(differences), t("identity.differences")],
          ].map(([value, label]) => (
            <div key={label}>
              <div className="text-2xl font-semibold tabular-nums text-cyan-100">
                {value}
              </div>
              <div className="mt-1 text-xs text-slate-300">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <ErrorNotice error={error} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("identity.snapshot")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t("identity.egress")}
              </p>
              <p className="mt-2 break-all font-mono text-xl font-medium">
                {valueOf("network.ip")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {["network.country", "network.city", "network.organization"]
                  .filter((id) => byId.get(id)?.value != null)
                  .map(valueOf)
                  .join(" · ") || t("identity.locationUnknown")}
              </p>
            </div>
            <div className="min-w-0 border-border sm:border-l sm:pl-5">
              <p className="text-xs text-muted-foreground">
                {t("identity.browserReports")}
              </p>
              <p className="mt-2 break-words text-xl font-medium">
                {valueOf("browser.clientHintsPlatform") ===
                t("identity.unavailable")
                  ? valueOf("browser.platform")
                  : valueOf("browser.clientHintsPlatform")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {valueOf("browser.language")} · {valueOf("browser.timezone")}
              </p>
            </div>
          </div>
          <p className="mt-5 border-t border-border pt-3 text-xs leading-6 text-muted-foreground">
            {t("identity.snapshotNote")}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="identity-sources">
        <h2 id="identity-sources" className="mb-2 text-lg font-semibold">
          {t("identity.sources")}
        </h2>
        <p className="mb-3 text-xs leading-6 text-muted-foreground">
          {t("identity.timelineNote")}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sources.map((source) => {
            const Icon = sourceIcons[source];
            const items = signals.filter((item) => item.source === source);
            return (
              <button
                key={source}
                type="button"
                aria-pressed={sourceFilter === source}
                onClick={() =>
                  setSourceFilter(sourceFilter === source ? "all" : source)
                }
                className={`min-w-0 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${sourceFilter === source ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"}`}
              >
                <Icon aria-hidden="true" className="mb-3 size-5 text-primary" />
                <div className="font-medium">{t(sourceLabels[source])}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {items.length
                    ? t("identity.sourceCount", [
                        items.filter((item) => item.value !== null).length,
                        items.length,
                      ])
                    : t("identity.reading")}
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {items.length
                    ? `${Math.max(...items.map((item) => item.elapsedMs))} ms`
                    : "—"}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="identity-comparison">
        <h2 id="identity-comparison" className="mb-3 text-lg font-semibold">
          {t("identity.comparison")}
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {comparisons.map((comparison) => (
            <Card key={comparison.id}>
              <CardHeader>
                <CardTitle>
                  <h3>{t(compareLabels[comparison.id])}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge
                  variant={
                    comparison.status === "match"
                      ? "success"
                      : comparison.status === "different"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {comparison.status === "match" && (
                    <Check aria-hidden="true" />
                  )}
                  {t(
                    comparison.status === "match"
                      ? "identity.match"
                      : comparison.status === "different"
                        ? "identity.different"
                        : "identity.unknown",
                  )}
                </Badge>
                <p className="text-xs leading-6 text-muted-foreground">
                  {t(compareNotes[comparison.id])}
                </p>
                <ul className="space-y-2 text-xs">
                  {comparison.evidence.map((id) => (
                    <li key={id} className="rounded-lg bg-muted/70 p-2">
                      <span className="text-muted-foreground">
                        {labelOf(id)}
                      </span>
                      <div className="mt-1 break-all">{valueOf(id)}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          {t("identity.comparisonNote")}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("identity.readings")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={sourceFilter === "all" ? "default" : "outline"}
              aria-pressed={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
            >
              {t("identity.allSources")}
            </Button>
            {sources.map((source) => (
              <Button
                key={source}
                size="sm"
                variant={sourceFilter === source ? "default" : "outline"}
                aria-pressed={sourceFilter === source}
                onClick={() => setSourceFilter(source)}
              >
                {t(sourceLabels[source])}
              </Button>
            ))}
            <label className="flex items-center gap-2 text-xs sm:ml-auto">
              {t("identity.filter")}
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-foreground"
              >
                <option value="all">{t("identity.allStatus")}</option>
                <option value="available">{t("identity.observed")}</option>
                <option value="unavailable">{t("identity.unavailable")}</option>
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="w-[30%] py-3 pr-3 font-medium">
                    {t("identity.field")}
                  </th>
                  <th scope="col" className="w-[50%] py-3 pr-3 font-medium">
                    {t("identity.value")}
                  </th>
                  <th scope="col" className="w-[20%] py-3 font-medium">
                    {t("identity.sourceTime")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <th
                      scope="row"
                      className="py-3 pr-3 align-top font-normal wrap-anywhere"
                    >
                      {labelOf(item.id)}
                    </th>
                    <td
                      className={`py-3 pr-3 align-top wrap-anywhere ${item.value === null ? "text-muted-foreground" : "font-mono"}`}
                    >
                      {valueOf(item.id)}
                    </td>
                    <td className="py-3 align-top text-xs text-muted-foreground">
                      {t(sourceLabels[item.source])}
                      <span className="mt-1 block font-mono">
                        {item.elapsedMs} ms
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("identity.noReadings")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("identity.export")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs leading-6 text-muted-foreground">
              {t("identity.exportNote")}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeSensitive && !hidden}
                disabled={hidden}
                onChange={(event) => setIncludeSensitive(event.target.checked)}
                className="mt-1 accent-primary"
              />
              {t("identity.includeSensitive")}
            </label>
            {hidden && (
              <p className="text-xs text-muted-foreground">
                {t("identity.exportHidden")}
              </p>
            )}
            <Button
              onClick={download}
              disabled={busy || !signals.length}
              variant="outline"
            >
              <Download className="size-4" aria-hidden="true" />
              {t("identity.download")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("identity.more")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              ["/leak/dns", t("navigation.dnsLeak")],
              ["/leak/webrtc", t("navigation.webrtcLeak")],
              ["/browser/fingerprint", t("common.browserFingerprint")],
              ["/browser/checks", t("common.consistency")],
            ].map(([path, label]) => (
              <Button
                key={path}
                asChild
                variant="outline"
                className="justify-between whitespace-normal"
              >
                <Link to={path}>
                  {label}
                  <ArrowUpRight
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            ))}
            <p className="col-span-2 mt-2 text-xs leading-6 text-muted-foreground">
              {t("identity.moreNote")}
            </p>
          </CardContent>
        </Card>
      </div>
      <aside className="rounded-2xl border border-dashed border-border p-5 text-xs leading-6 text-muted-foreground">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t("identity.limits")}
        </h2>
        <p>{t("identity.limitsText")}</p>
      </aside>
    </div>
  );
}
