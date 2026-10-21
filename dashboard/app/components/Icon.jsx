import { HugeiconsIcon } from '@hugeicons/react';
import { Moon02Icon, Sun03Icon, ComputerIcon, Menu01Icon, Cancel01Icon, Home01Icon, Key01Icon, Wallet01Icon, Calculator01Icon, ChartLineData01Icon, BookOpen01Icon, Shield01Icon, File01Icon, GridViewIcon, Activity01Icon, CheckmarkCircle02Icon, Layers01Icon, PlayIcon, ShoppingCart01Icon, Globe02Icon, SourceCodeIcon, Notification01Icon } from '@hugeicons/core-free-icons';

const icons = {
  moon: Moon02Icon, sun: Sun03Icon, monitor: ComputerIcon, menu: Menu01Icon, close: Cancel01Icon,
  tokens: Layers01Icon, keys: Key01Icon, wallet: Wallet01Icon, play: PlayIcon, check: CheckmarkCircle02Icon,
  '/account': Home01Icon, '/account/logs': File01Icon, '/account/performance': ChartLineData01Icon,
  '/account/setup': SourceCodeIcon, '/account/keys': Key01Icon, '/playground': PlayIcon,
  '/account/models': GridViewIcon, '/account/status': Activity01Icon, '/account/billing': Wallet01Icon,
  '/account/quota-history': Layers01Icon,
  '/account/calculator': Calculator01Icon, '/buy': ShoppingCart01Icon, '/account/updates': Notification01Icon,
  '/terms': File01Icon, '/privacy': Shield01Icon, '/': Globe02Icon, '/pricing': Layers01Icon, '/docs': BookOpen01Icon,
};

export default function Icon({ name, size = 20 }) {
  return <HugeiconsIcon icon={icons[name]} size={size} width={size} height={size} color="currentColor" strokeWidth={1.7} aria-hidden="true" focusable="false" className="axiom-icon" style={{ display: 'block', flexShrink: 0 }} />;
}
