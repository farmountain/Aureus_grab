/**
 * Tests for data contract validation
 */

import { describe, it, expect } from 'vitest';
import { DefaultDataContractValidator, SchemaDefinition } from '../src/contract';
import { NormalizedInput } from '../src/types';

describe('Data Contract Validation', () => {
  describe('DefaultDataContractValidator', () => {
    it('should validate text input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-1',
        source: 'text',
        timestamp: new Date(),
        format: 'text',
        data: {
          text: 'What is the weather?',
          length: 20,
          wordCount: 4,
        },
        schema: 'text-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.id).toBe('contract-input-1');
      expect(contract.inputId).toBe('input-1');
      expect(contract.schema).toBe('text-v1');
      expect(contract.intent.type).toBe('query');
      expect(contract.validationResults.every(r => r.passed)).toBe(true);
    });

    it('should validate JSON input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-2',
        source: 'json',
        timestamp: new Date(),
        format: 'json',
        data: { key: 'value' },
        schema: 'json-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.schema).toBe('json-v1');
      expect(contract.intent.type).toBe('data');
    });

    it('should validate event input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-3',
        source: 'event',
        timestamp: new Date(),
        format: 'event',
        data: {
          eventType: 'user.login',
          payload: { userId: '123' },
          eventMetadata: { source: 'event', timestamp: new Date().toISOString() },
        },
        schema: 'event-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.intent.type).toBe('event');
      expect(contract.intent.confidence).toBeGreaterThan(0.8);
    });

    it('should validate sensor input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-4',
        source: 'sensor',
        timestamp: new Date(),
        format: 'sensor',
        data: {
          sensorId: 'temp-1',
          readings: { temperature: 22.5 },
          timestamp: new Date().toISOString(),
        },
        schema: 'sensor-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.intent.type).toBe('observation');
      expect(contract.intent.confidence).toBeGreaterThan(0.9);
    });

    it('should throw on schema validation failure', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-5',
        source: 'text',
        timestamp: new Date(),
        format: 'text',
        data: {
          // Missing required 'text' field
          length: 10,
        },
        schema: 'text-v1',
      };

      await expect(validator.validate(input)).rejects.toThrow('Schema validation failed');
    });

    it('should extract query intent from text', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-6',
        source: 'text',
        timestamp: new Date(),
        format: 'text',
        data: { text: 'How do I reset my password?' },
      };

      const intent = await validator.extractIntent(input);

      expect(intent.type).toBe('query');
      expect(intent.confidence).toBeGreaterThan(0.6);
    });

    it('should extract command intent from text', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-7',
        source: 'text',
        timestamp: new Date(),
        format: 'text',
        data: { text: 'run the backup script' },
      };

      const intent = await validator.extractIntent(input);

      expect(intent.type).toBe('command');
      expect(intent.confidence).toBeGreaterThan(0.7);
    });

    it('should register custom schema', async () => {
      const validator = new DefaultDataContractValidator();
      const customSchema: SchemaDefinition = {
        name: 'order',
        version: 'v1',
        fields: {
          orderId: { type: 'string', required: true },
          status: { type: 'string', required: true },
        },
      };

      validator.registerSchema(customSchema);

      const input: NormalizedInput = {
        id: 'input-8',
        source: 'json',
        timestamp: new Date(),
        format: 'json',
        data: {
          orderId: 'ORD-123',
          status: 'pending',
        },
        schema: 'order-v1',
      };

      const contract = await validator.validate(input);
      expect(contract.schema).toBe('order-v1');
    });

    it('should register custom intent extractor', async () => {
      const validator = new DefaultDataContractValidator();
      
      validator.registerIntentExtractor('custom', async (input) => ({
        type: 'custom-intent',
        confidence: 1.0,
        parameters: { custom: true },
        description: 'Custom intent',
      }));

      const input: NormalizedInput = {
        id: 'input-9',
        source: 'custom',
        timestamp: new Date(),
        format: 'custom',
        data: { test: 'data' },
      };

      const intent = await validator.extractIntent(input);
      expect(intent.type).toBe('custom-intent');
      expect(intent.confidence).toBe(1.0);
    });

    it('should validate image input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-10',
        source: 'image',
        timestamp: new Date(),
        format: 'image',
        data: {
          content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
          format: 'png',
        },
        schema: 'image-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.schema).toBe('image-v1');
      expect(contract.intent.type).toBe('observation');
      expect(contract.intent.confidence).toBeGreaterThan(0.8);
      expect(contract.intent.parameters).toHaveProperty('format', 'png');
      expect(contract.validationResults.every(r => r.passed)).toBe(true);
    });

    it('should validate audio input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-11',
        source: 'audio',
        timestamp: new Date(),
        format: 'audio',
        data: {
          content: 'https://example.com/audio.mp3',
          format: 'mp3',
          duration: 120,
        },
        schema: 'audio-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.schema).toBe('audio-v1');
      expect(contract.intent.type).toBe('observation');
      expect(contract.intent.confidence).toBeGreaterThan(0.8);
      expect(contract.intent.parameters).toHaveProperty('format', 'mp3');
      expect(contract.intent.parameters).toHaveProperty('duration', 120);
      expect(contract.validationResults.every(r => r.passed)).toBe(true);
    });

    it('should validate video input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-12',
        source: 'video',
        timestamp: new Date(),
        format: 'video',
        data: {
          content: 'https://example.com/video.mp4',
          format: 'mp4',
          duration: 300,
        },
        schema: 'video-v1',
      };

      const contract = await validator.validate(input);

      expect(contract.schema).toBe('video-v1');
      expect(contract.intent.type).toBe('observation');
      expect(contract.intent.confidence).toBeGreaterThan(0.8);
      expect(contract.intent.parameters).toHaveProperty('format', 'mp4');
      expect(contract.intent.parameters).toHaveProperty('duration', 300);
      expect(contract.validationResults.every(r => r.passed)).toBe(true);
    });

    it('should throw on invalid image schema', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-13',
        source: 'image',
        timestamp: new Date(),
        format: 'image',
        data: {
          // Missing required 'content' field
          format: 'png',
        },
        schema: 'image-v1',
      };

      await expect(validator.validate(input)).rejects.toThrow('Schema validation failed');
    });

    it('should extract intent from image input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-14',
        source: 'image',
        timestamp: new Date(),
        format: 'image',
        data: {
          content: 'https://example.com/photo.jpg',
          format: 'jpeg',
        },
      };

      const intent = await validator.extractIntent(input);

      expect(intent.type).toBe('observation');
      expect(intent.confidence).toBeGreaterThan(0.8);
      expect(intent.parameters).toHaveProperty('contentType', 'image');
    });

    it('should extract intent from audio input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-15',
        source: 'audio',
        timestamp: new Date(),
        format: 'audio',
        data: {
          content: 'https://example.com/sound.wav',
          format: 'wav',
          duration: 60,
        },
      };

      const intent = await validator.extractIntent(input);

      expect(intent.type).toBe('observation');
      expect(intent.confidence).toBeGreaterThan(0.8);
      expect(intent.parameters).toHaveProperty('contentType', 'audio');
    });

    it('should extract intent from video input', async () => {
      const validator = new DefaultDataContractValidator();
      const input: NormalizedInput = {
        id: 'input-16',
        source: 'video',
        timestamp: new Date(),
        format: 'video',
        data: {
          content: 'https://example.com/clip.mp4',
          format: 'mp4',
          duration: 180,
        },
      };

      const intent = await validator.extractIntent(input);

      expect(intent.type).toBe('observation');
      expect(intent.confidence).toBeGreaterThan(0.8);
      expect(intent.parameters).toHaveProperty('contentType', 'video');
    });
  });
});
