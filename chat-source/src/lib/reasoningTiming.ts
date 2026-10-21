// Client-observed reasoning time, from the first reasoning chunk to the first answer
// chunk (or Stop/end). This is not a provider-reported server execution duration.
export function createReasoningTimer(now: () => number = () => performance.now()) {
  let started: number | undefined, ended: number | undefined;
  return {
    observe(reasoning: string, content: string) {
      if (started === undefined && reasoning.trim()) started = now();
      if (started !== undefined && ended === undefined && content.trim()) ended = now();
    },
    finish() { if (started !== undefined && ended === undefined) ended = now(); },
    elapsedMs() { return started === undefined ? undefined : Math.max(0, (ended ?? now()) - started); },
  };
}

export function reasoningSeconds(durationMs: unknown): number | undefined {
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs / 1000) : undefined;
}

export function completedThinkingLabel(durationMs: unknown): string {
  const seconds = reasoningSeconds(durationMs);
  return seconds ? `Thought for ${seconds} second${seconds === 1 ? '' : 's'}` : 'Thought';
}
