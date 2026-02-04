import { ToolSpec, IdempotencyStrategy } from '../index';

/**
 * HTTPTool adapter for HTTP requests with schema validation
 * Supports GET and POST methods with automatic retry and validation
 */
export class HTTPTool {
  /**
   * Create an HTTP GET tool
   */
  static createGetTool(): ToolSpec {
    return {
      id: 'http-get',
      name: 'HTTP GET',
      description: 'Make an HTTP GET request',
      parameters: [
        { name: 'url', type: 'string', required: true, description: 'URL to request' },
        { name: 'headers', type: 'object', required: false, description: 'HTTP headers' },
        { name: 'timeout', type: 'number', required: false, description: 'Request timeout in milliseconds' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          url: { 
            type: 'string',
            pattern: '^https?://.+',
          },
          headers: { type: 'object' },
          timeout: { 
            type: 'number',
            minimum: 0,
            maximum: 300000, // 5 minutes max
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          status: { type: 'number' },
          statusText: { type: 'string' },
          headers: { type: 'object' },
          body: { type: 'any' },
          url: { type: 'string' },
        },
        required: ['status', 'url'],
      },
      sideEffect: false, // GET requests are idempotent
      idempotencyStrategy: IdempotencyStrategy.NATURAL,
      execute: async (params) => {
        const url = params.url as string;
        const headers = (params.headers as Record<string, string>) || {};
        const timeout = (params.timeout as number) || 30000;
        
        // Validate URL format
        try {
          new URL(url);
        } catch (error) {
          throw new Error(`Invalid URL: ${url}`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          // Parse response body based on content type
          const contentType = response.headers.get('content-type') || '';
          let body: unknown;
          
          if (contentType.includes('application/json')) {
            body = await response.json();
          } else if (contentType.includes('text/')) {
            body = await response.text();
          } else {
            // For binary data, convert to base64
            const buffer = await response.arrayBuffer();
            body = Buffer.from(buffer).toString('base64');
          }
          
          // Convert Headers to plain object
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          return {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body,
            url: response.url,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
          }
          throw new Error('HTTP request failed');
        }
      },
      compensation: {
        supported: false, // GET requests don't need compensation
      },
    };
  }
  
  /**
   * Create an HTTP POST tool
   */
  static createPostTool(): ToolSpec {
    return {
      id: 'http-post',
      name: 'HTTP POST',
      description: 'Make an HTTP POST request',
      parameters: [
        { name: 'url', type: 'string', required: true, description: 'URL to request' },
        { name: 'body', type: 'any', required: false, description: 'Request body' },
        { name: 'headers', type: 'object', required: false, description: 'HTTP headers' },
        { name: 'timeout', type: 'number', required: false, description: 'Request timeout in milliseconds' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          url: { 
            type: 'string',
            pattern: '^https?://.+',
          },
          body: { type: 'any' },
          headers: { type: 'object' },
          timeout: { 
            type: 'number',
            minimum: 0,
            maximum: 300000,
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          status: { type: 'number' },
          statusText: { type: 'string' },
          headers: { type: 'object' },
          body: { type: 'any' },
          url: { type: 'string' },
        },
        required: ['status', 'url'],
      },
      sideEffect: true, // POST requests have side effects
      idempotencyStrategy: IdempotencyStrategy.REQUEST_ID,
      execute: async (params) => {
        const url = params.url as string;
        const body = params.body;
        const headers = (params.headers as Record<string, string>) || {};
        const timeout = (params.timeout as number) || 30000;
        
        // Validate URL format
        try {
          new URL(url);
        } catch (error) {
          throw new Error(`Invalid URL: ${url}`);
        }
        
        // Prepare request body
        let requestBody: string | undefined;
        let contentType = headers['content-type'] || headers['Content-Type'];
        
        if (body !== undefined) {
          if (typeof body === 'string') {
            requestBody = body;
          } else if (typeof body === 'object') {
            // Default to JSON for objects
            if (!contentType) {
              headers['content-type'] = 'application/json';
              contentType = 'application/json';
            }
            requestBody = contentType === 'application/json' 
              ? JSON.stringify(body) 
              : String(body);
          } else {
            // For primitive types, convert to string
            requestBody = String(body);
          }
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: requestBody,
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          // Parse response body based on content type
          const contentType = response.headers.get('content-type') || '';
          let responseBody: unknown;
          
          if (contentType.includes('application/json')) {
            responseBody = await response.json();
          } else if (contentType.includes('text/')) {
            responseBody = await response.text();
          } else {
            // For binary data, convert to base64
            const buffer = await response.arrayBuffer();
            responseBody = Buffer.from(buffer).toString('base64');
          }
          
          // Convert Headers to plain object
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          return {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            url: response.url,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
          }
          throw new Error('HTTP request failed');
        }
      },
      compensation: {
        supported: false, // Compensation would be application-specific
        mode: 'manual',
      },
    };
  }
}
