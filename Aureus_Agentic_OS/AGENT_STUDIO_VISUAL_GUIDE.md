# Agent Studio Visual Guide

## UI Flow Overview

The Agent Studio provides a 6-step wizard interface for creating AI agents:

```
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT STUDIO                               │
│         Design, validate, and deploy AI agents with confidence   │
└─────────────────────────────────────────────────────────────────┘

Progress Bar:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ①         ②           ③         ④           ⑤           ⑥
Define   Select     Select   Configure   Blueprint    Deploy
 Goal    Domain     Tools    Policies     Review
```

## Step-by-Step Breakdown

### Step 1: Define Goal
```
┌─────────────────────────────────────────────┐
│ Step 1: Define Agent Goal                   │
│                                              │
│ Agent Goal *                                 │
│ ┌──────────────────────────────────────┐   │
│ │ e.g., Monitor system logs and        │   │
│ │ alert on critical errors             │   │
│ └──────────────────────────────────────┘   │
│                                              │
│ Risk Profile *                               │
│ ┌──────────────────────────────────────┐   │
│ │ ▼ Medium - Standard operations       │   │
│ └──────────────────────────────────────┘   │
│ Options:                                     │
│ • Low - Read-only operations                 │
│ • Medium - Standard operations               │
│ • High - Sensitive operations                │
│ • Critical - High-impact operations          │
│                                              │
│ Constraints (Optional)                       │
│ ┌──────────────────────────────────────┐   │
│ │ Must be read-only                    │   │
│ │ Must not access PII                  │   │
│ └──────────────────────────────────────┘   │
│                                              │
│ [Cancel]              [Next: Select Domain] │
└─────────────────────────────────────────────┘
```

### Step 2: Select Domain (NEW)
```
┌─────────────────────────────────────────────┐
│ Step 2: Select Domain                        │
│                                              │
│ Domain *                                     │
│ ┌──────────────────────────────────────┐   │
│ │ ▼ General - General purpose agent    │   │
│ └──────────────────────────────────────┘   │
│ Options:                                     │
│ • General      • Robotics    • Healthcare   │
│ • Finance      • Retail      • Manufacturing│
│ • Logistics    • Education   • Entertainment│
│ • Travel       • Industrial  • Custom       │
│                                              │
│ Deployment Target (Optional)                 │
│ ┌──────────────────────────────────────┐   │
│ │ ▼ Auto-detect from domain            │   │
│ └──────────────────────────────────────┘   │
│ Options:                                     │
│ • Cloud        • Edge        • Robotics     │
│ • Humanoid     • Software    • Smartphone   │
│ • Desktop      • Smart Glasses              │
│                                              │
│ Device Class (Optional)                      │
│ ┌──────────────────────────────────────┐   │
│ │ ▼ Auto-detect from target            │   │
│ └──────────────────────────────────────┘   │
│ Options:                                     │
│ • Cloud        • Edge        • Mobile       │
│ • Wearable     • Embedded    • Robot        │
│ • Humanoid     • IoT         • Desktop      │
│                                              │
│ [Previous]              [Next: Select Tools] │
└─────────────────────────────────────────────┘
```

### Step 3: Select Tools
```
┌─────────────────────────────────────────────┐
│ Step 3: Select Tools & Capabilities          │
│                                              │
│ Available Tools                               │
│                                              │
│ ☑ HTTP Client            [low]              │
│ ☐ File Reader            [low]              │
│ ☐ Database Query         [medium]           │
│ ☐ API Caller             [medium]           │
│ ☐ Email Sender           [medium]           │
│ ☐ File Writer            [high]             │
│ ☐ Command Executor       [critical]         │
│                                              │
│ [Previous]        [Next: Configure Policies] │
└─────────────────────────────────────────────┘
```

### Step 4: Configure Policies
```
┌─────────────────────────────────────────────┐
│ Step 4: Configure Policies & Guardrails      │
│                                              │
│ Policy Requirements                           │
│                                              │
│ ☑ Rate Limiting                              │
│ ☑ Timeout Enforcement                        │
│ ☐ Data Validation                            │
│ ☐ Access Control                             │
│ ☐ Audit Logging                              │
│                                              │
│ Additional Context (Optional)                 │
│ ┌──────────────────────────────────────┐   │
│ │ Special requirements...              │   │
│ └──────────────────────────────────────┘   │
│                                              │
│ [Previous]    [Generate Agent Blueprint]    │
└─────────────────────────────────────────────┘
```

### Step 5: Blueprint Review
```
┌─────────────────────────────────────────────┐
│ Step 5: Review & Validate Agent Blueprint    │
│                                              │
│ ⏳ Generating agent blueprint...             │
│                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                              │
│ --- After Generation ---                     │
│                                              │
│ ✅ Agent Blueprint Generated Successfully    │
│                                              │
│ Agent Details:                               │
│ • Name: Monitor System Logs Agent           │
│ • Domain: software                           │
│ • Risk Profile: MEDIUM                       │
│ • Tools: 1 configured                        │
│ • Policies: 2 configured                     │
│ • Workflows: 2 configured                    │
│                                              │
│ Configuration:                                │
│ {                                            │
│   "name": "Monitor System Logs Agent",      │
│   "goal": "Monitor system logs...",         │
│   "domain": "software",                      │
│   "riskProfile": "MEDIUM",                   │
│   ...                                        │
│ }                                            │
│                                              │
│ Validation Status:                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                              │
│ [Previous] [Validate Configuration] [Simulate]│
│                    [Proceed to Deploy]       │
└─────────────────────────────────────────────┘
```

### Step 6: Deploy
```
┌─────────────────────────────────────────────┐
│ Step 6: Deploy Agent                         │
│                                              │
│ Target Environment *                          │
│ ┌──────────────────────────────────────┐   │
│ │ ▼ Development                        │   │
│ └──────────────────────────────────────┘   │
│ • Development                                │
│ • Staging                                    │
│ • Production                                 │
│                                              │
│ ☐ Auto-promote to production after staging  │
│ ☑ Require approval before deployment        │
│                                              │
│ Deployment Status                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│ ✅ Register: Completed                       │
│ ⏳ Stage: Pending approval                   │
│ ⏸  Promote: Pending                          │
│                                              │
│ [Previous]                  [Deploy Agent]   │
└─────────────────────────────────────────────┘
```

## Key Features

### 1. Domain Selection (NEW)
- **12 Domain Options**: General, Robotics, Healthcare, Finance, Retail, Manufacturing, Logistics, Education, Entertainment, Travel, Industrial, Custom
- **11 Deployment Targets**: Cloud, Edge, Robotics, Humanoid, Software, Travel, Retail, Industrial, Smartphone, Desktop, Smart Glasses
- **10 Device Classes**: Cloud, Edge, Mobile, Wearable, Embedded, Robot, Humanoid, IoT, Desktop, Server

### 2. Risk-Based Configuration
- **Low Risk**: Read-only operations, creative temperature (0.9)
- **Medium Risk**: Standard operations, balanced temperature (0.7)
- **High Risk**: Sensitive operations, deterministic temperature (0.5)
- **Critical Risk**: High-impact operations, very deterministic (0.3)

### 3. Validation Pipeline
- **Schema Validation**: Zod schema validation
- **CRV Validation**: Schema, security, logic consistency checks
- **Policy Evaluation**: GoalGuard FSM policy checks
- **Deployment Target Compatibility**: Required capabilities validation

### 4. AI-Assisted Generation
- **LLM Integration**: OpenAI GPT-4, Anthropic Claude
- **Context-Aware**: Includes domain, deployment target, risk profile
- **Structured Output**: JSON blueprint with tools, policies, workflows
- **Fallback Mock**: Testing without LLM API

### 5. Deployment Management
- **Environment Selection**: Development, Staging, Production
- **Approval Workflows**: Required for high-risk deployments
- **Auto-Promotion**: Optional staging-to-production
- **Status Tracking**: Real-time deployment stage monitoring

## Color Coding

```
Risk Levels:
[low]      - Green  - Read-only operations
[medium]   - Yellow - Standard operations  
[high]     - Orange - Sensitive operations
[critical] - Red    - High-impact operations

Status Indicators:
✅ Completed
⏳ In Progress
⏸  Pending
❌ Failed
```

## Responsive Design

The UI is fully responsive and works on:
- Desktop (1200px+ width)
- Tablet (768px - 1199px)
- Mobile (< 768px)

## Accessibility

- ARIA labels for screen readers
- Keyboard navigation support
- High contrast color scheme
- Clear error messages
- Helpful tooltips

## Next Steps After Deployment

1. Monitor agent performance in target environment
2. Review audit logs for compliance
3. Adjust policies based on behavior
4. Promote to higher environments when validated
5. Continuous improvement based on metrics
