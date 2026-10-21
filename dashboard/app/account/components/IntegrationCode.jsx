'use client';

export const API_BASE = 'https://ai.axiomcreative.xyz/v1';
export function environment(key, model) {
  return `OPENAI_API_KEY=${key}\nOPENAI_BASE_URL=${API_BASE}\nOPENAI_MODEL=${JSON.stringify(model)}\n`;
}
export function integrationCode(language, model) {
  const body = { model, messages: [{ role: 'user', content: 'Halo, jelaskan kemampuan Anda dalam satu kalimat.' }], max_tokens: 128, stream: true, stream_options: { include_usage: true } };
  if (language === 'curl') return `curl --no-buffer ${API_BASE}/chat/completions \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body).replaceAll("'", "'\\''")}'`;
  if (language === 'python') return `# Instal dependensi: python -m pip install openai\n# Muat variabel .env ke lingkungan proses terlebih dahulu.\nimport os\nfrom openai import OpenAI\n\nclient = OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=${JSON.stringify(API_BASE)})\nstream = client.chat.completions.create(\n    model=${JSON.stringify(model)},\n    messages=[{"role": "user", "content": "Halo, jelaskan kemampuan Anda dalam satu kalimat."}],\n    max_tokens=128,\n    stream=True,\n    stream_options={"include_usage": True},\n)\nfor chunk in stream:\n    if chunk.choices:\n        print(chunk.choices[0].delta.content or "", end="", flush=True)\n    if chunk.usage:\n        print("\\nUsage:", chunk.usage)\n`;
  return `// Instal dependensi: npm install openai\n// Node 20.6+: node --env-file=.env axiom.mjs\nimport OpenAI from 'openai';\n\nconst client = new OpenAI({\n  apiKey: process.env.OPENAI_API_KEY,\n  baseURL: ${JSON.stringify(API_BASE)},\n});\nconst stream = await client.chat.completions.create(${JSON.stringify(body, null, 2)});\nfor await (const chunk of stream) {\n  process.stdout.write(chunk.choices[0]?.delta?.content || '');\n  if (chunk.usage) console.log('\\nUsage:', chunk.usage);\n}\n`;
}
