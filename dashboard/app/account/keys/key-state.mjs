// Presentation only; key permissions and quota enforcement remain server-owned.
export function keyStatus(item, now = Date.now()) {
  if (!item.isActive) return 'revoked';
  if (item.expired || (item.expiresAt && Date.parse(item.expiresAt) <= now)) return 'expired';
  if (item.exhausted || (item.tokenLimit > 0 && item.tokensUsed >= item.tokenLimit)) return 'exhausted';
  return 'active';
}

export function keyQuota(item) {
  const used = Number(item.tokensUsed) || 0;
  const limit = Number(item.tokenLimit);
  if (!(limit > 0)) return { limit: null, used, remaining: null, percent: null };
  const remaining = Math.max(0, Number(item.remainingTokens ?? (limit - used)));
  return { limit, used, remaining, percent: Math.min(100, remaining / limit * 100) };
}

export function matchesKey(item, query, status, now = Date.now()) {
  const search = query.trim().toLocaleLowerCase('id-ID');
  return (status === 'all' || keyStatus(item, now) === status)
    && [item.name, item.id].some(value => String(value ?? '').toLocaleLowerCase('id-ID').includes(search));
}
