import { ClientEmpty } from '../components/SDKPrimitives';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import type { EndpointProfile } from '../lib/endpointProfiles';
import { modelLabel } from '../lib/axiomPresentation';
import { getAxiomSession } from '../lib/axiom';

export function ProviderModelMenu({ profiles, selectedId, model, availableKeyIds, position, onSelect, onClose }: { profiles: EndpointProfile[]; selectedId: string | null; model: string; availableKeyIds: string[]; position: CSSProperties; onSelect: (profile: EndpointProfile, model: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  const modelNames = new Map(getAxiomSession().models.map(model => [model.id, model.name]));
  const groups = profiles.map(profile => ({ profile, models: profile.models.filter(id => (profile.name + ' ' + id + ' ' + (modelNames.get(id) || '')).toLowerCase().includes(query.toLowerCase())) })).filter(group => group.models.length);
  let remaining = limit;
  const visible = groups.map(group => { const models = group.models.slice(0, remaining); remaining -= models.length; return { ...group, models }; }).filter(group => group.models.length);
  const count = groups.reduce((sum, group) => sum + group.models.length, 0);
  const selected = profiles.find(profile => profile.id === selectedId);
  const ready = !!selected?.model && (selected.auth === 'none' || availableKeyIds.includes(selected.id));
  return <div className="d-popover d-models d-provider-models" style={{ ...position, right: 'auto', bottom: 'auto' }} role="dialog" aria-label="Pilih model" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  }}>
    <div className={'d-provider-status ' + (ready ? 'd-is-ready' : '')}>
      <span aria-hidden="true"/>
      <div><b>{selected?.name || 'Belum ada key AXIOM'}</b><small>{ready ? 'Siap digunakan' : 'Kelola key melalui dashboard AXIOM'}</small></div>
    </div>
    <div className="d-model-search"><I name="search" size={18}/><input ref={search} aria-label="Cari model" placeholder="Cari model" value={query} onChange={event => { setQuery(event.target.value); setLimit(100); }}/></div>
    <div className="d-model-options" role="listbox" aria-label="Model tersedia">
      {visible.map(({ profile, models }) => <div role="group" aria-label={profile.name} key={profile.id}><p>{profile.name}</p>{models.map(id => <button role="option" aria-selected={selectedId === profile.id && model === id} key={id} onClick={() => onSelect(profile, id)}><span>{modelLabel(id, getAxiomSession().models)}</span>{selectedId === profile.id && model === id && <I name="check" size={18}/>}</button>)}</div>)}
      {count > limit && <button className="d-model-load" onClick={() => setLimit(value => value + 100)}>Tampilkan lebih banyak ({count - limit})</button>}
      {!groups.length && <ClientEmpty className="d-model-empty" title={profiles.length ? 'Model tidak ditemukan.' : 'Belum ada key AXIOM tersedia.'}/>}
    </div>
  </div>;
}
