import { WorldModelSpec, validateWorldModelSpec, createEmptyWorldModelSpec } from '@aureus/world-model';

/**
 * Request to generate a world model from natural language description
 */
export interface WorldModelGenerationRequest {
  description: string;
  domain: string;
  name?: string;
  includeExamples?: boolean;
  preferredStyle?: 'minimal' | 'detailed' | 'comprehensive';
}

/**
 * Result of world model generation
 */
export interface WorldModelGenerationResult {
  spec: WorldModelSpec;
  metadata: {
    timestamp: Date;
    prompt: string;
    response: string;
    tokensUsed?: number;
  };
}

/**
 * WorldModelBuilder generates structured world model specifications
 * from natural language domain descriptions using LLM
 */
export class WorldModelBuilder {
  private llmProvider?: any; // LLM provider interface

  constructor(llmProvider?: any) {
    this.llmProvider = llmProvider;
  }

  /**
   * Generate a world model specification from natural language description
   */
  async generateWorldModel(request: WorldModelGenerationRequest): Promise<WorldModelGenerationResult> {
    const { description, domain, name, includeExamples = false, preferredStyle = 'detailed' } = request;

    // Create the prompt for LLM
    const prompt = this.buildGenerationPrompt(description, domain, preferredStyle, includeExamples);

    // If LLM provider is available, use it to generate the spec
    let generatedSpec: WorldModelSpec;
    let response: string;

    if (this.llmProvider) {
      response = await this.generateWithLLM(prompt);
      generatedSpec = this.parseGeneratedSpec(response, name || this.extractNameFromDescription(description), domain);
    } else {
      // Fallback: create a basic spec structure from the description
      generatedSpec = this.generateBasicSpec(description, domain, name);
      response = JSON.stringify(generatedSpec, null, 2);
    }

    return {
      spec: generatedSpec,
      metadata: {
        timestamp: new Date(),
        prompt,
        response,
      },
    };
  }

  /**
   * Validate a world model specification
   */
  validateWorldModel(spec: unknown): { 
    valid: boolean; 
    spec?: WorldModelSpec; 
    errors?: string[];
    warnings?: string[];
  } {
    // Schema validation
    const validation = validateWorldModelSpec(spec);
    
    if (!validation.success) {
      return {
        valid: false,
        errors: validation.errors,
      };
    }

    // Additional semantic validation
    const semanticErrors: string[] = [];
    const warnings: string[] = [];

    if (validation.data) {
      const spec = validation.data;

      // Check entity references in relations
      const entityIds = new Set(spec.entities.map(e => e.id));
      for (const relation of spec.relations) {
        if (!entityIds.has(relation.sourceEntity)) {
          semanticErrors.push(`Relation "${relation.name}" references unknown source entity: ${relation.sourceEntity}`);
        }
        if (!entityIds.has(relation.targetEntity)) {
          semanticErrors.push(`Relation "${relation.name}" references unknown target entity: ${relation.targetEntity}`);
        }
      }

      // Check entity references in constraints
      for (const constraint of spec.constraints) {
        if (!entityIds.has(constraint.entity)) {
          semanticErrors.push(`Constraint "${constraint.name}" references unknown entity: ${constraint.entity}`);
        }
      }

      // Check entity references in causal rules
      for (const rule of spec.causalRules) {
        for (const condition of rule.conditions) {
          if (!entityIds.has(condition.entity)) {
            semanticErrors.push(`Causal rule "${rule.name}" condition references unknown entity: ${condition.entity}`);
          }
        }
        for (const effect of rule.effects) {
          if (!entityIds.has(effect.entity)) {
            semanticErrors.push(`Causal rule "${rule.name}" effect references unknown entity: ${effect.entity}`);
          }
        }
      }

      // Warnings for potential issues
      if (spec.entities.length === 0) {
        warnings.push('World model has no entities defined');
      }
      if (spec.relations.length === 0 && spec.entities.length > 1) {
        warnings.push('World model has multiple entities but no relations defined');
      }
    }

    if (semanticErrors.length > 0) {
      return {
        valid: false,
        errors: semanticErrors,
        warnings,
      };
    }

    return {
      valid: true,
      spec: validation.data,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Build LLM prompt for world model generation
   */
  private buildGenerationPrompt(
    description: string,
    domain: string,
    style: string,
    includeExamples: boolean
  ): string {
    let prompt = `Generate a structured world model specification for the following domain description:

Domain: ${domain}
Description: ${description}

The world model should include:
1. Entities with their attributes (name, type, required, description, constraints)
2. Relations between entities (type, cardinality, bidirectionality)
3. Constraints on entities (unique, not-null, check, range, pattern)
4. Causal rules that define domain logic (conditions and effects)

Style preference: ${style}

Output the world model as a JSON object following this structure:
{
  "id": "unique-identifier",
  "name": "World Model Name",
  "version": "1.0.0",
  "description": "Brief description",
  "domain": "${domain}",
  "entities": [
    {
      "id": "entity-id",
      "name": "EntityName",
      "description": "Entity description",
      "attributes": [
        {
          "name": "attributeName",
          "type": "string|number|boolean|date|object|array",
          "required": true|false,
          "description": "Attribute description",
          "constraints": ["constraint1", "constraint2"]
        }
      ]
    }
  ],
  "relations": [
    {
      "id": "relation-id",
      "name": "RelationName",
      "sourceEntity": "entity-id-1",
      "targetEntity": "entity-id-2",
      "type": "one-to-one|one-to-many|many-to-one|many-to-many",
      "bidirectional": true|false
    }
  ],
  "constraints": [
    {
      "id": "constraint-id",
      "name": "ConstraintName",
      "type": "unique|not-null|check|foreign-key|custom|range|pattern",
      "entity": "entity-id",
      "attributes": ["attr1", "attr2"],
      "rule": "validation expression",
      "severity": "error|warning"
    }
  ],
  "causalRules": [
    {
      "id": "rule-id",
      "name": "RuleName",
      "priority": 0,
      "conditions": [
        {
          "entity": "entity-id",
          "attribute": "attributeName",
          "operator": "equals|greater-than|less-than|contains|exists",
          "value": "value"
        }
      ],
      "effects": [
        {
          "entity": "entity-id",
          "attribute": "attributeName",
          "action": "set|increment|decrement|append|compute",
          "value": "value"
        }
      ]
    }
  ]
}`;

    if (includeExamples) {
      prompt += `\n\nInclude concrete examples of entity instances that demonstrate the world model.`;
    }

    return prompt;
  }

  /**
   * Generate world model using LLM
   */
  private async generateWithLLM(prompt: string): Promise<string> {
    if (!this.llmProvider) {
      throw new Error('LLM provider not configured');
    }

    // Call LLM provider - interface to be implemented
    // For now, this is a placeholder
    const response = await this.llmProvider.complete(prompt);
    return response;
  }

  /**
   * Parse LLM response into world model spec
   */
  private parseGeneratedSpec(response: string, name: string, domain: string): WorldModelSpec {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure required fields
      parsed.name = parsed.name || name;
      parsed.domain = parsed.domain || domain;
      parsed.version = parsed.version || '1.0.0';
      parsed.id = parsed.id || `world-model-${Date.now()}`;

      const validation = validateWorldModelSpec(parsed);
      if (!validation.success) {
        throw new Error(`Generated spec is invalid: ${validation.errors?.join(', ')}`);
      }

      return validation.data!;
    } catch (error) {
      console.error('Failed to parse generated spec:', error);
      // Fallback to basic spec
      return this.generateBasicSpec(`Generated from: ${response.substring(0, 200)}...`, domain, name);
    }
  }

  /**
   * Generate a basic spec structure from description
   */
  private generateBasicSpec(description: string, domain: string, name?: string): WorldModelSpec {
    const modelName = name || this.extractNameFromDescription(description);
    const spec = createEmptyWorldModelSpec(modelName, domain);
    spec.description = description;

    // Extract simple entity names from description (basic heuristic)
    const words = description.toLowerCase().split(/\s+/);
    const commonNouns = words.filter(w => w.length > 3 && !['this', 'that', 'with', 'have', 'from', 'were', 'been'].includes(w));
    
    // Create a few sample entities based on the description
    const uniqueNouns = [...new Set(commonNouns)].slice(0, 3);
    uniqueNouns.forEach((noun, idx) => {
      spec.entities.push({
        id: `entity-${noun}`,
        name: noun.charAt(0).toUpperCase() + noun.slice(1),
        attributes: [
          {
            name: 'id',
            type: 'string',
            required: true,
            description: 'Unique identifier',
          },
          {
            name: 'name',
            type: 'string',
            required: true,
            description: 'Name of the entity',
          },
          {
            name: 'createdAt',
            type: 'date',
            required: false,
            description: 'Creation timestamp',
          },
        ],
      });
    });

    return spec;
  }

  /**
   * Extract a reasonable name from description
   */
  private extractNameFromDescription(description: string): string {
    // Take first few significant words
    const words = description.split(/\s+/).slice(0, 3);
    return words
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
}
