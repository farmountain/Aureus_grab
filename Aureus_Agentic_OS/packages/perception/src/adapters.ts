/**
 * Perception adapters for normalizing raw inputs
 */

import { RawInput, NormalizedInput, PerceptionAdapter, ImageData, AudioData, VideoData } from './types';

/**
 * Base perception adapter implementation
 */
export abstract class BasePerceptionAdapter implements PerceptionAdapter {
  constructor(
    public readonly name: string,
    public readonly supportedSources: string[]
  ) {}

  abstract normalize(input: RawInput): Promise<NormalizedInput>;
  
  canHandle(input: RawInput): boolean {
    return this.supportedSources.includes(input.source) || 
           this.supportedSources.includes('*');
  }
}

/**
 * Text input adapter - normalizes text-based inputs
 */
export class TextAdapter extends BasePerceptionAdapter {
  constructor() {
    super('TextAdapter', ['text', 'string', 'console', 'cli']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    let text: string;
    
    if (typeof input.data === 'string') {
      text = input.data;
    } else if (input.data && typeof input.data === 'object' && 'text' in input.data) {
      text = String((input.data as { text: unknown }).text);
    } else {
      text = String(input.data);
    }

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'text',
      data: {
        text: text.trim(),
        length: text.length,
        wordCount: text.split(/\s+/).length,
      },
      schema: 'text-v1',
      metadata: {
        ...input.metadata,
        originalType: typeof input.data,
      },
    };
  }
}

/**
 * JSON input adapter - normalizes JSON-based inputs
 */
export class JsonAdapter extends BasePerceptionAdapter {
  constructor() {
    super('JsonAdapter', ['json', 'api', 'webhook', 'http']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    let jsonData: unknown;

    if (typeof input.data === 'string') {
      try {
        jsonData = JSON.parse(input.data);
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      jsonData = input.data;
    }

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'json',
      data: jsonData,
      schema: 'json-v1',
      metadata: {
        ...input.metadata,
        keys: jsonData && typeof jsonData === 'object' ? Object.keys(jsonData) : [],
      },
    };
  }
}

/**
 * Event adapter - normalizes event-based inputs
 */
export class EventAdapter extends BasePerceptionAdapter {
  constructor() {
    super('EventAdapter', ['event', 'stream', 'message-queue', 'pubsub']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    const eventData = input.data as {
      type?: string;
      payload?: unknown;
      [key: string]: unknown;
    };

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'event',
      data: {
        eventType: eventData.type || 'unknown',
        payload: eventData.payload || eventData,
        eventMetadata: {
          source: input.source,
          timestamp: input.timestamp.toISOString(),
        },
      },
      schema: 'event-v1',
      metadata: {
        ...input.metadata,
        eventType: eventData.type,
      },
    };
  }
}

/**
 * Sensor adapter - normalizes sensor data inputs
 */
export class SensorAdapter extends BasePerceptionAdapter {
  constructor() {
    super('SensorAdapter', ['sensor', 'iot', 'robotics', 'telemetry']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    const sensorData = input.data as {
      sensorId?: string;
      readings?: Record<string, number>;
      value?: number;
      [key: string]: unknown;
    };

    const readings = sensorData.readings || 
                    (typeof sensorData.value === 'number' ? { value: sensorData.value } : {});

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'sensor',
      data: {
        sensorId: sensorData.sensorId || input.source,
        readings,
        timestamp: input.timestamp.toISOString(),
        unit: sensorData.unit || 'unknown',
      },
      schema: 'sensor-v1',
      metadata: {
        ...input.metadata,
        sensorType: sensorData.type,
        readingCount: Object.keys(readings).length,
      },
    };
  }
}

/**
 * Custom adapter - flexible adapter for custom formats
 */
export class CustomAdapter extends BasePerceptionAdapter {
  constructor(
    name: string,
    supportedSources: string[],
    private normalizer: (input: RawInput) => Promise<NormalizedInput>
  ) {
    super(name, supportedSources);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    return this.normalizer(input);
  }
}

/**
 * Image input adapter - normalizes image-based inputs
 */
export class ImageAdapter extends BasePerceptionAdapter {
  constructor() {
    super('ImageAdapter', ['image', 'photo', 'picture', 'screenshot']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    const imageData = input.data as {
      content?: string;
      url?: string;
      format?: string;
      width?: number;
      height?: number;
      size?: number;
      [key: string]: unknown;
    };

    // Determine content (base64 or URL)
    let content: string;
    if (imageData.content) {
      content = imageData.content;
    } else if (imageData.url) {
      content = imageData.url;
    } else if (typeof input.data === 'string') {
      content = input.data;
    } else {
      throw new Error('Image content or URL is required');
    }

    // Extract format from content or metadata
    let format = imageData.format || 'unknown';
    if (format === 'unknown' && typeof content === 'string') {
      // Try to detect format from data URL or file extension
      if (content.startsWith('data:image/')) {
        const match = content.match(/data:image\/([^;]+)/);
        if (match) format = match[1];
      } else {
        const match = content.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
        if (match) format = match[1].toLowerCase();
      }
    }

    const normalized: ImageData = {
      content,
      format,
    };

    if (imageData.width && imageData.height) {
      normalized.dimensions = {
        width: imageData.width,
        height: imageData.height,
      };
    }

    if (imageData.size) {
      normalized.size = imageData.size;
    }

    // Collect additional metadata
    const metadata: Record<string, unknown> = {};
    if (imageData.colorSpace) metadata.colorSpace = imageData.colorSpace;
    if (imageData.orientation) metadata.orientation = imageData.orientation;
    
    if (Object.keys(metadata).length > 0) {
      normalized.metadata = metadata;
    }

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'image',
      data: normalized,
      schema: 'image-v1',
      metadata: {
        ...input.metadata,
        imageFormat: format,
      },
    };
  }
}

/**
 * Audio input adapter - normalizes audio-based inputs
 */
export class AudioAdapter extends BasePerceptionAdapter {
  constructor() {
    super('AudioAdapter', ['audio', 'sound', 'music', 'voice', 'speech']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    const audioData = input.data as {
      content?: string;
      url?: string;
      format?: string;
      duration?: number;
      sampleRate?: number;
      channels?: number;
      bitrate?: number;
      [key: string]: unknown;
    };

    // Determine content (base64 or URL)
    let content: string;
    if (audioData.content) {
      content = audioData.content;
    } else if (audioData.url) {
      content = audioData.url;
    } else if (typeof input.data === 'string') {
      content = input.data;
    } else {
      throw new Error('Audio content or URL is required');
    }

    // Extract format from content or metadata
    let format = audioData.format || 'unknown';
    if (format === 'unknown' && typeof content === 'string') {
      // Try to detect format from data URL or file extension
      if (content.startsWith('data:audio/')) {
        const match = content.match(/data:audio\/([^;]+)/);
        if (match) format = match[1];
      } else {
        const match = content.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i);
        if (match) format = match[1].toLowerCase();
      }
    }

    const normalized: AudioData = {
      content,
      format,
    };

    if (audioData.duration !== undefined) normalized.duration = audioData.duration;
    if (audioData.sampleRate !== undefined) normalized.sampleRate = audioData.sampleRate;
    if (audioData.channels !== undefined) normalized.channels = audioData.channels;
    if (audioData.bitrate !== undefined) normalized.bitrate = audioData.bitrate;

    // Collect additional metadata
    const metadata: Record<string, unknown> = {};
    if (audioData.title) metadata.title = audioData.title;
    if (audioData.artist) metadata.artist = audioData.artist;
    
    if (Object.keys(metadata).length > 0) {
      normalized.metadata = metadata;
    }

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'audio',
      data: normalized,
      schema: 'audio-v1',
      metadata: {
        ...input.metadata,
        audioFormat: format,
      },
    };
  }
}

/**
 * Video input adapter - normalizes video-based inputs
 */
export class VideoAdapter extends BasePerceptionAdapter {
  constructor() {
    super('VideoAdapter', ['video', 'movie', 'clip', 'recording']);
  }

  async normalize(input: RawInput): Promise<NormalizedInput> {
    const videoData = input.data as {
      content?: string;
      url?: string;
      format?: string;
      duration?: number;
      width?: number;
      height?: number;
      fps?: number;
      bitrate?: number;
      codec?: string;
      [key: string]: unknown;
    };

    // Determine content (base64 or URL)
    let content: string;
    if (videoData.content) {
      content = videoData.content;
    } else if (videoData.url) {
      content = videoData.url;
    } else if (typeof input.data === 'string') {
      content = input.data;
    } else {
      throw new Error('Video content or URL is required');
    }

    // Extract format from content or metadata
    let format = videoData.format || 'unknown';
    if (format === 'unknown' && typeof content === 'string') {
      // Try to detect format from data URL or file extension
      if (content.startsWith('data:video/')) {
        const match = content.match(/data:video\/([^;]+)/);
        if (match) format = match[1];
      } else {
        const match = content.match(/\.(mp4|webm|avi|mov|mkv|flv)$/i);
        if (match) format = match[1].toLowerCase();
      }
    }

    const normalized: VideoData = {
      content,
      format,
    };

    if (videoData.duration !== undefined) normalized.duration = videoData.duration;
    
    if (videoData.width && videoData.height) {
      normalized.resolution = {
        width: videoData.width,
        height: videoData.height,
      };
    }

    if (videoData.fps !== undefined) normalized.fps = videoData.fps;
    if (videoData.bitrate !== undefined) normalized.bitrate = videoData.bitrate;
    if (videoData.codec) normalized.codec = videoData.codec;

    // Collect additional metadata
    const metadata: Record<string, unknown> = {};
    if (videoData.hasAudio !== undefined) metadata.hasAudio = videoData.hasAudio;
    if (videoData.audioCodec) metadata.audioCodec = videoData.audioCodec;
    
    if (Object.keys(metadata).length > 0) {
      normalized.metadata = metadata;
    }

    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'video',
      data: normalized,
      schema: 'video-v1',
      metadata: {
        ...input.metadata,
        videoFormat: format,
      },
    };
  }
}

/**
 * Adapter registry for managing multiple adapters
 */
export class AdapterRegistry {
  private adapters: PerceptionAdapter[] = [];

  constructor() {
    // Register default adapters
    this.register(new TextAdapter());
    this.register(new JsonAdapter());
    this.register(new EventAdapter());
    this.register(new SensorAdapter());
    this.register(new ImageAdapter());
    this.register(new AudioAdapter());
    this.register(new VideoAdapter());
  }

  /**
   * Register a new adapter
   */
  register(adapter: PerceptionAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Find adapter that can handle the input
   */
  findAdapter(input: RawInput): PerceptionAdapter | null {
    return this.adapters.find(adapter => adapter.canHandle(input)) || null;
  }

  /**
   * Get all registered adapters
   */
  getAdapters(): PerceptionAdapter[] {
    return [...this.adapters];
  }

  /**
   * Clear all adapters
   */
  clear(): void {
    this.adapters = [];
  }
}
