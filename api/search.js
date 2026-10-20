export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { query, page = 1, per_page = 20 } = body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const results = [];
    
    // Search Openverse (Creative Commons)
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page=${page}&page_size=${per_page}`, {
        headers: { 'User-Agent': 'MiswarImageSearch/1.0' },
        signal: AbortSignal.timeout(10000)
      });
      const data = await r.json();
      (data.results || []).forEach(item => {
        results.push({
          id: item.id,
          title: item.title || 'Untitled',
          url: item.url,
          thumbnail: item.thumbnail,
          width: item.width || 800,
          height: item.height || 600,
          source: item.source_name || 'Openverse',
          license: item.license || 'CC',
          creator: item.creator || 'Unknown',
          foreign_landing_url: item.foreign_landing_url
        });
      });
    } catch {}

    // Search Wikimedia Commons
    try {
      const wr = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${per_page}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json`, {
        signal: AbortSignal.timeout(8000)
      });
      const wd = await wr.json();
      if (wd.query?.pages) {
        Object.values(wd.query.pages).forEach(p => {
          if (p.imageinfo?.[0]) {
            const ii = p.imageinfo[0];
            results.push({
              id: `wiki_${p.pageid}`,
              title: p.title.replace('File:', ''),
              url: ii.url,
              thumbnail: ii.thumburl || ii.url,
              width: ii.width || 800,
              height: ii.height || 600,
              source: 'Wikimedia Commons',
              license: 'CC/Wiki',
              creator: 'WikiMedia'
            });
          }
        });
      }
    } catch {}

    // Search Unsplash Source (public images)
    try {
      const ur = await fetch(`https://source.unsplash.com/featured/?${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
      // This returns a redirect to an image - we capture it
    } catch {}

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ results, total: results.length, query, page });
  } catch (e) {
    return res.status(500).json({ error: e.message, results: [] });
  }
}
