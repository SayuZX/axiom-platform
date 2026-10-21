import { endpointSecretsKey } from './endpointProfiles';
import { clearLocalProfile } from './localProfile';
import { clearNativeEndpointKeys } from './mobileEndpointVault';

export function signOutMobileProfile() {
  // Leave local conversations and provider definitions available after onboarding.
  sessionStorage.removeItem(endpointSecretsKey);
  void clearNativeEndpointKeys().catch(() => {
    window.dispatchEvent(new CustomEvent('client-toast', { detail: 'API key sesi sudah dihapus, tetapi penghapusan penyimpanan aman gagal. Coba keluar lagi sebelum menutup aplikasi.' }));
  });
  clearLocalProfile();
  window.dispatchEvent(new Event('client-endpoints-changed'));
}
