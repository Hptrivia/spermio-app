// Hash routes, so the in-app back buttons and iOS swipe-back both work without a server.
export type Route = { name: string; params: Record<string, string> };

const PATTERNS: [string, RegExp][] = [
  ['home', /^\/?$/],
  ['settings', /^\/settings$/],
  ['restore', /^\/restore$/],
  ['patientNew', /^\/p\/new$/],
  ['patient', /^\/p\/(?<pid>[\w-]+)$/],
  ['patientEdit', /^\/p\/(?<pid>[\w-]+)\/edit$/],
  ['invoiceNew', /^\/p\/(?<pid>[\w-]+)\/invoice\/new$/],
  ['invoice', /^\/p\/(?<pid>[\w-]+)\/invoice\/(?<iid>[\w-]+)$/],
  ['entryNew', /^\/p\/(?<pid>[\w-]+)\/(?<kind>visit|child|note)\/new$/],
  ['entryEdit', /^\/p\/(?<pid>[\w-]+)\/(?<kind>visit|child|note)\/(?<eid>[\w-]+)$/],
];

export function currentRoute(): Route {
  const path = location.hash.replace(/^#/, '');
  for (const [name, re] of PATTERNS) {
    const m = path.match(re);
    if (m) return { name, params: { ...m.groups } };
  }
  return { name: 'home', params: {} };
}

export function go(path: string, replace = false): void {
  const hash = '#' + path;
  if (replace) location.replace(hash);
  else location.hash = hash;
}
