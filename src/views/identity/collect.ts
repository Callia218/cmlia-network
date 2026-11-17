import type { BrowserNavigator } from "@/views/browser/environment";
import { signalValue, type Signal } from "./model.ts";

function clock() {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

function dimensions(width: unknown, height: unknown) {
  return typeof width === "number" &&
    Number.isFinite(width) &&
    typeof height === "number" &&
    Number.isFinite(height)
    ? `${width} × ${height}`
    : null;
}

function gpuRenderer() {
  let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return null;
    const extension = context.getExtension("WEBGL_debug_renderer_info");
    return context.getParameter(
      extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER,
    );
  } finally {
    try {
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // Context cleanup cannot invalidate an already collected renderer.
    }
  }
}

/** Lightweight, local-only sampling. Every getter is independently guarded. */
export function collectBrowserSignals(): Signal[] {
  const started = clock();
  const nav = () => navigator as BrowserNavigator;
  const readings: [string, () => unknown, boolean?][] = [
    ["userAgent", () => nav().userAgent, true],
    ["platform", () => nav().platform],
    ["language", () => nav().language],
    ["languages", () => Array.from(nav().languages).join(" · ")],
    ["timezone", () => Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["utcOffset", () => -new Date().getTimezoneOffset()],
    ["screen", () => dimensions(screen.width, screen.height)],
    [
      "availableScreen",
      () => dimensions(screen.availWidth, screen.availHeight),
    ],
    ["viewport", () => dimensions(window.innerWidth, window.innerHeight)],
    ["pixelRatio", () => window.devicePixelRatio],
    ["colorDepth", () => screen.colorDepth],
    ["logicalProcessors", () => nav().hardwareConcurrency],
    ["memoryGiB", () => nav().deviceMemory],
    ["touchPoints", () => nav().maxTouchPoints],
    ["clientHintsPlatform", () => nav().userAgentData?.platform],
    [
      "clientHintsBrands",
      () =>
        nav()
          .userAgentData?.brands.map(
            ({ brand, version }) => `${brand} ${version}`,
          )
          .join(" · "),
    ],
    ["clientHintsMobile", () => nav().userAgentData?.mobile],
    ["cookies", () => nav().cookieEnabled],
    ["dnt", () => nav().doNotTrack],
    ["gpc", () => nav().globalPrivacyControl],
    ["online", () => nav().onLine],
    ["secureContext", () => window.isSecureContext],
    ["crossOriginIsolated", () => window.crossOriginIsolated],
    [
      "colorScheme",
      () =>
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : null,
    ],
    [
      "reducedMotion",
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ],
    ["gpu", gpuRenderer, true],
    ["pdfViewerEnabled", () => nav().pdfViewerEnabled],
  ];
  return readings.map(([name, read, sensitive]) => {
    let value: Signal["value"] = null;
    try {
      value = signalValue(read());
    } catch {
      // Unsupported or restricted APIs are unavailable, never negative results.
    }
    return {
      id: `browser.${name}`,
      source: "browser",
      value,
      elapsedMs: Math.max(0, Math.round(clock() - started)),
      ...(sensitive ? { sensitive: true } : {}),
    };
  });
}
