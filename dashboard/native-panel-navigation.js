// Browser-only build adapter. Embedded shell never invokes standalone Next hooks.
export { useAdminRouter as useRouter } from './app/components/AdminEmbed.jsx';
export function usePathname() { return window.location.pathname; }
