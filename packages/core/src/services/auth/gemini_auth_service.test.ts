import { GeminiAuthService } from './gemini_auth_service.js';
import { Config, ConfigParameters } from '../../config/config.js';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

// Minimal mock for Config
class MockConfig extends Config {
  constructor(params: Partial<ConfigParameters> = {}) {
    super({
      sessionId: 'test-session',
      targetDir: '.',
      cwd: '.',
      model: 'gemini-pro', // Default model for mock
      debugMode: false, // Add default for debugMode
      ...params,
    } as ConfigParameters); // Cast needed due to partial params
  }
}

describe('GeminiAuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Important: Reset process.env before each test to clear GEMINI_API_KEY
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    // Restore original process.env after all tests
    process.env = originalEnv;
  });

  it('should report as not authenticated if GEMINI_API_KEY is not set', async () => {
    const config = new MockConfig();
    const authService = new GeminiAuthService(config);
    expect(await authService.isAuthenticated()).toBe(false);
    const credentials = await authService.getCredentials();
    expect(credentials.type).toBe('none');
    expect(authService.getApiKey()).toBeUndefined();
  });

  it('should report as authenticated if GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const config = new MockConfig();
    const authService = new GeminiAuthService(config);
    expect(await authService.isAuthenticated()).toBe(true);
    const credentials = await authService.getCredentials();
    expect(credentials.type).toBe('apiKey');
    if (credentials.type === 'apiKey') {
      expect(credentials.apiKey).toBe('test-gemini-key');
    }
    expect(authService.getApiKey()).toBe('test-gemini-key');
  });

  it('should use GEMINI_API_KEY from environment variables', async () => {
    process.env.GEMINI_API_KEY = 'env-api-key';
    const config = new MockConfig(); // Config doesn't provide the key in this setup
    const authService = new GeminiAuthService(config);
    const credentials = await authService.getCredentials();
    expect(credentials.type).toBe('apiKey');
    if (credentials.type === 'apiKey') {
      expect(credentials.apiKey).toBe('env-api-key');
    }
    expect(authService.getApiKey()).toBe('env-api-key');
  });

  // Example for future test if API key could come from config
  // it('should prioritize environment variable over config for API key', async () => {
  //   process.env.GEMINI_API_KEY = 'env-key-priority';
  //   const config = new MockConfig({ geminiApiKey: 'config-key-lower-priority' });
  //   const authService = new GeminiAuthService(config);
  //   const credentials = await authService.getCredentials();
  //   if (credentials.type === 'apiKey') {
  //     expect(credentials.apiKey).toBe('env-key-priority');
  //   }
  // });
});
