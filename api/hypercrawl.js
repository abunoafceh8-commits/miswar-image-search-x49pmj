/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
const __RL = new Map();
function __rate(req, res, max = 90, win = 60_000) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
    const key = ip + ':' + (req.url || '');
    const now = Date.now();
    const b = __RL.get(key);
    if (!b || now > b.r) { __RL.set(key, { n: 1, r: now + win }); if (__RL.size > 4000) __RL.clear(); return true; }
    b.n++;
    if (b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.r - now) / 1000))); res.status(429).json({ error: 'rate_limited', message: 'تم تجاوز الحد المسموح — أعد المحاولة بعد قليل' }); return false; }
    return true;
  } catch { return true; }
}
const __origin = (req) => {
  const o = req.headers.origin || '';
  if (!o) return '*';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  if (/^https?:\/\/[a-z0-9-]+\.(vercel|arcada)\.app$/.test(o)) return o;
  try { if (o === 'https://' + req.headers.host) return o; } catch {}
  return 'null';
};

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { urls, q, qAlt, safe = true } = body;

  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const items = [];
  
  // If URLs provided, fetch metadata for each
  if (urls && Array.isArray(urls)) {
    for (const url of urls.slice(0, 30)) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
          redirect: 'follow'
        });
        const ct = r.headers.get('content-type') || '';
        if (ct.startsWith('image/')) {
          items.push({
            id: `crawl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            url,
            thumbnail: url,
            source: 'crawl',
            source_label: 'Direct',
            width: 800,
            height: 600
          });
        }
      } catch {}
    }
  }
  
  // Also do a deep search
  if (q) {
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=30`, {
        headers: { 'User-Agent': 'MiswarCrawler/2.0' },
        signal: AbortSignal.timeout(10000)
      });
      const data = await r.json();
      (data.results || []).forEach(item => {
        if (!items.find(i => i.url === item.url)) {
          items.push({
            id: `ov_${item.id}`,
            title: item.title || 'Untitled',
            url: item.url,
            thumbnail: item.thumbnail,
            width: item.width || 800,
            height: item.height || 600,
            source: 'openverse',
            source_label: 'Openverse'
          });
        }
      });
    } catch {}
  }

  return res.json({ items, total: items.length, q: q || '' });
}
