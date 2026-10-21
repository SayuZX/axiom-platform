'use client';
import GlobalFeedback, { OverlayPortal } from '../../components/GlobalFeedback';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import DashboardShell from '../../components/DashboardShell';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import {request,errorLabel,rupiah,dateLabel} from '../../merchant/components/ui';
import './billing.css';

const checkout=id=>'/checkout/'+encodeURIComponent(id);
const number=new Intl.NumberFormat('id-ID');
const states={creating:'Menyiapkan',unknown:'Perlu diperiksa',pending:'Menunggu pembayaran',settlement:'Lunas',expire:'Kedaluwarsa',expired:'Kedaluwarsa',cancel:'Dibatalkan',cancelled:'Dibatalkan',deny:'Ditolak',failure:'Gagal'};
const stateLabel=state=>states[state]||state;

export default function CustomerBilling(){
  const router=useRouter();
  const [wallet,setWallet]=useState(null),[orders,setOrders]=useState([]),[packages,setPackages]=useState([]);
  const [error,setError]=useState(''),[actionError,setActionError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [tab,setTab]=useState('transactions'),[status,setStatus]=useState('all'),[page,setPage]=useState(0);
  const [modal,setModal]=useState(null),[packageId,setPackageId]=useState(''),[amount,setAmount]=useState('10000');
  const [purchaseUncertain,setPurchaseUncertain]=useState(false),[topupUncertain,setTopupUncertain]=useState(false);
  const purchase=useRef(null),topup=useRef(null),flight=useRef(false),dialog=useRef(null);
  useEffect(()=>{
    const c=new AbortController();setLoading(true);setError('');
    Promise.all([request('/wallet-api/summary',{signal:c.signal}),request('/commerce-api/orders',{signal:c.signal}),request('/commerce-api/packages',{signal:c.signal})])
      .then(([w,o,p])=>{if(!c.signal.aborted){setWallet(w);setOrders(o.orders);setPackages(p.packages);}})
      .catch(e=>{if(!c.signal.aborted){setError(errorLabel(e));if(e.status===401)router.replace('/account/login?next=%2Faccount%2Fbilling');}})
      .finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[revision,router]);
  useEffect(()=>{if(!modal)return;const previous=document.activeElement;return()=>{if(previous?.isConnected)previous.focus();};},[modal]);
  const chosen=packages.find(p=>p.id===packageId);
  const rows=tab==='transactions'?(wallet?.transactions||[]):orders.filter(o=>status==='all'||o.state===status);
  const pages=Math.max(1,Math.ceil(rows.length/10)),currentPage=Math.min(page,pages-1);
  const visible=rows.slice(currentPage*10,currentPage*10+10);
  function open(value){setActionError('');setModal(value);}
  function close(){if(!flight.current){dialog.current.close();setModal(null);}}
  async function submit(event,type){
    event.preventDefault();if(flight.current)return;
    let body;
    if(type==='topups'){
      if(topupUncertain)return;
      const value=Number(amount);
      if(!Number.isSafeInteger(value)||value<1000||value>10000000){setActionError('Masukkan Rp1.000–Rp10.000.000 dalam Rupiah bulat.');return;}
      topup.current={amount:value};body=topup.current;
    }else{
      const reviewed=modal?.type==='purchase'?modal.pkg:null;
      if(!reviewed)return;
      if(purchaseUncertain&&purchase.current?.package_id!==reviewed.id)return;
      if(purchase.current?.package_id!==reviewed.id)purchase.current={package_id:reviewed.id,request_id:crypto.randomUUID()};
      body=purchase.current;
    }
    flight.current=true;setBusy(true);setActionError('');
    try{
      const data=await request('/wallet-api/'+type,{method:'POST',body});
      if(!data.id)throw Error('Respons pesanan tidak lengkap. Periksa tagihan sebelum mengulang.');
      window.dispatchEvent(new Event('wallet-updated'));
      router.push(checkout(data.id));
    }catch(e){
      const uncertain=!e.status||e.status>=500;
      if(type==='topups'&&uncertain)setTopupUncertain(true);
      if(type==='purchase'&&uncertain)setPurchaseUncertain(true);
      setActionError(errorLabel(e));
      if(e.status===401)router.replace('/account/login?next=%2Faccount%2Fbilling');
    }finally{flight.current=false;setBusy(false);setRevision(v=>v+1);}
  }
  function showInvoices(){close();setTab('orders');setStatus('all');setPage(0);setRevision(v=>v+1);}
  return <DashboardShell title="Saldo & tagihan" description="Kelola saldo Rupiah, beli kuota token, dan periksa pembayaran Anda.">
    <div className="billing-workspace">
      {error&&<GlobalFeedback>{error} <button className="dash-button" onClick={()=>setRevision(v=>v+1)} disabled={loading}>Coba muat ulang</button></GlobalFeedback>}
      <div className="billing-summary">
        <section className="billing-wallet" aria-labelledby="balance-title">
          <h2 id="balance-title"><Icon name="wallet" size={18} /> Saldo tersedia</h2>
          {loading&&!wallet?<Skeleton rows={1}/>:<strong className="billing-balance">{wallet?rupiah(wallet.balance):'Tidak tersedia'}</strong>}
          <button className="dash-button dash-button-primary billing-primary" onClick={()=>open({type:'topup'})} disabled={busy||!wallet}><Icon name="wallet" size={16}/> Isi saldo via QRIS</button>
          <span className="billing-caption">Saldo Rupiah · bukan kuota token</span>
        </section>
        <section className="billing-package" aria-labelledby="package-title">
          <h2 id="package-title"><Icon name="tokens" size={18}/> Beli kuota token</h2>
          <form className="dash-form" onSubmit={e=>{e.preventDefault();if(chosen)open({type:'purchase',pkg:chosen});}}>
            <label>Paket token<select value={packageId} onChange={e=>setPackageId(e.target.value)} required disabled={busy||!wallet||purchaseUncertain}><option value="">Pilih paket</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name} · {rupiah(p.price)}</option>)}</select></label>
            {chosen&&<div className="billing-quota"><strong>{number.format(chosen.tokenLimit)} token</strong><span>Berlaku {chosen.validDays} hari · {rupiah(chosen.price)}</span></div>}
            <button className="dash-button" disabled={busy||!wallet||!chosen}>{purchaseUncertain?'Tinjau pembelian sebelumnya':'Tinjau pembelian'}</button>
            {!loading&&!packages.length&&<span className="billing-caption">Paket belum tersedia</span>}
          </form>
        </section>
      </div>
      {wallet?.pending_topups?.length>0&&<section className="billing-pending" aria-labelledby="pending-title"><h2 id="pending-title">Isi saldo belum selesai</h2><p>Buka invoice yang sudah ada untuk membayar atau memeriksa status. Tidak perlu membuat invoice baru.</p><ul>{wallet.pending_topups.map(o=><li key={o.id}><a href={checkout(o.id)}><strong>{rupiah(o.amount)}</strong><span>{stateLabel(o.state)}</span><span>Buka invoice</span></a></li>)}</ul></section>}
      <section className="billing-history" aria-label="Riwayat saldo dan tagihan">
        <div className="billing-toolbar"><div className="billing-tabs" role="tablist" aria-label="Jenis riwayat">{[['transactions','Mutasi saldo'],['orders','Tagihan']].map(([id,label])=><button key={id} id={'billing-tab-'+id} role="tab" aria-selected={tab===id} aria-controls="billing-history-panel" tabIndex={tab===id?0:-1} onClick={()=>{setTab(id);setPage(0);}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'transactions':e.key==='End'?'orders':tab==='orders'?'transactions':'orders';setTab(next);setPage(0);document.getElementById('billing-tab-'+next)?.focus();}}}>{label}</button>)}</div><button className="dash-button" onClick={()=>setRevision(v=>v+1)} disabled={busy||loading}>Perbarui</button></div>
        <div id="billing-history-panel" role="tabpanel" aria-labelledby={'billing-tab-'+tab} aria-busy={loading} tabIndex={0}>
          <div className="billing-filter"><span className="billing-caption">{rows.length} catatan</span>{tab==='orders'&&<label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Semua status</option>{[...new Set(orders.map(o=>o.state))].map(s=><option value={s} key={s}>{stateLabel(s)}</option>)}</select></label>}</div>
          {loading?<Skeleton rows={4}/>:!rows.length?<div className="billing-empty" aria-label="Riwayat kosong">—</div>:<div className="billing-table-scroll"><table><thead><tr><th scope="col">{tab==='transactions'?'Transaksi':'Tagihan'}</th><th scope="col">Waktu</th><th scope="col">Nominal</th><th scope="col">{tab==='transactions'?'Saldo setelah':'Status'}</th><th scope="col"><span className="dash-sr-only">Detail</span></th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><strong>{tab==='transactions'?(row.kind==='topup'?'Isi saldo':'Pembelian paket'):row.packageName}</strong><small>{tab==='transactions'?row.reference:row.funding==='wallet'?'Saldo Rupiah':'QRIS'}</small></td><td data-label="Waktu">{dateLabel(row.created_at)}</td><td data-label="Nominal" className={tab==='transactions'&&row.amount>0?'billing-credit':''}>{tab==='transactions'?(row.amount<0?'−':'+'):''}{rupiah(Math.abs(row.amount))}</td><td data-label={tab==='transactions'?'Saldo setelah':'Status'}>{tab==='transactions'?rupiah(row.balance_after):<span className="billing-status">{stateLabel(row.state)}</span>}</td><td><button className="dash-button" aria-label={'Detail '+(row.packageName||row.reference)} onClick={()=>open({type:'detail',row,source:tab})}>Detail</button></td></tr>)}</tbody></table></div>}
          {rows.length>0&&!loading&&<div className="billing-pagination"><p>{`${currentPage*10+1}–${Math.min((currentPage+1)*10,rows.length)} dari ${rows.length}`} · Maksimal 100 catatan terbaru</p><div><button className="dash-button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Sebelumnya</button><button className="dash-button" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Berikutnya</button></div></div>}
        </div>
      </section>
      {modal&&<OverlayPortal dialog><dialog ref={node=>{dialog.current=node;if(node&&!node.open)node.showModal();}} className="billing-dialog" aria-labelledby="billing-dialog-title" onCancel={e=>{if(flight.current)e.preventDefault();else setModal(null);}} onClose={()=>{if(!flight.current)setModal(null);}}>
        <div className="billing-dialog-head"><h2 id="billing-dialog-title">{modal.type==='topup'?'Isi saldo via QRIS':modal.type==='purchase'?'Konfirmasi pembelian':'Detail transaksi'}</h2><button className="dash-button" type="button" onClick={close} disabled={busy} aria-label="Tutup dialog">Tutup</button></div>
        {actionError&&<GlobalFeedback>{actionError}</GlobalFeedback>}
        {modal.type==='topup'&&<form className="dash-form" onSubmit={e=>submit(e,'topups')}><p>Buat invoice, lalu lanjutkan pembayaran pada halaman QRIS. Membuat invoice tidak mendebit rekening.</p><label>Nominal isi saldo (Rp)<input type="number" min="1000" max="10000000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy||topupUncertain}/></label><p>Rp1.000–Rp10.000.000. Bayar hanya nominal yang tampil pada invoice.</p>{topupUncertain?<div className="billing-warning" role="status"><p>Hasil pembuatan invoice belum dapat dipastikan. Jangan membuat ulang; perbarui tagihan dan buka invoice yang sudah tercatat.</p><button type="button" className="dash-button" onClick={showInvoices}>Periksa tagihan</button></div>:<button className="dash-button billing-primary" disabled={busy}>{busy?'Menyiapkan invoice…':'Buat invoice QRIS'}</button>}</form>}
        {modal.type==='purchase'&&<form className="dash-form" onSubmit={e=>submit(e,'purchase')}><p>Pembelian ini memotong saldo Rupiah, bukan memulai pembayaran QRIS.</p><dl className="billing-facts"><div><dt>Paket</dt><dd>{modal.pkg.name}</dd></div><div><dt>Kuota paket</dt><dd>{number.format(modal.pkg.tokenLimit)} token</dd></div><div><dt>Masa berlaku</dt><dd>{modal.pkg.validDays} hari</dd></div><div><dt>Harga</dt><dd>{rupiah(modal.pkg.price)}</dd></div><div><dt>Saldo saat ini</dt><dd>{wallet?rupiah(wallet.balance):'Tidak tersedia'}</dd></div>{!purchaseUncertain&&wallet&&wallet.balance>=modal.pkg.price&&<div><dt>Perkiraan saldo setelah pembelian</dt><dd>{rupiah(wallet.balance-modal.pkg.price)}</dd></div>}</dl>{purchaseUncertain?<div className="billing-warning"><p>Hasil pembelian belum dapat dipastikan. Periksa tagihan atau ulangi permintaan yang sama. ID pembelian tetap dipakai agar saldo tidak didebit dua kali.</p><button type="button" className="dash-button" onClick={showInvoices}>Periksa tagihan</button></div>:wallet&&wallet.balance<modal.pkg.price?<p className="billing-warning">Saldo tidak cukup. Isi saldo terlebih dahulu.</p>:<p>Kuota diterbitkan pada API key setelah pembelian diproses. Tidak ada pembelian sampai Anda menekan tombol konfirmasi.</p>}<button className="dash-button billing-primary" disabled={busy||!wallet||(!purchaseUncertain&&wallet.balance<modal.pkg.price)}>{busy?'Memproses…':purchaseUncertain?'Ulangi permintaan yang sama':'Konfirmasi · bayar '+rupiah(modal.pkg.price)}</button></form>}
        {modal.type==='detail'&&<><dl className="billing-facts"><div><dt>Referensi</dt><dd>{modal.row.reference||modal.row.id}</dd></div><div><dt>Waktu</dt><dd>{dateLabel(modal.row.created_at)}</dd></div><div><dt>Jenis</dt><dd>{modal.row.kind==='topup'?'Isi saldo':'Pembelian paket'}</dd></div><div><dt>Nominal</dt><dd>{modal.row.amount<0?'−':''}{rupiah(Math.abs(modal.row.amount))}</dd></div>{modal.source==='transactions'?<div><dt>Saldo setelah</dt><dd>{rupiah(modal.row.balance_after)}</dd></div>:<><div><dt>Paket / tagihan</dt><dd>{modal.row.packageName}</dd></div><div><dt>Status pembayaran</dt><dd>{stateLabel(modal.row.state)}</dd></div><div><dt>Sumber dana</dt><dd>{modal.row.funding==='wallet'?'Saldo Rupiah':'QRIS'}</dd></div><div><dt>{modal.row.kind==='topup'?'Pengisian saldo':'Penerbitan API key'}</dt><dd>{modal.row.fulfilled?'Selesai':'Belum selesai'}</dd></div></>}</dl><a className="dash-button" href={checkout(modal.row.reference||modal.row.id)}>Buka invoice dan periksa status</a></>}
      </dialog></OverlayPortal>}
    </div>
  </DashboardShell>;
}
