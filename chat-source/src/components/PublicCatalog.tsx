import { useEffect, useState } from 'react';

type CatalogItem = { id: string; name: string; description: string; url: string; source: string };
function validItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (!['id', 'name', 'description', 'url', 'source'].every(key => typeof item[key] === 'string' && (item[key] as string).length <= 2048)) return false;
  try { const url = new URL(item.url as string); return Boolean(item.id && item.name && item.source) && url.protocol === 'https:' && !url.username && !url.password && ['registry.modelcontextprotocol.io', 'github.com'].includes(url.hostname); } catch { return false; }
}
export function PublicCatalog({ kind, query, mobile = false }: { kind: 'plugins' | 'skills'; query: string; mobile?: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setLoading(true); setError(''); setItems([]);
    void (async () => {
      try {
        const response = await fetch(`/customer-api/axiom-chat/catalog?kind=${kind}`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Masuk kembali melalui AXIOM AI.' : 'Katalog publik tidak tersedia. Coba lagi nanti.');
        const payload = await response.json();
        if (payload?.kind !== kind || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 20 || !payload.items.every(validItem) || new Set(payload.items.map((item: CatalogItem) => item.id)).size !== payload.items.length) throw new Error('Data katalog publik tidak valid.');
        if (active) setItems(payload.items);
      } catch (failure) { if (active) setError(controller.signal.aborted ? 'Katalog publik terlalu lama merespons. Coba lagi.' : failure instanceof Error ? failure.message : 'Katalog publik tidak tersedia.'); }
      finally { clearTimeout(timer); if (active) setLoading(false); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [kind, attempt]);
  const visible = items.filter(item => `${item.name} ${item.description} ${item.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section aria-label={`Katalog publik ${kind}`}><h2>{kind === 'plugins' ? 'Plugin publik' : 'Skills publik'}</h2><p className={mobile ? 'm-setting-caption' : 'd-local-subtitle'}>Daftar publik dari sumber asli, bukan contoh. Hanya untuk dibaca; tidak memasang atau menjalankan plugin maupun skill di browser. Menampilkan hingga 20 entri sumber.</p>
    {loading && <p role="status">Memuat katalog publik…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>Coba lagi</button></div>}
    <div className={mobile ? 'm-library-grid' : 'd-functional-cards'}>{visible.map(item => <section className={mobile ? 'm-library-card' : undefined} key={item.id}><h3>{item.name}</h3><p>{item.description}</p><p>{item.source}</p><a href={item.url} target="_blank" rel="noopener noreferrer">Buka sumber</a></section>)}</div>
    {!loading && !error && !visible.length && <p>Tidak ada hasil dalam katalog yang dimuat.</p>}
  </section>;
}
