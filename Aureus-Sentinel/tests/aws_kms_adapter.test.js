// Placeholder integration test for AWS KMS adapter.
// This test will only run when AWS credentials and a KMS asymmetric ed25519 key are configured.

(async ()=>{
  try{
    const { signWithKms } = require('../bridge/kms/aws_kms_adapter');
    const keyId = process.env.TEST_KMS_KEY_ARN;
    if(!keyId){
      console.log('SKIP: TEST_KMS_KEY_ARN not set');
      process.exit(0);
    }
    const sig = await signWithKms({ keyId, payload: 'test-payload', region: process.env.AWS_REGION || 'us-east-1' });
    console.log('OK: KMS signature produced length=', sig.length);
    process.exit(0);
  }catch(e){
    console.error('KMS adapter test failed', e);
    process.exit(1);
  }
})();
