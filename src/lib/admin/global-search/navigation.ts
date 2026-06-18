/** True when the user is already on the record page for this search result. */
export function isGlobalSearchResultCurrentPage(
  pathname: string,
  search: string,
  href: string
): boolean {
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const normalizedSearch = search.startsWith("?") ? search : search ? `?${search}` : "";

  let targetPath = href;
  let targetSearch = "";
  const qIndex = href.indexOf("?");
  if (qIndex >= 0) {
    targetPath = href.slice(0, qIndex);
    targetSearch = href.slice(qIndex);
  }
  const normalizedTargetPath = targetPath.replace(/\/$/, "") || "/";

  if (normalizedPath !== normalizedTargetPath) return false;
  if (!targetSearch) return true;

  const currentParams = new URLSearchParams(normalizedSearch);
  const targetParams = new URLSearchParams(targetSearch);
  for (const [key, value] of targetParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}
