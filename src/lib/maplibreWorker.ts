import { setWorkerUrl } from 'maplibre-gl';

let configured = false;

export function ensureMapWorker(): void {
  if (typeof window === 'undefined' || configured) return;
  setWorkerUrl('/maplibre-gl-worker.mjs');
  configured = true;
}
