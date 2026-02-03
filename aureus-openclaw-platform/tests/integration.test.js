const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { verifyApproval } = require('../bridge/signer');

const serverPath = path.join(__dirname, '..', 'bridge', 'server.js');

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

(async ()=>{
  // Start server as child process
  const child = spawn(process.execPath, [serverPath], { env: Object.assign({}, process.env), stdio: ['ignore','pipe','pipe'] });
  let started = false;
  let publicKeyBase64 = null;
  child.stdout.on('data', d=>{
    const s = d.toString();
    process.stdout.write(s);
    if(s.includes('listening')) started = true;
    const m = s.match(/PUBLIC_KEY_BASE64:([A-Za-z0-9+/=]+)/);
    if(m) publicKeyBase64 = m[1];
  });
  child.stderr.on('data', d=> process.stderr.write(d.toString()));

  // Wait for server to start and public key
  for(let i=0;i<40;i++){
    if(started && publicKeyBase64) break;
    await wait(100);
  }

  if(!started || !publicKeyBase64){
    console.error('Server failed to start');
    child.kill();
    process.exit(1);
  }

  // Make a sign request
  const approval = {
    version: '1.0',
    type: 'ExecutionApproval',
    approvalId: 'int-1',
    planId: 'plan-1',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now()+60*1000).toISOString()
  };

  const req = http.request({ hostname: '127.0.0.1', port: 3001, path: '/sign', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
    let data='';
    res.on('data', c => data += c);
    res.on('end', ()=>{
      try{
        const obj = JSON.parse(data);
        assert(obj.signature, 'response must include signature');
        const pub = Buffer.from(publicKeyBase64,'base64');
        const ok = verifyApproval(Object.assign({}, obj, { signature: undefined }), obj.signature, pub);
        assert.strictEqual(ok, true, 'signature must verify');
        console.log('OK: integration sign+verify');
        child.kill();
        process.exit(0);
      }catch(e){
        console.error('Integration test failed:', e);
        child.kill();
        process.exit(1);
      }
    });
  });
  req.write(JSON.stringify(approval));
  req.end();
})();
