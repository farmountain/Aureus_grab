/**
 * Runtime Adapters Module
 * 
 * Provides runtime adapter interfaces and implementations for deploying agents
 * across different platforms (robotics, mobile, desktop, smart-glasses, etc.)
 */

// Export types
export * from './types';

// Export adapters
export * from './robotics-runtime-adapter';
export * from './mobile-desktop-runtime-adapter';
export * from './smart-glasses-runtime-adapter';

// Export registry
export * from './registry';
