import { getAxiomSession } from './axiom';
export type LocalProfile = { version: 1; name: string };
export const localProfileKey = 'client-local-profile-v1';
export function clearLocalProfile(): void {
  localStorage.removeItem(localProfileKey);
}
export function loadLocalProfile(): LocalProfile {
  const { customer } = getAxiomSession();
  return { version: 1, name: customer.name || customer.email };
}
export function saveLocalProfile(_name: string): LocalProfile {
  throw Error('Profil dikelola melalui akun AXIOM.');
}
export function profileInitials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase() || '?';
}
