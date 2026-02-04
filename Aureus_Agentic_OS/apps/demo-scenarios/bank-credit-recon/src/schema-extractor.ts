/**
 * Schema extractor for DDL files
 * Parses DDL and extracts table schema information
 */

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  constraints?: string[];
}

export interface TableSchema {
  tableName: string;
  columns: ColumnDefinition[];
  indexes: string[];
}

export class SchemaExtractor {
  /**
   * Extract schema from DDL file content
   */
  extractSchema(ddl: string): TableSchema {
    const lines = ddl.split('\n').map(line => line.trim());
    
    // Find CREATE TABLE statement
    let tableName = '';
    const createTableMatch = ddl.match(/CREATE TABLE (\w+)/i);
    if (createTableMatch) {
      tableName = createTableMatch[1];
    }

    const columns: ColumnDefinition[] = [];
    const indexes: string[] = [];

    // Parse column definitions
    let inTableDef = false;
    for (const line of lines) {
      if (line.startsWith('CREATE TABLE')) {
        inTableDef = true;
        continue;
      }
      
      if (inTableDef && line.includes(');')) {
        inTableDef = false;
        continue;
      }

      if (inTableDef && line.length > 0 && !line.startsWith('--')) {
        const columnMatch = line.match(/(\w+)\s+(VARCHAR|DECIMAL|DATE|TIMESTAMP|TEXT|INT|INTEGER|BIGINT|SMALLINT|FLOAT|DOUBLE|BOOLEAN|BOOL|CHAR)/i);
        if (columnMatch) {
          const name = columnMatch[1];
          const type = columnMatch[2];
          const nullable = !line.includes('NOT NULL');
          const primaryKey = line.includes('PRIMARY KEY');
          
          columns.push({
            name,
            type,
            nullable,
            primaryKey,
            constraints: line.includes('CHECK') ? ['CHECK'] : undefined,
          });
        }
      }

      // Parse indexes
      if (line.startsWith('CREATE INDEX')) {
        const indexMatch = line.match(/CREATE INDEX (\w+)/i);
        if (indexMatch) {
          indexes.push(indexMatch[1]);
        }
      }
    }

    return {
      tableName,
      columns,
      indexes,
    };
  }
}
