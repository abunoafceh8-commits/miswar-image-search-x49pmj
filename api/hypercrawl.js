export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { query, depth = 1, maxResults = 50 } = body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const results = [];
    
    // Multiple search queries with variations
    const queries = [query, `${query} photo`, `${query} image`, `${query} hd`];
    
    for (const q of queries.slice(0, depth + 1)) {
      try {
        const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20`, {
          headers: { 'User-Agent': 'MiswarCrawler/1.0' },
          signal: AbortSignal.timeout(10000)
        });
        const data = await r.json();
        (data.results || []).forEach(item => {
          if (!results.find(r => r.url === item.url)) {
            results.push({
              id: item.id,
              title: item.title || 'Untitled',
              url: item.url,
              thumbnail: item.thumbnail,
              width: item.width || 800,
              height: item.height || 600,
              source: item.source_name || 'Openverse'
            });
          }
        });
      } catch {}
      if (results.length >= maxResults) break;
    }

    // Also crawl Wikimedia
    try {
      const wr = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=30&prop=imageinfo&iiprop=url|size|mime&format=json`, {
        signal: AbortSignal.timeout(8000)
      });
      const wd = await wr.json();
      if (wd.query?.pages) {
        Object.values(wd.query.pages).forEach(p => {
          if (p.imageinfo?.[0] && !results.find(r => r.url === p.imageinfo[0].url)) {
            results.push({
              id: `wiki_${p.pageid}`,
              title: p.title.replace('File:', ''),
              url: p.imageinfo[0].url,
              thumbnail: p.imageinfo[0].url,
              width: p.imageinfo[0].width || 800,
              height: p.imageinfo[0].height || 600,
              source: 'Wikimedia'
            });
          }
        });
      }
    } catch {}

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ results: results.slice(0, maxResults), total: results.length, query });
  } catch (e) {
    return res.status(500).json({ error: e.message, results: [] });
  }
}
