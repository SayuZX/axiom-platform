export type ComposerState = { phase: 'untouched' | 'first-focus' | 'compact'; focused: boolean; keyboardOpen: boolean; restingHeight: number; width: number };
export function initialComposerState(height: number, width: number): ComposerState {
  return { phase: 'untouched', focused: false, keyboardOpen: false, restingHeight: height, width };
}
export function focusComposer(state: ComposerState): ComposerState {
  return { ...state, focused: true, phase: state.phase === 'untouched' ? 'first-focus' : state.phase };
}
export function blurComposer(state: ComposerState): ComposerState {
  return { ...state, focused: false, phase: state.phase === 'first-focus' ? 'compact' : state.phase };
}
export function resizeComposer(state: ComposerState, height: number, width: number, composerFocused = state.focused): ComposerState {
  // Width changes indicate rotation/window resizing, not the soft keyboard.
  if (Math.abs(width - state.width) > 40) return { ...state, restingHeight: height, width, keyboardOpen: false };
  const restingHeight = Math.max(state.restingHeight, height);
  const keyboardOpen = (composerFocused || state.keyboardOpen) && restingHeight - height > 120;
  const keyboardClosed = state.keyboardOpen && !keyboardOpen;
  return { ...state, width, restingHeight, keyboardOpen, focused: keyboardClosed ? false : composerFocused, phase: keyboardClosed && state.phase === 'first-focus' ? 'compact' : state.phase };
}
