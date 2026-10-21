import { useEffect, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { RichText } from '../components/RichText';

export type StreamTool = { id: string; type: string; status?: string; command?: string; aggregatedOutput?: string; changes?: { path: string; diff?: string; kind?: { type: string } }[]; server?: string; tool?: string };
export type StreamEntry = { id: string; kind: 'message' | 'tool' | 'summary'; text?: string; item?: StreamTool; startedAt: number; endedAt?: number };
type StreamEvent = { type: string; itemId?: string; delta?: string; text?: string; item?: StreamTool };
const running = (status?: string) => !status || status === 'inProgress' || status === 'in_progress' || status === 'running';

export function updateAgentStream(entries: StreamEntry[], event: StreamEvent, now = Date.now()): StreamEntry[] {
  if (!['text', 'message', 'item', 'output', 'summary'].includes(event.type)) return entries;
  const kind = event.type === 'item' || event.type === 'output' ? 'tool' : event.type === 'summary' ? 'summary' : 'message';
  const id = event.item?.id || event.itemId || (kind === 'message' ? 'answer' : 'summary');
  const index = entries.findIndex(entry => entry.id === id && entry.kind === kind);
  const previous = entries[index];
  if (event.type === 'output' && !previous) return entries;
  const entry: StreamEntry = previous ? { ...previous } : { id, kind, startedAt: now };
  if (event.type === 'text' || event.type === 'summary') entry.text = ((entry.text || '') + (event.delta || '')).slice(-1024 * 1024);
  if (event.type === 'message') entry.text = (event.text || '').slice(-1024 * 1024);
  if (event.type === 'item') {
    entry.item = { ...entry.item, ...event.item } as StreamTool;
    if (!running(entry.item.status)) entry.endedAt = now;
  }
  if (event.type === 'output') entry.item = { ...entry.item!, aggregatedOutput: ((entry.item?.aggregatedOutput || '') + (event.delta || '')).slice(-50000) };
  if (kind === 'summary') return [...entries.filter(value => value.kind !== 'summary'), entry].slice(-100);
  return index < 0 ? [...entries, entry].slice(-100) : entries.map((value, i) => i === index ? entry : value);
}

function ToolRow({ entry, streaming, now }: { entry: StreamEntry; streaming: boolean; now: number }) {
  const item = entry.item!;
  const active = streaming && running(item.status);
  const stopped = !streaming && running(item.status);
  const seconds = Math.max(0, Math.floor(((entry.endedAt ?? now) - entry.startedAt) / 1000));
  const command = item.type === 'commandExecution';
  const failed = item.status === 'failed' || item.status === 'declined';
  const state = failed ? 'Failed' : stopped ? 'Stopped' : active ? 'Running' : 'Completed';
  const description = item.command || (item.type === 'fileChange' ? 'File changes' : item.type === 'mcpToolCall' ? [item.server, item.tool].filter(Boolean).join(' / ') : item.type);
  const label = command ? failed ? 'Command failed' : stopped ? 'Stopped command' : active ? seconds >= 10 ? `Running command for ${seconds}s` : `Running ${description}` : `Ran ${description}` : `${state} ${description}`;
  return <details className="d-agent-stream-tool">
    <summary><I name={command ? 'terminal' : item.type === 'fileChange' ? 'page' : 'plugin'} size={18}/><span className="d-tool-label-collapsed" title={description}>{label}</span><span className="d-tool-label-expanded">{command && !active && !failed && !stopped ? 'Ran command' : label}</span><I name="down" size={14}/></summary>
    <div className="d-agent-stream-output">{command && <><small>Shell</small><pre>$ {item.command}</pre></>}{item.aggregatedOutput && <pre>{item.aggregatedOutput}</pre>}{item.changes?.map(change => <div key={change.path}><b>{change.path}</b><pre>{change.diff || change.kind?.type}</pre></div>)}</div>
  </details>;
}

export function AgentStream({ entries, streaming }: { entries: StreamEntry[]; streaming: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [streaming]);
  return <div className="d-agent-stream">{entries.map((entry, index) => {
    if (entry.kind === 'message') return entry.text ? <div className="d-assistant-message" key={'message-' + entry.id}><RichText text={entry.text}/></div> : null;
    if (entry.kind === 'summary') return streaming && index === entries.length - 1 && entry.text ? <p key={'summary-' + entry.id} className="d-agent-stream-summary"><span>{entry.text}</span></p> : null;
    if (entries[index - 1]?.kind === 'tool') return null;
    const tools: StreamEntry[] = [];
    for (let cursor = index; entries[cursor]?.kind === 'tool'; cursor++) tools.push(entries[cursor]);
    const completedCommands = tools.length > 1 && tools.every(tool => tool.item?.type === 'commandExecution' && tool.item.status === 'completed');
    const rows = tools.map(tool => <ToolRow key={tool.id} entry={tool} streaming={streaming} now={now}/>);
    return completedCommands ? <details className="d-agent-stream-tool d-agent-stream-batch" key={'batch-' + entry.id}>
      <summary><I name="terminal" size={18}/><span>Ran commands</span><I name="down" size={14}/></summary>
      <div className="d-agent-stream-tools">{rows}</div>
    </details> : <div className="d-agent-stream-tools" key={'tools-' + entry.id}>{rows}</div>;
  })}</div>;
}
