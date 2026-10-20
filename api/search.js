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

  const body = req.method === 'POST' 
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {})
    : {};
  const params = { ...req.query, ...body };
  
  const q = params.q || params.query || '';
  const limit = parseInt(params.limit || 100);
  const engines = params.engines || 'all';
  
  if (!q) {
    return res.status(400).json({ error: 'Query required (use ?q= parameter)' });
  }

  const startTime = Date.now();
  
  // Run all search engines in parallel
  const searchPromises = {
    wikimedia: searchWikimedia(q, limit),
    openverse: searchOpenverse(q, limit),
    unsplash: searchUnsplash(q, limit),
    pexels: searchPexels(q, limit),
    pixabay: searchPixabay(q, limit),
    flickr: searchFlickr(q, limit),
    bing: searchBing(q, limit),
    duckduckgo: searchDuckDuckGo(q, limit),
    deviantart: searchDeviantArt(q, limit),
    '500px': search500px(q, limit)
  };
  
  const results = await Promise.allSettled(
    Object.entries(searchPromises).map(([engine, promise]) => 
      promise.then(images => ({ engine, images }))
    )
  );
  
  // Collect all images
  let allImages = [];
  const engineStats = {};
  
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      const { engine, images } = r.value;
      engineStats[engine] = images.length;
      allImages.push(...images);
    }
  });
  
  // Deduplicate
  allImages = deduplicateImages(allImages);
  
  // Sort by score
  allImages.sort((a, b) => (b.score || 5) - (a.score || 5));
  
  // Extract top terms
  const topTerms = extractTopTerms(allImages);
  
  const duration = Date.now() - startTime;
  
  res.json({
    query: q,
    images: allImages.slice(0, limit),
    total: allImages.length,
    counts: engineStats,
    topTerms,
    duration,
    timestamp: new Date().toISOString(),
    version: '3.0-advanced',
    engines: Object.keys(engineStats).filter(e => engineStats[e] > 0)
  });
}
