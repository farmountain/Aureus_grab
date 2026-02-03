const { generateKeyPairSync, createSign, createVerify } = require('crypto');

function canonicalize(obj){
  if(typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => `"${k}":${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

function loadKeysFromEnv(){
  const priv = process.env.SIGNER_PRIVATE_KEY_BASE64 || null;
  const pub = process.env.SIGNER_PUBLIC_KEY_BASE64 || null;
  if(priv && pub){
    return {privateKey: Buffer.from(priv,'base64'), publicKey: Buffer.from(pub,'base64')};
  }
  return null;
}

function generateKeypair(){
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' })
  };
}

function signApproval(approvalObj, privateKeyDer){
  const signer = createSign('SHA512');
  const payload = canonicalize(approvalObj);
  signer.update(payload);
  signer.end();
  const sig = signer.sign({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  return sig.toString('base64');
}

function verifyApproval(approvalObj, signatureBase64, publicKeyDer){
  const verifier = createVerify('SHA512');
  const payload = canonicalize(approvalObj);
  verifier.update(payload);
  verifier.end();
  return verifier.verify({ key: publicKeyDer, format: 'der', type: 'spki' }, Buffer.from(signatureBase64,'base64'));
}

function verifyApprovalStrict(approvalObj, signatureBase64, publicKeyDer, opts){
  // opts: { now: Date, allowClockSkewSec: number }
  const ok = verifyApproval(approvalObj, signatureBase64, publicKeyDer);
  if(!ok) return { ok: false, reason: 'invalid_signature' };

  const now = opts && opts.now ? opts.now : new Date();
  const skew = opts && opts.allowClockSkewSec ? opts.allowClockSkewSec : 30;
  if(approvalObj.expiresAt){
    const exp = new Date(approvalObj.expiresAt);
    if(now.getTime() - (skew*1000) > exp.getTime()) return { ok: false, reason: 'expired' };
  }
  if(approvalObj.issuedAt){
    const issued = new Date(approvalObj.issuedAt);
    if(issued.getTime() - (skew*1000) > now.getTime()) return { ok: false, reason: 'issued_in_future' };
  }

  // humanApproved flag (if present) should be truthy for high-risk plans - caller enforces specifics
  return { ok: true };
}

module.exports = { canonicalize, loadKeysFromEnv, generateKeypair, signApproval, verifyApproval, verifyApprovalStrict };
