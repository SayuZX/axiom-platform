'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowDown01Icon,
  Search01Icon,
  Add01Icon,
  Cancel01Icon,
  SentIcon,
  Attachment01Icon,
  Tick01Icon,
  TickDouble01Icon,
  MoreVerticalIcon,
  Message01Icon,
} from '@hugeicons/core-free-icons';
import { api, date } from '../lib/api';
import { CircleLoading, Failure } from './ui';
import { useUser } from './workspace';
import './support.css';

type Ticket = {
  id: string;
  subject: string;
  status: string;
  customer_id: string;
  username?: string;
  updated_at: string;
  last_message?: string;
  last_message_at?: string;
  latest_message_id?: number;
  unread_count?: number;
};
type Message = {
  id: number;
  actor_id: string;
  actor_username: string;
  body: string;
  internal: number;
  channel: string;
  created_at: string;
  attachment_name?: string;
  attachment_type?: string;
  reply_to_id?: number;
  reply_to?: Pick<Message, 'id' | 'actor_username' | 'body' | 'attachment_name'>;
  read_by_other?: boolean;
};
type Thread = {
  ticket: Ticket;
  messages: Message[];
  has_more: boolean;
  last_read_message_id: number;
  service_hours?: string;
};
type Inbox = { tickets: Ticket[]; total: number; service_hours?: string };
const statuses: Record<string, string> = {
  OPEN: 'Terbuka',
  WAITING_ADMIN: 'Menunggu pengelola',
  WAITING_CUSTOMER: 'Menunggu pelanggan',
  CLOSED: 'Ditutup',
};
const time = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
const day = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
const icon = (value: typeof Search01Icon, size = 20) => (
  <HugeiconsIcon icon={value} size={size} aria-hidden="true" />
);

export default function SupportPage({ admin = false, id }: { admin?: boolean; id?: string }) {
  const user = useUser();
  const router = useRouter();
  const base = admin ? '/api/admin/support' : '/api/support';
  const route = admin ? '/admin/bantuan' : '/dashboard/bantuan';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [inbox, setInbox] = useState<Inbox>();
  const [thread, setThread] = useState<Thread>();
  const [loadError, setLoadError] = useState<Error>();
  const [listError, setListError] = useState<Error>();
  const [error, setError] = useState<Error>();
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [internal, setInternal] = useState(false);
  const [reply, setReply] = useState<Message>();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadStart, setUnreadStart] = useState<number>();
  const [threadSearch, setThreadSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [hit, setHit] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [dragging, setDragging] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<Message>();
  const firstLoad = useRef(true);
  const readThrough = useRef(0);
  const reading = useRef(false);
  const request = useRef<{ payload: string; id: string; reply?: Message } | undefined>(undefined);
  const pendingScroll = useRef<number | undefined>(undefined);
  const bottom = useRef(true);
  const sending = useRef(false);
  const draftKey = `axiom:support:${admin ? 'admin' : 'customer'}:${user.id}:${id || 'new'}`;
  const active = Boolean(id || creating);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || '{}');
      setBody(draft.body || '');
      setSubject(draft.subject || '');
      setInternal(admin && draft.internal === true);
      const pending = JSON.parse(sessionStorage.getItem(`${draftKey}:pending`) || 'null');
      if (pending && typeof pending.payload === 'string' && typeof pending.id === 'string') {
        const payload = JSON.parse(pending.payload);
        request.current = pending;
        if (
          payload.message === (draft.body || '').trim() &&
          payload.internal === Boolean(draft.internal) &&
          (id || payload.subject === (draft.subject || '').trim())
        ) {
          setReply(pending.reply);
          if (payload.attachment) {
            const attachment = payload.attachment;
            const bytes = Uint8Array.from(atob(attachment.data), (value) => value.charCodeAt(0));
            setFile(new File([bytes], attachment.name, { type: attachment.type }));
          }
        }
      }
    } catch {
      /* Private browsing may deny draft storage. */
    }
    if (!id) setCreating(new URLSearchParams(window.location.search).get('baru') === '1');
  }, [draftKey]);
  const changeDraft = (text: string, title = subject, note = internal) => {
    setBody(text);
    setSubject(title);
    setInternal(note);
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ body: text, subject: title, internal: note }),
      );
    } catch {
      /* Sending does not depend on local storage. */
    }
  };
  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ponytail: visible-tab polling reuses the authenticated API; use SSE if concurrent support traffic warrants it.
  useEffect(() => {
    const controller = new AbortController();
    let working = false;
    const load = async () => {
      if (working || document.hidden) return;
      working = true;
      try {
        const query = new URLSearchParams({
          search,
          status: status || 'all',
          offset: String(offset),
          limit: '20',
        });
        const response = await api<Inbox>(`${base}?${query}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setInbox(response.data);
          setListError(undefined);
        }
      } catch (e) {
        if (!controller.signal.aborted) setListError(e as Error);
      } finally {
        working = false;
      }
    };
    const debounce = setTimeout(load, 200);
    const timer = setInterval(load, 5000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener('focus', load);
    };
  }, [base, search, status, offset, revision]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let working = false;
    const load = async () => {
      if (working || document.hidden) return;
      working = true;
      try {
        const response = await api<Thread>(`${base}/${encodeURIComponent(id)}?limit=50`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next = response.data;
        if (firstLoad.current) {
          readThrough.current = next.last_read_message_id || 0;
          setUnreadStart(
            next.messages.find(
              (message) => message.id > readThrough.current && message.actor_id !== user.id,
            )?.id,
          );
        }
        setThread((previous) => {
          if (!previous || previous.ticket.id !== next.ticket.id) return next;
          const gap = next.has_more && next.messages[0]?.id > (previous.messages.at(-1)?.id || 0);
          if (gap) return next;
          const messages = new Map(previous.messages.map((message) => [message.id, message]));
          next.messages.forEach((message) => messages.set(message.id, message));
          return {
            ...next,
            has_more: previous.has_more,
            messages: [...messages.values()].sort((a, b) => a.id - b.id),
          };
        });
        setLoadError(undefined);
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(e as Error);
      } finally {
        working = false;
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener('focus', load);
    };
  }, [base, id, revision, user.id]);

  useLayoutEffect(() => {
    const element = log.current;
    if (!element || !thread) return;
    if (pendingScroll.current !== undefined) {
      element.scrollTop += element.scrollHeight - pendingScroll.current;
      pendingScroll.current = undefined;
    } else if (firstLoad.current || bottom.current) {
      element.scrollTop = element.scrollHeight;
      bottom.current = true;
      setAtBottom(true);
    }
    firstLoad.current = false;
  }, [thread]);

  const markRead = useCallback(async () => {
    const latest = thread?.messages.at(-1)?.id;
    if (
      !id ||
      !latest ||
      latest <= readThrough.current ||
      !bottom.current ||
      document.hidden ||
      !document.hasFocus() ||
      document.querySelector('dialog[open]') ||
      reading.current
    )
      return;
    const lastMessage = document
      .getElementById(`support-message-${latest}`)
      ?.getBoundingClientRect();
    const viewport = log.current?.getBoundingClientRect();
    if (
      !lastMessage ||
      !viewport ||
      !viewport.height ||
      lastMessage.bottom > viewport.bottom + 1 ||
      lastMessage.bottom <= viewport.top
    )
      return;
    reading.current = true;
    try {
      await api(`${base}/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        body: JSON.stringify({ message_id: latest }),
      });
      readThrough.current = latest;
      setInbox(
        (value) =>
          value && {
            ...value,
            tickets: value.tickets.map((ticket) =>
              ticket.id === id ? { ...ticket, unread_count: 0 } : ticket,
            ),
          },
      );
    } catch {
      /* Read receipts retry on the next refresh; message delivery is unaffected. */
    } finally {
      reading.current = false;
    }
  }, [base, id, thread]);
  useEffect(() => {
    void markRead();
    window.addEventListener('focus', markRead);
    document.addEventListener('visibilitychange', markRead);
    return () => {
      window.removeEventListener('focus', markRead);
      document.removeEventListener('visibilitychange', markRead);
    };
  }, [markRead, atBottom]);

  const chooseFile = (next?: File) => {
    if (!next) return;
    if (
      !next.size ||
      next.size > 2097152 ||
      !['image/png', 'image/jpeg', 'application/pdf'].includes(next.type)
    ) {
      setError(new Error('Gunakan PNG, JPEG, atau PDF maksimal 2 MB.'));
      return;
    }
    if (next.name.length > 120) {
      setError(new Error('Nama lampiran maksimal 120 karakter.'));
      return;
    }
    setFile(next);
    setError(undefined);
  };
  const send = async () => {
    if (sending.current || !body.trim() || (!id && !subject.trim())) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    setNotice('');
    try {
      const payload: Record<string, unknown> = {
        message: body.trim(),
        internal,
        reply_to_id: reply?.id,
      };
      if (!id) payload.subject = subject.trim();
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let start = 0; start < bytes.length; start += 8192)
          binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        payload.attachment = { name: file.name, type: file.type, data: btoa(binary) };
      }
      const serialized = JSON.stringify(payload);
      if (request.current?.payload !== serialized)
        request.current = { payload: serialized, id: crypto.randomUUID(), reply };
      try {
        sessionStorage.setItem(`${draftKey}:pending`, JSON.stringify(request.current));
      } catch {
        /* Same-page retry still retains its idempotency key when storage is unavailable. */
      }
      const result = await api<{ ticket?: Ticket }>(
        id ? `${base}/${encodeURIComponent(id)}/messages` : base,
        { method: 'POST', body: JSON.stringify({ ...payload, request_id: request.current.id }) },
      );
      changeDraft('', '');
      setFile(undefined);
      setReply(undefined);
      setInternal(false);
      request.current = undefined;
      try {
        sessionStorage.removeItem(draftKey);
        sessionStorage.removeItem(`${draftKey}:pending`);
      } catch {
        /* Optional local draft. */
      }
      bottom.current = true;
      setAtBottom(true);
      if (result.data.ticket) router.push(`${route}/${result.data.ticket.id}`);
      else {
        refresh();
        input.current?.focus();
      }
      setNotice('Pesan tersimpan.');
    } catch (e) {
      setError(e as Error);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const older = async () => {
    if (!thread?.messages.length || loadingOlder) return;
    setLoadingOlder(true);
    setError(undefined);
    try {
      const result = await api<Thread>(
        `${base}/${encodeURIComponent(id!)}?before=${thread.messages[0].id}&limit=50`,
      );
      pendingScroll.current = log.current?.scrollHeight;
      setThread(
        (current) =>
          current && {
            ...current,
            has_more: result.data.has_more,
            messages: [
              ...new Map(
                [...result.data.messages, ...current.messages].map((message) => [
                  message.id,
                  message,
                ]),
              ).values(),
            ].sort((a, b) => a.id - b.id),
          },
      );
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoadingOlder(false);
    }
  };
  const changeStatus = async () => {
    if (!thread || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`${base}/${encodeURIComponent(id!)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: thread.ticket.status === 'CLOSED' ? 'OPEN' : 'CLOSED' }),
      });
      refresh();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const jump = (messageId: number) => {
    const element = document.getElementById(`support-message-${messageId}`);
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      element.focus({ preventScroll: true });
    } else setNotice('Pesan berada di riwayat sebelumnya. Pilih Muat pesan sebelumnya.');
  };
  const matches = threadSearch.trim()
    ? thread?.messages.filter((message) =>
        `${message.body} ${message.attachment_name || ''}`
          .toLocaleLowerCase('id')
          .includes(threadSearch.trim().toLocaleLowerCase('id')),
      ) || []
    : [];
  const latestIncoming =
    thread?.messages.filter(
      (message) => message.actor_id !== user.id && message.id > readThrough.current,
    ).length || 0;
  const closed = thread?.ticket.status === 'CLOSED';

  return (
    <section
      className={`support-chat ${active ? 'support-chat-active' : ''}`}
      aria-label="Bantuan pelanggan"
    >
      <aside className="chat-inbox" aria-label="Daftar percakapan">
        <header className="chat-inbox-head">
          <div>
            <h1>Bantuan</h1>
            <p>{admin ? 'Percakapan pelanggan' : 'Axiom Payment'}</p>
          </div>
          {!admin && (
            <button
              className="chat-icon chat-accent"
              aria-label="Percakapan baru"
              onClick={() => {
                if (id) router.push(`${route}?baru=1`);
                else {
                  setCreating(true);
                  setTimeout(() => document.getElementById('support-subject')?.focus(), 0);
                }
              }}
            >
              {icon(Add01Icon)}
            </button>
          )}
        </header>
        <label className="chat-search">
          {icon(Search01Icon)}
          <span className="sr-only">Cari percakapan</span>
          <input
            type="search"
            placeholder="Cari percakapan atau pesan"
            value={search}
            maxLength={120}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="chat-filter">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Semua percakapan</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {listError && <Failure error={listError} retry={refresh} />}
        <nav className="chat-threads" aria-label="Tiket bantuan">
          {!inbox ? (
            <CircleLoading />
          ) : !inbox.tickets.length ? (
            <div className="chat-list-empty">
              <strong>{search || status ? 'Tidak ada hasil' : 'Belum ada percakapan'}</strong>
              <p>
                {search || status
                  ? 'Ubah pencarian atau filter status.'
                  : admin
                    ? 'Tiket pelanggan akan tampil di sini.'
                    : 'Mulai percakapan untuk menghubungi pengelola.'}
              </p>
            </div>
          ) : (
            inbox.tickets.map((ticket) => (
              <Link
                key={ticket.id}
                className={`chat-thread ${ticket.id === id ? 'selected' : ''}`}
                href={`${route}/${ticket.id}`}
                aria-current={ticket.id === id ? 'page' : undefined}
              >
                <span className="chat-avatar" aria-hidden="true">
                  {(admin ? ticket.username || 'P' : 'A').slice(0, 2).toUpperCase()}
                </span>
                <span className="chat-thread-copy">
                  <span className="chat-thread-title">
                    <strong>{ticket.subject}</strong>
                    <time dateTime={ticket.last_message_at || ticket.updated_at}>
                      {time(ticket.last_message_at || ticket.updated_at)}
                    </time>
                  </span>
                  <span className="chat-snippet">
                    {admin && ticket.username ? `${ticket.username}: ` : ''}
                    {ticket.last_message || 'Lampiran'}
                  </span>
                  <span className="chat-thread-meta">
                    <span>{statuses[ticket.status]}</span>
                    {!!ticket.unread_count && (
                      <span
                        className="chat-unread"
                        aria-label={`${ticket.unread_count} pesan belum dibaca`}
                      >
                        {ticket.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            ))
          )}
        </nav>
        <footer className="chat-list-footer">
          <span>{inbox?.total || 0} percakapan</span>
          <button
            className="chat-icon"
            aria-label="Percakapan sebelumnya"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            {icon(ArrowLeft01Icon, 18)}
          </button>
          <button
            className="chat-icon chat-next"
            aria-label="Percakapan berikutnya"
            disabled={offset + 20 >= (inbox?.total || 0)}
            onClick={() => setOffset(offset + 20)}
          >
            {icon(ArrowLeft01Icon, 18)}
          </button>
        </footer>
      </aside>
      <div
        className="chat-conversation"
        onDragOver={(e) => {
          if (active && !closed && e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (active && !closed) chooseFile(e.dataTransfer.files[0]);
        }}
      >
        {!active ? (
          <div className="chat-welcome">
            <span className="chat-welcome-icon">{icon(Message01Icon, 36)}</span>
            <h2>{admin ? 'Bantuan pelanggan' : 'Ada yang perlu dibantu?'}</h2>
            <p>
              {admin
                ? 'Pilih percakapan untuk membaca dan membalas pesan pelanggan.'
                : 'Kirim pertanyaan, jelaskan kendala, atau lampirkan bukti. Riwayat web dan Telegram tersimpan dalam tiket yang sama.'}
            </p>
            {!admin && (
              <button className="button primary" onClick={() => setCreating(true)}>
                Mulai percakapan
              </button>
            )}
            <small>
              {inbox?.service_hours
                ? `Jam layanan: ${inbox.service_hours}`
                : 'Pesan diproses sesuai antrean layanan.'}
            </small>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <Link
                href={route}
                className="chat-icon chat-back"
                aria-label="Kembali ke daftar percakapan"
                onClick={() => setCreating(false)}
              >
                {icon(ArrowLeft01Icon)}
              </Link>
              <span className="chat-avatar" aria-hidden="true">
                {admin ? (thread?.ticket.username || 'P').slice(0, 2).toUpperCase() : 'A'}
              </span>
              <div className="chat-heading">
                <h2>{id ? thread?.ticket.subject || 'Memuat percakapan…' : 'Percakapan baru'}</h2>
                <p>
                  {id
                    ? `${admin ? thread?.ticket.username || 'Pelanggan' : 'Pengelola Axiom'} · ${statuses[thread?.ticket.status || 'OPEN']}`
                    : 'Bantuan Axiom Payment'}
                </p>
              </div>
              {id && (
                <>
                  <button
                    className="chat-icon"
                    aria-label="Cari dalam percakapan"
                    aria-expanded={showSearch}
                    onClick={() => setShowSearch(!showSearch)}
                  >
                    {icon(Search01Icon)}
                  </button>
                  <button
                    className="chat-icon"
                    aria-label="Informasi dan tindakan tiket"
                    aria-expanded={showInfo}
                    onClick={() => setShowInfo(!showInfo)}
                  >
                    {icon(MoreVerticalIcon)}
                  </button>
                </>
              )}
            </header>
            {showInfo && thread && (
              <div className="chat-info">
                <div>
                  <strong>{thread.ticket.id}</strong>
                  <p>
                    {thread.service_hours
                      ? `Jam layanan: ${thread.service_hours}`
                      : 'Jam layanan belum dipublikasikan.'}
                  </p>
                  <small>Waktu WIB. Status dibaca hanya mencatat pembacaan melalui web.</small>
                </div>
                <button className="button" disabled={busy} onClick={changeStatus}>
                  {closed ? 'Buka kembali tiket' : 'Tutup tiket'}
                </button>
              </div>
            )}
            {showSearch && (
              <div className="chat-find">
                <label className="chat-search">
                  {icon(Search01Icon)}
                  <span className="sr-only">Cari pada pesan dimuat</span>
                  <input
                    autoFocus
                    type="search"
                    placeholder="Cari pada pesan dimuat"
                    value={threadSearch}
                    onChange={(e) => {
                      setThreadSearch(e.target.value);
                      setHit(0);
                    }}
                  />
                </label>
                <span>
                  {matches.length
                    ? `${Math.min(hit + 1, matches.length)}/${matches.length}`
                    : '0 hasil'}
                </span>
                <button
                  className="chat-icon"
                  aria-label="Hasil pencarian berikutnya"
                  disabled={!matches.length}
                  onClick={() => {
                    const next = hit % matches.length;
                    jump(matches[next].id);
                    setHit((next + 1) % matches.length);
                  }}
                >
                  {icon(ArrowDown01Icon)}
                </button>
              </div>
            )}
            {loadError && <Failure error={loadError} retry={refresh} />}
            <div
              ref={log}
              className="chat-history"
              role="log"
              aria-label="Riwayat pesan"
              aria-live="polite"
              aria-relevant="additions"
              tabIndex={0}
              onScroll={(e) => {
                const el = e.currentTarget;
                bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
                setAtBottom(bottom.current);
              }}
            >
              {id && !thread && !loadError ? (
                <CircleLoading label="Memuat percakapan…" />
              ) : !id ? (
                <div className="chat-start-note">
                  <strong>Percakapan dengan pengelola</strong>
                  <p>
                    Tulis subjek dan pesan pertama. Jangan kirim kata sandi, OTP, atau kunci API.
                  </p>
                </div>
              ) : (
                <>
                  {thread?.has_more && (
                    <button className="chat-history-more" disabled={loadingOlder} onClick={older}>
                      {loadingOlder ? 'Memuat…' : 'Muat pesan sebelumnya'}
                    </button>
                  )}
                  {thread?.messages.map((message, index, messages) => {
                    const mine = message.actor_id === user.id;
                    const dateLabel = day(message.created_at);
                    return (
                      <div key={message.id}>
                        {(index === 0 || day(messages[index - 1].created_at) !== dateLabel) && (
                          <div className="chat-day">
                            <span>{dateLabel}</span>
                          </div>
                        )}
                        {message.id === unreadStart && (
                          <div className="chat-unread-divider">Pesan baru</div>
                        )}
                        <article
                          id={`support-message-${message.id}`}
                          tabIndex={-1}
                          className={`chat-message ${mine ? 'mine' : ''} ${message.internal ? 'internal' : ''} ${matches.some((match) => match.id === message.id) ? 'match' : ''}`}
                        >
                          <div className="chat-bubble">
                            <strong className="chat-author">
                              {message.actor_username || 'Pengelola'}
                              {message.internal === 1 && <span>Catatan internal</span>}
                            </strong>
                            {message.reply_to && (
                              <button
                                className="chat-quote"
                                onClick={() => jump(message.reply_to!.id)}
                              >
                                <strong>{message.reply_to.actor_username}</strong>
                                <span>
                                  {message.reply_to.body || message.reply_to.attachment_name}
                                </span>
                              </button>
                            )}
                            {message.attachment_name &&
                              (message.attachment_type?.startsWith('image/') ? (
                                <button
                                  className="chat-photo"
                                  aria-label={`Buka gambar ${message.attachment_name}`}
                                  onClick={() => {
                                    setImage(message);
                                    viewer.current?.showModal();
                                  }}
                                >
                                  <img
                                    src={`/api/support-attachments/${message.id}`}
                                    alt={message.attachment_name}
                                    loading="lazy"
                                    onLoad={() => {
                                      if (bottom.current && log.current)
                                        log.current.scrollTop = log.current.scrollHeight;
                                    }}
                                  />
                                </button>
                              ) : (
                                <a
                                  className="chat-file"
                                  href={`/api/support-attachments/${message.id}`}
                                  download
                                >
                                  {icon(Attachment01Icon)}
                                  <span>
                                    {message.attachment_name}
                                    <small>Unduh PDF</small>
                                  </span>
                                </a>
                              ))}
                            <p>{message.body}</p>
                            <div className="chat-message-meta">
                              <span>{message.channel === 'telegram' ? 'Telegram' : 'Web'}</span>
                              <time dateTime={message.created_at} title={date(message.created_at)}>
                                {time(message.created_at)}
                              </time>
                              {mine && (
                                <span
                                  className={message.read_by_other ? 'chat-read' : ''}
                                  aria-label={message.read_by_other ? 'Dibaca di web' : 'Tersimpan'}
                                  title={message.read_by_other ? 'Dibaca di web' : 'Tersimpan'}
                                >
                                  {icon(message.read_by_other ? TickDouble01Icon : Tick01Icon, 17)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="chat-message-tools">
                            {!closed && (
                              <button
                                aria-label={`Balas pesan ${message.id}`}
                                onClick={() => {
                                  setReply(message);
                                  if (message.internal) changeDraft(body, subject, true);
                                  input.current?.focus();
                                }}
                              >
                                Balas
                              </button>
                            )}
                            <button
                              aria-label={`Salin pesan ${message.id}`}
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(message.body);
                                  setNotice('Pesan disalin.');
                                } catch {
                                  setError(
                                    new Error(
                                      'Penyalinan tidak tersedia. Pilih teks pesan untuk menyalin.',
                                    ),
                                  );
                                }
                              }}
                            >
                              Salin
                            </button>
                            {message.attachment_name && (
                              <a href={`/api/support-attachments/${message.id}`} download>
                                Unduh
                              </a>
                            )}
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            {!atBottom && (
              <button
                className="chat-jump"
                onClick={() => {
                  if (log.current) log.current.scrollTop = log.current.scrollHeight;
                  bottom.current = true;
                  setAtBottom(true);
                }}
              >
                {icon(ArrowDown01Icon)}
                <span>{latestIncoming ? `${latestIncoming} pesan baru` : 'Pesan terbaru'}</span>
              </button>
            )}
            <div className="chat-announcement" role="status">
              {busy ? 'Mengirim…' : notice}
            </div>
            {error && <Failure error={error} />}
            {closed ? (
              <div className="chat-closed">
                <p>Tiket ditutup. Riwayat tetap tersimpan.</p>
                <button className="button" disabled={busy} onClick={changeStatus}>
                  Buka kembali tiket
                </button>
              </div>
            ) : (
              (id ? !!thread : true) && (
                <form
                  className={`chat-composer ${internal ? 'is-internal' : ''}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  {!id && (
                    <label className="chat-subject">
                      <span>Subjek</span>
                      <input
                        id="support-subject"
                        required
                        maxLength={160}
                        value={subject}
                        disabled={busy}
                        placeholder="Contoh: Status pembayaran belum berubah"
                        onChange={(e) => changeDraft(body, e.target.value)}
                      />
                    </label>
                  )}
                  {reply && (
                    <div className="chat-reply-preview">
                      <div>
                        <strong>Membalas {reply.actor_username}</strong>
                        <p>{reply.body}</p>
                      </div>
                      <button
                        type="button"
                        className="chat-icon"
                        aria-label="Batalkan balasan"
                        disabled={busy}
                        onClick={() => setReply(undefined)}
                      >
                        {icon(Cancel01Icon, 18)}
                      </button>
                    </div>
                  )}
                  {file && (
                    <div className="chat-attachment-preview">
                      {preview ? (
                        <img src={preview} alt="Pratinjau lampiran" />
                      ) : (
                        icon(Attachment01Icon, 30)
                      )}
                      <span>
                        {file.name}
                        <small>{Math.ceil(file.size / 1024)} KB</small>
                      </span>
                      <button
                        type="button"
                        className="chat-icon"
                        aria-label="Hapus lampiran"
                        disabled={busy}
                        onClick={() => {
                          setFile(undefined);
                          if (upload.current) upload.current.value = '';
                        }}
                      >
                        {icon(Cancel01Icon, 18)}
                      </button>
                    </div>
                  )}
                  {showEmoji && (
                    <div className="chat-emoji" aria-label="Pilih emoji">
                      {['😀', '👍', '🙏', '✅', '❓', '📎', '📷', '❤️'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Sisipkan ${emoji}`}
                          disabled={busy}
                          onClick={() => {
                            changeDraft((body + emoji).slice(0, 4000));
                            setShowEmoji(false);
                            input.current?.focus();
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="chat-compose-row">
                    <button
                      type="button"
                      className="chat-icon"
                      aria-label="Tambahkan lampiran"
                      title="PNG, JPEG, PDF · maksimal 2 MB"
                      disabled={busy}
                      onClick={() => upload.current?.click()}
                    >
                      {icon(Attachment01Icon, 22)}
                    </button>
                    <input
                      ref={upload}
                      className="sr-only"
                      type="file"
                      tabIndex={-1}
                      accept="image/png,image/jpeg,application/pdf"
                      aria-label="Pilih lampiran"
                      disabled={busy}
                      onChange={(e) => chooseFile(e.target.files?.[0])}
                    />
                    <label className="chat-text">
                      <span className="sr-only">{internal ? 'Catatan internal' : 'Pesan'}</span>
                      <textarea
                        ref={input}
                        required
                        maxLength={4000}
                        rows={2}
                        value={body}
                        disabled={busy}
                        placeholder={
                          internal ? 'Catatan internal, hanya untuk admin…' : 'Tulis pesan…'
                        }
                        onChange={(e) => changeDraft(e.target.value)}
                        onPaste={(e) => {
                          const pasted = Array.from(e.clipboardData.files)[0];
                          if (pasted) {
                            e.preventDefault();
                            chooseFile(pasted);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing &&
                            matchMedia('(pointer: fine)').matches
                          ) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="chat-icon chat-emoji-toggle"
                      aria-label="Emoji"
                      aria-expanded={showEmoji}
                      disabled={busy}
                      onClick={() => setShowEmoji(!showEmoji)}
                    >
                      ☺
                    </button>
                    <button
                      className="chat-send"
                      aria-label={internal ? 'Simpan catatan internal' : 'Kirim pesan'}
                      type="submit"
                      disabled={busy || !body.trim() || (!id && !subject.trim())}
                      aria-busy={busy}
                    >
                      {busy ? <span className="loading-ring" /> : icon(SentIcon, 22)}
                    </button>
                  </div>
                  <div className="chat-composer-foot">
                    {admin ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={internal}
                          disabled={busy || Boolean(reply?.internal)}
                          onChange={(e) => changeDraft(body, subject, e.target.checked)}
                        />
                        Catatan internal
                      </label>
                    ) : (
                      <span>PNG, JPEG, PDF hingga 2 MB. Jangan kirim data rahasia.</span>
                    )}
                    <span>{body.length}/4000</span>
                  </div>
                </form>
              )
            )}
          </>
        )}
        {dragging && (
          <div className="chat-drop">
            {icon(Attachment01Icon, 36)}
            <strong>Lepaskan lampiran di sini</strong>
            <span>PNG, JPEG, PDF · maksimal 2 MB</span>
          </div>
        )}
      </div>
      <dialog
        ref={viewer}
        className="chat-image-viewer"
        onClick={(e) => {
          if (e.target === e.currentTarget) viewer.current?.close();
        }}
      >
        <header>
          <strong>{image?.attachment_name}</strong>
          <button
            className="chat-icon"
            aria-label="Tutup pratinjau"
            onClick={() => viewer.current?.close()}
          >
            {icon(Cancel01Icon)}
          </button>
        </header>
        {image && <img src={`/api/support-attachments/${image.id}`} alt={image.attachment_name} />}
        <a
          className="button"
          href={image ? `/api/support-attachments/${image.id}` : undefined}
          download
        >
          Unduh gambar
        </a>
      </dialog>
    </section>
  );
}
