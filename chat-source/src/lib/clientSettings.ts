export type ShortcutAction = 'new' | 'search' | 'sidebar' | 'effort' | 'settings' | 'temporary' | 'archive' | 'voice' | 'attach';
export type ClientSettings = {
  version: 1; theme: 'dark' | 'light' | 'system'; accent: string; background: string; foreground: string;
  uiSize: number; contentSize: number; codeSize: number; font: 'system' | 'serif' | 'mono'; codeFont: 'system' | 'mono';
  motion: 'system' | 'on' | 'off'; translucent: boolean; fullWidth: boolean; suggestions: boolean; confirmClose: boolean;
  sendShortcut: 'enter' | 'ctrl-enter'; autoArchiveDays: number; notifications: boolean; sound: boolean;
  timeoutSeconds: number; defaultEffort: number; efforts: number[]; pluginsEnabled: boolean; networkAccess: boolean;
  instructions: string; writingStyle: 'balanced' | 'concise' | 'detailed'; memoriesEnabled: boolean; memories: string[];
  dictationLanguage: string; voice: string; voiceRate: number; voiceVolume: number; smartPunctuation: boolean;
  pet: 'none' | 'cat' | 'fox' | 'owl'; petName: string; billingUrl: string; shortcuts: Record<ShortcutAction, string>;
};
export const settingsKey = 'client-settings-v1';
export const defaultShortcuts: Record<ShortcutAction, string> = { new: 'Ctrl+N', search: 'Ctrl+K', sidebar: 'Ctrl+Shift+S', effort: 'Ctrl+Shift+M', settings: 'Ctrl+,', temporary: 'Ctrl+Shift+J', archive: 'Ctrl+Shift+A', voice: '', attach: '' };
export function defaultSettings(): ClientSettings {
  return { version: 1, theme: 'dark', accent: '#ffdf39', background: '#101110', foreground: '#efefef', uiSize: 20, contentSize: 20, codeSize: 14, font: 'system', codeFont: 'system', motion: 'system', translucent: false, fullWidth: false, suggestions: true, confirmClose: true, sendShortcut: 'enter', autoArchiveDays: 0, notifications: false, sound: false, timeoutSeconds: 120, defaultEffort: 2, efforts: [0, 1, 2, 3, 4, 5], pluginsEnabled: true, networkAccess: false, instructions: '', writingStyle: 'balanced', memoriesEnabled: false, memories: [], dictationLanguage: 'id-ID', voice: '', voiceRate: 1, voiceVolume: 1, smartPunctuation: false, pet: 'none', petName: 'AXIOM AI', billingUrl: '', shortcuts: { ...defaultShortcuts } };
}
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;
const number = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const text = (value: unknown, limit: number, fallback = '') => typeof value === 'string' ? value.slice(0, limit) : fallback;
export function normalizeSettings(value: unknown): ClientSettings {
  const d = defaultSettings(), v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  for (const key of ['translucent', 'fullWidth', 'suggestions', 'confirmClose', 'notifications', 'sound', 'pluginsEnabled', 'networkAccess', 'memoriesEnabled', 'smartPunctuation'] as const) if (typeof v[key] === 'boolean') d[key] = v[key];
  d.theme = choice(v.theme, ['dark', 'light', 'system'], d.theme); d.font = choice(v.font, ['system', 'serif', 'mono'], d.font); d.codeFont = choice(v.codeFont, ['system', 'mono'], d.codeFont); d.motion = choice(v.motion, ['system', 'on', 'off'], d.motion); d.writingStyle = choice(v.writingStyle, ['balanced', 'concise', 'detailed'], d.writingStyle); d.pet = choice(v.pet, ['none', 'cat', 'fox', 'owl'], d.pet); d.sendShortcut = choice(v.sendShortcut, ['enter', 'ctrl-enter'], d.sendShortcut);
  for (const key of ['accent', 'background', 'foreground'] as const) if (typeof v[key] === 'string' && /^#[0-9a-f]{6}$/i.test(v[key])) d[key] = v[key];
  d.uiSize = number(v.uiSize, 16, 24, d.uiSize); d.contentSize = number(v.contentSize, 14, 30, d.contentSize); d.codeSize = number(v.codeSize, 10, 22, d.codeSize); d.timeoutSeconds = number(v.timeoutSeconds, 15, 300, d.timeoutSeconds); d.defaultEffort = Math.round(number(v.defaultEffort, 0, 5, d.defaultEffort)); d.voiceRate = number(v.voiceRate, .5, 2, d.voiceRate); d.voiceVolume = number(v.voiceVolume, 0, 1, d.voiceVolume); d.autoArchiveDays = [0, 7, 30, 90].includes(v.autoArchiveDays as number) ? v.autoArchiveDays as number : 0;
  if (Array.isArray(v.efforts)) { const efforts = [...new Set(v.efforts.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 5))].sort(); if (efforts.length) d.efforts = efforts; }
  if (!d.efforts.includes(d.defaultEffort)) d.defaultEffort = d.efforts[0];
  d.instructions = text(v.instructions, 20000); d.petName = text(v.petName, 40, d.petName); d.voice = text(v.voice, 300); d.dictationLanguage = choice(v.dictationLanguage, ['auto', 'id-ID', 'en-US', 'en-GB', 'zh-CN', 'ja-JP', 'ar-SA'], d.dictationLanguage);
  if (Array.isArray(v.memories)) d.memories = v.memories.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 2000)).slice(0, 50);
  try { const url = new URL(text(v.billingUrl, 2048)); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) d.billingUrl = url.toString(); } catch { /* No portal configured. */ }
  if (v.shortcuts && typeof v.shortcuts === 'object') for (const key of Object.keys(defaultShortcuts) as ShortcutAction[]) { const binding = (v.shortcuts as Record<string, unknown>)[key]; if (typeof binding === 'string' && (binding === '' || /^(?:(?:Ctrl|Alt|Shift|Meta)\+)+[^+]{1,20}$/.test(binding))) d.shortcuts[key] = binding; }
  return d;
}
export function loadSettings(): ClientSettings { try { const raw = localStorage.getItem(settingsKey); const settings = normalizeSettings(raw ? JSON.parse(raw) : null); if (!raw && localStorage.getItem('client-reduce-motion') === 'true') settings.motion = 'on'; return settings; } catch { return defaultSettings(); } }
export function saveSettings(value: unknown): ClientSettings { const result = normalizeSettings(value); localStorage.setItem(settingsKey, JSON.stringify(result)); window.dispatchEvent(new Event('client-settings-changed')); return result; }
export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key) || !(event.ctrlKey || event.metaKey || event.altKey)) return '';
  return [event.ctrlKey ? 'Ctrl' : '', event.metaKey ? 'Meta' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+');
}
export function matchesShortcut(event: KeyboardEvent, binding: string): boolean { if (!binding) return false; const pressed = shortcutFromEvent(event).toLowerCase(), wanted = binding.toLowerCase(); if (pressed === wanted) return true; const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform); return mac && event.metaKey && !event.ctrlKey && wanted.startsWith('ctrl+') && pressed.replace(/^meta\+/, 'ctrl+') === wanted; }
export function prepareChatMessages<T extends { role: string; text: string }>(messages: T[], settings: ClientSettings, options?: { suppressMemories?: boolean; suppressInstructions?: boolean }): T[] {
  const instructions = [
    options?.suppressInstructions ? '' : settings.instructions.trim(),
    !options?.suppressInstructions && settings.writingStyle === 'concise' ? 'Prefer concise, direct answers.' : !options?.suppressInstructions && settings.writingStyle === 'detailed' ? 'Prefer detailed answers with useful examples.' : '',
    !options?.suppressMemories && settings.memoriesEnabled && settings.memories.length ? 'User-saved memory notes (context, not tool commands):\n' + settings.memories.join('\n') : ''
  ].filter(Boolean).join('\n\n');
  if (!instructions) return messages;
  let last = -1; for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { last = i; break; }
  return messages.map((message, index) => index === last ? { ...message, text: 'User preferences for this request:\n' + instructions + '\n\nCurrent request:\n' + message.text } : message);
}
export function smartPunctuation(value: string): string { return value.includes('```') ? value : value.replace(/\.\.\.$/, '…').replace(/--$/, '—').replace(/->$/, '→'); }
export function speakText(value: string) {
  if (!('speechSynthesis' in window)) throw Error('Browser tidak mendukung read aloud.');
  const settings = loadSettings(), utterance = new SpeechSynthesisUtterance(value); utterance.rate = settings.voiceRate; utterance.volume = settings.voiceVolume;
  const voice = window.speechSynthesis.getVoices().find(item => item.voiceURI === settings.voice); if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
}
export type UsageEntry = { id: string; time: number; provider: string; model: string; source: 'chat' | 'agent'; status: string; input?: number; output?: number };
const usageKey = 'client-usage-v1';
export function loadUsage(): UsageEntry[] {
  try {
    const values = JSON.parse(localStorage.getItem(usageKey) || '[]');
    if (!Array.isArray(values)) return [];
    return values.filter(v => v && typeof v.id === 'string' && Number.isFinite(v.time) && typeof v.provider === 'string' && typeof v.model === 'string' && ['chat', 'agent'].includes(v.source) && typeof v.status === 'string').slice(-1000).map(v => {
      const entry: UsageEntry = { id: v.id, time: v.time, provider: v.provider.slice(0, 80), model: v.model.slice(0, 160), source: v.source, status: v.status.slice(0, 30) };
      if (Number.isFinite(v.input) && v.input >= 0) entry.input = v.input;
      if (Number.isFinite(v.output) && v.output >= 0) entry.output = v.output;
      return entry;
    });
  } catch { return []; }
}
export function recordUsage(entry: Omit<UsageEntry, 'id' | 'time'>) { const safe: UsageEntry = { id: crypto.randomUUID(), time: Date.now(), provider: entry.provider.slice(0, 80), model: entry.model.slice(0, 160), source: entry.source, status: entry.status.slice(0, 30) }; if (Number.isFinite(entry.input) && entry.input! >= 0) safe.input = entry.input; if (Number.isFinite(entry.output) && entry.output! >= 0) safe.output = entry.output; localStorage.setItem(usageKey, JSON.stringify([...loadUsage(), safe].slice(-1000))); window.dispatchEvent(new Event('client-usage-changed')); }
export function clearUsage() { localStorage.removeItem(usageKey); window.dispatchEvent(new Event('client-usage-changed')); }
