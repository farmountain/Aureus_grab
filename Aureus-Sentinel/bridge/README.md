# Bridge — Gateway Adapter

This bridge mediates between OpenClaw and Aureus. Responsibilities:
- Validate incoming `IntentEnvelope` and `ContextSnapshot`.
- Forward requests to the Aureus decision API.
- Relay signed `ExecutionApproval` back to OpenClaw.
- Persist events for replay and audit.

Development:
- Start with a minimal PoC (see `knowledgebase/Aureus-Sentinel/bridge/README.md`).
- Add signer/verifier client and schema tests as next tasks.

KMS Integration:
- The bridge can optionally use AWS KMS to perform signing instead of local private key material.
- Configure the following environment variables for KMS signing:
	- `USE_KMS=true`
	- `KMS_KEY_ID=<KMS Key ARN or alias>`
	- `AWS_REGION` (optional, defaults to `us-east-1`)
- In dev, the bridge will generate an ephemeral keypair if no env keys are provided; production must use KMS or a secret store.
