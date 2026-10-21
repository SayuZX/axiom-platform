// Temporary release gate. Keep Codex history and runtime intact for re-enabling.
export const CODEX_MODE_ENABLED = false;
export function availableExperience(value: unknown): 'ChatGPT' | 'Codex' {
  return CODEX_MODE_ENABLED && value === 'Codex' ? 'Codex' : 'ChatGPT';
}
