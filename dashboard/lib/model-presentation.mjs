// Presentation only; API IDs remain untouched.
const families = [
  [/^atria/i, 'Atria'], [/^(gpt|codex)/i, 'OpenAI'],
  [/^deepseek/i, 'DeepSeek'], [/^gemini/i, 'Gemini'], [/^glm/i, 'Z.ai'],
  [/^hy\d/i, 'Hunyuan'], [/^kimi/i, 'Kimi'], [/^mimo/i, 'Xiaomi MiMo'],
  [/^minimax/i, 'MiniMax'], [/^qwen/i, 'Qwen'],
];
const casing = { atria: 'Atria', gpt: 'GPT', codex: 'Codex', deepseek: 'DeepSeek', gemini: 'Gemini', glm: 'GLM', kimi: 'Kimi', mimo: 'MiMo', minimax: 'MiniMax', qwen: 'Qwen' };
export function presentModel(model) {
  const slug = model.id.split('/').at(-1);
  const name = (model.name || slug).split('/').at(-1).replace(/[-_]+/g, ' ').replace(/\b[a-z][a-z\d.]*/gi, word => casing[word.toLowerCase()] || (/^(?:v\d|k\d|m\d|q\d)/i.test(word) ? word : word[0].toUpperCase() + word.slice(1)));
  return { ...model, name, provider: families.find(([pattern]) => pattern.test(slug))?.[1] || model.provider };
}
