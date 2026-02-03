<!-- Copilot instructions for coding agents working in this workspace -->

Purpose
-------
- Quickly orient an AI coding agent to the repo's architecture, workflows, conventions, and safe operating rules so it can be productive without guessing.

Big picture (read these first)
--------------------------------
- Two main local codebases live in `knowledgebase/`: `knowledgebase/openclaw` (OpenClaw runtime and channels, TypeScript ESM, plugins) and `knowledgebase/Aureus_Agentic_OS` (Aureus agentic OS monorepo with packages/runtime/CRV). See `knowledgebase/README.md` and `knowledgebase/aureus_openclaw_program_design.md` for context.
- Key contract/schema artifacts: `knowledgebase/aureus-openclaw-platform/contracts/v1/` and repo-level `contracts/v1/` (created by scaffold).
- OpenSpec is used for spec-driven changes: see `openspec/config.yaml` and change artifacts under `openspec/changes/`.

Where to look for the important code
------------------------------------
- Channel and CLI code (OpenClaw): `knowledgebase/openclaw/src/` (look for `src/telegram`, `src/discord`, `src/provider-web.ts`).
- Aureus runtime and packages: `knowledgebase/Aureus_Agentic_OS/packages/` (kernel, crv, memory, policy, sdk).
- Contract schemas and tests: `contracts/v1/` and `tests/schema-test-runner.js`.
- Specs & change flow: `openspec/specs/` and `openspec/changes/`.

Developer workflows & commands (explicit)
----------------------------------------
- Install deps (OpenClaw): `pnpm install` (repo prefers `pnpm` and supports `bun`).
- Build: run `pnpm build` or package-specific build scripts under `packages/*`.
- Lint & format: `pnpm check` (runs oxfmt/oxlint). Use these before committing.
- Tests: `pnpm test` (Vitest in OpenClaw). For contract checks in this workspace run `node tests/schema-test-runner.js` or `npm run schema-lint` from the repository root.
- OpenSpec flow: create change `openspec new change <name>`, author `proposal.md`, then `instructions` to generate artifacts; use `openspec apply` to implement.

Project-specific conventions and patterns
----------------------------------------
- TypeScript ESM + strict types across both codebases. Prefer `zod` or TypeScript-first schemas where present.
- Contracts are strict: JSON Schemas use `"additionalProperties": false` and live under `contracts/v1/`.
- Plugins/extensions live under `extensions/*`; keep plugin-only deps scoped to the plugin `package.json`.
- Docs use root-relative links and are hosted on Mintlify in OpenClaw; prefer absolute docs URLs in GitHub README.

Integration points & external deps
----------------------------------
- LLM providers: configured via env (e.g., `OPENAI_API_KEY`) and consumed by Aureus runtimes — see `Aureus_Agentic_OS/docs/` for wiring.
- Runtime stores: Postgres and Redis are expected for durable orchestration — see `demo-deployment/` and `docs/persistence.md`.
- Channel integrations: update UI surfaces + onboarding docs when adding channels (`src/telegram`, `src/discord`, etc.).

Multi-agent safety & operational rules (must follow)
---------------------------------------------------
- Do NOT switch branches or modify remote branches without explicit user permission.
- Do NOT stash, change `git worktree`, or edit `node_modules` directly.
- When asked to commit, limit commits to scoped changes; when asked to "commit all" group logically.
- Always add evidence in `docs/evidence/` for spec-driven changes and reference the relevant `openspec` change.

Examples to copy/paste
----------------------
- Verify schemas: `node tests/schema-test-runner.js` (returns `OK: <file>` or exits non-zero).
- Run the OpenSpec scaffold flow:
  - `openspec new change openclaw-scaffold`
  - edit `openspec/changes/openclaw-scaffold/proposal.md`
  - `openspec instructions specs --change openclaw-scaffold`

Where to add tests and docs
---------------------------
- Add contract JSON Schemas to `contracts/v1/` and examples under `tests/contracts/`.
- Add evidence docs to `docs/evidence/` for any spec-driven change.

If something is unclear, start by referencing these files and return a short list of specific questions:
- `knowledgebase/aureus_openclaw_program_design.md`
- `knowledgebase/openclaw/AGENTS.md`
- `openspec/config.yaml` and `openspec/changes/`
- `contracts/v1/` and `tests/schema-test-runner.js`

Endnote
-------
- Keep responses and code edits scoped and reversible. Ask one targeted question if required context is missing (which branch, which package, or which runtime to use).

***
Please review: tell me which areas need more detail (architecture diagrams, example tests, CI gating rules).
