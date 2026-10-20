// Miswar Image Search v3.0 - Advanced Multi-Engine Deep Search
// 10 search engines with intelligent ranking and metadata extraction

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Advanced search engine implementations

async function searchWikimedia(q, limit, offset = 0) {
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${Math.min(limit, 50)}&gsroffset=${offset}&prop=imageinfo&iiprop=url|size|mime|extmetadata|timestamp|user&iiurlwidth=1200&format=json`, {
      headers: { 'User-Agent': 'MiswarHarvester/3.0' },
      signal: AbortSignal.timeout(10000)
    });
    const d = await r.json();
    const images = [];
    
    if (d.query?.pages) {
      for (const p of Object.values(d.query.pages)) {
        const ii = p.imageinfo?.[0];
        if (ii && (ii.mime || '').startsWith('image/')) {
          const title = p.title.replace('File:', '');
          const ext = ii.extmetadata || {};
          
          images.push({
            url: ii.url,
            thumb: ii.thumburl || ii.url,
            title,
            description: ext.ImageDescription?.value || '',
            author: ext.Artist?.value || ii.user || 'Unknown',
            license: ext.LicenseShortName?.value || 'Unknown',
            date: ext.DateTimeOriginal?.value || ii.timestamp || '',
            pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
            source: 'wikimedia',
            width: ii.width || 1200,
            height: ii.height || 800,
            size: ii.size || 0,
            score: calculateScore(ii.width, ii.height, ext)
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
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    return (d.results || []).map(item => ({
      url: item.url,
      thumb: item.thumbnail || item.url,
      title: item.title || 'Untitled',
      description: item.description || '',
      author: item.creator || 'Unknown',
      license: item.license || 'Unknown',
      date: item.created_on || '',
      pageUrl: item.foreign_landing_url || '',
      source: 'openverse',
      width: item.width || 1200,
      height: item.height || 800,
      score: calculateScore(item.width, item.height, {})
    }));
  } catch { return []; }
}

async function searchUnsplash(q, limit) {
  try {
    // Unsplash Source API
    const images = [];
    const r = await fetch(`https://source.unsplash.com/featured/?${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual'
    });
    const location = r.headers.get('location');
    if (location) {
      images.push({
        url: location,
        thumb: location + '&w=400',
        title: q,
        source: 'unsplash',
        width: 1920,
        height: 1080,
        score: 8
      });
    }
    return images;
  } catch { return []; }
}

async function searchPexels(q, limit) {
  try {
    // Pexels public search (no API key needed for basic)
    const r = await fetch(`https://www.pexels.com/search/${encodeURIComponent(q)}/`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    // Extract image URLs
    const matches = [...html.matchAll(/data-src="(https:\/\/images\.pexels\.com\/photos\/\d+[^"]+)"/g)];
    matches.slice(0, limit).forEach(m => {
      images.push({
        url: m[1],
        thumb: m[1] + '?w=400',
        title: q,
        source: 'pexels',
        width: 1920,
        height: 1080,
        score: 7
      });
    });
    
    return images;
  } catch { return []; }
}

async function searchPixabay(q, limit) {
  try {
    // Pixabay public API (limited)
    const r = await fetch(`https://pixabay.com/api/?key=free&q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 20)}`, {
      signal: AbortSignal.timeout(6000)
    });
    const d = await r.json();
    return (d.hits || []).map(item => ({
      url: item.largeImageURL,
      thumb: item.previewURL || item.webformatURL,
      title: item.tags || q,
      author: item.user || 'Unknown',
      source: 'pixabay',
      width: item.imageWidth || 1920,
      height: item.imageHeight || 1080,
      downloads: item.downloads || 0,
      likes: item.likes || 0,
      score: calculateScore(item.imageWidth, item.imageHeight, { downloads: item.downloads })
    }));
  } catch { return []; }
}

async function searchFlickr(q, limit) {
  try {
    // Flickr public search
    const r = await fetch(`https://www.flickr.com/search/?text=${encodeURIComponent(q)}&sort=relevance`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    const matches = [...html.matchAll(/data-deferred="1"[^>]+src="([^"]+)"/g)];
    matches.slice(0, limit).forEach(m => {
      images.push({
        url: m[1].replace('_m.jpg', '_b.jpg'), // Get large version
        thumb: m[1],
        title: q,
        source: 'flickr',
        width: 1024,
        height: 768,
        score: 6
      });
    });
    
    return images;
  } catch { return []; }
}

async function searchBing(q, limit) {
  try {
    const r = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&count=${limit}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    // Extract image data from Bing
    const matches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g)];
    matches.slice(0, limit).forEach(m => {
      const url = m[1].replace(/&amp;/g, '&');
      images.push({
        url,
        thumb: url,
        title: q,
        source: 'bing',
        width: 1200,
        height: 800,
        score: 5
      });
    });
    
    return images;
  } catch { return []; }
}

async function searchDuckDuckGo(q, limit) {
  try {
    const r = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    const matches = [...html.matchAll(/image&quot;:&quot;(https?:\/\/[^&]+)&quot;/g)];
    matches.slice(0, limit).forEach(m => {
      const url = m[1].replace(/&amp;/g, '&');
      images.push({
        url,
        thumb: url,
        title: q,
        source: 'duckduckgo',
        width: 1200,
        height: 800,
        score: 5
      });
    });
    
    return images;
  } catch { return []; }
}

async function searchDeviantArt(q, limit) {
  try {
    const r = await fetch(`https://www.deviantart.com/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    const matches = [...html.matchAll(/data-super-full-img="([^"]+)"/g)];
    matches.slice(0, limit).forEach(m => {
      images.push({
        url: m[1],
        thumb: m[1].replace('/f/', '/t/'),
        title: q,
        source: 'deviantart',
        width: 1920,
        height: 1080,
        score: 7
      });
    });
    
    return images;
  } catch { return []; }
}

async function search500px(q, limit) {
  try {
    const r = await fetch(`https://500px.com/search?q=${encodeURIComponent(q)}&type=photos`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const images = [];
    
    const matches = [...html.matchAll(/src="(https:\/\/drscdn\.500px\.org\/photo\/[^"]+)"/g)];
    matches.slice(0, limit).forEach(m => {
      images.push({
        url: m[1],
        thumb: m[1].replace('/2048/', '/400/'),
        title: q,
        source: '500px',
        width: 2048,
        height: 1365,
        score: 8
      });
    });
    
    return images;
  } catch { return []; }
}

// Intelligent scoring algorithm
function calculateScore(width, height, metadata) {
  let score = 5; // Base score
  
  // Resolution bonus
  if (width && height) {
    const pixels = width * height;
    if (pixels > 4000000) score += 3; // 4MP+
    else if (pixels > 2000000) score += 2; // 2MP+
    else if (pixels > 1000000) score += 1; // 1MP+
  }
  
  // Metadata bonus
  if (metadata.downloads > 1000) score += 2;
  if (metadata.likes > 100) score += 1;
  if (metadata.license && metadata.license !== 'Unknown') score += 1;
  
  return Math.min(10, score);
}

// Top terms extraction for search refinement
function extractTopTerms(images) {
  const terms = {};
  
  images.forEach(img => {
    const words = (img.title + ' ' + (img.description || '')).toLowerCase().split(/\W+/);
    words.forEach(word => {
      if (word.length > 3) {
        terms[word] = (terms[word] || 0) + 1;
      }
    });
  });
  
  return Object.entries(terms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, count }));
}

// Deduplication by URL similarity
function deduplicateImages(images) {
  const seen = new Set();
  return images.filter(img => {
    const key = img.url.split('?')[0]; // Remove query params
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
