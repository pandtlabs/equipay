import { nyAdapter } from "./ny.js";
import { nycAdapter } from "./nyc.js";

const ADAPTERS = [nyAdapter, nycAdapter];

// Host → adapter. An adapter registers under `hosts` (array) or `host`
// (single string). Add new states by appending to ADAPTERS.
const BY_HOST = {};
for (const adapter of ADAPTERS) {
  for (const host of adapter.hosts || [adapter.host]) {
    BY_HOST[host] = adapter;
  }
}

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
  return ADAPTERS;
}
