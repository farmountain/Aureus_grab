const http = require('http');
const { signApproval, generateKeypair, canonicalize } = require('./signer');
const { validateIntent } = require('./schema_validator');
const { processIntent } = require('./aureus_stub');
const { getEventStore } = require('./event_store');
const { getAuditLogger } = require('./audit_logger');

const PORT = process.env.PORT || 3001;
const eventStore = getEventStore();
const auditLogger = getAuditLogger();

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
  // POST /intents - Receive intent, generate plan, issue approval
  if(req.method === 'POST' && req.url === '/intents'){
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', async () => {
      try{
        const intentEnvelope = JSON.parse(data);
        
        // Log intent received (event store)
        eventStore.logIntentReceived(intentEnvelope, {
          source: 'bridge',
          clientIp: req.socket.remoteAddress
        });

        // Log to tamper-evident audit chain
        auditLogger.logIntentReceived(intentEnvelope, {
          clientIp: req.socket.remoteAddress,
          userAgent: req.headers['user-agent']
        });

        // Validate intent against schema
        const validation = validateIntent(intentEnvelope);
        if (!validation.valid) {
          jsonResponse(res, 400, {
            error: 'Invalid intent schema',
            details: validation.errors
          });
          return;
        }

        // Process intent through Aureus stub
        const keys = ensureKeys();
        const result = await processIntent(intentEnvelope, keys);

        // Log plan generation
        eventStore.logPlanGenerated(result.plan, intentEnvelope.intentId);
        auditLogger.logPlanGenerated(result.plan, { intentId: intentEnvelope.intentId });

        // If human approval required
        if (result.requiresHumanApproval) {
          eventStore.logApprovalDenied(result.plan.planId, result.reason);
          auditLogger.logApprovalDenied(result.plan.planId, result.reason, {
            riskLevel: result.plan.riskAssessment.overallRiskLevel
          });
          jsonResponse(res, 202, {
            plan: result.plan,
            requiresHumanApproval: true,
            reason: result.reason,
            message: 'Plan requires human approval'
          });
          return;
        }

        // Sign the approval
        const sig = signApproval(result.approval, keys.privateKey);
        result.approval.signature = sig;

        // Log approval issued
        eventStore.logApprovalIssued(result.approval, result.plan.planId);
        auditLogger.logApprovalIssued(result.approval, {
          planId: result.plan.planId,
          intentId: intentEnvelope.intentId
        });

        // Return plan and signed approval
        jsonResponse(res, 200, {
          plan: result.plan,
          approval: result.approval
        });

      }catch(e){
        console.error('Error processing intent:', e);
        jsonResponse(res, 500, { error: e.message });
      }
    });
    return;
  }

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
  ensureKeys(); // Generate keys and emit public key before starting server
  server.listen(PORT, () => console.log(`Bridge signer listening on ${PORT}`));
}

module.exports = server;
