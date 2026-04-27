type RefreshRouter = {
  refresh: () => void;
};

export function refreshPreservingWindowScroll(router: RefreshRouter) {
  if (typeof document === "undefined") {
    router.refresh();
    return;
  }

  const el = document.querySelector<HTMLElement>("[data-lead-scroll-container='true']");
  const top = el?.scrollTop ?? 0;
  const left = el?.scrollLeft ?? 0;

  router.refresh();

  requestAnimationFrame(() => {
    if (!el) return;
    el.scrollTop = top;
    el.scrollLeft = left;
    requestAnimationFrame(() => {
      el.scrollTop = top;
      el.scrollLeft = left;
    });
  });
}
