'use client';
import GlobalFeedback from './GlobalFeedback';
import Skeleton from './Skeleton';

import { useEffect, useId, useState } from 'react';
import { estimatePackage, packageAllowsModel, validCalculatorPackage } from '../../lib/token-calculator.mjs';
import { estimateWeighted } from '../../lib/retail-pricing.mjs';

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 });
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 6 });
const rupiah = value => value > 0 && value < 0.000001 ? '< Rp0,000001' : currency.format(value);
const positiveLimit = value => Number.isSafeInteger(value) && value > 0;

export default function TokenCalculator() {
  const uid = useId();
  const [packages, setPackages] = useState([]);
  const [models, setModels] = useState([]);
  const [packageId, setPackageId] = useState('');
  const [modelId, setModelId] = useState('');
  const [packageStatus, setPackageStatus] = useState('loading');
  const [modelStatus, setModelStatus] = useState('loading');
  const [values, setValues] = useState({ input: '10000', output: '3000', requests: '1' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/commerce-api/packages', { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Paket tidak tersedia'); return response.json(); })
      .then(data => {
        if (!Array.isArray(data.packages) || !data.packages.every(validCalculatorPackage)) throw new Error('Paket tidak valid');
        if (controller.signal.aborted) return;
        setPackages(data.packages);
        const linkedPackage = new URLSearchParams(window.location.search).get('package');
        setPackageId(data.packages.some(item => item.id === linkedPackage) ? linkedPackage : data.packages[0]?.id || '');
        setPackageStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setPackageStatus('error'); });
    fetch('/site-api/catalog', { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Katalog tidak tersedia'); return response.json(); })
      .then(data => {
        if (data.available !== true || !Array.isArray(data.models)) throw new Error('Katalog tidak tersedia');
        const available = data.models.filter(model => model && typeof model.id === 'string' && typeof model.name === 'string');
        if (controller.signal.aborted) return;
        setModels(available);
        setModelId(available[0]?.id || '');
        setModelStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setModelStatus('error'); });
    return () => controller.abort();
  }, []);

  const pkg = packages.find(item => item.id === packageId);
  const availableModels = pkg ? models.filter(item => packageAllowsModel(pkg, item.id)) : [];
  const model = availableModels.find(item => item.id === modelId) || availableModels[0];
  useEffect(() => { setModelId(''); }, [packageId]);
  const estimate = estimatePackage(pkg, values);
  const hasErrors = Object.keys(estimate.errors).length > 0;
  const weighted = pkg && model && !hasErrors ? estimateWeighted(pkg, model, estimate) : null;
  const result = weighted ? { ...estimate, ...weighted } : null;
  const allowed = pkg && model ? packageAllowsModel(pkg, model.id) : null;
  const contextExceeded = model && !hasErrors && positiveLimit(model.contextWindow) && estimate.perRequest > model.contextWindow;
  const outputExceeded = model && !hasErrors && positiveLimit(model.maxOutput) && Number(values.output) > model.maxOutput;

  return <div className="calculator-shell package-calculator">
    <span className="eyebrow yellow">SIMULASI PAKET TOKEN / IDR</span>
    <h2>Berapa token yang Anda butuhkan?</h2>
    <p>Tarif jual AXIOM dihitung terpisah untuk input dan output model. Saldo paket tetap token, tetapi tiap request mendebit token berbobot sesuai tarif model.</p>
    <div className="calculator-grid">
      <div className="token-controls">
        <label htmlFor={`${uid}-package`} className="micro-label">PILIH PAKET</label>
        <select id={`${uid}-package`} value={packageId} onChange={event => { setPackageId(event.target.value); setModelId(''); }} disabled={!packages.length}>
          {!packages.length && <option value="">{packageStatus === 'loading' ? '—' : 'Paket belum tersedia'}</option>}
          {packages.map(item => <option key={item.id} value={item.id}>{item.name} · {rupiah(item.price)} · {number.format(item.tokenLimit)} token</option>)}
        </select>
        {packageStatus === 'loading' && <Skeleton rows={1} label="Memuat paket…" />}
        {packageStatus === 'error' && <GlobalFeedback>Paket belum dapat dimuat atau datanya tidak valid. Estimasi IDR tidak tersedia; muat ulang halaman untuk mencoba lagi.</GlobalFeedback>}
        {packageStatus === 'ready' && !packages.length && <p className="calculator-help" role="status">Belum ada paket aktif. Estimasi IDR menunggu paket yang dipublikasikan.</p>}
        <div className="calculator-model">
          <label htmlFor={`${uid}-model`} className="micro-label">MODEL / PEMERIKSAAN AKSES</label>
          <select id={`${uid}-model`} value={model?.id || ''} onChange={event => setModelId(event.target.value)} disabled={!availableModels.length}>
            {!availableModels.length && <option value="">{modelStatus === 'loading' ? '—' : 'Tidak ada model yang diizinkan'}</option>}
            {availableModels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        {modelStatus === 'loading' && <Skeleton rows={1} label="Memuat batas model…" />}
        {(modelStatus === 'error' || (modelStatus === 'ready' && !models.length)) && <GlobalFeedback>Katalog belum tersedia. Perhitungan IDR tetap berjalan; akses dan batas model belum dapat diperiksa.</GlobalFeedback>}
        <p id={`${uid}-help`} className="calculator-help">Masukkan angka bulat tanpa pemisah ribuan. Input atau output boleh 0, tetapi total per request minimal 1. Jumlah request 0 berarti belum ada pemakaian.</p>
        {[['input', 'Token input per request'], ['output', 'Token output per request'], ['requests', 'Jumlah request dalam workload']].map(([key, label]) => <div className="token-control" key={key}>
          <label htmlFor={`${uid}-${key}`}>{label}</label>
          <input id={`${uid}-${key}`} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} aria-invalid={Boolean(estimate.errors[key])} aria-describedby={`${uid}-help${estimate.errors[key] ? ` ${uid}-${key}-error` : ''}`}/>
          {estimate.errors[key] && <p id={`${uid}-${key}-error`} className="calculator-error" role="alert">{estimate.errors[key]}</p>}
        </div>)}
        {estimate.errors.total && <p className="calculator-error" role="alert">{estimate.errors.total}</p>}
      </div>
      <div className="cost-result">
        <span className="micro-label">TARIF JUAL MODEL / ESTIMASI PER REQUEST</span>
        <strong className="cost-unavailable" aria-live="polite">{result ? rupiah(result.perRequestCost) : hasErrors ? 'Periksa input' : model ? 'Tarif model belum diatur' : 'Pilih model'}</strong>
        <p>Tarif jual = (token input × harga input + token output × harga output) ÷ 1 juta. Debit token paket dibulatkan naik per request.</p>
        {pkg && <dl>
          <div><dt>Paket aktif</dt><dd>{pkg.name}</dd></div>
          <div><dt>Harga beli penuh di muka</dt><dd>{rupiah(pkg.price)}</dd></div>
          <div><dt>Kuota paket baru</dt><dd>{number.format(pkg.tokenLimit)} token</dd></div>
          <div><dt>Nilai per 1 juta token</dt><dd>{rupiah(pkg.price * (1_000_000 / pkg.tokenLimit))}</dd></div>
          <div><dt>Batas request per menit</dt><dd>{pkg.rpmLimit ? `${number.format(pkg.rpmLimit)} RPM` : 'Tidak dibatasi paket'}</dd></div>
          <div><dt>Konfigurasi token per menit</dt><dd>{pkg.tpmLimit ? `${number.format(pkg.tpmLimit)} TPM (konfigurasi)` : 'Tidak dibatasi paket'}</dd></div>
          <div><dt>Masa berlaku</dt><dd>{number.format(pkg.validDays)} hari</dd></div>
        </dl>}
        {result && <dl aria-live="polite">
          <div><dt>Debit token berbobot per request</dt><dd>{number.format(result.debitTokensPerRequest)}</dd></div>
          <div><dt>Kapasitas request utuh / paket</dt><dd>{number.format(result.requestCapacity)}</dd></div>
          <div><dt>Request dalam workload</dt><dd>{number.format(result.requests)}</dd></div>
          <div><dt>Total debit token berbobot workload</dt><dd>{number.format(result.workloadDebitTokens)}</dd></div>
          <div><dt>Tarif jual workload</dt><dd>{rupiah(result.workloadCost)}</dd></div>
          <div><dt>Porsi kuota workload</dt><dd>{result.quotaShare > 0 && result.quotaShare < 0.000001 ? '< 0,000001' : number.format(result.quotaShare)}%</dd></div>
          <div><dt>{result.remaining < 0 ? 'Kekurangan kuota' : 'Sisa kuota simulasi'}</dt><dd>{number.format(Math.abs(result.remaining))} token</dd></div>
        </dl>}
        {result?.remaining < 0 && <p className="token-warning" role="status">Workload melampaui kuota paket setelah bobot harga model diterapkan; pilih paket yang mencukupi.</p>}
        {pkg && <p className="calculator-access">Diizinkan: {!pkg.allowedModels?.length || pkg.allowedModels.includes('*') ? 'Semua model' : pkg.allowedModels.join(', ')}. Diblokir: {!pkg.blockedModels?.length ? 'Tidak ada' : pkg.blockedModels.includes('*') ? 'Semua model' : pkg.blockedModels.join(', ')}. Blokir diutamakan; ketersediaan mengikuti gateway.</p>}
        {pkg && models.length > 0 && !availableModels.length && <p className="token-warning" role="status">Tidak ada model katalog yang diizinkan paket ini. Pilih paket lain atau hubungi admin.</p>}
        {allowed === true && <p>Model pilihan termasuk cakupan paket. Ketersediaan tetap mengikuti gateway.</p>}
        {contextExceeded && <p className="token-warning" role="status">Total input + output per request melebihi context window model: {number.format(model.contextWindow)} token.</p>}
        {outputExceeded && <p className="token-warning" role="status">Output per request melebihi batas output model: {number.format(model.maxOutput)} token.</p>}
        {model && (!positiveLimit(model.contextWindow) || !positiveLimit(model.maxOutput)) && <p>Batas context atau output belum dipublikasikan lengkap; simulasi bukan jaminan request diterima.</p>}
        <div className="cost-note">Paket prabayar, bukan pay-as-you-go. Simulasi memakai saldo paket baru, bukan saldo key Anda. Input cache yang sudah termasuk input tidak ditagih dua kali; reasoning yang sudah termasuk output tidak ditagih lagi. Usage aktual dan debit final mengikuti laporan provider serta kebijakan router. Batas RPM, konteks, dan kedaluwarsa tetap berlaku.</div>
        {pkg && <a className="button yellow" href={`/buy?package=${encodeURIComponent(pkg.id)}`}>BELI PAKET {pkg.name} ↗</a>}
      </div>
    </div>
  </div>;
}
