// Home dashboard layout, shared with the loading skeleton.
// (Full class strings: Tailwind only sees literal candidates.)

export const homePageClass = [
  "grid grid-cols-[minmax(0,1fr)] gap-5 *:my-0 max-md:gap-3",
  // Denser cards and titles than elsewhere.
  "[&_[data-slot=card]]:gap-2 [&_[data-slot=card]]:[--card-spacing:0.75rem] max-md:[&_[data-slot=card]]:[--card-spacing:0.625rem]",
  "[&_[data-slot=card-title]]:text-[14px] [&_[data-slot=card-title]]:leading-[1.4] [&_[data-slot=card-title]]:font-[650]",
  // Links and text buttons turn primary on hover; most also underline, except
  // UnderlineHover links and the shortcut tiles / tool directory.
  "[&_:is(a,button,summary):not([data-slot=button]):is(:hover,:focus-visible)]:text-primary",
  "[&_:is(a,button,summary):not([data-slot=button]):not([data-underline-hover]):not(:where([data-plain-links]_a,[data-plain-summary]>summary)):is(:hover,:focus-visible)]:underline",
  "[&_:is(a,button,summary):not([data-slot=button]):not([data-underline-hover]):not(:where([data-plain-links]_a,[data-plain-summary]>summary)):is(:hover,:focus-visible)]:underline-offset-4",
  "[&_button:disabled]:no-underline [&_summary>span]:text-inherit",
].join(" ");

export const homeToolbarClass =
  "flex min-w-0 items-center justify-between gap-3 rounded-[1.25rem] border border-primary/18 bg-card/60 px-5 py-3.5 shadow-tool backdrop-blur-sm max-xs:flex-wrap max-xs:gap-2";
export const homeToolbarActionsClass = "flex min-w-0 items-center gap-1";

export const homeHeroClass =
  "relative isolate grid min-h-[18rem] grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)] items-stretch gap-5 overflow-hidden rounded-[1.75rem] border border-[#164e63]/20 bg-[#0b2435] px-7 py-7 text-white shadow-[0_24px_60px_-28px_rgb(7_61_82_/_65%)] max-lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)] max-md:min-h-0 max-md:grid-cols-1 max-md:gap-6 max-md:px-5 max-md:py-6";
export const homeHeroCopyClass =
  "relative z-10 flex max-w-[38rem] flex-col items-start justify-center gap-4";
export const homeHeroEyebrowClass =
  "inline-flex items-center gap-2 rounded-full border border-cyan-100/20 bg-cyan-50/8 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.2em] text-cyan-100/80 uppercase";
export const homeHeroTitleClass =
  "max-w-[13ch] text-[clamp(2.15rem,5vw,4.4rem)] leading-[0.98] font-[760] tracking-[-0.06em] text-balance text-white";
export const homeHeroDescriptionClass =
  "max-w-[34rem] text-[0.9rem] leading-7 text-slate-200/78 md:text-[0.98rem]";
export const homeHeroActionsClass = "flex flex-wrap items-center gap-2 pt-1";
export const homeHeroSignalClass =
  "relative z-10 flex min-h-[14rem] flex-col justify-between overflow-hidden rounded-[1.25rem] border border-cyan-100/15 bg-[#102f42]/82 p-5 shadow-[inset_0_1px_0_rgb(255_255_255_/_8%)] max-md:min-h-[11rem]";
export const homeHeroMetricClass =
  "flex items-center justify-between border-b border-cyan-100/10 py-3 first:pt-0 last:border-b-0 last:pb-0";

// `my-0!` beats the layout's `[&_[data-slot=card]]:mt-2` card spacing.
export const homeIpOverviewClass =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-stretch gap-4 max-md:gap-3 max-xs:grid-cols-1 [&>[data-slot=card]]:my-0! [&>[data-slot=card]]:h-auto [&_[data-slot=sweep-shine]]:text-[0.8rem] [&_[data-slot=sweep-shine]]:font-normal";
export const homeNetworkOverviewClass =
  "grid grid-cols-2 items-stretch gap-4 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-3 [&>[data-slot=card]]:my-0! [&>[data-slot=card]]:min-w-0 [&>[data-slot=card]>[data-slot=card-content]]:grid [&>[data-slot=card]>[data-slot=card-content]]:flex-1";
export const homePingGridClass = "grid h-full grid-cols-2 gap-2 max-md:gap-1.5";

// IP overview card: the old `.home-page .home-primary-card` border beat the
// layout's card reset, hence `border!`.
export const homePrimaryCardClass =
  "border! border-primary/15 bg-card/78 shadow-tool backdrop-blur-sm";
export const homePrimaryBlockClass = "min-w-0 rounded-none bg-transparent";
