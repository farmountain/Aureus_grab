# Workflow Specification Generator - Visual Guide

## What You Get: A Complete Workflow Creation System

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW WIZARD UI                           │
│                                                                 │
│  Step 1: Describe Your Goal                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Goal: "Reconcile bank transactions with ledger"         │  │
│  │                                                          │  │
│  │ Constraints:  [< 5 minutes] [No external APIs]          │  │
│  │                                                          │  │
│  │ Tools: [database] [email] [slack]                       │  │
│  │                                                          │  │
│  │ Risk: ● Low  ◯ Medium  ◯ High  ◯ Critical               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│                    [Generate Workflow →]                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │   LLM Engine    │
                    │  (Mock/Real)    │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW WIZARD UI                           │
│                                                                 │
│  Step 2: Review Generated Specification                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ {                                                        │  │
│  │   "id": "workflow-1234567890",                          │  │
│  │   "name": "Reconcile Bank Transactions",                │  │
│  │   "tasks": [                                            │  │
│  │     {                                                   │  │
│  │       "id": "task-1",                                   │  │
│  │       "name": "Initialize and validate",               │  │
│  │       "type": "action",                                │  │
│  │       "riskTier": "HIGH",                              │  │
│  │       "toolName": "database",                          │  │
│  │       "retry": { "maxAttempts": 3 }                    │  │
│  │     },                                                  │  │
│  │     ...                                                 │  │
│  │   ]                                                     │  │
│  │ }                                                        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│          [← Previous]      [Validate Specification →]          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW WIZARD UI                           │
│                                                                 │
│  Step 3: Validation Results                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ✓ Validation Passed                                     │  │
│  │                                                          │  │
│  │ Your workflow specification is valid and ready!         │  │
│  │                                                          │  │
│  │ Workflow: Reconcile Bank Transactions                   │  │
│  │ Tasks: 3                                                 │  │
│  │ Risk Tiers: HIGH, MEDIUM, HIGH                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│          [← Previous]            [Download Spec ✓]             │
└─────────────────────────────────────────────────────────────────┘
```

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐          │
│  │   Step 1:     │→ │   Step 2:     │→ │   Step 3:      │          │
│  │ Goal Input    │  │ Spec Preview  │  │  Validation    │          │
│  └───────────────┘  └───────────────┘  └────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST
┌──────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                    │
│                                                                      │
│  POST /api/workflows/generate   POST /api/workflows/validate        │
│         ↓                                  ↓                         │
│  ┌──────────────┐                   ┌──────────────┐                │
│  │ Auth Check   │                   │ Auth Check   │                │
│  └──────────────┘                   └──────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                                    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────┐         │
│  │           WorkflowGenerator Class                      │         │
│  │                                                         │         │
│  │  1. Build Prompt                                       │         │
│  │  2. Call LLM (Mock/Real)                              │         │
│  │  3. Parse Response                                     │         │
│  │  4. Generate Tasks (3-6)                              │         │
│  │  5. Assign Risk Tiers                                 │         │
│  │  6. Create Dependencies                               │         │
│  │  7. Add Safety Policy                                 │         │
│  │  8. Log to Audit Trail                                │         │
│  └────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      VALIDATION LAYER                                │
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │            Zod Schema Validation                    │            │
│  │                                                      │            │
│  │  • WorkflowGenerationRequest → validate input      │            │
│  │  • TaskSpec → validate each task                   │            │
│  │  • WorkflowSpecJSON → validate full spec           │            │
│  │  • Return detailed errors if invalid                │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                       AUDIT LAYER                                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              Event Log                              │            │
│  │                                                      │            │
│  │  • LLM_PROMPT_GENERATED (timestamp, prompt)        │            │
│  │  • LLM_RESPONSE_RECEIVED (timestamp, response)     │            │
│  │  • Queryable by workflow-generator ID               │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Natural Language Input
        ↓
┌───────────────────┐
│ Zod Validation    │ ← validateGenerationRequest()
│ - Min length      │
│ - Type checking   │
│ - Enum validation │
└───────────────────┘
        ↓
┌───────────────────┐
│ Prompt Building   │ ← buildPrompt()
│ - Goal            │
│ - Constraints     │
│ - Tools           │
│ - Risk tolerance  │
└───────────────────┘
        ↓
┌───────────────────┐
│ LLM Call          │ ← mockLLMCall() / realLLMCall()
│ - Send prompt     │
│ - Receive JSON    │
│ - Log interaction │
└───────────────────┘
        ↓
┌───────────────────┐
│ Response Parsing  │ ← parseLLMResponse()
│ - Parse JSON      │
│ - Normalize tasks │
│ - Convert to Map  │
└───────────────────┘
        ↓
┌───────────────────┐
│ Task Generation   │ ← generateMockTasks()
│ - 3-6 tasks       │
│ - Risk tiers      │
│ - Tool assignment │
│ - Retry configs   │
└───────────────────┘
        ↓
┌───────────────────┐
│ Dependencies      │ ← generateMockDependencies()
│ - Sequential      │
│ - task-2 → task-1 │
│ - task-3 → task-2 │
└───────────────────┘
        ↓
┌───────────────────┐
│ Safety Policy     │ ← generated automatically
│ - Max retries     │
│ - Timeouts        │
│ - Fail-fast?      │
└───────────────────┘
        ↓
┌───────────────────┐
│ WorkflowSpec      │ ← Complete specification
│ - ID, Name        │
│ - Tasks[]         │
│ - Dependencies    │
│ - SafetyPolicy    │
└───────────────────┘
        ↓
Structured JSON Output
```

## Example Transformation

```
INPUT (Natural Language):
┌────────────────────────────────────────────────┐
│ "Reconcile bank transactions with internal    │
│  ledger entries and flag discrepancies for    │
│  review"                                       │
│                                                │
│ Constraints: "Complete within 5 minutes"      │
│ Tools: "database", "email"                    │
│ Risk: HIGH                                     │
└────────────────────────────────────────────────┘
                    ↓
            LLM Processing
                    ↓
OUTPUT (Structured Spec):
┌────────────────────────────────────────────────┐
│ {                                              │
│   "id": "workflow-1234567890",                │
│   "name": "Reconcile Bank Transactions...",   │
│   "tasks": [                                   │
│     {                                          │
│       "id": "task-1",                         │
│       "name": "Initialize and validate",      │
│       "type": "action",                       │
│       "riskTier": "HIGH",                     │
│       "toolName": "database",                 │
│       "retry": {                              │
│         "maxAttempts": 3,                     │
│         "backoffMs": 1000                     │
│       }                                        │
│     },                                         │
│     {                                          │
│       "id": "task-2",                         │
│       "name": "Process step 1",               │
│       "type": "action",                       │
│       "riskTier": "MEDIUM",                   │
│       "toolName": "email"                     │
│     },                                         │
│     {                                          │
│       "id": "task-3",                         │
│       "name": "Verify and cleanup",           │
│       "type": "decision",                     │
│       "riskTier": "HIGH",                     │
│       "toolName": "database"                  │
│     }                                          │
│   ],                                           │
│   "dependencies": {                            │
│     "task-2": ["task-1"],                     │
│     "task-3": ["task-2"]                      │
│   },                                           │
│   "safetyPolicy": {                            │
│     "name": "default-safety-policy",          │
│     "rules": [                                 │
│       { "type": "max_retries" },              │
│       { "type": "timeout_enforcement" }       │
│     ],                                         │
│     "failFast": false                         │
│   }                                            │
│ }                                              │
└────────────────────────────────────────────────┘
```

## UI Screenshots Description

### Step 1: Goal Input
- **Header**: Purple gradient with "🤖 Workflow Specification Generator"
- **Progress Bar**: Step 1 highlighted in purple, Steps 2-3 in gray
- **Form Fields**:
  - Large text area for goal (placeholder with example)
  - Chip input for constraints (add/remove tags)
  - Chip input for tools (add/remove tags)
  - Dropdown for risk tolerance (4 options)
  - Optional text area for additional context
- **Buttons**: "Previous" (disabled), "Generate Workflow →" (purple)
- **Theme**: Clean white background, purple accents, modern sans-serif

### Step 2: Spec Preview
- **Progress Bar**: Steps 1-2 green checkmarks, Step 2 purple active
- **Loading State**: Spinner with "Generating workflow specification..."
- **Preview State**:
  - Dark code editor theme (syntax highlighted JSON)
  - Edit button to enable in-place editing
  - Scrollable if spec is long
- **Buttons**: "← Previous", "Validate Specification →"

### Step 3: Validation Results
- **Success View** (green box):
  - Checkmark icon
  - "Validation Passed" heading
  - Workflow summary (name, task count, risk tiers)
  - Full spec in dark code view
  - "Download Spec" button
- **Error View** (red box):
  - X icon
  - "Validation Errors" heading
  - Bulleted list of errors with field paths
  - "← Previous" to go back and fix
- **Progress Bar**: All steps completed (green) or step 3 active

## File Organization

```
aureus-agentic-os/
├── packages/
│   └── kernel/
│       ├── src/
│       │   ├── types.ts                          [UPDATED]
│       │   └── workflow-spec-schema.ts           [NEW]
│       └── tests/
│           └── workflow-spec-schema.test.ts      [NEW]
│
├── apps/
│   └── console/
│       ├── src/
│       │   ├── api-server.ts                     [UPDATED]
│       │   ├── workflow-generator.ts             [NEW]
│       │   └── ui/
│       │       └── workflow-wizard.html          [NEW]
│       ├── tests/
│       │   └── workflow-generator.test.ts        [NEW]
│       ├── example-workflow-generator.ts         [NEW]
│       └── WORKFLOW_GENERATOR_README.md          [NEW]
│
├── WORKFLOW_GENERATOR_IMPLEMENTATION.md          [NEW]
├── DELIVERY_SUMMARY.md                           [NEW]
├── SECURITY_SUMMARY.md                           [NEW]
└── VISUAL_GUIDE.md                               [THIS FILE]
```

## Key Features Visualization

```
┌─────────────────────────────────────────────────────────┐
│                  KEY FEATURES                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔐 Security                                           │
│    ├─ Authentication Required                          │
│    ├─ Permission Checks (read)                         │
│    ├─ Audit Logging (all LLM interactions)            │
│    └─ Input Validation (Zod schemas)                   │
│                                                         │
│  ✅ Type Safety                                        │
│    ├─ Full TypeScript Coverage                         │
│    ├─ Zod Runtime Validation                           │
│    ├─ No Unsafe Type Casts                            │
│    └─ Helper Type Conversions                          │
│                                                         │
│  🎯 User Experience                                    │
│    ├─ 3-Step Wizard                                    │
│    ├─ Progress Indicators                              │
│    ├─ In-place Editing                                 │
│    ├─ Download Functionality                           │
│    └─ Clear Error Messages                             │
│                                                         │
│  📊 Generated Workflows                                │
│    ├─ 3-6 Tasks per Workflow                          │
│    ├─ Sequential Dependencies                          │
│    ├─ Risk Tier Assignment                            │
│    ├─ Retry Configs for High Risk                     │
│    └─ Safety Policies                                  │
│                                                         │
│  🧪 Testing                                            │
│    ├─ 20+ Schema Tests                                │
│    ├─ 15+ Generator Tests                             │
│    ├─ Code Review Completed                           │
│    └─ CodeQL Security Scan                            │
│                                                         │
│  📖 Documentation                                      │
│    ├─ User Guide (README)                             │
│    ├─ Code Examples                                    │
│    ├─ API Reference                                    │
│    ├─ Implementation Details                           │
│    ├─ Security Analysis                               │
│    └─ Visual Guide (this file)                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Integration Points

```
┌──────────────────────────────────────────────────────────┐
│              INTEGRATION READY                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  LLM Providers                                          │
│  ├─ OpenAI (GPT-4, GPT-3.5)    ← Replace mockLLMCall() │
│  ├─ Anthropic (Claude)                                  │
│  ├─ Azure OpenAI                                        │
│  └─ Custom LLM Endpoint                                 │
│                                                          │
│  Audit Systems                                          │
│  ├─ HipCortex Memory           ← Already integrated     │
│  ├─ EventLog Interface                                  │
│  └─ Custom Audit Backend                                │
│                                                          │
│  Policy Engines                                         │
│  ├─ GoalGuardFSM               ← Compatible spec format │
│  ├─ Risk Tier Gating                                    │
│  └─ Permission Enforcement                              │
│                                                          │
│  Workflow Execution                                     │
│  ├─ WorkflowOrchestrator       ← Compatible WorkflowSpec│
│  ├─ Task Execution Engine                               │
│  └─ State Management                                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Usage Flow

```
1. User opens browser → http://localhost:3000/wizard

2. User fills Step 1:
   - Enters goal in natural language
   - Adds constraints (optional)
   - Adds preferred tools (optional)
   - Selects risk tolerance

3. User clicks "Generate Workflow"
   ↓
   API POST /api/workflows/generate
   ↓
   WorkflowGenerator.generateWorkflow()
   ↓
   Returns structured spec

4. User reviews in Step 2:
   - Sees JSON preview
   - Can edit if needed
   - Clicks "Validate"

5. Validation in Step 3:
   ↓
   API POST /api/workflows/validate
   ↓
   Zod schema validation
   ↓
   Shows results (success or errors)

6. If valid:
   - User downloads JSON file
   - Spec can be used with WorkflowOrchestrator

7. If invalid:
   - User sees error list
   - Goes back to edit
   - Re-validates
```

## Summary

This visual guide demonstrates the complete workflow specification generator system, showing:
- **User Interface**: 3-step wizard with clear progression
- **Architecture**: Layered design with clear separation
- **Data Flow**: Natural language → structured spec
- **Integration**: Ready to connect with LLMs and other systems
- **Features**: Security, type safety, testing, documentation
- **Usage**: Simple 7-step process from input to download

The system transforms vague, natural language descriptions into precise, validated, executable workflow specifications automatically.
