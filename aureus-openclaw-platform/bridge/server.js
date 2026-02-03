const http = require('http');
const { signApproval, generateKeypair, canonicalize } = require('./signer');

const PORT = process.env.PORT || 3001;

function jsonResponse(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

let runtimeKeys = null;

function ensureKeys(){
  if(runtimeKeys) return runtimeKeys;
  if(process.env.SIGNER_PRIVATE_KEY_DER && process.env.SIGNER_PUBLIC_KEY_DER){
    runtimeKeys = {
      privateKey: Buffer.from(process.env.SIGNER_PRIVATE_KEY_DER,'base64'),
      publicKey: Buffer.from(process.env.SIGNER_PUBLIC_KEY_DER,'base64')
    };
    return runtimeKeys;
  }
  const kp = generateKeypair();
  runtimeKeys = { privateKey: kp.privateKey, publicKey: kp.publicKey };
  // emit public key for integration tests / consumers
  console.log('PUBLIC_KEY_BASE64:' + runtimeKeys.publicKey.toString('base64'));
  return runtimeKeys;
}

const server = http.createServer((req, res) => {
  if(req.method === 'POST' && req.url === '/sign'){
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try{
          const obj = JSON.parse(data);
          // Expect approval object without signature
          const keys = ensureKeys();
          // If configured to use KMS, route to adapter
          if(process.env.USE_KMS === 'true' && process.env.KMS_KEY_ID){
            // dynamic require to avoid hard dependency
            const { signWithKms } = require('./kms/aws_kms_adapter');
            signWithKms({ keyId: process.env.KMS_KEY_ID, payload: canonicalize(obj), region: process.env.AWS_REGION || 'us-east-1' })
              .then(sig => {
                const out = Object.assign({}, obj, { signature: sig });
                jsonResponse(res, 200, out);
              })
              .catch(err => jsonResponse(res, 500, { error: err.message }));
            return;
          }

          const sig = signApproval(obj, keys.privateKey);
          const out = Object.assign({}, obj, { signature: sig });
          jsonResponse(res, 200, out);
        }catch(e){
          jsonResponse(res, 400, { error: e.message });
        }
    });
    return;
  }

  if(req.method === 'GET' && req.url === '/health'){
    jsonResponse(res, 200, { status: 'ok' });
    return;
  }

  jsonResponse(res, 404, { error: 'not found' });
});

if(require.main === module){
  server.listen(PORT, () => console.log(`Bridge signer listening on ${PORT}`));
}

module.exports = server;
