import { LLMServiceFactory } from './llm_service_factory.js';
import { Config, ConfigParameters } from '../../config/config.js';
import { GeminiLLMService } from './gemini_llm_service.js';
import { OpenRouterLLMService } from './openrouter_llm_service.js';
import { GeminiAuthService } from '../auth/gemini_auth_service.js';
import { ApiKeyAuthService } from '../auth/api_key_auth_service.js';
import { type GenerationConfig } from '@google/genai'; // Use GenerationConfig
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

// Minimal mock for Config
class MockConfig extends Config {
  constructor(params: Partial<ConfigParameters>) { // Accept Partial for easier test setup
    super({
      // Provide all required ConfigParameters fields with defaults
      sessionId: 'test-session',
      targetDir: '.',
      cwd: '.',
      model: 'default-model-for-test', // Default model
      llmProvider: 'gemini', // Default provider
      debugMode: false, // Add default for debugMode
      // Ensure other potentially required fields by Config constructor have defaults
      // or are covered by params.
      ...params, // User-provided params override defaults
    } as ConfigParameters); // Cast to full ConfigParameters as super expects it
  }
}

describe('LLMServiceFactory', () => {
  // No longer need baseConfigParams, setup directly in tests or MockConfig defaults
  const defaultGenerationConfig = {} as GenerationConfig;

  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env after all tests
    process.env = originalEnv;
  });

  describe('createLLMService', () => {
    it('should create GeminiLLMService for gemini provider', () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      const config = new MockConfig({
        llmProvider: 'gemini',
        model: 'gemini-pro',
        generationConfig: defaultGenerationConfig,
      });
      const factory = new LLMServiceFactory(config);
      const service = factory.createLLMService();
      expect(service).toBeInstanceOf(GeminiLLMService);
    });

    it('should create OpenRouterLLMService for openrouter provider with API key and model', () => {
      const config = new MockConfig({
        llmProvider: 'openrouter',
        openRouterApiKey: 'test-or-key',
        model: 'openrouter/test-model',
        generationConfig: defaultGenerationConfig,
      });
      const factory = new LLMServiceFactory(config);
      const service = factory.createLLMService();
      expect(service).toBeInstanceOf(OpenRouterLLMService);
    });

    it('should throw if openrouter provider is missing API key', () => {
      const config = new MockConfig({
        llmProvider: 'openrouter',
        model: 'openrouter/test-model',
        // openRouterApiKey is missing
        generationConfig: defaultGenerationConfig,
      });
      const factory = new LLMServiceFactory(config);
      expect(() => factory.createLLMService()).toThrow(/OpenRouter API key is not configured/);
    });

    it('should throw if openrouter provider is "missing" model (e.g. empty string from getModel())', () => {
      // To test this, we need config.getModel() to return a falsy value like ""
      // The MockConfig currently ensures a default model string.
      // We can create a specific mock for this test that makes getModel() return ""
      const config = new MockConfig({
        llmProvider: 'openrouter',
        openRouterApiKey: 'test-or-key',
        model: '', // Simulate empty model string
        generationConfig: defaultGenerationConfig,
      });
      // This relies on the factory using config.getModel() and that returning ""
      // and the Config class allowing model to be "" and getModel() reflecting that.
      // The Config class `model` is `string`, not `string | undefined`.
      // The factory's check `if (!this.config.getModel())` would catch `""`.
      const factory = new LLMServiceFactory(config);
      expect(() => factory.createLLMService()).toThrow(/OpenRouter model is not configured/);
    });

    it('should throw for an unsupported provider', () => {
      const config = new MockConfig({
        llmProvider: 'unsupported-provider' as any,
        generationConfig: defaultGenerationConfig,
      });
      const factory = new LLMServiceFactory(config);
      expect(() => factory.createLLMService()).toThrow(/Unsupported LLM provider: unsupported-provider/);
    });
  });

  describe('createAuthService', () => {
    it('should create GeminiAuthService for gemini provider', () => {
      const config = new MockConfig({ llmProvider: 'gemini' });
      const factory = new LLMServiceFactory(config);
      const authService = factory.createAuthService();
      expect(authService).toBeInstanceOf(GeminiAuthService);
    });

    it('should create ApiKeyAuthService for openrouter provider with API key', () => {
      const config = new MockConfig({
        llmProvider: 'openrouter',
        openRouterApiKey: 'test-or-key',
      });
      const factory = new LLMServiceFactory(config);
      const authService = factory.createAuthService();
      expect(authService).toBeInstanceOf(ApiKeyAuthService);
    });

    it('should throw if openrouter provider is missing API key for AuthService creation', () => {
      const config = new MockConfig({
        llmProvider: 'openrouter',
        // openRouterApiKey is missing
      });
      const factory = new LLMServiceFactory(config);
      expect(() => factory.createAuthService()).toThrow(/OpenRouter API key is not configured for AuthService creation/);
    });

    it('should throw for an unsupported provider for AuthService creation', () => {
      const config = new MockConfig({
        llmProvider: 'unsupported-provider' as any,
      });
      const factory = new LLMServiceFactory(config);
      expect(() => factory.createAuthService()).toThrow(/Cannot create AuthService for unsupported LLM provider: unsupported-provider/);
    });
  });
});
