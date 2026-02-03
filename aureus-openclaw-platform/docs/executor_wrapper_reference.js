// Reference implementation (Node.js) for Executor Wrapper enforcement
const { verifyApprovalStrict } = require('../bridge/signer');

async function verifyAndEnforce({ approval, proposedPlan, toolProfiles, now }){
  const pub = process.env.AUREUS_PUBLIC_KEY_DER ? Buffer.from(process.env.AUREUS_PUBLIC_KEY_DER,'base64') : null;
  if(!pub) throw new Error('Aureus public key not configured');

  const v = verifyApprovalStrict(approval, approval.signature, pub, { now: now || new Date(), allowClockSkewSec: 30 });
  if(!v.ok) throw new Error(`approval verification failed: ${v.reason}`);

  if(approval.planId !== proposedPlan.planId) throw new Error('planId mismatch');

  const results = [];
  for(const step of proposedPlan.steps||[]){
    const profile = (toolProfiles && toolProfiles[step.tool]) || { allowed: false };
    if(!profile.allowed){
      results.push({ step, status: 'rejected', reason: 'tool_not_allowed' });
      continue;
    }
    if(profile.hashPin && profile.hashPin !== step.skillHash){
      results.push({ step, status: 'rejected', reason: 'hash_mismatch' });
      continue;
    }
    if(step.risk === 'high' && !approval.humanApproved){
      results.push({ step, status: 'rejected', reason: 'human_approval_required' });
      continue;
    }
    // Execution should be performed by executor; here we mark as allowed
    results.push({ step, status: 'allowed' });
  }

  const report = { version: '1.0', type: 'ExecutionReport', reportId: `r-${Date.now()}`, approvalId: approval.approvalId, status: 'partial', details: { steps: results } };
  // Determine overall status
  if(results.every(r=>r.status==='allowed')) report.status = 'success';
  if(results.some(r=>r.status==='rejected')) report.status = 'partial';

  return { ok: true, report };
}

module.exports = { verifyAndEnforce };
