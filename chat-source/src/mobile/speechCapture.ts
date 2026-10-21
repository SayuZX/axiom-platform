type RecognitionResult = { isFinal?: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
};
export type SpeechCapture = { stop(): Promise<string>; cancel(): void };
export function captureSpeech(options: {
  language: string; continuous: boolean; onStart(): void;
  onText(text: string): void; onEnd(text: string): void; onError(message: string): void;
}): SpeechCapture {
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
  if (!Constructor) throw Error('Dikte belum didukung perangkat ini. Kamu tetap bisa mengetik pesan.');
  const recognition = new Constructor();
  let active = true, text = '', failed = false, stopping: Promise<string> | undefined;
  let resolveStop: ((text: string) => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  recognition.lang = options.language === 'auto' ? navigator.language : options.language;
  recognition.continuous = options.continuous; recognition.interimResults = true;
  function cleanup() { active = false; clearTimeout(timer); recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null; }
  function end() { if (!active) return; cleanup(); resolveStop?.(failed ? '' : text); if (!failed) options.onEnd(text); }
  recognition.onstart = () => { if (active) options.onStart(); };
  recognition.onresult = event => {
    if (!active) return;
    text = Array.from(event.results, result => result[0].transcript).join(' ').trim(); options.onText(text);
  };
  recognition.onerror = event => {
    if (!active) return;
    failed = true;
    options.onError(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk menggunakan dikte.' : event.error === 'no-speech' ? 'Belum terdengar suara. Coba lagi.' : 'Mikrofon belum dapat digunakan. Periksa koneksi dan izin perangkat.');
    end();
    try { recognition.abort(); } catch { /* The device may have already ended it. */ }
  };
  recognition.onend = end;
  try { recognition.start(); } catch (error) { cleanup(); throw error; }
  return {
    stop() {
      if (!active) return Promise.resolve(failed ? '' : text);
      if (stopping) return stopping;
      stopping = new Promise(resolve => { resolveStop = resolve; });
      timer = setTimeout(() => { recognition.onerror = null; try { recognition.abort(); } catch { /* Already stopped. */ } end(); }, 2500);
      try { recognition.stop(); } catch { end(); }
      return stopping;
    },
    cancel() { if (!active) return; cleanup(); resolveStop?.(''); try { recognition.abort(); } catch { /* Already stopped by the device. */ } },
  };
}
