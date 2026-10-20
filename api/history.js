const history = [];
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    history.unshift({ id: Date.now().toString(), ...body, searchedAt: new Date().toISOString() });
    if (history.length > 200) history.pop();
    return res.json({ success: true });
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const targetId = id || body.id;
    if (targetId) {
      const idx = history.findIndex(h => h.id === targetId);
      if (idx >= 0) history.splice(idx, 1);
    }
    return res.json({ success: true });
  }
  const { limit = 50 } = req.query;
  return res.json(history.slice(0, parseInt(limit)));
}
