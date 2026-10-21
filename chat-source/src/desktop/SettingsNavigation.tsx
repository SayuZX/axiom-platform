import { UIIcon as I } from '../components/UIIcon';
export const settingsTabs = [
  ['General', 'settings', 'permissions folder send notifications suggestions'], ['Import', 'download', 'backup migration json'],
  ['Profile', 'page', 'name avatar activity'], ['Appearance', 'bulb', 'theme font colors size motion contrast'],
  ['Account', 'comment', 'name logout local'], ['Archived chats', 'archive', 'history restore delete search'],
  ['Voice', 'mic', 'microphone dictation language speech audio'], ['Storage', 'folder', 'files persistence clear export'],
  ['Configuration', 'shield', 'model effort access network timeout plugins'], ['Personalization', 'settings', 'memory instructions writing'],
  ['Mini & Pets', 'plugin', 'companion mini window'], ['Keyboard shortcuts', 'list', 'keys shortcut send'],
  ['Usage & billing', 'clock', 'tokens analytics runs quota portal'], ['Data controls', 'shield', 'privacy archive delete reset backup'],
  ['Plugins', 'plugin', 'mcp tools'],
] as const;
export function isSettingsTab(tab: string) { return settingsTabs.some(item => item[0] === tab); }
export function SettingsSidebar({ tab, query, onQuery, onTab }: { tab: string; query: string; onQuery: (value: string) => void; onTab: (value: string) => void }) {
  const matches = settingsTabs.filter(item => item.join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="d-settings-nav"><label><I name="search" size={18}/><input id="settings-search" aria-label="Search settings" placeholder="Search settings" value={query} onChange={event => onQuery(event.target.value)}/>{query && <button aria-label="Clear settings search" onClick={() => onQuery('')}><I name="close" size={16}/></button>}</label><small>Personal</small><nav aria-label="Settings tabs">{matches.map(([name, icon]) => <button key={name} className={tab === name ? 'd-selected' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => onTab(name)}><I name={icon} size={18}/>{name}</button>)}</nav>{!matches.length && <p>No matching settings</p>}</div>;
}
