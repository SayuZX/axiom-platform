// Customer accounting uses one request ledger, never time/model joins to native logs.
export const ledgerRecords = `WITH records AS (
  SELECT 'ledger:' || l.api_key_id || ':' || l.request_id id, 'ledger' source,
    strftime('%Y-%m-%dT%H:%M:%fZ',l.requested_at/1000.0,'unixepoch') timestamp,
    l.requested_at sortTime, k.name keyAlias, l.provider, l.model, l.status,
    l.input_tokens inputTokens, l.output_tokens outputTokens, l.total_tokens totalTokens,
    l.debit_tokens debitTokens, l.sale_cost_idr saleCostIdr, l.billing_status billingStatus,
    l.usage_source usageSource, l.started_at startedAt, l.completed_at completedAt,
    CASE WHEN l.completed_at>=l.started_at THEN l.completed_at-l.started_at END processingMs,
    COALESCE(l.completed_at,l.started_at,l.requested_at) updatedAt
  FROM axiom_usage_ledger l LEFT JOIN apiKeys k ON k.id=l.api_key_id
  WHERE l.api_key_id IN (SELECT value FROM json_each(?))
)`;
const sum = (field, alias = field) => `CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN status='completed' THEN ${field} END) END ${alias}`;
export const usageTotals = `COUNT(*) requests, ${sum('inputTokens', 'promptTokens')}, ${sum('outputTokens', 'completionTokens')}, ${sum('totalTokens')}, CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(debitTokens) END debitTokens,
  CASE WHEN COUNT(*)>0 AND COUNT(*)=COUNT(saleCostIdr) THEN SUM(saleCostIdr) END saleCostIdr,
  COUNT(debitTokens) billedRequests,
  COALESCE(SUM(inputTokens IS NULL OR outputTokens IS NULL OR totalTokens IS NULL),0) unavailableUsageRequests,
  COALESCE(SUM(status IN ('started','streaming')),0) provisionalRequests,
  CASE WHEN COUNT(*)=0 THEN 'empty'
    WHEN COUNT(CASE WHEN status='completed' AND (inputTokens IS NOT NULL OR outputTokens IS NOT NULL OR totalTokens IS NOT NULL) THEN 1 END)=0 THEN 'unavailable'
    WHEN COUNT(CASE WHEN status='completed' AND inputTokens IS NOT NULL AND outputTokens IS NOT NULL AND totalTokens IS NOT NULL THEN 1 END)=COUNT(*) THEN 'complete'
    ELSE 'partial' END usageCompleteness,
  AVG(processingMs) averageTotalMs, MAX(updatedAt) lastUpdatedAt`;
