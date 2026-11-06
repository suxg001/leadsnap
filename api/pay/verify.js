const { send, PAY } = require('../_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'method not allowed' });
  const tx = String((req.body || {}).txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return send(res, 400, { success: false, error: 'invalid txHash' });
  try {
    const r = await fetch(PAY.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx] }) });
    const j = await r.json();
    const receipt = j.result;
    if (!receipt) return send(res, 200, { success: false, error: 'tx not found on Base yet (wait for confirmation)' });
    if (receipt.status !== '0x1') return send(res, 200, { success: false, error: 'tx failed on-chain' });
    const toPadded = '0x000000000000000000000000' + PAY.wallet.slice(2).toLowerCase();
    const ok = (receipt.logs || []).some(l =>
      l.address?.toLowerCase() === PAY.usdcBase && l.topics?.[0] === PAY.transferTopic
      && l.topics?.[2]?.toLowerCase() === toPadded
      && BigInt(l.data) >= BigInt(PAY.amount_usdc * 1000000));
    if (!ok) return send(res, 200, { success: false, error: 'no matching USDC transfer to this wallet on Base' });
    return send(res, 200, { success: true, data: { paid: true, credits: PAY.credits, txHash: tx } });
  } catch (e) { return send(res, 502, { success: false, error: `verify failed: ${e.message}` }); }
};
