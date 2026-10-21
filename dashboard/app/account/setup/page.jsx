'use client';
import GlobalFeedback from '../../components/GlobalFeedback';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardShell from '../../components/DashboardShell';
import { customerRequest, DataState, download, useCustomerData } from '../components/CustomerData';
import { setupArtifact, setupTargets } from '../../../lib/setup-artifacts.mjs';
import modelPolicy from '../../../lib/model-policy.cjs';
import './setup.css';

const { policyAllowsModel } = modelPolicy;

export default function SetupPage() {
  const keys = useCustomerData('keys'), catalogue = useCustomerData('catalogue');
  const [target, setTarget] = useState('openclaw'), [keyId, setKeyId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const active = keys.data?.keys.filter(key => key.usable) || [];
  const selectedKey = active.find(key => key.id === keyId) || active[0];
  const models = (catalogue.data?.models || []).filter(item => selectedKey && policyAllowsModel(selectedKey, item.id));
  useEffect(() => { setError(''); setNotice(''); }, [selectedKey?.id]);

  async function configure(copy = false) {
    if (!selectedKey || !models.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await customerRequest(`keys/${encodeURIComponent(selectedKey.id)}/reveal`, { method: 'POST', body: '{}' });
      const file = setupArtifact(target, result.key, models);
      if (copy) await navigator.clipboard.writeText(file.content);
      else download(file.filename, file.content);
      setNotice(copy ? 'Konfigurasi disalin.' : `${file.filename} diunduh.`);
    } catch (failure) { setError(failure.message || 'Konfigurasi tidak dapat dibuat.'); }
    finally { setBusy(false); }
  }

  const current = setupTargets.find(item => item.id === target);
  return <DashboardShell title="One Click Setup">
    <div className="setup-flow">
      <DataState resource={keys} /><DataState resource={catalogue} />
      {keys.data && !active.length && <div className="setup-empty"><p>Belum ada API key yang dapat digunakan.</p><Link href="/account/keys">Periksa API key</Link></div>}
      {selectedKey && <>
        <div className="setup-choice" role="group" aria-label="Pilih aplikasi">
          {setupTargets.map(item => <button type="button" key={item.id} className={target === item.id ? 'is-selected' : ''} aria-pressed={target === item.id} onClick={() => { setTarget(item.id); setError(''); setNotice(''); }}><span>{item.label}</span><small>{item.kind}</small></button>)}
        </div>
        <div className="setup-workspace" key={target}>
          <div className="setup-fields">
            <label>API key<select value={selectedKey.id} disabled={busy} onChange={event => setKeyId(event.target.value)}>{active.map(key => <option key={key.id} value={key.id}>{key.name || key.id}</option>)}</select></label>
          </div>
          {models.length ? <>
            <div className="setup-result"><div><span>Konfigurasi {current.label}</span><strong>{models.length} model tersedia</strong></div><span className="setup-ready">Siap diunduh</span></div>
            <div className="setup-actions"><button type="button" className="setup-download" disabled={busy} onClick={() => configure(false)}>{busy ? 'Menyiapkan…' : 'Unduh konfigurasi'}<span aria-hidden="true">↗</span></button><button type="button" className="setup-copy" disabled={busy} onClick={() => configure(true)}>Salin isi</button></div>
            <p className="setup-hint">{current.guide}</p>
            <p className="setup-secret">Berkas dan teks yang disalin berisi API key. Simpan secara privat; jangan unggah ke repositori.</p>
            {notice && <GlobalFeedback info>{notice}</GlobalFeedback>}
            {error && <GlobalFeedback>{error}</GlobalFeedback>}
          </> : <p className="setup-hint">Tidak ada model yang diizinkan untuk API key ini.</p>}
        </div>
      </>}
      {error && !selectedKey && <GlobalFeedback>{error}</GlobalFeedback>}
    </div>
  </DashboardShell>;
}
