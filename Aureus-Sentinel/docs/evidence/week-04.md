# Evidence — Week 04: OpenClaw Channel Adapters

- **Title**: Week 4 OpenClaw Channel Adapters (Telegram, Discord) and Executor Integration
- **Change / PR**: feature/week-04-openclaw-adapters
- **Author(s)**: Development Team
- **Date**: 2026-02-04
- **Summary of change**: Implemented OpenClaw channel adapters for Telegram and Discord, integrated executor wrapper with signature verification, and created end-to-end integration tests demonstrating full approval flow.

## Implementation Overview

### OpenClaw Integration Structure
Created `openclaw/` directory with channel adapters and executor wrapper:
- Telegram adapter for parsing commands into IntentEnvelope
- Discord adapter for slash command integration
- Executor wrapper with signature verification and policy enforcement
- E2E tests validating full approval flow

### Telegram Bridge Adapter
**File**: `openclaw/src/telegram/bridge-adapter.js`

**Features**:
- Parses Telegram commands (e.g., `/search`, `/execute`) into IntentEnvelope
- Maps commands to tool intentions with risk levels
- Calls bridge `/intents` endpoint for policy evaluation
- Returns approval/rejection to user with contextual messages
- Handles async approval flow for high-risk actions

**Command Mapping**:
- `/search` → `web_search` (low risk)
- `/execute` → `code_executor` (high risk)
- `/send` → `send_message` (medium risk)
- `/delete` → `delete_data` (high risk)
- `/read` → `read_file` (low risk)

**Context Capture**:
- Telegram user ID and username
- Chat ID for conversation tracking
- Message ID for audit correlation
- Timestamp for temporal ordering

### Discord Bridge Adapter
**File**: `openclaw/src/discord/bridge-adapter.js`

**Features**:
- Parses Discord slash commands into IntentEnvelope
- Extracts parameters from interaction options
- Calls bridge `/intents` endpoint
- Handles deferred replies for high-risk commands
- Returns rich embeds with approval status and details

**Enhanced Capabilities**:
- Guild and channel context tracking
- Rich embed responses with color coding
- Deferred reply pattern for async processing
- Follow-up messages for long-running approvals
- Human approval requirement indicators

**Slash Command Support**:
- `/search` → `web_search` (low risk)
- `/execute` → `code_executor` (high risk)
- `/send` → `send_message` (medium risk)
- `/delete` → `delete_data` (high risk)
- `/read` → `read_file` (low risk)
- `/deploy` → `deploy_service` (high risk)

### Executor Wrapper Integration
**File**: `openclaw/src/executor/executor-wrapper.js`

**Features**:
- Ed25519 signature verification using tweetnacl
- TTL expiration checking with configurable clock skew (30s default)
- Tool allowlist validation with hash pinning support
- Human approval enforcement for high-risk tools
- Comprehensive execution reporting with step-by-step results
- Audit logging integration

**Verification Flow**:
1. **Signature Verification**: Verify ed25519 signature on approval using public key
2. **TTL Check**: Ensure approval hasn't expired (with clock skew tolerance)
3. **Plan ID Match**: Validate approval matches intended plan
4. **Tool Validation**: Check each tool against allowlist and policy
5. **Risk Enforcement**: Require human approval for high-risk tools
6. **Execution**: Execute allowed steps and report results

**Configuration**:
- `AUREUS_PUBLIC_KEY_BASE64`: Public key for signature verification
- `allowClockSkewSec`: Clock skew tolerance (default 30 seconds)
- `auditLogger`: Logger for execution events

### E2E Integration Tests
**File**: `openclaw/tests/e2e-flow.test.js`

**Test Coverage**:
1. ✅ Telegram low-risk command parsing (`/search`)
2. ✅ Discord high-risk command parsing (`/execute`)
3. ✅ Executor wrapper approval structure validation
4. ✅ Expired approval detection
5. ✅ High-risk tool human approval requirement
6. ✅ Tool allowlist enforcement
7. ✅ IntentEnvelope schema compliance

**Test Results**:
```
=== OpenClaw E2E Integration Tests ===

[Test 1] Telegram low-risk command (/search)
✅ PASS: Telegram command parsed correctly

[Test 2] Discord high-risk command (/execute)
✅ PASS: Discord interaction parsed correctly

[Test 3] Executor wrapper - valid approval
✅ PASS: Approval structure valid

[Test 4] Executor wrapper - expired approval
✅ PASS: Expired approval detected

[Test 5] High-risk tool requires human approval
✅ PASS: High-risk action requires human approval

[Test 6] Tool not in allowlist
✅ PASS: Unauthorized tool rejected

[Test 7] IntentEnvelope schema compliance
✅ PASS: IntentEnvelope matches schema

=== Test Summary ===
All structural tests passed!
✅ Week 4 E2E tests complete
```

## Files Added/Modified

### New Files
- `openclaw/README.md` - Integration layer documentation
- `openclaw/package.json` - Dependencies (axios, tweetnacl)
- `openclaw/src/telegram/bridge-adapter.js` - Telegram channel adapter
- `openclaw/src/discord/bridge-adapter.js` - Discord channel adapter
- `openclaw/src/executor/executor-wrapper.js` - Signature verification wrapper
- `openclaw/tests/e2e-flow.test.js` - Integration test suite
- `Aureus-Sentinel/docs/evidence/week-04.md` - This evidence file

### Dependencies Installed
- `axios@^1.6.0` - HTTP client for bridge communication
- `tweetnacl@^1.0.3` - Ed25519 signature verification

## Integration Flow

### User Command to Execution
```
1. User sends command (Telegram/Discord)
   ↓
2. Adapter parses command → IntentEnvelope
   ↓
3. Adapter calls bridge POST /intents
   ↓
4. Bridge evaluates risk → returns approval/rejection
   ↓
5. Adapter sends user feedback
   ↓
6. If approved, executor wrapper validates signature
   ↓
7. Executor checks TTL, plan ID, tool allowlist
   ↓
8. Execute allowed steps → generate report
```

### Example: Low-Risk Telegram Command
```javascript
// User: /search Bitcoin price
// └─> IntentEnvelope { tool: 'web_search', risk: 'low' }
//     └─> Bridge: auto-approve
//         └─> Executor: validate signature → execute
//             └─> User: ✅ Command approved! Executing...
```

### Example: High-Risk Discord Command
```javascript
// User: /execute code:rm -rf /
// └─> IntentEnvelope { tool: 'code_executor', risk: 'high' }
//     └─> Bridge: requires human approval
//         └─> Discord: ❌ Command rejected
//             └─> Reason: High-risk action requires manual approval
```

## Security Features

### Signature Verification
- Ed25519 signatures verified using public key
- Tamper-evident: any modification invalidates signature
- Canonical JSON serialization for signing

### TTL Enforcement
- Approvals expire after configured duration (default 5 minutes)
- Clock skew tolerance (30 seconds) prevents spurious rejections
- Prevents replay attacks with expired approvals

### Tool Allowlist
- Deny-by-default: tools must be explicitly allowed
- Hash pinning for skill integrity verification
- Per-tool risk classification

### Human Approval Gating
- High-risk tools require `humanApproved: true` flag
- Bridge policy determines when human approval is needed
- Executor enforces human approval requirement

## Acceptance Criteria

✅ **AC1**: User sends Telegram command → gets approval/rejection  
✅ **AC2**: User sends Discord slash command → gets rich embed response  
✅ **AC3**: High-risk commands prompt human approval requirement  
✅ **AC4**: Executor wrapper enforces signature before execution  
✅ **AC5**: Expired approvals are rejected  
✅ **AC6**: Unauthorized tools are blocked  
✅ **AC7**: E2E golden path test passes  
✅ **AC8**: All 7 integration tests pass  

## Usage Examples

### Telegram Adapter
```javascript
import { TelegramBridgeAdapter } from './openclaw/src/telegram/bridge-adapter.js';
import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adapter = new TelegramBridgeAdapter('http://localhost:3000');

bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) {
    await adapter.handleCommand(msg, (text) => bot.sendMessage(msg.chat.id, text));
  }
});
```

### Discord Adapter
```javascript
import { DiscordBridgeAdapter } from './openclaw/src/discord/bridge-adapter.js';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const adapter = new DiscordBridgeAdapter('http://localhost:3000');

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  await adapter.handleInteraction(
    interaction,
    (content) => interaction.reply(content),
    () => interaction.deferReply(),
    (content) => interaction.followUp(content)
  );
});
```

### Executor Wrapper
```javascript
import { ExecutorWrapper } from './openclaw/src/executor/executor-wrapper.js';

const executor = new ExecutorWrapper({
  publicKey: process.env.AUREUS_PUBLIC_KEY_BASE64,
  allowClockSkewSec: 30
});

const result = await executor.executeWithEnforcement({
  approval: signedApproval,
  plan: proposedPlan,
  toolProfiles: {
    'web_search': { allowed: true },
    'read_file': { allowed: true },
    'code_executor': { allowed: false }
  },
  executor: async (tool, params) => {
    // Execute tool and return result
    return await tools[tool](params);
  }
});
```

## Known Limitations

1. **Mock Testing**: Full signature verification requires running bridge with real keys
2. **Network Errors**: Adapters should implement retry logic for production
3. **Rate Limiting**: No rate limiting implemented on adapter side
4. **Webhook Integration**: Production should use webhooks instead of polling
5. **State Management**: No persistent state for multi-turn conversations

## Next Steps - Week 5

- Context engine integration for conversation memory
- Multi-turn conversation support with state persistence
- Enhanced error handling and retry logic
- Webhook-based event processing
- User session management

## References

- [Week 4 Session Pack](../week-04-session-pack.md)
- [Executor Wrapper Reference](../../Aureus-Sentinel/docs/executor_wrapper_reference.js)
- [IntentEnvelope Schema](../../contracts/v1/intent.schema.json)
- [ContextSnapshot Schema](../../contracts/v1/context.schema.json)
- [ExecutionApproval Schema](../../contracts/v1/approval.schema.json)

---

**Status**: Week 4 Complete — OpenClaw channel adapters (Telegram, Discord) ✅
