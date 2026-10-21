export const SLOW_THRESHOLD_MS = 1000;

export function serviceState(service, loading = false) {
  if (loading || !service) return 'unknown';
  if (service.available === false) return 'down';
  if (service.available !== true || !Number.isFinite(service.latencyMs) || service.latencyMs < 0) return 'unknown';
  return service.latencyMs >= SLOW_THRESHOLD_MS ? 'slow' : 'healthy';
}

export function summaryState(states, maintenanceEnabled = false) {
  if (maintenanceEnabled === true || states.includes('down')) return 'down';
  if (maintenanceEnabled === null) return 'unknown';
  if (!states.length || states.includes('unknown')) return 'unknown';
  return states.includes('slow') ? 'slow' : 'healthy';
}
