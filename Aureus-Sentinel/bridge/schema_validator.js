// Schema validator for contract validation
const fs = require('fs');
const path = require('path');

// Cache for loaded schemas
const schemaCache = {};

function loadSchema(schemaName) {
  if (schemaCache[schemaName]) return schemaCache[schemaName];
  
  const schemaPath = path.join(__dirname, '..', 'contracts', 'v1', `${schemaName}.schema.json`);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  schemaCache[schemaName] = schema;
  return schema;
}

// Simple JSON Schema validator (subset for our needs)
function validateObject(obj, schema) {
  const errors = [];

  // Check type
  if (schema.type && typeof obj !== schema.type) {
    return { valid: false, errors: [`Expected type ${schema.type}, got ${typeof obj}`] };
  }

  if (schema.type === 'object' && obj !== null) {
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check additional properties
    if (schema.additionalProperties === false) {
      const allowedProps = Object.keys(schema.properties || {});
      for (const key of Object.keys(obj)) {
        if (!allowedProps.includes(key)) {
          errors.push(`Unexpected property: ${key}`);
        }
      }
    }

    // Validate each property
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const result = validateProperty(obj[key], propSchema, key);
          if (!result.valid) {
            errors.push(...result.errors);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateProperty(value, propSchema, fieldName) {
  const errors = [];

  // Type check
  if (propSchema.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== propSchema.type && value !== null) {
      errors.push(`Field ${fieldName}: expected type ${propSchema.type}, got ${actualType}`);
      return { valid: false, errors };
    }
  }

  // Const check
  if ('const' in propSchema && value !== propSchema.const) {
    errors.push(`Field ${fieldName}: expected value "${propSchema.const}", got "${value}"`);
  }

  // Enum check
  if (propSchema.enum && !propSchema.enum.includes(value)) {
    errors.push(`Field ${fieldName}: value "${value}" not in allowed values: ${propSchema.enum.join(', ')}`);
  }

  // Pattern check
  if (propSchema.pattern && typeof value === 'string') {
    const regex = new RegExp(propSchema.pattern);
    if (!regex.test(value)) {
      errors.push(`Field ${fieldName}: value does not match pattern ${propSchema.pattern}`);
    }
  }

  // String length checks
  if (typeof value === 'string') {
    if (propSchema.minLength && value.length < propSchema.minLength) {
      errors.push(`Field ${fieldName}: string too short (min: ${propSchema.minLength})`);
    }
    if (propSchema.maxLength && value.length > propSchema.maxLength) {
      errors.push(`Field ${fieldName}: string too long (max: ${propSchema.maxLength})`);
    }
  }

  // Numeric range checks
  if (typeof value === 'number') {
    if ('minimum' in propSchema && value < propSchema.minimum) {
      errors.push(`Field ${fieldName}: value ${value} below minimum ${propSchema.minimum}`);
    }
    if ('maximum' in propSchema && value > propSchema.maximum) {
      errors.push(`Field ${fieldName}: value ${value} above maximum ${propSchema.maximum}`);
    }
  }

  // Array checks
  if (Array.isArray(value)) {
    if ('minItems' in propSchema && value.length < propSchema.minItems) {
      errors.push(`Field ${fieldName}: array too short (min: ${propSchema.minItems})`);
    }
    if ('maxItems' in propSchema && value.length > propSchema.maxItems) {
      errors.push(`Field ${fieldName}: array too long (max: ${propSchema.maxItems})`);
    }

    // Validate array items
    if (propSchema.items && propSchema.items.type === 'object') {
      value.forEach((item, idx) => {
        const itemResult = validateObject(item, propSchema.items);
        if (!itemResult.valid) {
          errors.push(`Field ${fieldName}[${idx}]: ${itemResult.errors.join(', ')}`);
        }
      });
    }
  }

  // Object validation (recursive)
  if (propSchema.type === 'object' && value !== null && typeof value === 'object') {
    const result = validateObject(value, propSchema);
    if (!result.valid) {
      errors.push(...result.errors.map(e => `${fieldName}.${e}`));
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateIntent(intentEnvelope) {
  const schema = loadSchema('intent');
  return validateObject(intentEnvelope, schema);
}

function validatePlan(proposedPlan) {
  const schema = loadSchema('plan');
  return validateObject(proposedPlan, schema);
}

function validateApproval(approval) {
  const schema = loadSchema('approval');
  return validateObject(approval, schema);
}

function validateReport(report) {
  const schema = loadSchema('report');
  return validateObject(report, schema);
}

module.exports = {
  validateIntent,
  validatePlan,
  validateApproval,
  validateReport,
  validateObject,
  loadSchema
};
