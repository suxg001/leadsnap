// Shared helpers for LeadSnap Vercel functions. Zero dependencies.
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
module.exports = { rateLimited, send, isPrivateHost, parseHtml, PAY };
