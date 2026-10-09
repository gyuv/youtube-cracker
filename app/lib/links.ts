import "server-only";
import type { Guide, ResourceLink } from "./types";

/** HEAD/GET-checks every link with a short timeout; drops obviously broken ones. */
async function check(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status === 405 || r.status === 403) {
      r = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    // 401/403/429 mean "exists but gated" — treat as live.
    return r.ok || [401, 403, 429].includes(r.status);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function verifyLinks(guide: Guide): Promise<Guide> {
  const all = new Map<string, Promise<boolean>>();
  const probe = (u: string) => {
    if (!all.has(u)) all.set(u, check(u));
    return all.get(u)!;
  };
  const mark = async (links: ResourceLink[]) => {
    const out = await Promise.all(links.map(async (l) => ({ ...l, verified: await probe(l.url) })));
    return out.filter((l) => l.verified);
  };
  const [resources, steps] = await Promise.all([
    mark(guide.resources),
    Promise.all(guide.steps.map(async (s) => ({ ...s, links: await mark(s.links) }))),
  ]);
  return { ...guide, resources, steps };
}
