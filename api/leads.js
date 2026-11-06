const { rateLimited, send } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'method not allowed' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (rateLimited(ip)) return send(res, 429, { success: false, error: 'rate limited, 60/min' });
  const input = req.body || {};
  const keyword = String(input.keyword || '').trim();
  const city = String(input.city || '').trim();
  const limit = Math.min(Math.max(parseInt(input.limit) || 5, 1), 10);
  if (!keyword || !city) return send(res, 400, { success: false, error: 'keyword and city required' });
  try {
    const q = encodeURIComponent(`${keyword} ${city}`);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=${limit}&addressdetails=1`, {
      headers: { 'User-Agent': 'LeadSnap/0.1 (1000-websites goal)' }
    });
    if (!r.ok) return send(res, 502, { success: false, error: `nominatim ${r.status}` });
    const rows = await r.json();
    const leads = rows.map(x => ({
      name: x.display_name?.split(',')[0] || x.name || '',
      address: x.display_name || '', lat: x.lat, lon: x.lon,
      type: x.type || '', category: x.category || '', source: 'OpenStreetMap Nominatim'
    }));
    return send(res, 200, { success: true, data: { keyword, city, count: leads.length, leads }, meta: { source: 'OSM, not Google Maps scraping' } });
  } catch (e) { return send(res, 502, { success: false, error: `leads failed: ${e.message}` }); }
};
