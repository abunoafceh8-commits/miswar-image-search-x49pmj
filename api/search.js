/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
import { endpoint, readBody, json, rateLimit } from './_lib/guard.js';

/**
 * /api/search — محرّك بحث صور متوافق مع واجهة مِصوَر.
 * يقبل GET و POST ويُعيد الشكلين (images/items) حتى يعمل مع كل إصدارات الواجهة.
 * مصادر بلا مفاتيح: Wikimedia · Art Institute · NASA · Library of Congress (+ Openverse عند توفّر OPENVERSE_TOKEN)
 */
const UA = 'AbuNawaf-Miswar/3.0 (+https://abu-nawaf-hub.vercel.app)';
const IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
const extOf = (u) => { try { return new URL(u).pathname.split('.').pop().toLowerCase(); } catch { return ''; } };
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/^File:/, '').replace(/\s+/g, ' ').trim();
const stripQuery = (u) => { try { const x = new URL(u); x.search = ''; return x.href; } catch { return u; } };

const S = {
  async wikimedia(q, n, offset, minWidth) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&gsrnamespace=6&gsrlimit=${Math.min(50, n)}&gsroffset=${offset || 0}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480&format=json`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('wikimedia ' + r.status);
    const j = await r.json();
    const pages = Object.values(j.query?.pages || {}).map((p) => {
      const ii = p.imageinfo?.[0] || {};
      const md = ii.extmetadata || {};
      const full = stripQuery(ii.url || '');
      return {
        id: 'wm-' + p.pageid, title: clean(p.title).replace(/\.[a-z0-9]+$/i, ''),
        url: full, thumbnail: stripQuery(ii.thumburl || ii.url || ''), thumb: stripQuery(ii.thumburl || ii.url || ''),
        width: ii.width || 0, height: ii.height || 0, mime: ii.mime || 'image/jpeg',
        source: 'wikimedia', source_label: 'Wikimedia',
        license: String(md.LicenseShortName?.value || 'open').toLowerCase().replace(/\s+/g, '-'),
        creator: clean(md.Artist?.value).slice(0, 60),
        pageUrl: ii.descriptionurl || full, page_url: ii.descriptionurl || full,
      };
    }).filter((x) => x.url && IMG_EXT.includes(extOf(x.url)) && (!minWidth || !x.width || x.width >= minWidth));
    return pages;
  },
  async artic(q, n, _o, minWidth) {
    const r = await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&fields=id,title,image_id,artist_display,date_display,is_public_domain&limit=${Math.min(50, n)}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('artic');
    const j = await r.json();
    return (j.data || []).filter((x) => x.image_id).map((x) => {
      const base = `https://www.artic.edu/iiif/2/${x.image_id}/full`;
      return {
        id: 'aic-' + x.id, title: clean(x.title) || 'Artwork',
        url: `${base}/1686,/0/default.jpg`, thumbnail: `${base}/400,/0/default.jpg`, thumb: `${base}/400,/0/default.jpg`,
        width: 1686, height: 0, mime: 'image/jpeg', source: 'artic', source_label: 'Art Institute',
        license: x.is_public_domain ? 'public-domain' : 'art-institute',
        creator: clean(x.artist_display).split('\n')[0].slice(0, 60),
        pageUrl: `https://www.artic.edu/artworks/${x.id}`, page_url: `https://www.artic.edu/artworks/${x.id}`,
      };
    }).filter((x) => !minWidth || x.width >= minWidth);
  },
  async nasa(q, n) {
    const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=${Math.min(100, n)}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('nasa');
    const j = await r.json();
    return (j.collection?.items || []).filter((x) => x.links?.[0]?.href).map((x, i) => {
      const d = x.data?.[0] || {};
      return {
        id: 'nasa-' + (d.nasa_id || i), title: clean(d.title) || 'NASA',
        url: x.links[0].href, thumbnail: x.links[0].href, thumb: x.links[0].href,
        width: 0, height: 0, mime: 'image/jpeg', source: 'nasa', source_label: 'NASA',
        license: 'public-domain', creator: clean(d.center || 'NASA'),
        pageUrl: `https://images.nasa.gov/details/${d.nasa_id || ''}`, page_url: `https://images.nasa.gov/details/${d.nasa_id || ''}`,
      };
    });
  },
  async loc(q, n) {
    const r = await fetch(`https://www.loc.gov/photos/?q=${encodeURIComponent(q)}&fo=json&c=${Math.min(50, n)}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('loc');
    const j = await r.json();
    return (j.results || []).map((x, i) => {
      const img = Array.isArray(x.image_url) ? x.image_url[0] : x.image_url;
      if (!img) return null;
      const thumb = img.replace(/\/\d+\.(jpe?g|png|gif)$/i, '/480.$1');
      return {
        id: 'loc-' + (x.id || i), title: clean(Array.isArray(x.title) ? x.title[0] : x.title) || 'Library of Congress',
        url: img, thumbnail: thumb, thumb, width: 0, height: 0, mime: 'image/jpeg',
        source: 'loc', source_label: 'LOC', license: 'public-domain', creator: 'Library of Congress',
        pageUrl: x.id ? `https://www.loc.gov/item/${x.id}/` : img, page_url: x.id ? `https://www.loc.gov/item/${x.id}/` : img,
      };
    }).filter(Boolean).filter((x) => IMG_EXT.includes(extOf(x.url)));
  },
  async openverse(q, n) {
    const token = process.env.OPENVERSE_TOKEN || '';
    if (!token) throw new Error('openverse:token-missing');
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${Math.min(100, n)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) throw new Error('openverse ' + r.status);
    const j = await r.json();
    return (j.results || []).map((x) => ({
      id: 'ov-' + (x.id || x.url), title: clean(x.title) || q, url: x.url,
      thumbnail: x.thumbnail || x.url, thumb: x.thumbnail || x.url,
      width: x.width || 0, height: x.height || 0, mime: 'image/jpeg',
      source: 'openverse', source_label: 'Openverse', license: String(x.license || '').toLowerCase(),
      creator: clean(x.creator), pageUrl: x.foreign_landing_url || x.url, page_url: x.foreign_landing_url || x.url,
    }));
  },
};

const dedupe = (items) => {
  const seen = new Set();
  return items.filter((x) => {
    const k = (x.url || '').replace(/^https?:\/\//, '').replace(/[?#].*$/, '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
};

export default endpoint(async (req, res) => {
  if (!rateLimit(req, res, { max: 60, windowMs: 60_000, key: 'miswar-search' })) return;

  const body = req.method === 'POST' ? await readBody(req, 16 * 1024) : {};
  const params = { ...(req.query || {}), ...(body || {}) };
  const q = String(params.q || params.query || '').trim().slice(0, 120);
  if (!q) return json(res, 400, { error: 'Query required (field: q)', images: [], items: [], pages: [] });

  const limit = Math.min(160, Math.max(8, parseInt(params.limit, 10) || 60));
  const minWidth = parseInt(params.minWidth, 10) || 0;
  const offset = parseInt(params.cursors?.wikimedia ?? params.offset, 10) || 0;
  const wanted = String(params.engines && params.engines !== 'all' ? params.engines : 'wikimedia,artic,nasa,loc,openverse')
    .split(',').map((s) => s.trim()).filter((s) => S[s]);
  const t0 = Date.now();

  const results = await Promise.all(wanted.map(async (k) => {
    try { return { k, items: await S[k](q, limit, offset, minWidth) }; }
    catch (e) { return { k, items: [], error: e.message }; }
  }));

  const images = dedupe(results.flatMap((r) => r.items)).slice(0, limit);
  const pages = results.map((r) => ({ source: r.k, ok: !r.error, count: r.items.length, error: r.error || null, page: r.k }));

  return json(res, 200, {
    query: q, q, count: images.length,
    images, items: images, results: images, pages,
    took_ms: Date.now() - t0,
    engine: 'Miswar · AbuNawaf Enhance 3.0',
  });
}, { name: 'miswar-search', methods: ['GET', 'POST'] });
