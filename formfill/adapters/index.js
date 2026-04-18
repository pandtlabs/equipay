import { nyAdapter } from "./ny.js";

// Host → adapter. Add new states by appending entries.
const BY_HOST = {
  [nyAdapter.host]: nyAdapter,
};

export function pickAdapterForHost(host) {
  // Exact host match first
  if (BY_HOST[host]) return BY_HOST[host];
  // Allow subdomain match (e.g., www.apps.labor.ny.gov)
  for (const [h, adapter] of Object.entries(BY_HOST)) {
    if (host.endsWith(`.${h}`) || host === h) return adapter;
  }
  return null;
}

export function allAdapters() {
  return Object.values(BY_HOST);
}
