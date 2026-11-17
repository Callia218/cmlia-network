import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConnectivityTile, homeTargets } from "@/components/connectivity";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { UnderlineHover } from "@/components/underline-hover";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSortAnimation } from "@/hooks/use-sort-animation";
import { t } from "@/i18n";
import { lookupIp } from "@/views/ip/api";
import { testConnectivity } from "@/views/link/api";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, RotateCw, Signal } from "lucide-react";
import { getGeo, getDomesticIp, getOverseasIp } from "./api";
import { IpOverviewCard } from "./components/ip-overview-card";
import { PagePortrait } from "./page-portrait";
import { AiAccessSummary, PlatformSummary } from "./platform-summary";
import { SplitResults } from "./split-results";
import {
  homeIpOverviewClass,
  homeNetworkOverviewClass,
  homePageClass,
  homePingGridClass,
  homeHeroActionsClass,
  homeHeroClass,
  homeHeroCopyClass,
  homeHeroDescriptionClass,
  homeHeroEyebrowClass,
  homeHeroMetricClass,
  homeHeroSignalClass,
  homeHeroTitleClass,
  homeToolbarActionsClass,
  homeToolbarClass,
} from "./styles";

export function HomePage() {
  const mobile = useIsMobile();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [sortBySpeed, setSortBySpeed] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const filters = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        [
          "home-domestic-ip",
          "browser-ip",
          "split",
          "geoip",
          "lookup-ip-coffee",
          "connectivity",
          "connectivity-progress",
          "ai-preview",
          "service-status",
          "home-dns",
          "home-webrtc",
          "webrtc-diagnostic",
          "home-browser-fingerprint",
        ].includes(String(query.queryKey[0])),
    };
    try {
      await client.cancelQueries(filters);
      await client.resetQueries(filters);
    } finally {
      setRefreshing(false);
    }
  };
  const connectivity = useQueries({
    queries: homeTargets.map((target) => ({
      queryKey: ["connectivity", target.url, 0],
      enabled: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        testConnectivity(target.url, signal, (result) =>
          client.setQueryData(["connectivity-progress", target.url, 0], result),
        ),
      retry: false,
      staleTime: 60_000,
    })),
  });
  const orderedTargets = homeTargets.map((target, index) => ({
    target,
    query: connectivity[index],
  }));
  if (sortBySpeed)
    orderedTargets.sort(
      (a, b) =>
        (a.query.data?.median ?? Infinity) - (b.query.data?.median ?? Infinity),
    );

  const connectivityRef = useSortAnimation(
    `${mobile}-${orderedTargets.map(({ target }) => target.name).join("|")}`,
  );
  useEffect(() => {
    document.title = t("home.overviewIpTools");
  }, []);
  const probes = useQueries({
    queries: [
      {
        queryKey: ["home-domestic-ip", 3],
        retry: false,
        queryFn: ({ signal }: { signal: AbortSignal }) => getDomesticIp(signal),
      },
      {
        queryKey: ["browser-ip", 4],
        queryFn: ({ signal }: { signal: AbortSignal }) => getOverseasIp(signal),
      },
    ].map((probe) => ({ retry: false, staleTime: 60_000, ...probe })),
  });
  const cards = probes.flatMap((query, index) => {
    // Only dedicated probes belong in the overview; per-site routes stay in SplitResults.
    // Hide a probe once it has settled without an IP instead of showing an empty card.
    if (!query.data && !query.isPending) return [];
    return [
      {
        query,
        data: query.data,
        version: 4,
        label:
          index === 0
            ? t("home.ipv4DomesticProbe")
            : t("home.ipv4ExternalProbe"),
      },
    ];
  });
  const ips = [
    ...new Set(cards.flatMap(({ data }) => (data ? [data.ip] : []))),
  ];
  const geoQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: ["geoip", ip],
      queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const geoByIp = new Map(ips.map((ip, index) => [ip, geoQueries[index]]));
  const typeQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: ["lookup-ip-coffee", ip],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        lookupIp(ip, AbortSignal.any([signal, AbortSignal.timeout(3000)])),
      staleTime: 3600_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const typeByIp = new Map(ips.map((ip, index) => [ip, typeQueries[index]]));
  return (
    <div className={homePageClass}>
      <section className={homeHeroClass} aria-labelledby="home-hero-title">
        <div className={homeHeroCopyClass}>
          <span className={homeHeroEyebrowClass}>
            <Signal className="size-3.5" aria-hidden="true" />
            CMLIA·NET / NETWORK INTELLIGENCE
          </span>
          <h1 id="home-hero-title" className={homeHeroTitleClass}>
            看清你的网络出口，做出下一步判断。
          </h1>
          <p className={homeHeroDescriptionClass}>
            从 IP 归属、AI 可用性到全球链路，一次探测收拢你此刻的网络状态。
          </p>
          <div className={homeHeroActionsClass}>
            <Button
              asChild
              className="h-10 rounded-full bg-cyan-300 px-5 text-[0.8rem] font-semibold text-[#073247] shadow-[0_8px_24px_-10px_rgb(103_232_249_/_90%)] hover:bg-cyan-200"
            >
              <Link to="/ip">
                查看当前 IP
                <ArrowUpRight className="ml-1 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/who-am-i"
              className="inline-flex h-10 items-center rounded-full border border-white/20 px-5 text-[0.8rem] font-semibold text-white/85 transition-colors hover:border-cyan-100/50 hover:bg-white/8 hover:text-white"
            >
              {t("identity.title")}
            </Link>
          </div>
        </div>
        <div
          className={homeHeroSignalClass}
          aria-label="CMLIA Network live checks"
        >
          <div className="flex items-center justify-between text-[0.68rem] font-semibold tracking-[0.15em] text-cyan-100/65 uppercase">
            <span>Live checks</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-200">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgb(110_231_183_/_12%)]" />
              Online
            </span>
          </div>
          <div className="mt-3">
            <div className={homeHeroMetricClass}>
              <span className="text-sm text-slate-200/70">出口识别</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-white">
                <Check className="size-3.5 text-emerald-300" />
                IPv4 / IPv6
              </span>
            </div>
            <div className={homeHeroMetricClass}>
              <span className="text-sm text-slate-200/70">服务探测</span>
              <span className="text-sm font-semibold text-cyan-200">
                AI · CDN · Sites
              </span>
            </div>
            <div className={homeHeroMetricClass}>
              <span className="text-sm text-slate-200/70">测量范围</span>
              <span className="text-sm font-semibold text-white">全球节点</span>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-14 -bottom-24 size-64 rounded-full border border-cyan-200/10 bg-cyan-300/8 blur-[1px]" />
          <div className="pointer-events-none absolute -right-4 -bottom-14 size-36 rounded-full border border-cyan-200/15" />
        </div>
      </section>
      <div className={homeToolbarClass}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_18%,transparent)]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[0.95rem] leading-[1.35] font-[700] tracking-[-0.01em] whitespace-nowrap">
              {t("home.networkOverview")}
            </h1>
            <p className="truncate text-[0.68rem] font-medium tracking-[0.12em] text-subtle uppercase">
              Live network signals
            </p>
          </div>
        </div>
        <div className={homeToolbarActionsClass}>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            disabled={refreshing}
            aria-busy={refreshing}
            aria-label={
              refreshing ? t("common.checkingDots") : t("common.runAgain")
            }
            title={t("common.runAgain")}
            onClick={refresh}
          >
            <RotateCw
              aria-hidden="true"
              className={refreshing ? "animate-spin" : undefined}
            />
          </Button>
        </div>
      </div>
      <div className={homeIpOverviewClass}>
        {cards.map(({ query, data, version, label }) => (
          <IpOverviewCard
            key={label}
            label={label}
            version={version}
            data={data}
            pending={!data && query.isPending}
            geoQuery={data ? geoByIp.get(data.ip) : undefined}
            typeQuery={data ? typeByIp.get(data.ip) : undefined}
          />
        ))}
      </div>
      <div className={homeNetworkOverviewClass}>
        <AiAccessSummary />
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t("common.networkConnectivity")}</CardTitle>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  <Switch
                    size="sm"
                    checked={sortBySpeed}
                    onCheckedChange={setSortBySpeed}
                    aria-label={t("home.sortBySpeed")}
                  />
                  <span>{t("home.sortBySpeed")}</span>
                </label>
                <UnderlineHover asChild>
                  <Link
                    className="text-[0.78rem] whitespace-nowrap text-muted-foreground"
                    to="/unlock/sites"
                  >
                    {t("home.viewMore")}
                  </Link>
                </UnderlineHover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={connectivityRef}>
              <div className={homePingGridClass}>
                {orderedTargets.map(({ target }) => (
                  <ConnectivityTile target={target} key={target.name} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <SplitResults summary />
      <PlatformSummary />
      <PagePortrait />
    </div>
  );
}
export default HomePage;
