const { send, PAY } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: 'method not allowed' });
  return send(res, 200, { success: true, data: {
    wallet: PAY.wallet, chain: PAY.chain, token: PAY.token,
    amount_usdc: PAY.amount_usdc, credits: PAY.credits,
    note: 'Pay exactly 1 USDC on Base to this wallet, then submit the tx hash to /api/pay/verify. Verification only checks Base.'
  } });
};
