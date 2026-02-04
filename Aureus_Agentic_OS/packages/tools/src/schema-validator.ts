import { ToolSchema, SchemaProperty, SchemaValidationResult, ValidationError } from './types';

/**
 * Simple schema validator for tool input/output validation
 * Supports basic JSON Schema-like validation
 */
export class SchemaValidator {
  /**
   * Validate data against a schema
   */
  static validate(data: unknown, schema: ToolSchema): SchemaValidationResult {
    const errors: ValidationError[] = [];
    
    // Check type
    if (!this.validateType(data, schema.type)) {
      errors.push({
        message: `Expected type ${schema.type}, got ${typeof data}`,
        code: 'INVALID_TYPE',
      });
      return { valid: false, errors };
    }
    
    // For object types, validate properties
    if (schema.type === 'object' && typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      
      // Check required properties
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in obj)) {
            errors.push({
              field,
              message: `Required field '${field}' is missing`,
              code: 'REQUIRED_FIELD_MISSING',
            });
          }
        }
      }
      
      // Validate properties
      if (schema.properties) {
        for (const [field, propSchema] of Object.entries(schema.properties)) {
          if (field in obj) {
            const propErrors = this.validateProperty(obj[field], propSchema, field);
            errors.push(...propErrors);
          }
        }
      }
      
      // Check additional properties
      if (schema.additionalProperties === false && schema.properties) {
        const allowedFields = Object.keys(schema.properties);
        for (const field of Object.keys(obj)) {
          if (!allowedFields.includes(field)) {
            errors.push({
              field,
              message: `Additional property '${field}' is not allowed`,
              code: 'ADDITIONAL_PROPERTY_NOT_ALLOWED',
            });
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
  
  private static validateType(data: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof data === 'string';
      case 'number':
        return typeof data === 'number';
      case 'boolean':
        return typeof data === 'boolean';
      case 'object':
        return typeof data === 'object' && data !== null && !Array.isArray(data);
      case 'array':
        return Array.isArray(data);
      case 'null':
        return data === null;
      case 'any':
        return true;
      default:
        return false;
    }
  }
  
  private static validateProperty(
    value: unknown,
    schema: SchemaProperty,
    field: string,
    depth: number = 0
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Prevent infinite recursion with depth limit
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) {
      errors.push({
        field,
        message: `Maximum validation depth (${MAX_DEPTH}) exceeded`,
        code: 'MAX_DEPTH_EXCEEDED',
      });
      return errors;
    }
    
    // Check type
    if (!this.validateType(value, schema.type)) {
      errors.push({
        field,
        message: `Field '${field}' expected type ${schema.type}, got ${typeof value}`,
        code: 'INVALID_PROPERTY_TYPE',
      });
      return errors;
    }
    
    // Check enum
    if (schema.enum && !schema.enum.includes(value as string)) {
      errors.push({
        field,
        message: `Field '${field}' must be one of: ${schema.enum.join(', ')}`,
        code: 'INVALID_ENUM_VALUE',
      });
    }
    
    // Check pattern (for strings)
    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          field,
          message: `Field '${field}' does not match pattern ${schema.pattern}`,
          code: 'PATTERN_MISMATCH',
        });
      }
    }
    
    // Check minimum (for numbers)
    if (schema.minimum !== undefined && typeof value === 'number') {
      if (value < schema.minimum) {
        errors.push({
          field,
          message: `Field '${field}' must be >= ${schema.minimum}`,
          code: 'BELOW_MINIMUM',
        });
      }
    }
    
    // Check maximum (for numbers)
    if (schema.maximum !== undefined && typeof value === 'number') {
      if (value > schema.maximum) {
        errors.push({
          field,
          message: `Field '${field}' must be <= ${schema.maximum}`,
          code: 'ABOVE_MAXIMUM',
        });
      }
    }
    
    // Check array items (with depth limit)
    if (schema.items && Array.isArray(value)) {
      value.forEach((item, index) => {
        const itemErrors = this.validateProperty(item, schema.items!, `${field}[${index}]`, depth + 1);
        errors.push(...itemErrors);
      });
    }
    
    return errors;
  }
}
