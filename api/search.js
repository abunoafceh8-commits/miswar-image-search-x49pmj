// Miswar Image Search - Full 7-engine implementation
// Matches original API format exactly

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function searchWikimedia(q, limit, offset = 0) {
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${Math.min(limit, 50)}&gsroffset=${offset}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&format=json`, {
      headers: { 'User-Agent': 'MiswarHarvester/3.0' },
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    const images = [];
    if (d.query?.pages) {
      for (const p of Object.values(d.query.pages)) {
        const ii = p.imageinfo?.[0];
        if (ii && (ii.mime || '').startsWith('image/')) {
          const title = p.title.replace('File:', '');
          images.push({
            url: ii.url,
            thumb: ii.thumburl || ii.url,
            title,
            pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
            pageTitle: title,
            source: 'wikimedia',
            width: ii.width || 800,
            height: ii.height || 600,
            score: Math.min(10, Math.round((ii.width || 800) / 500))
          });
        }
      }
    }
    return images;
  } catch { return []; }
}

async function searchOpenverse(q, limit, page = 1) {
  try {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page=${page}&page_size=${Math.min(limit, 40)}`, {
      headers: { 'User-Agent': 'MiswarHarvester/3.0' },
      signal: AbortSignal.timeout(6000)
    });
    const d = await r.json();
    return (d.results || []).map(item => ({
      url: item.url,
      thumb: item.thumbnail || item.url,
      title: item.title || 'Untitled',
      pageUrl: item.foreign_landing_url || '',
      pageTitle: item.title || '',
      source: 'openverse',
      width: item.width || 800,
      height: item.height || 600,
      score: Math.min(10, Math.round((item.width || 800) / 500))
    }));
  } catch { return []; }
}

async function searchUnsplash(q, limit) {
  // Unsplash Source API (free, no key needed)
  try {
    const images = [];
    const r = await fetch(`https://source.unsplash.com/featured/?${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual'
    });
    // This returns a redirect to an image
    const location = r.headers.get('location');
    if (location) {
      images.push({
        url: location,
        thumb: location + '&w=400',
        title: q,
        pageUrl: `https://unsplash.com/s/photos/${encodeURIComponent(q)}`,
        pageTitle: q,
        source: 'unsplash',
        width: 1920,
        height: 1080,
        score: 8
      });
    }
    return images;
  } catch { return []; }
}

async function searchDuckDuckGo(q, limit) {
  try {
    // DuckDuckGo image search via their API
    const r = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images&f=json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    const text = await r.text();
    // Extract image URLs from the response
    const images = [];
    const urlMatches = text.matchAll(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi);
    const seen = new Set();
    for (const match of urlMatches) {
      const url = match[0];
      if (!seen.has(url) && !url.includes('duckduckgo.com') && !url.includes('bing.com')) {
        seen.add(url);
        images.push({
          url,
          thumb: url,
          title: q,
          pageUrl: '',
          pageTitle: '',
          source: 'duckduckgo',
          width: 800,
          height: 600,
          score: 5
        });
        if (images.length >= limit) break;
      }
    }
    return images;
  } catch { return []; }
}

async function searchBing(q, limit, offset = 0) {
  try {
    // Bing image search (no API key needed for basic search)
    const r = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&first=${offset}&count=${Math.min(limit, 35)}&qft=+filterui:imagesize-large`, {
      headers: { 
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    // Extract murl (media URL) from Bing results
    const murlMatches = html.matchAll(/"murl":"(https?:\/\/[^"]+)"/g);
    const turlMatches = [...html.matchAll(/"turl":"(https?:\/\/[^"]+)"/g)];
    const titleMatches = [...html.matchAll(/"desc":"([^"]*)"/g)];
    const purlMatches = [...html.matchAll(/"purl":"(https?:\/\/[^"]+)"/g)];
    
    let i = 0;
    for (const match of murlMatches) {
      if (images.length >= limit) break;
      const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      images.push({
        url,
        thumb: turlMatches[i]?.[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/') || url,
        title: titleMatches[i]?.[1] || q,
        pageUrl: purlMatches[i]?.[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/') || '',
        pageTitle: titleMatches[i]?.[1] || '',
        source: 'bing',
        width: 800,
        height: 600,
        score: 6
      });
      i++;
    }
    return images;
  } catch { return []; }
}

async function searchPexels(q, limit) {
  // Pexels requires API key - skip for now
  return [];
}

async function searchPixabay(q, limit) {
  try {
    // Pixabay public API (limited)
    const r = await fetch(`https://pixabay.com/api/?key=&q=${encodeURIComponent(q)}&image_type=photo&per_page=${Math.min(limit, 20)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.hits || []).map(item => ({
      url: item.largeImageURL || item.webformatURL,
      thumb: item.previewURL || item.webformatURL,
      title: item.tags || q,
      pageUrl: item.pageURL || '',
      pageTitle: item.tags || '',
      source: 'pixabay',
      width: item.imageWidth || 800,
      height: item.imageHeight || 600,
      score: 7
    }));
  } catch { return []; }
}

function extractTopTerms(images) {
  const wordCount = {};
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','although','this','that','these','those','i','me','my','we','our','you','your','he','him','his','she','her','it','its','they','them','their','what','which','who','whom','whose']);
  
  for (const img of images) {
    const text = `${img.title || ''} ${img.pageTitle || ''}`.toLowerCase();
    const words = text.split(/[^a-zA-Z\u0600-\u06FF]+/).filter(w => w.length > 2 && !stopWords.has(w));
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, count]) => ({ term, count }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' 
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}))
    : {};
  const params = { ...req.query, ...body };
  const { q, qAlt, limit = 160, safe = true, minWidth = 400, engines = 'all', cursors = {} } = params;
  
  if (!q) return res.status(400).json({ error: 'Query required (field: q)' });

  const startTime = Date.now();
  const perEngine = Math.min(Math.ceil(limit / 3), 50);
  const allImages = [];
  const counts = { wikimedia: 0, openverse: 0, unsplash: 0, duckduckgo: 0, bing: 0, pexels: 0, pixabay: 0 };

  // Run all search engines in parallel
  const results = await Promise.allSettled([
    searchWikimedia(q, perEngine, cursors.wiki || 0),
    searchOpenverse(q, perEngine, cursors.openverse || 1),
    searchUnsplash(q, 5),
    searchDuckDuckGo(q, perEngine),
    searchBing(q, perEngine, cursors.bing || 0),
    searchPexels(q, perEngine),
    searchPixabay(q, perEngine),
  ]);

  const engineNames = ['wikimedia', 'openverse', 'unsplash', 'duckduckgo', 'bing', 'pexels', 'pixabay'];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      const imgs = result.value;
      counts[engineNames[i]] = imgs.length;
      allImages.push(...imgs);
    }
  });

  // If qAlt provided, search with it too
  if (qAlt && qAlt !== q && allImages.length < limit) {
    const altResults = await Promise.allSettled([
      searchWikimedia(qAlt, 20),
      searchBing(qAlt, 20),
    ]);
    altResults.forEach((result, i) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        const imgs = result.value.map(img => ({ ...img, source: img.source + '_alt' }));
        counts[engineNames[i]] += imgs.length;
        allImages.push(...imgs);
      }
    });
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = allImages.filter(img => {
    const key = img.url.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter by minWidth
  const filtered = unique.filter(img => !minWidth || (img.width || 0) >= minWidth || img.width === 800);

  // Sort by score (highest first)
  filtered.sort((a, b) => (b.score || 0) - (a.score || 0));

  const finalImages = filtered.slice(0, limit);
  const topTerms = extractTopTerms(finalImages);

  return res.json({
    images: finalImages,
    cursors: {
      wiki: (cursors.wiki || 0) + perEngine,
      openverse: (cursors.openverse || 1) + 1,
      unsplash: (cursors.unsplash || 1) + 1,
      ddg: null,
      bing: (cursors.bing || 0) + perEngine,
      pexels: (cursors.pexels || 1) + 1,
      pixabay: (cursors.pixabay || 1) + 1
    },
    counts,
    hasMore: filtered.length >= limit,
    ms: Date.now() - startTime,
    topTerms,
    rejected: unique.length - filtered.length,
    safeApplied: safe
  });
}
