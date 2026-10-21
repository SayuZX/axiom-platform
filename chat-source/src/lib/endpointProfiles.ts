import { getAxiomSession, isAxiomEndpoint } from './axiom';
export type EndpointProfile = {
  id: string; name: string; baseUrl: string; protocol: 'openai-compatible';
  model: string; models: string[]; auth: 'bearer' | 'none'; sendReasoning?: boolean;
};
export type EndpointStore = { version: 1; profiles: EndpointProfile[]; selectedId: string | null };
export const endpointStorageKey = 'client-endpoint-profiles-v1';
export const endpointSecretsKey = 'client-endpoint-keys-v1';

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value, window.location.origin);
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '');
  if (!isAxiomEndpoint(url.toString())) throw Error('Gunakan endpoint AXIOM untuk akun ini.');
  return url.toString().replace(/\/+$/, '');
}

export function loadEndpointStore(): EndpointStore {
  const session = getAxiomSession();
  let saved: { customerId?: unknown; selectedId?: unknown; profiles?: { id: string; model: string }[] } = {};
  try { saved = JSON.parse(localStorage.getItem(endpointStorageKey) || '{}') || {}; } catch { /* Session defaults remain usable without saved preferences. */ }
  if (saved.customerId !== session.customer.id) saved = {};
  const profiles: EndpointProfile[] = session.keys.filter(key => key.models.length > 0).map(key => {
    const models = key.models;
    const previous = Array.isArray(saved.profiles) ? saved.profiles.find(profile => profile?.id === key.id)?.model : undefined;
    return { id: key.id, name: key.name, baseUrl: new URL('/customer-api/axiom-chat/key/' + encodeURIComponent(key.id) + '/v1', window.location.origin).toString(), protocol: 'openai-compatible', model: previous && models.includes(previous) ? previous : models[0], models, auth: 'none', sendReasoning: true };
  });
  return { version: 1, profiles, selectedId: profiles.find(profile => profile.id === saved.selectedId)?.id || profiles[0]?.id || null };
}

export function loadEndpointKeys(_profiles: EndpointProfile[]): Record<string, string> {
  return {};
}

// Store selection only. Customer credentials never enter the browser.
export function saveEndpointStore(store: EndpointStore, _keys: Record<string, string>) {
  const session = getAxiomSession();
  if (store.selectedId !== null && !session.keys.some(key => key.id === store.selectedId)) throw Error('Key AXIOM tidak tersedia.');
  const profiles = store.profiles.filter(profile => session.keys.some(key => key.id === profile.id)).map(({ id, model }) => {
    if (!session.keys.find(key => key.id === id)?.models.includes(model)) throw Error('Model AXIOM tidak tersedia untuk API key ini.');
    return { id, model };
  });
  localStorage.setItem(endpointStorageKey, JSON.stringify({ customerId: session.customer.id, selectedId: store.selectedId, profiles }));
  sessionStorage.removeItem(endpointSecretsKey);
  window.dispatchEvent(new Event('client-endpoints-changed'));
}
