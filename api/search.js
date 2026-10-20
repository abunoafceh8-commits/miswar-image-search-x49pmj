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
  const { q, qAlt, limit = 160, safe = true, minWidth = 400, engines = 'all', cursors = {} } = body;
  if (!q) return res.status(400).json({ error: 'Query required (field: q)' });

  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = [];
  const perSource = Math.min(Math.ceil(limit / 2), 40);

  // Source 1: Wikimedia Commons (primary - fast and reliable)
  try {
    const offset = cursors.wikimedia || 0;
    const wr = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${perSource}&gsroffset=${offset}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&format=json`, {
      signal: AbortSignal.timeout(8000)
    });
    const wd = await wr.json();
    if (wd.query?.pages) {
      Object.values(wd.query.pages).forEach(p => {
        const ii = p.imageinfo?.[0];
        if (ii && (ii.mime || '').startsWith('image/')) {
          const w = ii.width || 800;
          if (w >= minWidth || !minWidth) {
            results.push({
              id: `wiki_${p.pageid}`,
              title: p.title.replace('File:', ''),
              url: ii.url,
              thumbnail: ii.thumburl || ii.url,
              width: w,
              height: ii.height || 600,
              source: 'wikimedia',
              source_label: 'Wikimedia',
              license: 'CC/Wiki',
              creator: '',
              mime: ii.mime || 'image/jpeg',
              aspect_ratio: w > 0 ? (w / (ii.height || 600)).toFixed(2) : '1.33'
            });
          }
        }
      });
    }
  } catch {}

  // Source 2: Openverse (secondary - may be slow)
  try {
    const page = cursors.openverse || 1;
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page=${page}&page_size=${Math.min(perSource, 20)}&license_type=commercial`, {
      headers: { 'User-Agent': 'MiswarImageSearch/2.0' },
      signal: AbortSignal.timeout(5000)
    });
    const data = await r.json();
    (data.results || []).forEach(item => {
      const w = item.width || 800;
      if (w >= minWidth || !minWidth) {
        results.push({
          id: `ov_${item.id}`,
          title: item.title || 'Untitled',
          url: item.url,
          thumbnail: item.thumbnail || item.url,
          width: w,
          height: item.height || 600,
          source: 'openverse',
          source_label: 'Openverse',
          license: item.license || 'CC',
          creator: item.creator || '',
          creator_url: item.creator_url || '',
          foreign_landing_url: item.foreign_landing_url || '',
          aspect_ratio: w > 0 ? (w / (item.height || 600)).toFixed(2) : '1.33'
        });
      }
    });
  } catch {}

  // Also search with qAlt if provided
  if (qAlt && qAlt !== q && results.length < limit) {
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(qAlt)}&page_size=20`, {
        headers: { 'User-Agent': 'MiswarImageSearch/2.0' },
        signal: AbortSignal.timeout(8000)
      });
      const data = await r.json();
      (data.results || []).forEach(item => {
        if (!results.find(r => r.url === item.url)) {
          results.push({
            id: `ov_${item.id}`,
            title: item.title || 'Untitled',
            url: item.url,
            thumbnail: item.thumbnail || item.url,
            width: item.width || 800,
            height: item.height || 600,
            source: 'openverse',
            source_label: 'Openverse',
            license: item.license || 'CC'
          });
        }
      });
    } catch {}
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = results.filter(r => { const k = r.url; if (seen.has(k)) return false; seen.add(k); return true; });

  // Format images to match original API structure
  const images = unique.slice(0, limit).map(item => ({
    id: item.id,
    url: item.url,
    thumb: item.thumbnail,
    title: item.title,
    source: item.source_label,
    width: item.width,
    height: item.height,
    query: q,
    status: 'found'
  }));

  return res.json({
    images,
    cursors: {
      wikimedia: (cursors.wikimedia || 0) + perSource,
      openverse: (cursors.openverse || 1) + 1
    },
    counts: {
      wikimedia: results.filter(r => r.source === 'wikimedia').length,
      openverse: results.filter(r => r.source === 'openverse').length,
      total: unique.length
    },
    hasMore: unique.length >= limit,
    ms: Date.now(),
    topTerms: [q],
    rejected: 0,
    safeApplied: safe
  });
}
