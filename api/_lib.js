// Shared helpers for LeadSnap Vercel functions. Zero dependencies.
// Quota: free 5 extracts/day + 20 leads/day per IP; paid credits (1 USDC = 100)
// are stored in Vercel KV (Upstash REST). Without KV env vars, limits fall back
// to in-memory counters (best-effort only: they do not survive across instances).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 60;
}
function send(res, code, obj) {
  res.status(code).json(obj);
}
function isPrivateHost(host) {
  const h = String(host).toLowerCase();
  return h === 'localhost' || h.endsWith('.local') || h === '[::1]'
    || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) || h === '0.0.0.0';
}
function parseHtml(html, baseUrl) {
  const text = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const pick = re => { const m = html.match(re); return m ? text(m[1]).slice(0, 300) : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => text(m[1])).slice(0, 5);
  const emails = [...new Set(html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])].slice(0, 10);
  const phones = [...new Set(html.match(/(\+?\d[\d\s\-()]{7,}\d)/g) || [])].slice(0, 10);
  const links = [...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]))]
    .filter(u => /^https?:\/\//.test(u)).slice(0, 20);
  return { title, description: desc, h1, emails, phones, links, url: baseUrl };
}
const PAY = {
  wallet: '0x84327ed4e013e8d0521b0f73431b66436b34e790', // user's OKX address
  chain: 'Base', token: 'USDC', amount_usdc: 1, credits: 100,
  usdcBase: '0x833589fcd6edb6e08f4c7c32d4f71b54bd029029',
  transferTopic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  rpc: 'https://mainnet.base.org',
};
const FREE_LIMIT = { extract: 5, leads: 20 };

// ---- Vercel KV (Upstash REST) ----
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';
async function kv(path) {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(KV_URL + path, { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  const j = await r.json().catch(() => null);
  return j && j.result !== undefined ? j.result : null;
}
// Returns { allowed: true } or { allowed: false, reason }.
// Charges 1 free unit per day first, then 1 paid credit if the free quota is used up.
async function checkQuota(ip, kind) {
  const limit = FREE_LIMIT[kind];
  const day = new Date().toISOString().slice(0, 10);
  const qkey = `q:${kind}:${ip}:${day}`;
  if (KV_URL && KV_TOKEN) {
    const used = await kv(`/incr/${encodeURIComponent(qkey)}`);
    if (used === 1) await kv(`/expire/${encodeURIComponent(qkey)}/86400`);
    if (used !== null && used <= limit) return { allowed: true, freeLeft: limit - used };
    // Free quota used up: try one paid credit.
    const credits = await kv(`/get/${encodeURIComponent('credits:' + ip)}`);
    if (credits !== null && parseInt(credits) > 0) {
      await kv(`/decr/${encodeURIComponent('credits:' + ip)}`);
      return { allowed: true, creditsLeft: parseInt(credits) - 1 };
    }
    return { allowed: false, reason: `free limit reached (${limit}/${kind} per day). Pay 1 USDC on Base for 100 credits, then submit the tx hash to /api/pay/verify.` };
  }
  // No KV configured: in-memory fallback (per-instance only).
  const key = qkey;
  const used = (hits.get(key) || 0) + 1;
  hits.set(key, used);
  if (used <= limit) return { allowed: true, freeLeft: limit - used };
  return { allowed: false, reason: `free limit reached (${limit}/${kind} per day). Pay 1 USDC on Base for 100 credits, then submit the tx hash to /api/pay/verify.` };
}
async function grantCredits(ip, txHash, amount) {
  // One txHash credits only once.
  if (KV_URL && KV_TOKEN) {
    const first = await kv(`/set/${encodeURIComponent('tx:' + txHash)}/1/NX`);
    if (first !== 'OK') return { ok: false, reason: 'this txHash was already used' };
    const total = await kv(`/incrby/${encodeURIComponent('credits:' + ip)}/${amount}`);
    return { ok: true, credits: total };
  }
  const key = 'credits:' + ip;
  const total = (hits.get(key) || 0) + amount;
  hits.set(key, total);
  return { ok: true, credits: total };
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
}
module.exports = { rateLimited, send, isPrivateHost, parseHtml, PAY, FREE_LIMIT, checkQuota, grantCredits, clientIp };
