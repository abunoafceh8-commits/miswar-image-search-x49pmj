export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { ids, query } = body;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (ids && Array.isArray(ids)) {
      const results = await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(`https://api.openverse.org/v1/images/${id}/`, { signal: AbortSignal.timeout(5000) });
          return await r.json();
        } catch { return { id, error: true }; }
      }));
      return res.json({ items: results });
    }
    return res.json({ items: [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
