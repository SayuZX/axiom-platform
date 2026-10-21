const base = 'https://ai.axiomcreative.xyz';
const api = `${base}/v1`;
export const setupTargets = [
  { id: 'openclaw', label: 'OpenClaw', kind: 'Agen', guide: 'Gabungkan ke konfigurasi OpenClaw. Semua model siap dipilih di aplikasi.' },
  { id: 'cursor', label: 'Cursor', kind: 'Editor', guide: 'Isi API key dan base URL di Cursor Settings > Models, lalu tambahkan model dari daftar.' },
  { id: 'claude', label: 'Claude Code', kind: 'Terminal', guide: 'Gabungkan ke ~/.claude/settings.json. Model tersedia di /model pada sesi baru.' },
  { id: 'codex', label: 'Codex', kind: 'Terminal', guide: 'Simpan di ~/.codex/axiom.config.toml. Gunakan codex --profile axiom --model ID.' },
  { id: 'hermes', label: 'Hermes', kind: 'Agen', guide: 'Gabungkan ke ~/.hermes/config.yaml. Pilih model setelah memulai sesi baru.' },
  { id: 'omp', label: 'Oh My Pi', kind: 'Terminal', guide: 'Gabungkan provider ke ~/.omp/agent/models.yml. Semua model tersedia di /model.' },
  { id: 'node', label: 'Node.js', kind: 'Proyek', guide: 'Jalankan node axiom.mjs --list atau node axiom.mjs ID_MODEL. Permintaan memakai kuota.' },
];
export function setupArtifact(target, key, models) {
  const selected = setupTargets.find(item => item.id === target);
  if (!selected) throw new TypeError('Aplikasi tidak dikenal.');
  const artifact = (filename, content) => ({ filename, content, instruction: selected.guide });
  if (typeof key !== 'string' || !/^[-\w]{12,300}$/.test(key)) throw new TypeError('Kunci API tidak valid.');
  if (!Array.isArray(models) || !models.length || models.length > 1000) throw new TypeError('Daftar model tidak valid.');
  const ids = new Set();
  for (const model of models) {
    if (typeof model?.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,299}$/.test(model.id) || ids.has(model.id)) throw new TypeError('ID model tidak valid.');
    ids.add(model.id);
  }
  const first = models[0].id;
  if (target === 'openclaw') return artifact('axiom-openclaw.json', JSON.stringify({
    models: { mode: 'merge', providers: { axiom: { baseUrl: api, apiKey: key, api: 'openai-completions', models: models.map(model => ({ id: model.id, name: model.name || model.id })) } } },
    agents: { defaults: { model: { primary: `axiom/${first}` } } },
  }, null, 2) + '\n');
  if (target === 'cursor') return artifact('axiom-cursor.txt', `Cursor Settings > Models\nOpenAI API Key: ${key}\nOverride OpenAI Base URL: ${api}\nModels:\n${models.map(model => model.id).join('\n')}\n`);
  if (target === 'claude') return artifact('axiom-claude.json', JSON.stringify({ env: {
    ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: first,
  }, modelPicker: { options: models.map(model => ({ model: model.id, label: model.name || model.id })), replaceBuiltInOptions: true } }, null, 2) + '\n');
  if (target === 'codex') return artifact('axiom-codex.config.toml', `model = ${JSON.stringify(first)}\nmodel_provider = "axiom"\n# Model tersedia; pilih dengan codex --profile axiom --model ID_MODEL\n${models.map(model => `# ${model.id}`).join('\n')}\n\n[model_providers.axiom]\nname = "AXIOM AI"\nbase_url = ${JSON.stringify(api)}\nwire_api = "responses"\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${key}`)} }\n`);
  if (target === 'hermes') return artifact('axiom-hermes.yaml', `model:\n  provider: custom\n  default: ${JSON.stringify(first)}\n  base_url: ${JSON.stringify(api)}\n  api_mode: chat_completions\nproviders:\n  custom:\n    api: ${JSON.stringify(api)}\n    api_key: ${JSON.stringify(key)}\n    discover_models: false\n    models:\n${models.map(model => `      - ${JSON.stringify(model.id)}`).join('\n')}\n`);
  if (target === 'omp') return artifact('axiom-omp.models.yml', `providers:\n  axiom:\n    baseUrl: ${JSON.stringify(api)}\n    apiKey: ${JSON.stringify(key)}\n    api: openai-completions\n    models:\n${models.map(model => `      - id: ${JSON.stringify(model.id)}\n        name: ${JSON.stringify(model.name || model.id)}`).join('\n')}\n`);
  return artifact('axiom.mjs', `// Berkas privat: berisi API key. Node.js 20.6+. Jalankan: node axiom.mjs [ID_MODEL]\nconst models = ${JSON.stringify(models.map(model => model.id))};\nif (process.argv[2] === '--list') { console.log(models.join('\\n')); process.exit(0); }\nconst model = process.argv[2] || models[0];\nif (!models.includes(model)) throw new Error('Model tidak ada dalam konfigurasi.');\nconst response = await fetch(${JSON.stringify(`${api}/chat/completions`)}, {\n  method: 'POST',\n  headers: { Authorization: ${JSON.stringify(`Bearer ${key}`)}, 'Content-Type': 'application/json' },\n  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Halo!' }], max_tokens: 128, stream: false }),\n});\nconst result = await response.json();\nif (!response.ok || result.error) throw new Error(result.error?.message || String(response.status));\nconsole.log(result.choices?.[0]?.message?.content ?? result);\n`);
}
