import { useEffect, useRef, useState } from 'react';
import { UIIcon } from '../components/UIIcon';
import { loadSettings } from '../lib/clientSettings';
import { captureSpeech, type SpeechCapture } from './speechCapture';

type Phase = 'ready' | 'starting' | 'listening' | 'review' | 'thinking' | 'speaking' | 'error';
export function MobileSpeech({ mode, onClose, onDictation, onReply }: {
  mode: 'dictation' | 'voice'; onClose(): void; onDictation(text: string): void; onReply(text: string): Promise<string>;
}) {
  const [phase, setPhase] = useState<Phase>('ready'), [text, setText] = useState(''), [reply, setReply] = useState(''), [error, setError] = useState(''), [captions, setCaptions] = useState(true);
  const close = useRef<HTMLButtonElement>(null), capture = useRef<SpeechCapture | null>(null), epoch = useRef(0), utterance = useRef<SpeechSynthesisUtterance | null>(null);
  function stopAudio() {
    if (utterance.current) { utterance.current.onend = utterance.current.onerror = null; utterance.current = null; window.speechSynthesis?.cancel(); }
  }
  function cancelCapture() { epoch.current++; capture.current?.cancel(); capture.current = null; stopAudio(); }
  useEffect(() => { if (mode === 'dictation') start(); else close.current?.focus({ preventScroll: true }); return cancelCapture; }, []);
  async function answer(value: string, token: number) {
    if (!value.trim()) { setPhase('ready'); return; }
    setPhase('thinking');
    try {
      const result = await onReply(value);
      if (epoch.current !== token) return;
      setReply(result);
      if (!window.speechSynthesis) throw Error('Pembacaan suara belum tersedia. Jawaban tetap tampil sebagai teks.');
      const settings = loadSettings(), speech = new SpeechSynthesisUtterance(result);
      speech.rate = settings.voiceRate; speech.volume = settings.voiceVolume;
      const selected = window.speechSynthesis.getVoices().find(voice => voice.voiceURI === settings.voice);
      if (selected) speech.voice = selected;
      speech.onend = () => { if (epoch.current === token) { utterance.current = null; setPhase('ready'); } };
      speech.onerror = () => { if (epoch.current === token) { utterance.current = null; setError('Jawaban belum bisa dibacakan.'); setPhase('error'); } };
      utterance.current = speech; setPhase('speaking'); window.speechSynthesis.speak(speech);
    } catch (failure) { if (epoch.current === token) { setError(failure instanceof Error ? failure.message : 'Percakapan suara terhenti.'); setPhase('error'); } }
  }
  function start() {
    cancelCapture(); const token = epoch.current;
    window.speechSynthesis?.cancel();
    setText(''); setError(''); setPhase('starting');
    try {
      capture.current = captureSpeech({ language: loadSettings().dictationLanguage, continuous: mode === 'dictation',
        onStart: () => { if (epoch.current === token) setPhase('listening'); },
        onText: value => { if (epoch.current === token) setText(value); },
        onEnd: value => { if (epoch.current !== token) return; if (mode === 'dictation') setPhase('review'); else void answer(value, token); },
        onError: message => { if (epoch.current === token) { setError(message); setPhase('error'); } },
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Mikrofon tidak tersedia.'); setPhase('error'); }
  }
  async function confirm() {
    const token = epoch.current; setPhase('review');
    const value = capture.current ? await capture.current.stop() : text;
    if (token === epoch.current && value.trim()) { cancelCapture(); onDictation(value.trim()); }
  }
  const status = error || ({ ready: 'Ketuk mikrofon untuk bicara', starting: 'Menyiapkan mikrofon…', listening: 'Mendengarkan…', review: 'Tinjau hasil dikte', thinking: 'Menunggu jawaban…', speaking: 'Berbicara…', error: 'Coba lagi' } as const)[phase];
  const listening = phase === 'listening' || phase === 'starting';
  if (mode === 'dictation') return <div className="m-dictation" role="group" aria-label="Dikte">
    {(text || error) && <p className="m-dictation-transcript" role={error ? 'alert' : undefined}>{error || text}</p>}
    <div className="m-dictation-bar">
      <button type="button" aria-label="Cancel dictation" onClick={onClose}><UIIcon name="close"/></button>
      <div className={`m-speech-signal${listening && phase !== 'starting' ? ' is-listening' : ''}`} aria-hidden="true">{[0,1,2,3,4,5,6,7,8].map(n => <i key={n} style={{ animationDelay: `${n * 65}ms` }}/>)}</div>
      <span className="m-speech-status" role="status">{status}</span>
      {phase === 'error' ? <button type="button" aria-label="Retry dictation" onClick={start}><UIIcon name="mic"/></button> : <button type="button" aria-label="Accept dictation" disabled={!text.trim()} onClick={() => void confirm()}><UIIcon name="check"/></button>}
    </div>
  </div>;
  return <section className="m-voice-screen" role="dialog" aria-modal="true" aria-label="AXIOM AI Voice">
    <header><button type="button" aria-label="Toggle voice captions" aria-pressed={captions} onClick={() => setCaptions(value => !value)}>Aa</button><button ref={close} type="button" aria-label="Close voice" onClick={onClose}><UIIcon name="close"/></button></header>
    <div className={`m-voice-orb m-voice-${phase}`} aria-hidden="true"/>
    <p className="m-voice-status" role={error ? 'alert' : 'status'}>{status}</p>
    {captions && <div className="m-voice-captions">{text && <p>{text}</p>}{reply && <p>{reply}</p>}</div>}
    <footer><button type="button" aria-label={listening ? 'Mute microphone' : 'Start voice microphone'} disabled={phase === 'thinking'} onClick={() => { if (listening) { cancelCapture(); setPhase('ready'); } else start(); }}><UIIcon name={listening ? 'mic' : 'wave'}/></button><button type="button" aria-label="End voice conversation" onClick={onClose}><UIIcon name="close"/></button></footer>
    <small>Suara perangkat · model endpoint yang dipilih</small>
  </section>;
}
