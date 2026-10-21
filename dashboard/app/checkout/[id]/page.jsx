'use client';
import Skeleton from '../../components/Skeleton';
import {useEffect,useState} from 'react';
import {useParams,useRouter} from 'next/navigation';
import CustomerShell,{CustomerAlert,loginHref} from '../../components/CustomerShell';
import {useCustomerSession} from '../../components/SiteHeader';
import {Alert,PaymentCard,checkoutStorageKey,usePaymentResource,rupiah} from '../../merchant/components/ui';
import styles from './checkout.module.css';
export default function Checkout(){const {id}=useParams();return <CheckoutOrder key={id} id={id}/>;}
function CheckoutOrder({id}){
  const router=useRouter();const session=useCustomerSession();const [token,setToken]=useState(null);const [storageChecked,setStorageChecked]=useState(false);const [revealed,setRevealed]=useState(false);const [notice,setNotice]=useState('');
  useEffect(()=>{try{setToken(sessionStorage.getItem(checkoutStorageKey(id)))}catch{}setStorageChecked(true)},[id]);
  const next=`/checkout/${encodeURIComponent(id)}`;
  useEffect(()=>{if(!session.loading&&!session.customer&&!session.error)router.replace(loginHref(next))},[session.loading,session.customer,session.error,next,router]);
  const resource=usePaymentResource({path:`/commerce-api/orders/${encodeURIComponent(id)}`,headers:token?{'X-Checkout-Token':token}:{},enabled:storageChecked&&!!session.customer,onUnauthorized:()=>{setRevealed(false);router.replace(loginHref(next));session.reload()}});
  const order=session.customer?resource.data:null;const paid=order?.payment?.status==='settlement';const fulfilled=paid&&order?.fulfilled===true;const topup=order?.kind==='topup';const wallet=order?.funding==='wallet';const apiKey=fulfilled&&!topup&&typeof order.api_key==='string'?order.api_key:'';
  const inactive=['cancel','expire','deny','failure'].includes(order?.payment?.status);
  const status=fulfilled?'Selesai':paid?'Pembayaran diterima':inactive?'Invoice tidak aktif':'Menunggu pembayaran';
  useEffect(()=>{if(order&&token){try{sessionStorage.removeItem(checkoutStorageKey(id))}catch{}setToken(null)}},[order,token,id]);
  useEffect(()=>{if(fulfilled&&(topup||wallet))window.dispatchEvent(new Event('wallet-updated'))},[fulfilled,topup,wallet]);
  async function copyKey(){try{await navigator.clipboard.writeText(apiKey);setNotice('Kunci API berhasil disalin. Simpan di tempat yang aman.')}catch{setRevealed(true);setNotice('Penyalinan otomatis tidak tersedia. Salin kunci API secara manual.')}}
  return <CustomerShell view="buy" session={session}><main className={`${styles.checkout} wrap`}>
    <header className={styles.header}><div><a href="/account/billing">Saldo dan tagihan</a><h1>Pembayaran pesanan</h1><p>{topup?'Isi saldo akun melalui QRIS.':'Periksa rincian pesanan dan status pembayaran Anda.'}</p></div>{order&&<span className={styles.status} role="status">{status}</span>}</header>
    <CustomerAlert>{session.error}</CustomerAlert>{session.error&&<button className="small-button" onClick={session.reload}>Periksa sesi kembali</button>}
    {(session.loading||!storageChecked)&&<Skeleton rows={3} label="Memeriksa akses pesanan…" />}
    {session.customer&&<><CustomerAlert>{resource.error}</CustomerAlert>{!order&&(resource.busy?<Skeleton rows={4} label="Memuat pesanan…" />:<section className={styles.empty}><p>Pesanan belum dapat dimuat.</p><button className="small-button" onClick={()=>resource.refresh()}>Muat ulang pesanan</button></section>)}
    {order&&<div className={`${styles.layout} merchant-ui`}>
      <section className={styles.payment} aria-label="Pembayaran">
        {wallet?<div className="m-card"><span className="m-tag">Pembayaran dengan saldo</span><h2>{rupiah(order.payment.amount)}</h2><p>Pembayaran menggunakan saldo akun. Tidak diperlukan pembayaran QRIS tambahan.</p><button className="m-button" disabled={resource.busy} onClick={()=>resource.refresh()}>Periksa status aktivasi</button></div>:<PaymentCard key={order.payment.order_id} qrPath={`/commerce-api/orders/${encodeURIComponent(id)}/qr`} qrToken={token} payment={order.payment} busy={resource.busy} onRefresh={()=>resource.refresh()} onCancel={()=>resource.refresh(true)}/>}
        <details className={styles.help}><summary>Petunjuk pembayaran</summary><p>Pindai QRIS melalui aplikasi bank atau dompet digital. Periksa nominal dan penerima sebelum menyetujui pembayaran. Setelah pembayaran selesai, periksa status pada halaman ini.</p></details>
        <details className={styles.help}><summary>Status belum berubah setelah pembayaran?</summary><p>Jangan melakukan pembayaran ulang. Simpan bukti pembayaran dan hubungi pengelola dengan menyertakan nomor pesanan. Gangguan pemeriksaan status tidak berarti pembayaran gagal.</p></details>
      </section>
      <aside className={styles.summary}><h2>Rincian pesanan</h2><dl><div><dt>Jenis pesanan</dt><dd>{topup?'Isi saldo':'Paket token'}</dd></div><div><dt>Nama</dt><dd>{order.packageName||'Pesanan AXIOM AI'}</dd></div><div><dt>Nomor pesanan</dt><dd>{order.id||id}</dd></div><div><dt>Akun</dt><dd>{session.customer.email}</dd></div><div className={styles.total}><dt>Total pembayaran</dt><dd>{rupiah(order.payment.amount)}</dd></div></dl>
        {paid&&!fulfilled&&<Alert kind="info">Pembayaran telah diterima. {topup?'Penambahan saldo':'Aktivasi paket'} sedang diproses. Jangan melakukan pembayaran ulang.</Alert>}
        {topup?<><p>Isi saldo tidak menerbitkan kunci API. Saldo ditambahkan setelah pembayaran terverifikasi.</p>{fulfilled&&<Alert kind="info">Saldo berhasil ditambahkan.</Alert>}<a className="m-button" href="/account/billing">Lihat mutasi saldo</a></>:<>{fulfilled&&<section className={styles.key} aria-label="Akses API paket"><h3>Paket telah aktif</h3>{apiKey?<><label>Kunci API<input className="m-secret" readOnly value={revealed?apiKey:'••••••••••••••••••••••••'} aria-label={revealed?'Kunci API Anda':'Kunci API disembunyikan'} autoComplete="off" spellCheck="false"/></label><div className="m-actions"><button className="m-button" onClick={()=>setRevealed(v=>!v)} aria-pressed={revealed}>{revealed?'Sembunyikan':'Tampilkan kunci'}</button><button className="m-button" onClick={copyKey}>Salin kunci API</button></div><p>Jangan membagikan kunci API atau menyimpannya dalam kode frontend.</p><p role="status">{notice}</p><a href="/account/setup">Panduan konfigurasi</a></>:<Alert kind="info">Kunci API belum tersedia. Periksa kembali atau hubungi pengelola.</Alert>}</section>}<p>Kuota, masa aktif, dan akses model mengikuti paket yang dibeli.</p></>}
        {inactive&&<Alert kind="info">Invoice tidak aktif. Jika dana telah terpotong, hubungi pengelola sebelum membuat pembayaran baru.</Alert>}
        <nav className={styles.links} aria-label="Navigasi pesanan"><a href="/account/billing">Lihat pesanan</a><a href="/buy">Kembali ke daftar paket</a></nav>
      </aside>
    </div>}</>}
  </main></CustomerShell>;
}
