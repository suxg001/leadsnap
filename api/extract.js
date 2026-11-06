const { rateLimited, send, isPrivateHost, parseHtml, checkQuota, clientIp } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'method not allowed' });
  const ip = clientIp(req);
  if (rateLimited(ip)) return send(res, 429, { success: false, error: 'rate limited, 60/min' });
  const quota = await checkQuota(ip, 'extract');
  if (!quota.allowed) return send(res, 429, { success: false, error: quota.reason });
  const input = req.body || {};
  let target;
  try { target = new URL(input.url); } catch { return send(res, 400, { success: false, error: 'invalid url' }); }
  if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname))
    return send(res, 400, { success: false, error: 'url not allowed' });
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(target, { signal: ctl.signal, headers: { 'User-Agent': 'LeadSnap/0.1' }, redirect: 'follow' });
    if (!r.ok) return send(res, 502, { success: false, error: `upstream ${r.status}` });
    const html = (await r.text()).slice(0, 2000000);
    return send(res, 200, { success: true, data: parseHtml(html, target.href), meta: { bytes: html.length, quota } });
  } catch (e) { return send(res, 502, { success: false, error: `fetch failed: ${e.message}` }); }
};
