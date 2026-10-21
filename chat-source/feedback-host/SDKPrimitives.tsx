// Adapted from gabrieelibrahim/SuperGPT HEAD:src/components/SDKPrimitives.tsx.
// Actual SDK Alert/Button components; only toast tone and Indonesian label extended.
import { type ComponentProps, type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button } from '@openai/apps-sdk-ui/components/Button';
const StatusAlert = Alert as ComponentType<ComponentProps<typeof Alert> & HTMLAttributes<HTMLDivElement>>;
export function ClientAlert({ children, tone = 'danger', title, actions, className = '' }: { children: ReactNode; tone?: 'danger' | 'success' | 'info' | 'warning'; title?: string; actions?: ReactNode; className?: string }) {
  return <StatusAlert color={tone} variant="soft" className={'d-sdk-alert ' + className} title={title} description={children} actions={actions} role={tone === 'danger' ? 'alert' : 'status'} aria-live={tone === 'danger' ? 'assertive' : 'polite'} aria-atomic="true"/>;
}
export function ClientButton({ className = '', color = 'secondary', size = 'xl', variant = 'outline', ...props }: Omit<ComponentProps<typeof Button>, 'color'> & { color?: ComponentProps<typeof Button>['color'] }) {
  return <Button {...props} color={color} size={size} variant={variant} className={'d-sdk-button ' + className} data-sdk-control="button"/>;
}
export function ClientToast({ message, onDismiss, kind }: { message: string; onDismiss: () => void; kind: 'success' | 'error' }) {
  return <div className="d-toast d-sdk-toast"><ClientAlert tone={kind === 'error' ? 'danger' : 'success'} actions={<ClientButton color="secondary" variant="ghost" size="sm" aria-label="Tutup pemberitahuan" onClick={onDismiss}>×</ClientButton>}>{message}</ClientAlert></div>;
}
