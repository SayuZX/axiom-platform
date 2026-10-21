import { useSyncExternalStore, type SetStateAction } from 'react';
import type { FileRef } from './fileLibrary';
import { notifyAxiom } from './axiom';

export type HistoryMessage = { role: 'user' | 'assistant'; text: string; reasoning?: string; reasoningDurationMs?: number; timestamp?: number; attachments?: FileRef[] };
type History = { version: number; titles: string[]; content: Record<string, HistoryMessage[]>; error: string };
let state: History = { version: 0, titles: [], content: {}, error: '' };
let initialized = false, dirty = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const endpoint = '/customer-api/axiom-chat/history';
const emit = () => listeners.forEach(listener => listener());
function protectUnsavedHistory(event: BeforeUnloadEvent) {
  if (!pending && !dirty && !state.error) return;
  event.preventDefault(); event.returnValue = '';
}
export const getAxiomHistory = () => state;
export function useAxiomHistory() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getAxiomHistory); }
function validHistory(value: unknown): value is Omit<History, 'error'> {
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version < 0 || !('titles' in value) || !Array.isArray(value.titles) || !value.titles.every(title => typeof title === 'string') || !('content' in value) || !value.content || typeof value.content !== 'object' || Array.isArray(value.content)) return false;
  return Object.values(value.content).every(messages => Array.isArray(messages) && messages.every((message: unknown) => {
    if (!message || typeof message !== 'object' || !('role' in message) || (message.role !== 'user' && message.role !== 'assistant') || !('text' in message) || typeof message.text !== 'string') return false;
    if ('reasoning' in message && message.reasoning !== undefined && typeof message.reasoning !== 'string') return false;
    const fields = message as Record<string, unknown>;
    for (const key of ['timestamp', 'reasoningDurationMs'] as const) if (key in fields && fields[key] !== undefined && (typeof fields[key] !== 'number' || !Number.isFinite(fields[key]))) return false;
    if ('attachments' in message && message.attachments !== undefined && (!Array.isArray(message.attachments) || !message.attachments.every((file: unknown) => !!file && typeof file === 'object' && 'id' in file && typeof file.id === 'string' && 'name' in file && typeof file.name === 'string' && 'type' in file && typeof file.type === 'string'))) return false;
    return true;
  }));
}
export async function initializeAxiomHistory() {
  initialized = false;
  state = { version: 0, titles: [], content: {}, error: '' };
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('Could not load AXIOM chat history.');
  const value: unknown = await response.json();
  if (!validHistory(value)) throw new Error('Invalid AXIOM chat history.');
  state = { ...value, error: '' }; initialized = true; emit();
  window.addEventListener('beforeunload', protectUnsavedHistory);
}
function schedule() {
  if (!initialized || state.error) return;
  dirty = true;
  if (pending) return;
  pending = Promise.resolve().then(async () => {
    while (dirty && !state.error) {
      dirty = false;
      const snapshot = state;
      try {
        const response = await fetch(endpoint, { method: 'PUT', credentials: 'same-origin', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: snapshot.version, titles: snapshot.titles, content: snapshot.content }) });
        if (!response.ok) throw new Error(response.status === 409 ? 'History changed in another window. Changes are not saved. Reload before editing again.' : 'Chat changes are not saved. Reload before editing again.');
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || !('version' in result) || typeof result.version !== 'number' || !Number.isSafeInteger(result.version) || result.version <= snapshot.version) throw new Error('History save was not confirmed. Changes are not saved. Reload before editing again.');
        state = { ...state, version: result.version }; emit();
      } catch (error) {
        dirty = false;
        state = { ...state, error: error instanceof Error ? `Changes are not saved. ${error.message}` : 'Chat changes are not saved. Reload before editing again.' }; emit(); notifyAxiom(state.error);
      }
    }
  }).finally(() => { pending = null; });
}
export function setHistoryTitles(update: SetStateAction<string[]>) {
  state = { ...state, titles: typeof update === 'function' ? update(state.titles) : update }; emit(); schedule();
}
export function setHistoryContent(update: SetStateAction<History['content']>) {
  state = { ...state, content: typeof update === 'function' ? update(state.content) : update }; emit(); schedule();
}
export async function flushAxiomHistory() { while (pending) await pending; if (state.error) throw new Error(state.error); }
