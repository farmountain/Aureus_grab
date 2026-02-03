# Templates Directory

This directory should contain **verbatim copies** of the repository structure that gets installed into user workspaces.

## Required Structure

```
templates/
├─ .agents/
│  ├─ driver/
│  ├─ verifier/
│  └─ (other agent folders)
├─ capabilities/
│  └─ (capability files)
├─ weeks/
│  ├─ week-01/
│  ├─ week-02/
│  └─ (other weeks)
└─ adoption/
   └─ (adoption guides)
```

## How to Populate

When building the extension for distribution:

1. Copy the entire `.agents/` folder from the main repository
2. Copy the entire `capabilities/` folder
3. Copy relevant `weeks/` content (or all of it)
4. Copy the entire `adoption/` folder

## Safety Rules

The extension will **never overwrite** these files during initialization:
- `evidence_*.md`
- `decisions_log.md`
- `experience_ledger.md`
- `risk_ledger.md`
- `confidence_ledger.md`
- `drift_ledger.md`

## Why This Exists

This folder allows users to:
- Install the SDLC Swarm structure with one command
- Get started without manual folder creation
- Receive updates to skills and workflows

The extension remains **thin** - it only copies files, never executes logic.
