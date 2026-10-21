export function modelLabel(id: string, models: { id: string; name: string }[]): string {
  const name = models.find(model => model.id === id)?.name?.trim();
  return (name || id).split('/').pop()!.replace(/-/g, ' ');
}
export function desktopScale(width: number, mobile: boolean): number {
  return mobile ? 1 : .85 * Math.min(1, width / 1920);
}
export type KeyUsage = {
  keyId: string; tokenLimit: number; tokensUsed: number; remainingTokens: number | null;
  debitedTokens: number; spentIdr: number | null; requests: number;
  recent: { model: string; inputTokens: number | null; outputTokens: number | null; debitTokens: number | null; saleCostIdr: number | null; requestedAt: number }[];
  daily: { date: string; requests: number; debitedTokens: number; spentIdr: number | null }[];
};
export async function fetchKeyUsage(keyId: string, signal?: AbortSignal): Promise<KeyUsage> {
  const response = await fetch(`/customer-api/axiom-chat/key/${encodeURIComponent(keyId)}/usage`, { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error('Penggunaan akun belum dapat dimuat. Coba lagi.');
  const value = await response.json();
  const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!value || value.keyId !== keyId || !['tokenLimit', 'tokensUsed', 'debitedTokens', 'requests'].every(key => count(value[key])) || !(value.spentIdr === null || count(value.spentIdr)) || !(value.remainingTokens === null || count(value.remainingTokens)) || !Array.isArray(value.daily) || value.daily.length !== 7 || !value.daily.every((day: KeyUsage['daily'][number]) => day && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && count(day.requests) && count(day.debitedTokens) && (day.spentIdr === null || count(day.spentIdr))) || !Array.isArray(value.recent) || !value.recent.every((row: KeyUsage['recent'][number]) => row && typeof row.model === 'string' && Number.isSafeInteger(row.requestedAt) && row.requestedAt >= 0 && ['inputTokens', 'outputTokens', 'debitTokens', 'saleCostIdr'].every(key => row[key as keyof typeof row] === null || count(row[key as keyof typeof row])))) throw new Error('Respons penggunaan akun tidak valid.');
  return value;
}
