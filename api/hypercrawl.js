export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { urls, q, qAlt, safe = true } = body;

  res.setHeader('Access-Control-Allow-Origin', '*');
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
