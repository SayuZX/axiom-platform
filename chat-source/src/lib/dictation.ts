import { loadSettings } from './clientSettings';

export function dictate(onText: (text: string) => void, notify: (text: string) => void) {
  type Recognition = { lang: string; start: () => void; onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null; onerror: (() => void) | null };
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
  if (!Constructor) { notify('Browser ini belum mendukung dikte. Gunakan browser dengan SpeechRecognition.'); return; }
  const recognition = new Constructor(), language = loadSettings().dictationLanguage; recognition.lang = language === 'auto' ? navigator.language : language; recognition.onresult = event => onText(event.results[0][0].transcript); recognition.onerror = () => notify('Dikte gagal. Periksa izin mikrofon browser.');
  try { recognition.start(); } catch { notify('Mikrofon belum bisa dimulai.'); }
}
