/**
 * Tests for perception adapters
 */

import { describe, it, expect } from 'vitest';
import {
  TextAdapter,
  JsonAdapter,
  EventAdapter,
  SensorAdapter,
  CustomAdapter,
  ImageAdapter,
  AudioAdapter,
  VideoAdapter,
  AdapterRegistry,
} from '../src/adapters';
import { RawInput, ImageData, AudioData, VideoData } from '../src/types';

describe('Perception Adapters', () => {
  describe('TextAdapter', () => {
    it('should normalize text input', async () => {
      const adapter = new TextAdapter();
      const input: RawInput = {
        id: 'test-1',
        source: 'text',
        timestamp: new Date(),
        data: 'Hello, world!',
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('text');
      expect(normalized.data).toHaveProperty('text');
      expect((normalized.data as { text: string }).text).toBe('Hello, world!');
      expect(normalized.schema).toBe('text-v1');
    });

    it('should handle text object with text property', async () => {
      const adapter = new TextAdapter();
      const input: RawInput = {
        id: 'test-2',
        source: 'text',
        timestamp: new Date(),
        data: { text: 'Test message' },
      };

      const normalized = await adapter.normalize(input);
      expect((normalized.data as { text: string }).text).toBe('Test message');
    });

    it('should handle supported sources', () => {
      const adapter = new TextAdapter();
      expect(adapter.canHandle({ id: '1', source: 'text', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'string', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'json', timestamp: new Date(), data: '' })).toBe(false);
    });
  });

  describe('JsonAdapter', () => {
    it('should normalize JSON object', async () => {
      const adapter = new JsonAdapter();
      const input: RawInput = {
        id: 'test-3',
        source: 'json',
        timestamp: new Date(),
        data: { key: 'value', number: 42 },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('json');
      expect(normalized.data).toEqual({ key: 'value', number: 42 });
      expect(normalized.schema).toBe('json-v1');
    });

    it('should parse JSON string', async () => {
      const adapter = new JsonAdapter();
      const input: RawInput = {
        id: 'test-4',
        source: 'json',
        timestamp: new Date(),
        data: '{"key":"value"}',
      };

      const normalized = await adapter.normalize(input);
      expect(normalized.data).toEqual({ key: 'value' });
    });

    it('should throw on invalid JSON string', async () => {
      const adapter = new JsonAdapter();
      const input: RawInput = {
        id: 'test-5',
        source: 'json',
        timestamp: new Date(),
        data: 'invalid json',
      };

      await expect(adapter.normalize(input)).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('EventAdapter', () => {
    it('should normalize event data', async () => {
      const adapter = new EventAdapter();
      const input: RawInput = {
        id: 'test-6',
        source: 'event',
        timestamp: new Date(),
        data: {
          type: 'user.signup',
          payload: { userId: '123', email: 'test@example.com' },
        },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('event');
      const data = normalized.data as { eventType: string; payload: unknown };
      expect(data.eventType).toBe('user.signup');
      expect(data.payload).toEqual({ userId: '123', email: 'test@example.com' });
      expect(normalized.schema).toBe('event-v1');
    });

    it('should handle event without explicit type', async () => {
      const adapter = new EventAdapter();
      const input: RawInput = {
        id: 'test-7',
        source: 'event',
        timestamp: new Date(),
        data: { someData: 'value' },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as { eventType: string };
      expect(data.eventType).toBe('unknown');
    });
  });

  describe('SensorAdapter', () => {
    it('should normalize sensor data', async () => {
      const adapter = new SensorAdapter();
      const input: RawInput = {
        id: 'test-8',
        source: 'sensor',
        timestamp: new Date(),
        data: {
          sensorId: 'temp-sensor-1',
          readings: { temperature: 22.5, humidity: 60 },
        },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('sensor');
      const data = normalized.data as { sensorId: string; readings: Record<string, number> };
      expect(data.sensorId).toBe('temp-sensor-1');
      expect(data.readings).toEqual({ temperature: 22.5, humidity: 60 });
      expect(normalized.schema).toBe('sensor-v1');
    });

    it('should handle sensor with single value', async () => {
      const adapter = new SensorAdapter();
      const input: RawInput = {
        id: 'test-9',
        source: 'sensor',
        timestamp: new Date(),
        data: { value: 42.0 },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as { readings: Record<string, number> };
      expect(data.readings).toEqual({ value: 42.0 });
    });
  });

  describe('CustomAdapter', () => {
    it('should use custom normalizer', async () => {
      const adapter = new CustomAdapter(
        'CustomTest',
        ['custom'],
        async (input) => ({
          id: input.id,
          source: input.source,
          timestamp: input.timestamp,
          format: 'custom',
          data: { custom: true, original: input.data },
          schema: 'custom-v1',
        })
      );

      const input: RawInput = {
        id: 'test-10',
        source: 'custom',
        timestamp: new Date(),
        data: 'test data',
      };

      const normalized = await adapter.normalize(input);
      expect(normalized.format).toBe('custom');
      expect((normalized.data as { custom: boolean }).custom).toBe(true);
    });
  });

  describe('AdapterRegistry', () => {
    it('should register and find adapters', () => {
      const registry = new AdapterRegistry();
      const input: RawInput = {
        id: 'test-11',
        source: 'text',
        timestamp: new Date(),
        data: 'test',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter).toBeTruthy();
      expect(adapter?.name).toBe('TextAdapter');
    });

    it('should return null for unsupported source', () => {
      const registry = new AdapterRegistry();
      registry.clear();
      
      const input: RawInput = {
        id: 'test-12',
        source: 'unknown',
        timestamp: new Date(),
        data: 'test',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter).toBeNull();
    });

    it('should register custom adapter', () => {
      const registry = new AdapterRegistry();
      const customAdapter = new CustomAdapter('Custom', ['custom'], async (input) => ({
        id: input.id,
        source: input.source,
        timestamp: input.timestamp,
        format: 'custom',
        data: input.data,
      }));

      registry.register(customAdapter);

      const input: RawInput = {
        id: 'test-13',
        source: 'custom',
        timestamp: new Date(),
        data: 'test',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter?.name).toBe('Custom');
    });
  });

  describe('ImageAdapter', () => {
    it('should normalize image input with content', async () => {
      const adapter = new ImageAdapter();
      const input: RawInput = {
        id: 'test-14',
        source: 'image',
        timestamp: new Date(),
        data: {
          content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
          format: 'png',
          width: 800,
          height: 600,
          size: 102400,
        },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('image');
      expect(normalized.schema).toBe('image-v1');
      const data = normalized.data as ImageData;
      expect(data.content).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...');
      expect(data.format).toBe('png');
      expect(data.dimensions).toEqual({ width: 800, height: 600 });
      expect(data.size).toBe(102400);
    });

    it('should normalize image input with URL', async () => {
      const adapter = new ImageAdapter();
      const input: RawInput = {
        id: 'test-15',
        source: 'photo',
        timestamp: new Date(),
        data: {
          url: 'https://example.com/image.jpg',
          format: 'jpeg',
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as ImageData;
      expect(data.content).toBe('https://example.com/image.jpg');
      expect(data.format).toBe('jpeg');
    });

    it('should detect format from data URL', async () => {
      const adapter = new ImageAdapter();
      const input: RawInput = {
        id: 'test-16',
        source: 'image',
        timestamp: new Date(),
        data: {
          content: 'data:image/gif;base64,R0lGOD...',
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as ImageData;
      expect(data.format).toBe('gif');
    });

    it('should handle string content directly', async () => {
      const adapter = new ImageAdapter();
      const input: RawInput = {
        id: 'test-17',
        source: 'image',
        timestamp: new Date(),
        data: 'https://example.com/photo.webp',
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as ImageData;
      expect(data.content).toBe('https://example.com/photo.webp');
      expect(data.format).toBe('webp');
    });

    it('should throw error when content is missing', async () => {
      const adapter = new ImageAdapter();
      const input: RawInput = {
        id: 'test-18',
        source: 'image',
        timestamp: new Date(),
        data: {},
      };

      await expect(adapter.normalize(input)).rejects.toThrow('Image content or URL is required');
    });

    it('should handle supported sources', () => {
      const adapter = new ImageAdapter();
      expect(adapter.canHandle({ id: '1', source: 'image', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'photo', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'picture', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'screenshot', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'text', timestamp: new Date(), data: '' })).toBe(false);
    });
  });

  describe('AudioAdapter', () => {
    it('should normalize audio input with full metadata', async () => {
      const adapter = new AudioAdapter();
      const input: RawInput = {
        id: 'test-19',
        source: 'audio',
        timestamp: new Date(),
        data: {
          content: 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0U...',
          format: 'mp3',
          duration: 180.5,
          sampleRate: 44100,
          channels: 2,
          bitrate: 320,
          title: 'Test Song',
          artist: 'Test Artist',
        },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('audio');
      expect(normalized.schema).toBe('audio-v1');
      const data = normalized.data as AudioData;
      expect(data.content).toBe('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0U...');
      expect(data.format).toBe('mp3');
      expect(data.duration).toBe(180.5);
      expect(data.sampleRate).toBe(44100);
      expect(data.channels).toBe(2);
      expect(data.bitrate).toBe(320);
      expect(data.metadata?.title).toBe('Test Song');
      expect(data.metadata?.artist).toBe('Test Artist');
    });

    it('should normalize audio input with URL', async () => {
      const adapter = new AudioAdapter();
      const input: RawInput = {
        id: 'test-20',
        source: 'sound',
        timestamp: new Date(),
        data: {
          url: 'https://example.com/audio.wav',
          format: 'wav',
          duration: 60,
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as AudioData;
      expect(data.content).toBe('https://example.com/audio.wav');
      expect(data.format).toBe('wav');
      expect(data.duration).toBe(60);
    });

    it('should detect format from data URL', async () => {
      const adapter = new AudioAdapter();
      const input: RawInput = {
        id: 'test-21',
        source: 'audio',
        timestamp: new Date(),
        data: {
          content: 'data:audio/ogg;base64,T2dnUw...',
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as AudioData;
      expect(data.format).toBe('ogg');
    });

    it('should handle string content with file extension', async () => {
      const adapter = new AudioAdapter();
      const input: RawInput = {
        id: 'test-22',
        source: 'audio',
        timestamp: new Date(),
        data: 'https://example.com/voice.flac',
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as AudioData;
      expect(data.content).toBe('https://example.com/voice.flac');
      expect(data.format).toBe('flac');
    });

    it('should throw error when content is missing', async () => {
      const adapter = new AudioAdapter();
      const input: RawInput = {
        id: 'test-23',
        source: 'audio',
        timestamp: new Date(),
        data: {},
      };

      await expect(adapter.normalize(input)).rejects.toThrow('Audio content or URL is required');
    });

    it('should handle supported sources', () => {
      const adapter = new AudioAdapter();
      expect(adapter.canHandle({ id: '1', source: 'audio', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'sound', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'music', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'voice', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'speech', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'text', timestamp: new Date(), data: '' })).toBe(false);
    });
  });

  describe('VideoAdapter', () => {
    it('should normalize video input with full metadata', async () => {
      const adapter = new VideoAdapter();
      const input: RawInput = {
        id: 'test-24',
        source: 'video',
        timestamp: new Date(),
        data: {
          content: 'data:video/mp4;base64,AAAAIGZ0eXBpc29t...',
          format: 'mp4',
          duration: 300.25,
          width: 1920,
          height: 1080,
          fps: 30,
          bitrate: 5000,
          codec: 'h264',
          hasAudio: true,
          audioCodec: 'aac',
        },
      };

      const normalized = await adapter.normalize(input);

      expect(normalized.format).toBe('video');
      expect(normalized.schema).toBe('video-v1');
      const data = normalized.data as VideoData;
      expect(data.content).toBe('data:video/mp4;base64,AAAAIGZ0eXBpc29t...');
      expect(data.format).toBe('mp4');
      expect(data.duration).toBe(300.25);
      expect(data.resolution).toEqual({ width: 1920, height: 1080 });
      expect(data.fps).toBe(30);
      expect(data.bitrate).toBe(5000);
      expect(data.codec).toBe('h264');
      expect(data.metadata?.hasAudio).toBe(true);
      expect(data.metadata?.audioCodec).toBe('aac');
    });

    it('should normalize video input with URL', async () => {
      const adapter = new VideoAdapter();
      const input: RawInput = {
        id: 'test-25',
        source: 'movie',
        timestamp: new Date(),
        data: {
          url: 'https://example.com/video.webm',
          format: 'webm',
          duration: 120,
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as VideoData;
      expect(data.content).toBe('https://example.com/video.webm');
      expect(data.format).toBe('webm');
      expect(data.duration).toBe(120);
    });

    it('should detect format from data URL', async () => {
      const adapter = new VideoAdapter();
      const input: RawInput = {
        id: 'test-26',
        source: 'video',
        timestamp: new Date(),
        data: {
          content: 'data:video/webm;base64,GkXfo...',
        },
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as VideoData;
      expect(data.format).toBe('webm');
    });

    it('should handle string content with file extension', async () => {
      const adapter = new VideoAdapter();
      const input: RawInput = {
        id: 'test-27',
        source: 'video',
        timestamp: new Date(),
        data: 'https://example.com/clip.avi',
      };

      const normalized = await adapter.normalize(input);
      const data = normalized.data as VideoData;
      expect(data.content).toBe('https://example.com/clip.avi');
      expect(data.format).toBe('avi');
    });

    it('should throw error when content is missing', async () => {
      const adapter = new VideoAdapter();
      const input: RawInput = {
        id: 'test-28',
        source: 'video',
        timestamp: new Date(),
        data: {},
      };

      await expect(adapter.normalize(input)).rejects.toThrow('Video content or URL is required');
    });

    it('should handle supported sources', () => {
      const adapter = new VideoAdapter();
      expect(adapter.canHandle({ id: '1', source: 'video', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'movie', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'clip', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'recording', timestamp: new Date(), data: '' })).toBe(true);
      expect(adapter.canHandle({ id: '1', source: 'text', timestamp: new Date(), data: '' })).toBe(false);
    });
  });

  describe('AdapterRegistry with Multimodal', () => {
    it('should register multimodal adapters by default', () => {
      const registry = new AdapterRegistry();
      const adapters = registry.getAdapters();
      
      const adapterNames = adapters.map(a => a.name);
      expect(adapterNames).toContain('TextAdapter');
      expect(adapterNames).toContain('JsonAdapter');
      expect(adapterNames).toContain('EventAdapter');
      expect(adapterNames).toContain('SensorAdapter');
      expect(adapterNames).toContain('ImageAdapter');
      expect(adapterNames).toContain('AudioAdapter');
      expect(adapterNames).toContain('VideoAdapter');
    });

    it('should find ImageAdapter for image source', () => {
      const registry = new AdapterRegistry();
      const input: RawInput = {
        id: 'test-29',
        source: 'image',
        timestamp: new Date(),
        data: 'https://example.com/image.png',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter?.name).toBe('ImageAdapter');
    });

    it('should find AudioAdapter for audio source', () => {
      const registry = new AdapterRegistry();
      const input: RawInput = {
        id: 'test-30',
        source: 'audio',
        timestamp: new Date(),
        data: 'https://example.com/audio.mp3',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter?.name).toBe('AudioAdapter');
    });

    it('should find VideoAdapter for video source', () => {
      const registry = new AdapterRegistry();
      const input: RawInput = {
        id: 'test-31',
        source: 'video',
        timestamp: new Date(),
        data: 'https://example.com/video.mp4',
      };

      const adapter = registry.findAdapter(input);
      expect(adapter?.name).toBe('VideoAdapter');
    });
  });
});
