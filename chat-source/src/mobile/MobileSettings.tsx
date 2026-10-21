import { getAxiomHistory } from '../lib/axiomHistory';
import { useEffect, useState, type ReactNode } from 'react';
import { MobileNavigationIcon as Icon } from './MobileNavigationIcon';
import { ClientSwitch } from '../components/SDKPrimitives';
import { type ClientSettings } from '../lib/clientSettings';
import { type LocalProfile } from '../lib/localProfile';
import { libraryFiles } from '../lib/fileLibrary';
import { downloadFile } from '../desktop/ClientCollections';
import { AxiomUsage } from '../desktop/AxiomUsage';
import { modelLabel } from '../lib/axiomPresentation';
import { getAxiomSession, confirmAxiom } from '../lib/axiom';

type Props = {
  profile: LocalProfile | null; settings: ClientSettings; provider?: string; model?: string; titles: string[]; archived: string[];
  update: (change: Partial<ClientSettings>) => void; onProfile: (profile: LocalProfile) => void;
  onModels: () => void; onPlugins: () => void; onOpen: (title: string) => void;
  onArchive: (titles: string[]) => void; onNotice: (message: string) => void; onClose: () => void; onSignOut: () => void;
};

function Group({ title, children }: { title?: string; children: ReactNode }) { return <section className="m-setting-group">{title && <h2>{title}</h2>}<div className="m-setting-card">{children}</div></section>; }
function Row({ icon, title, detail, onClick, children, disabled = false }: { icon?: string; title: string; detail?: string; onClick?: () => void; children?: ReactNode; disabled?: boolean }) {
  const content = <>{icon && <Icon name={icon} size={22}/>}<span className="m-setting-label">{title}</span>{detail && <span className="m-setting-detail">{detail}</span>}{children}</>;
  return onClick ? <button type="button" className="m-setting-row" disabled={disabled} onClick={onClick}>{content}</button> : <div className="m-setting-row" aria-disabled={disabled || undefined}>{content}</div>;
}
const names: Record<string, string> = { root: 'Pengaturan', personalization: 'Personalisasi', memory: 'Memori', account: 'Akun', usage: 'Penggunaan dan batasan', appearance: 'Tampilan', accent: 'Warna aksen', general: 'Umum', notifications: 'Notifikasi', voice: 'Suara', security: 'Keamanan dan masuk', storage: 'Penyimpanan', privacy: 'Pusat privasi', data: 'Kontrol data', about: 'Tentang' };

export function MobileSettings(p: Props) {
  const [screen, setScreen] = useState('root'), [memory, setMemory] = useState('');
  const [storage, setStorage] = useState<string>(''), [voices, setVoices] = useState(() => window.speechSynthesis?.getVoices() || []);
  useEffect(() => { const synthesis = window.speechSynthesis; const refresh = () => setVoices(synthesis?.getVoices() || []); synthesis?.addEventListener('voiceschanged', refresh); refresh(); return () => synthesis?.removeEventListener('voiceschanged', refresh); }, []);
  const s = p.settings, update = p.update;
  const select = (label: string, value: string, options: [string, string][], change: (value: string) => void) => <select aria-label={label} value={value} onChange={event => change(event.target.value)}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
  const toggle = (title: string, value: boolean, change: (value: boolean) => void) => <Row title={title}><ClientSwitch label={title} value={value} change={change}/></Row>;
  const openStorage = async () => { setScreen('storage'); try { const files = await libraryFiles(); setStorage(`${files.length} file · ${(files.reduce((size, file) => size + file.size, 0) / 1024 / 1024).toFixed(1)} MB`); } catch { setStorage('Penyimpanan file tidak tersedia.'); } };
  const exportChats = () => { try { const { titles, content } = getAxiomHistory(); downloadFile('AXIOM AI-chats.json', JSON.stringify({ version: 1, titles, content }, null, 2), 'application/json'); } catch { p.onNotice('Ekspor obrolan gagal.'); } };
  const page = (key: string) => () => setScreen(key);
  return <div className="m-settings-screen">
    <header className="m-page-header"><button aria-label={screen === 'root' ? 'Back to chat' : 'Back to Settings'} className="m-page-back" onClick={screen === 'root' ? p.onClose : page('root')}><Icon name="arrow"/></button><h1>{names[screen]}</h1><span/></header>
    <div className="m-settings-body" key={screen}>
    {screen === 'root' ? <>
      <Group title="AXIOM AI saya"><Row icon="personal" title="Personalisasi" onClick={page('personalization')}/><Row icon="memory" title="Memori" onClick={page('memory')}/><Row icon="settings-plugins" title="Plugin" onClick={p.onPlugins}/></Group>
      <Group title="Akun"><Row icon="side-chat" title="Langganan" detail="Dikelola penyedia" onClick={page('account')}/><Row icon="bars" title="Penggunaan dan batasan" onClick={page('usage')}/><Row icon="mail" title="Email" detail="Tidak digunakan"/><Row icon="phone" title="Nomor telepon" detail="Tidak digunakan"/></Group>
      <Group><Row icon="sun" title="Tampilan" detail={{ system: 'Sistem', light: 'Terang', dark: 'Gelap' }[s.theme]} onClick={page('appearance')}><Icon name="down" size={14}/></Row><Row icon="paint" title="Warna aksen" detail={s.accent === '#2b6bca' ? 'Biru' : 'Kustom'} onClick={page('accent')}><i className="m-accent-dot" style={{ background: s.accent }}/><Icon name="down" size={14}/></Row></Group>
      <Group><Row icon="settings" title="Umum" onClick={page('general')}/><Row icon="bell" title="Notifikasi" onClick={page('notifications')}/><Row icon="wave" title="Suara" onClick={page('voice')}/><Row icon="shield" title="Keamanan dan masuk" onClick={page('security')}/><Row icon="computer" title="Kontrol jarak jauh" detail="Belum tersedia" disabled/><Row icon="globe" title="Browser cloud" detail="Belum tersedia" disabled/><Row icon="archive" title="Penyimpanan" onClick={() => void openStorage()}/><Row icon="shield" title="Pusat privasi" onClick={page('privacy')}/><Row icon="page" title="Kontrol data" onClick={page('data')}/><Row icon="bug" title="Laporkan bug" onClick={() => { downloadFile('AXIOM AI-diagnostics.json', JSON.stringify({ app: 'AXIOM AI', version: '0.3.0', platform: navigator.platform, viewport: { width: innerWidth, height: innerHeight }, nativeBridge: !!('__TAURI_INTERNALS__' in window) }, null, 2), 'application/json'); p.onNotice('Diagnostik diunduh. Sertakan saat melaporkan bug.'); }}/><Row icon="info" title="Tentang" onClick={page('about')}/></Group>
      <Group><Row icon="logout" title="Dashboard AXIOM" onClick={async () => { if (await confirmAxiom('Kembali ke dashboard AXIOM untuk mengelola akun?')) window.parent.location.assign('/dashboard'); }}/></Group>
    </> : screen === 'personalization' ? <>
      <Group><Row title="Nama akun AXIOM" detail={p.profile?.name}/><p className="m-setting-caption">Kelola identitas akun melalui dashboard AXIOM.</p></Group>
      <Group title="Instruksi khusus"><label className="m-setting-editor">Bagaimana AI merespons?<textarea rows={6} maxLength={20000} value={s.instructions} onChange={event => update({ instructions: event.target.value })}/></label><Row title="Gaya penulisan">{select('Gaya penulisan', s.writingStyle, [['balanced', 'Seimbang'], ['concise', 'Ringkas'], ['detailed', 'Terperinci']], value => update({ writingStyle: value as ClientSettings['writingStyle'] }))}</Row></Group>
      <p className="m-setting-caption">Instruksi dikirim bersama permintaan ke model pilihanmu.</p>
    </> : screen === 'memory' ? <><Group>{toggle('Gunakan memori tersimpan', s.memoriesEnabled, memoriesEnabled => update({ memoriesEnabled }))}</Group><p className="m-setting-caption">Hanya catatan yang kamu simpan sendiri yang digunakan kembali.</p><Group title="Catatan tersimpan">{s.memories.map((value, index) => <Row key={index} title={value}><button aria-label={'Hapus memori ' + (index + 1)} onClick={() => update({ memories: s.memories.filter((_, i) => i !== index) })}><Icon name="trash" size={18}/></button></Row>)}{!s.memories.length && <p className="m-setting-empty">Belum ada memori.</p>}<label className="m-setting-editor">Memori baru<textarea maxLength={2000} value={memory} onChange={event => setMemory(event.target.value)}/></label><button className="m-setting-save" disabled={!memory.trim() || s.memories.length >= 50} onClick={() => { update({ memories: [...s.memories, memory.trim()] }); setMemory(''); }}>Simpan memori</button></Group></>
    : screen === 'appearance' ? <><Group><div className="m-theme-options" role="radiogroup" aria-label="Tema">{([['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']] as const).map(([value, label]) => <label className="m-theme-option" key={value}><span>{label}</span><input type="radio" name="mobile-theme" value={value} checked={s.theme === value} onChange={() => update({ theme: value })}/></label>)}</div></Group><p className="m-setting-caption">Sistem mengikuti tampilan perangkat secara otomatis.</p><Group>{toggle('Kurangi animasi', s.motion === 'on', value => update({ motion: value ? 'on' : 'system' }))}</Group></>
    : screen === 'accent' ? <Group><div className="m-color-options">{[['#ffdf39', 'AXIOM Yellow'], ['#dceeff', 'Sky Blue'], ['#2b6bca', 'Biru'], ['#10a37f', 'Hijau'], ['#a66cdb', 'Ungu'], ['#e98b34', 'Oranye'], ['#e477a6', 'Merah muda']].map(([value, label]) => <button key={value} aria-pressed={s.accent === value} onClick={() => update({ accent: value })}><i style={{ background: value }}/>{label}{s.accent === value && <Icon name="check" size={18}/>}</button>)}</div></Group>
    : screen === 'general' ? <Group>{toggle('Saran di halaman utama', s.suggestions, suggestions => update({ suggestions }))}<Row title="Model" detail={modelLabel(p.model || '', getAxiomSession().models) || 'Belum dipilih'} onClick={p.onModels}/><Row title="Batas waktu respons"><input aria-label="Batas waktu respons" type="number" min={15} max={300} value={s.timeoutSeconds} onChange={event => update({ timeoutSeconds: Number(event.target.value) })}/><span>detik</span></Row></Group>
    : screen === 'notifications' ? <><Group>{toggle('Pengingat dalam aplikasi', s.notifications, notifications => update({ notifications }))}</Group><p className="m-setting-caption">Pengingat lokal diperiksa selama aplikasi terbuka. Notifikasi latar belakang sistem belum tersedia.</p></>
    : screen === 'voice' ? <><Group><Row title="Bahasa dikte">{select('Bahasa dikte', s.dictationLanguage, [['auto', 'Otomatis'], ['id-ID', 'Indonesia'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ja-JP', '日本語']], value => update({ dictationLanguage: value }))}</Row><Row title="Suara baca">{select('Suara baca', s.voice, [['', 'Default perangkat'], ...voices.map(v => [v.voiceURI, v.name] as [string, string])], voice => update({ voice }))}</Row><Row title="Kecepatan baca"><input aria-label="Kecepatan baca" type="range" min="0.5" max="2" step="0.1" value={s.voiceRate} onChange={event => update({ voiceRate: Number(event.target.value) })}/></Row>{toggle('Tanda baca otomatis', s.smartPunctuation, smartPunctuation => update({ smartPunctuation }))}</Group><p className="m-setting-caption">Dikte dan suara baca bergantung pada dukungan browser atau WebView perangkat.</p></>
    : screen === 'usage' ? <AxiomUsage/>
    : screen === 'data' ? <><Group><Row title="Ekspor obrolan" onClick={exportChats}/><Row title="Arsipkan semua obrolan" onClick={() => { p.onArchive([...new Set([...p.archived, ...p.titles])]); p.onNotice('Semua obrolan diarsipkan.'); }}/></Group><Group title="Obrolan diarsipkan">{p.archived.filter(title => p.titles.includes(title)).map(title => <Row key={title} title={title}><button aria-label={'Pulihkan ' + title} onClick={() => p.onArchive(p.archived.filter(value => value !== title))}>Pulihkan</button></Row>)}{!p.archived.length && <p className="m-setting-empty">Belum ada arsip.</p>}</Group></>
    : screen === 'storage' ? <Group><Row title="Library perangkat" detail={storage || 'Memeriksa…'}/><Row title="Obrolan lokal" detail={String(p.titles.length)}/><Row title="Ekspor obrolan" onClick={exportChats}/></Group>
    : screen === 'about' ? <><div className="m-setting-about"><img className="m-brand" src="/axiom-chat/axiom-logo.svg" alt=""/><h2>AXIOM AI</h2><p>Dibuat oleh RAYH4ZE (Raihan Nugroho).</p></div></>
    : screen === 'account' ? <><Group><Row title="Akun AXIOM" detail={p.profile?.name}/><Row title="Penyedia" detail={p.provider || 'Belum dipilih'}/></Group><p className="m-setting-caption">Identitas akun berasal dari sesi pelanggan AXIOM. Kelola akun di dashboard AXIOM.</p></>
    : screen === 'security' ? <><Group><Row title="API key" detail="Sesi ini"/></Group><p className="m-setting-caption">Autentikasi memakai cookie sesi AXIOM. API key mentah tidak dikirim ke browser.</p></>
    : <><Group><Row title="Kontrol data lokal" onClick={page('data')}/><Row title="Penyedia API" detail={p.provider || 'Belum dipilih'}/></Group><p className="m-setting-caption">Riwayat disimpan untuk akun AXIOM. Kebijakan retensi, pelatihan dan pemrosesan permintaan ditentukan penyedia API yang kamu pilih.</p></>}
    </div>
  </div>;
}
