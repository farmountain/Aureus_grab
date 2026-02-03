const assert = require('assert');
const { verifyAndEnforce } = require('../docs/executor_wrapper_reference');
const { generateKeypair, signApproval } = require('../bridge/signer');

(async ()=>{
  try{
    // Generate keypair and configure public key for verifier
    const kp = generateKeypair();
    process.env.AUREUS_PUBLIC_KEY_DER = kp.publicKey.toString('base64');

    // Case 1: low-risk step allowed without human approval
    const approval1 = { version: '1.0', type: 'ExecutionApproval', approvalId: 'a-low', planId: 'p-low', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+60000).toISOString() };
    const sig1 = signApproval(approval1, kp.privateKey);
    approval1.signature = sig1;
    const planLow = { version: '1.0', type: 'ProposedActionPlan', planId: 'p-low', steps: [ { tool: 'diag', risk: 'low', skillHash: 'h1' } ] };
    const res1 = await verifyAndEnforce({ approval: approval1, proposedPlan: planLow, toolProfiles: { diag: { allowed: true } } });
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.report.status, 'success');
    console.log('OK: low-risk allowed without human approval');

    // Case 2: high-risk step rejected without human approval
    const approval2 = { version: '1.0', type: 'ExecutionApproval', approvalId: 'a-high', planId: 'p-high', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+60000).toISOString() };
    const sig2 = signApproval(approval2, kp.privateKey);
    approval2.signature = sig2;
    const planHigh = { version: '1.0', type: 'ProposedActionPlan', planId: 'p-high', steps: [ { tool: 'deploy', risk: 'high', skillHash: 'h2' } ] };
    const res2 = await verifyAndEnforce({ approval: approval2, proposedPlan: planHigh, toolProfiles: { deploy: { allowed: true } } });
    assert.strictEqual(res2.ok, true);
    const stepResult = res2.report.details.steps[0];
    assert.strictEqual(stepResult.status, 'rejected');
    assert.strictEqual(stepResult.reason, 'human_approval_required');
    console.log('OK: high-risk rejected without human approval');

    // Case 3: expired approval throws
    const approval3 = { version: '1.0', type: 'ExecutionApproval', approvalId: 'a-exp', planId: 'p-exp', issuedAt: new Date(Date.now()-120000).toISOString(), expiresAt: new Date(Date.now()-60000).toISOString() };
    const sig3 = signApproval(approval3, kp.privateKey);
    approval3.signature = sig3;
    const planExp = { version: '1.0', type: 'ProposedActionPlan', planId: 'p-exp', steps: [ { tool: 'diag', risk: 'low', skillHash: 'h3' } ] };
    let threw = false;
    try{ await verifyAndEnforce({ approval: approval3, proposedPlan: planExp, toolProfiles: { diag: { allowed: true } } }); }catch(e){ threw = true }
    assert.strictEqual(threw, true);
    console.log('OK: expired approval rejected');

    console.log('All executor wrapper tests passed.');
    process.exit(0);
  }catch(e){
    console.error('executor wrapper tests failed', e);
    process.exit(1);
  }
})();
