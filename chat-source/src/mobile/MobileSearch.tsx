import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyAxiom } from '../lib/axiom';
import { libraryFiles } from '../lib/fileLibrary';
import type { LocalDocument } from '../desktop/ClientCollections';
import { MobileNavigationIcon as Icon } from './MobileNavigationIcon';
import { chatSearchItems, fileSearchItems, filterSearchItems, loadMobileProjects, type SearchFilter, type SearchItem } from './searchData';

const filters: [SearchFilter, string][] = [['Top', 'Teratas'], ['Chats', 'Obrolan'], ['Images', 'Gambar'], ['Documents', 'Dokumen'], ['Projects', 'Proyek']];
export function MobileSearch({ titles, archived, documents, onClose, onOpen, onProject }: { titles: string[]; archived: string[]; documents: LocalDocument[]; onClose: () => void; onOpen: (title: string) => void; onProject: (id: string) => void }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<SearchFilter>('Top');
  const [files, setFiles] = useState<SearchItem[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => { if (error) notifyAxiom(error); }, [error]);
  const [selected, setSelected] = useState<SearchItem | null>(null), [preview, setPreview] = useState('');
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let active = true;
    close.current?.focus({ preventScroll: true });
    setPreview('');
    if (selected && !selected.file) setPreview(selected.text || '');
    else if (selected?.file && (selected.file.type.startsWith('text/') || /\.(txt|md|json|csv|html?|js|ts|css|py|log)$/i.test(selected.title))) {
      void selected.file.blob.slice(0, 100000).text().then(text => { if (active) setPreview(text); }, () => { if (active) setError('Pratinjau file tidak dapat dibaca.'); });
    }
    return () => { active = false; };
  }, [selected]);
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = () => { const request = ++revision; setLoading(true); void libraryFiles().then(values => { if (active && request === revision) { setFiles(fileSearchItems(values)); setError(''); } }, () => { if (active && request === revision) setError('File lokal belum dapat dibaca.'); }).finally(() => { if (active && request === revision) setLoading(false); }); };
    refresh(); window.addEventListener('client-files-changed', refresh);
    return () => { active = false; window.removeEventListener('client-files-changed', refresh); };
  }, []);
  const chats = useMemo(() => chatSearchItems(titles, archived), [titles, archived]);
  const notes = useMemo<SearchItem[]>(() => documents.map(doc => ({ id: 'note:' + doc.id, title: doc.title, text: doc.text, detail: 'Dokumen', icon: 'document-file', kind: 'Documents', updated: doc.updated })), [documents]);
  const projects = useMemo<SearchItem[]>(() => loadMobileProjects().map(project => ({ id: project.id, title: project.name, text: project.chats.join('\n'), detail: 'Proyek', icon: 'folder', kind: 'Projects', updated: 0 })), []);
  const searching = !!query.trim();
  const results = filterSearchItems([...files, ...notes, ...chats, ...projects], query, filter);
  const recent = [...files, ...notes].sort((a, b) => b.updated - a.updated);
  const groups: [string, SearchItem[]][] = searching ? [['Obrolan', results.filter(item => item.kind === 'Chats')], ['File', results.filter(item => item.kind === 'Images' || item.kind === 'Documents')], ['Proyek', results.filter(item => item.kind === 'Projects')]] : [['File terbaru', recent]];
  function open(item: SearchItem) {
    if (item.kind === 'Chats') { onOpen(item.id); return; }
    if (item.kind === 'Projects') { onProject(item.id); return; }
    setSelected(item);
  }
  function download(item: SearchItem) {
    if (!item.file) return;
    const url = URL.createObjectURL(item.file.blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = item.title; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <section className="m-search-screen" role="dialog" aria-modal="true" aria-label="Pencarian" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (selected) setSelected(null); else onClose(); } }}>
    {selected ? <><header className="m-page-header"><button className="m-page-back" aria-label="Kembali ke pencarian" onClick={() => setSelected(null)}><Icon name="arrow"/></button><h1>{selected.title}</h1><span/></header><div className="m-search-preview"><p>{selected.detail}</p>{preview && <pre>{preview}</pre>}{selected.file && <button className="m-primary" onClick={() => download(selected)}>Unduh file</button>}</div></> : <>
      {searching && <nav className="m-search-filters" aria-label="Kategori pencarian">{filters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</nav>}
      <div className="m-search-results" aria-busy={loading}>
        {groups.map(([heading, items]) => (items.length > 0 || !searching) && <section key={heading}><h2>{heading}</h2>{items.map(item => <button className="m-search-result" key={item.kind + ':' + item.id} onClick={() => void open(item)}><span className={'m-search-file-icon m-kind-' + item.icon}><Icon name={item.icon}/></span><span className="m-search-result-copy"><span>{item.title}</span><small>{item.detail}</small></span></button>)}{!items.length && !loading && <p className="m-search-empty">Belum ada file tersimpan.</p>}</section>)}
        {loading && <div className="m-search-loading" role="status" aria-label="Memuat file">{[0, 1, 2].map(row => <span key={row}/>)}</div>}
        {searching && !results.length && !loading && <p className="m-search-empty">Tidak ada hasil untuk “{query.trim()}”.</p>}
      </div>
    </>}
    <footer className="m-search-footer"><label><Icon name="search"/><input aria-label="Cari" placeholder="Cari" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} type="search" autoComplete="off"/></label><button ref={close} aria-label="Tutup pencarian" onClick={onClose}><Icon name="close"/></button></footer>
  </section>;
}
