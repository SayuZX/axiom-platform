import { normalizeBaseUrl, type EndpointProfile } from './endpointProfiles';
import { providerFetch, providerStatusError } from './providerTransport';
export type ProviderMessage = { role: 'user' | 'assistant'; text: string; images?: string[] };

export function hasMessageContent(message: { role: string; text: string; reasoning?: unknown }): boolean {
  return message.role !== 'assistant' || !!message.text || (typeof message.reasoning === 'string' && !!message.reasoning.trim());
}

function providerReasoning(message: { reasoning_content?: unknown; reasoning?: unknown; thought?: unknown } | undefined): string {
  return [message?.reasoning_content, message?.reasoning, message?.thought].find((value): value is string => typeof value === 'string' && !!value) || '';
}

export function parseThinking(text: string, explicitReasoning?: unknown): { reasoning: string; content: string; isThinking: boolean } {
  if (typeof explicitReasoning === 'string' && explicitReasoning) {
    return { reasoning: explicitReasoning, content: text, isThinking: false };
  }
  // Legacy gateways wrap reasoning at the start. Tags in prose/code are answer data.
  const thinkOpen = text.search(/\S/);
  if (thinkOpen !== -1 && text.startsWith('<think>', thinkOpen)) {
    const thinkClose = text.indexOf('</think>', thinkOpen + 7);
    if (thinkClose !== -1) {
      const reasoning = text.slice(thinkOpen + 7, thinkClose).trim();
      const content = (text.slice(0, thinkOpen) + text.slice(thinkClose + 8)).trim();
      return { reasoning, content, isThinking: false };
    } else {
      const reasoning = text.slice(thinkOpen + 7);
      const content = text.slice(0, thinkOpen).trim();
      return { reasoning, content, isThinking: true };
    }
  }
  return { reasoning: '', content: text, isThinking: false };
}

export async function streamEndpointChat(profile: EndpointProfile, key: string, model: string, messages: ProviderMessage[], signal: AbortSignal, onText: (text: string, reasoning?: string) => void, reasoningEffort?: string, onUsage?: (usage: { input?: number; output?: number }) => void): Promise<void> {
  function usage(value: unknown) { const tokens = value as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined; if (!tokens) return; const input = typeof tokens.prompt_tokens === 'number' && Number.isFinite(tokens.prompt_tokens) && tokens.prompt_tokens >= 0 ? tokens.prompt_tokens : undefined, output = typeof tokens.completion_tokens === 'number' && Number.isFinite(tokens.completion_tokens) && tokens.completion_tokens >= 0 ? tokens.completion_tokens : undefined; if (input !== undefined || output !== undefined) onUsage?.({ input, output }); }
  if (profile.auth === 'bearer' && !key.trim()) throw Error('API key sesi ini belum tersedia. Masukkan ulang di pengaturan key AXIOM.');
  const response = await providerFetch(normalizeBaseUrl(profile.baseUrl) + '/chat/completions', profile.auth === 'bearer' ? key : '', signal, {
    model, stream: true, messages: messages.filter(message => message.text || message.images?.length).map(message => ({ role: message.role, content: message.images?.length ? [{ type: 'text', text: message.text }, ...message.images.map(url => ({ type: 'image_url', image_url: { url } }))] : message.text })),
    ...(profile.sendReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  });
  if (!response.ok) throw providerStatusError(response.status);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    usage(json.usage);
    const message = json?.choices?.[0]?.message;
    const text = typeof message?.content === 'string' ? message.content : '';
    const reasoning = providerReasoning(message);
    if (!text.trim() && !reasoning.trim()) throw Error('Penyedia tidak mengirim jawaban teks yang dikenali.');
    if (text.length > 2 * 1024 * 1024 || reasoning.length > 4 * 1024 * 1024) throw Error('Jawaban penyedia terlalu panjang.');
    onText(text, reasoning); return;
  }
  if (!response.body) throw Error('Penyedia mengirim respons kosong.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', answer = '', reasoning = '', done = false;
  function event(block: string) {
    const raw = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!raw) return;
    if (raw === '[DONE]') { done = true; return; }
    let json;
    try { json = JSON.parse(raw); } catch { throw Error('Respons streaming penyedia tidak valid.'); }
    if (json.error) throw Error('Penyedia menghentikan jawaban. Periksa model, kuota, dan izin API key.');
    usage(json.usage);
    const delta = json.choices?.[0]?.delta;
    const deltaContent = delta?.content;
    const deltaReasoning = providerReasoning(delta);
    let changed = false;
    if (typeof deltaReasoning === 'string' && deltaReasoning) {
      reasoning += deltaReasoning;
      if (reasoning.length > 4 * 1024 * 1024) throw Error('Proses reasoning penyedia terlalu panjang.');
      changed = true;
    }
    if (typeof deltaContent === 'string' && deltaContent) {
      answer += deltaContent;
      if (answer.length > 2 * 1024 * 1024) throw Error('Jawaban penyedia terlalu panjang.');
      changed = true;
    }
    if (changed) {
      onText(answer, reasoning);
    }
  }
  try {
    while (!done) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      // Normalize only complete lines; a chunk can end in the middle of CRLF.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary: number;
      while (!done && (boundary = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(block); }
      if (buffer.length > 2 * 1024 * 1024) throw Error('Respons streaming penyedia terlalu besar.');
      if (result.done) { if (!done && buffer.trim()) event(buffer); break; }
    }
    if (!answer.trim() && !reasoning.trim()) throw Error('Penyedia tidak mengirim jawaban teks. Model ini mungkin memerlukan protokol lain.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
