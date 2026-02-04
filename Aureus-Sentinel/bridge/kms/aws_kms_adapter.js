// AWS KMS signing adapter (skeleton)
// Usage: sign a canonicalized payload using AWS KMS Sign API with an asymmetric ed25519 key.
// Note: Add `@aws-sdk/client-kms` to your package.json when integrating for real.

/* eslint-disable no-console */

async function signWithKms({ keyId, payload, region }){
  // payload: Buffer or string
  // keyId: KMS Key ARN or alias
  // This function returns signature as base64 string.

  // Minimal runtime check to avoid hard dependency in this repo.
  let KMSClient, SignCommand;
  try{
    ({ KMSClient, SignCommand } = require('@aws-sdk/client-kms'));
  }catch(e){
    throw new Error('Missing dependency: @aws-sdk/client-kms. Install it to enable KMS signing.');
  }

  const client = new KMSClient({ region });

  const msg = (typeof payload === 'string') ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  // For ed25519 keys, KMS expects the message and the SigningAlgorithm e.g. 'ED25519'
  const command = new SignCommand({ KeyId: keyId, Message: msg, MessageType: 'RAW', SigningAlgorithm: 'ED25519' });
  const res = await client.send(command);
  if(!res.Signature) throw new Error('KMS did not return a signature');
  return Buffer.from(res.Signature).toString('base64');
}

module.exports = { signWithKms };
