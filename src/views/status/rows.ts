import { t } from "@/i18n";
import { localizeCatalogItem } from "@/lib/localize-catalog";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ServiceStatus } from "./api";
import rawservices from "./services.json";

export const services = rawservices.map(localizeCatalogItem);

export type ServiceWithQuery = (typeof services)[number] & {
  query: UseQueryResult<ServiceStatus>;
};

export const componentLabels: Record<string, string> = {
  operational: t("common.operational"),
  degraded_performance: t("status.degradedPerformance"),
  partial_outage: t("status.partialOutage"),
  major_outage: t("common.majorOutage"),
  under_maintenance: t("common.underMaintenance"),
};
export const indicatorLabels: Record<string, string> = {
  none: t("status.officialStatusOperational"),
  minor: t("status.officialStatusPartialImpact"),
  major: t("status.officialStatusMajorImpact"),
  critical: t("status.officialStatusCriticalIncident"),
  maintenance: t("status.officialStatusMaintenance"),
};

export function toTableRow(service: ServiceWithQuery) {
  return {
    id: service.id,
    name: service.name,
    group: service.group,
    page: service.page,
    icon: service.icon,
    data: service.query.data,
    loading: Boolean(service.url) && service.query.isPending,
    integrated: Boolean(service.url),
    officialStatus: service.officialStatus !== false,
    statusSource: "statusSource" in service ? service.statusSource : undefined,
    note: service.note,
    fetching: service.query.isFetching,
    failed: service.query.isError,
    error: service.query.error?.message,
  };
}
export type StatusRow = ReturnType<typeof toTableRow>;
