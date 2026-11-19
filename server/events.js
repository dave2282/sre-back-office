// Server-sent events: powers `entities.X.subscribe()` on the client (live refresh).
// Only {entity, type, id} is broadcast — clients re-fetch through the permission-checked API.
const clients = new Set();

export function eventsHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const client = { res, userId: req.user.id };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

export function broadcast(evt) {
  const line = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients) {
    try { c.res.write(line); } catch { clients.delete(c); }
  }
}
