# World Model Generation & Integration

This guide describes how the Aureus Console world model builder works, what inputs it expects, how LLM providers should be wired, which validation steps are applied, and how the generated models integrate with the `@aureus/world-model` package.

## Overview

The Aureus Console exposes endpoints to:

1. **Generate** a structured world model spec from a natural language description.
2. **Validate** the spec (schema + semantic checks + CRV gate validation).
3. **Store and version** the model in the world model state store.

Relevant entry points:

- `WorldModelBuilder` in `apps/console/src/world-model-builder.ts` for prompt generation, parsing, and semantic validation.
- Console API endpoints in `apps/console/src/api-server.ts` under `/api/world-models/*` for generation, validation, and persistence.
- `@aureus/world-model` for schema validation and state storage.
- `@aureus/crv` for CRV gate validation of world model specs.

## World Model Builder Inputs

The world model builder expects a request with the following fields:

- `description` **(required)**: Natural language description of the domain.
- `domain` **(required)**: Domain/category label (e.g., `logistics`, `ecommerce`).
- `name` *(optional)*: Human-readable name for the model.
- `includeExamples` *(optional)*: Whether to ask the LLM to include concrete entity instance examples.
- `preferredStyle` *(optional)*: One of `minimal`, `detailed`, or `comprehensive` to guide output density.

These inputs map directly to the `WorldModelGenerationRequest` interface used by `WorldModelBuilder.generateWorldModel()`.

## LLM Provider Requirements

`WorldModelBuilder` accepts an LLM provider in its constructor. The builder currently calls a **`complete(prompt)`** method on that provider and expects a **string** response containing JSON. If no provider is configured, it falls back to generating a basic spec using heuristics (`generateBasicSpec`).

**Key requirements for the provider passed to `WorldModelBuilder`:**

- Exposes `complete(prompt: string): Promise<string>`.
- Returns a response that contains a JSON object matching the world model schema.

If you are already using the shared `LLMProvider` interface from `apps/console/src/llm-provider.ts`, build a thin adapter that calls `generateCompletion()` and returns the `content` string to satisfy the `complete()` signature.

> **Note:** The `/api/world-models/generate` endpoint instantiates `WorldModelBuilder` without an LLM provider by default, which means it returns the fallback heuristic model unless you wire a provider in the server setup.

## Validation Steps

The validation pipeline is layered:

1. **Schema validation** via `validateWorldModelSpec` from `@aureus/world-model` (Zod schema, semver version check, required fields).
2. **Semantic validation** in `WorldModelBuilder.validateWorldModel`:
   - Ensures relations reference valid entities.
   - Ensures constraints reference valid entities.
   - Ensures causal rules reference valid entities.
   - Emits warnings when models have no entities or no relations despite multiple entities.
3. **CRV validation** via `validateWorldModelWithCRV` from `@aureus/crv`:
   - Schema validation (again, through CRV gate).
   - Constraint consistency checks.
   - Causal graph connectivity checks.

The `/api/world-models/validate` endpoint combines the basic validation with CRV gate results and returns a consolidated list of errors/warnings.

## Integration with `@aureus/world-model`

Once validated, a world model spec integrates with the `@aureus/world-model` package in two primary ways:

1. **Schema & Types**
   - The generated spec is expected to match `WorldModelSpecSchema`.
   - This schema defines entities, relations, constraints, causal rules, and metadata.

2. **State Store & Versioning**
   - The world model state store (`InMemoryStateStore` / `StateStore`) can store and version specs with `storeWorldModel()`.
   - Models can be listed, retrieved by ID, or queried for version history.

3. **Agent Runtime Initialization**
   - When an agent blueprint includes `worldModelConfig`, the kernel runtime initializes entity state and stores metadata in the world state store.
   - This allows constraints and causal rules to influence feasibility checks and planning flows downstream.

## Example Requests & Outputs

### Generate a World Model

```bash
curl -X POST http://localhost:3000/api/world-models/generate \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Track shipments, hubs, and delivery status for a logistics network",
    "domain": "logistics",
    "name": "Logistics Network Model",
    "preferredStyle": "detailed",
    "includeExamples": false
  }'
```

**Example response:**

```json
{
  "spec": {
    "id": "world-model-1736890000000",
    "name": "Logistics Network Model",
    "version": "1.0.0",
    "description": "Track shipments, hubs, and delivery status for a logistics network",
    "domain": "logistics",
    "entities": [
      {
        "id": "entity-shipment",
        "name": "Shipment",
        "attributes": [
          {"name": "id", "type": "string", "required": true, "description": "Unique identifier"},
          {"name": "status", "type": "string", "required": true, "description": "Current shipment status"},
          {"name": "createdAt", "type": "date", "required": false, "description": "Creation timestamp"}
        ]
      },
      {
        "id": "entity-hub",
        "name": "Hub",
        "attributes": [
          {"name": "id", "type": "string", "required": true, "description": "Unique identifier"},
          {"name": "name", "type": "string", "required": true, "description": "Hub name"},
          {"name": "createdAt", "type": "date", "required": false, "description": "Creation timestamp"}
        ]
      }
    ],
    "relations": [
      {
        "id": "relation-shipment-hub",
        "name": "ShipmentAssignedToHub",
        "sourceEntity": "entity-shipment",
        "targetEntity": "entity-hub",
        "type": "many-to-one",
        "bidirectional": false
      }
    ],
    "constraints": [
      {
        "id": "constraint-unique-shipment",
        "name": "ShipmentIdUnique",
        "type": "unique",
        "entity": "entity-shipment",
        "attributes": ["id"],
        "rule": "unique(id)",
        "severity": "error"
      }
    ],
    "causalRules": [
      {
        "id": "rule-status-delivered",
        "name": "Delivered sets completion",
        "priority": 0,
        "conditions": [
          {
            "entity": "entity-shipment",
            "attribute": "status",
            "operator": "equals",
            "value": "delivered"
          }
        ],
        "effects": [
          {
            "entity": "entity-shipment",
            "attribute": "completed",
            "action": "set",
            "value": true
          }
        ]
      }
    ]
  },
  "metadata": {
    "generatedAt": "2024-01-14T20:33:20.000Z",
    "promptLength": 1100,
    "responseLength": 1750
  }
}
```

### Validate a World Model

```bash
curl -X POST http://localhost:3000/api/world-models/validate \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d @./world-model.json
```

**Example response:**

```json
{
  "valid": true,
  "spec": { "id": "world-model-1736890000000", "name": "Logistics Network Model", "version": "1.0.0" },
  "warnings": [],
  "crvResults": [
    {"valid": true, "reason": "Schema validation passed", "confidence": 1},
    {"valid": true, "reason": "Constraint consistency validated", "confidence": 1},
    {"valid": true, "reason": "Causal graph connectivity validated", "confidence": 1}
  ]
}
```

### Store a World Model (Versioned)

```bash
curl -X POST http://localhost:3000/api/world-models \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d @./world-model.json
```

**Example response:**

```json
{
  "success": true,
  "id": "world-model-1736890000000",
  "version": 1,
  "timestamp": "2024-01-14T20:35:00.000Z"
}
```

### Fetch Version History

```bash
curl -X GET http://localhost:3000/api/world-models/world-model-1736890000000/versions \
  -H "Authorization: Bearer <jwt-token>"
```

**Example response:**

```json
[
  {
    "version": 1,
    "timestamp": "2024-01-14T20:35:00.000Z",
    "value": { "id": "world-model-1736890000000", "version": "1.0.0" }
  }
]
```
