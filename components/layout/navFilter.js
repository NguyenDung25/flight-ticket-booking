export function hideCurrentPage(links, pathname) {
  const current = (pathname || "/").replace(/\/+$/, "") || "/";
  return links.filter((l) => l.plain || l.href !== current);
}
