import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

export function desktopHostClient(input, output) {
  const pending = new Map();
  const lines = createInterface({ input: output, crlfDelay: Infinity });
  function failAll() { for (const request of pending.values()) request.fail(Error('Host closed')); pending.clear(); }
  lines.on('close', failAll);
  lines.on('line', line => {
    const event = JSON.parse(line), request = pending.get(event.id);
    if (!request) return;
    if (event.type === 'headers') request.headers(event);
    if (event.type === 'chunk') request.chunk(Buffer.from(event.data, 'base64'));
    if (event.type === 'end') { request.end(); pending.delete(event.id); }
    if (event.type === 'error') { request.fail(Error(event.error)); pending.delete(event.id); }
  });
  return {
    request(payload) {
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        let controller, settled = false;
        const stream = new ReadableStream({ start(value) { controller = value; }, cancel() { input.write(JSON.stringify({ id, cancel: true }) + '\n'); pending.delete(id); } });
        pending.set(id, { headers(event) { settled = true; resolve(new Response(stream, { status: event.status, headers: event.headers })); }, chunk(chunk) { controller.enqueue(chunk); }, end() { controller.close(); }, fail(error) { if (settled) controller.error(error); else reject(error); } });
        input.write(JSON.stringify({ id, payload }) + '\n');
      });
    },
    shutdown() { input.write('{"shutdown":true}\n'); },
    close() { lines.close(); },
  };
}
