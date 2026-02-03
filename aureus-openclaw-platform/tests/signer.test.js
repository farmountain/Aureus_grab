const assert = require('assert');
const { generateKeypair, signApproval, verifyApproval } = require('../bridge/signer');

function makeApproval(){
  const now = new Date();
  const expires = new Date(now.getTime()+60*1000).toISOString();
  return {
    version: '1.0',
    type: 'ExecutionApproval',
    approvalId: 'appr-1',
    planId: 'plan-1',
    issuedAt: now.toISOString(),
    expiresAt: expires
  };
}

// Test: valid signature
(() => {
  const { publicKey, privateKey } = generateKeypair();
  const approval = makeApproval();
  const sig = signApproval(approval, privateKey);
  const ok = verifyApproval(approval, sig, publicKey);
  assert.strictEqual(ok, true, 'valid signature should verify');
  console.log('OK: valid signature verified');
})();

// Test: invalid signature (tampered payload)
(() => {
  const { publicKey, privateKey } = generateKeypair();
  const approval = makeApproval();
  const sig = signApproval(approval, privateKey);
  approval.planId = 'plan-2';
  const ok = verifyApproval(approval, sig, publicKey);
  assert.strictEqual(ok, false, 'tampered payload should fail');
  console.log('OK: tampered payload detected');
})();

// Test: expired TTL (signature still valid but expiry logic should catch it in verifier caller)
(() => {
  const { publicKey, privateKey } = generateKeypair();
  const approval = makeApproval();
  approval.expiresAt = new Date(Date.now()-60*1000).toISOString();
  const sig = signApproval(approval, privateKey);
  const ok = verifyApproval(approval, sig, publicKey);
  assert.strictEqual(ok, true, 'signature remains valid even if expired');
  console.log('OK: signature remains valid for expired approval (expiry must be checked by caller)');
})();

console.log('All signer tests passed.');
