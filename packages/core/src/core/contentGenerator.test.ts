/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { createContentGenerator, AuthType } from './contentGenerator.js';
// import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js'; // Old path
// import { GoogleGenAI } from '@google/genai'; // Old path
import { Config, ConfigParameters, LLMProvider } from '../config/config.js';
import { LLMServiceContentGenerator } from './contentGenerator.js'; // Adjust if class is not exported

// vi.mock('../code_assist/codeAssist.js'); // Not testing this path now
// vi.mock('@google/genai'); // LLMService will use actual or its own mocks

// Minimal mock for Config, similar to other new tests
class MockConfig extends Config {
  constructor(params: Partial<ConfigParameters>) {
    super({
      sessionId: 'test-session',
      targetDir: '.',
      cwd: '.',
      model: 'default-model-for-test',
      llmProvider: 'gemini', // Default provider
      debugMode: false,
      ...params,
    } as ConfigParameters);
  }
}

describe('contentGenerator', () => {
  // These tests need complete rewrite for LLMServiceFactory logic.
  // For now, just test that createContentGenerator returns an instance
  // of LLMServiceContentGenerator when a basic valid config is passed.

  it('should create an LLMServiceContentGenerator for gemini provider', async () => {
    const config = new MockConfig({
      llmProvider: 'gemini',
      model: 'gemini-pro',
      // Ensure GEMINI_API_KEY is set for GeminiLLMService constructor if it's not mocked out
    });
    // Mock environment variable if GeminiAuthService relies on it
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key-for-contentgenerator';

    const generator = await createContentGenerator(config);
    expect(generator).toBeInstanceOf(LLMServiceContentGenerator);

    process.env.GEMINI_API_KEY = originalApiKey; // Restore
  });

  it('should create an LLMServiceContentGenerator for openrouter provider', async () => {
    const config = new MockConfig({
      llmProvider: 'openrouter',
      model: 'openrouter/some-model',
      openRouterApiKey: 'test-or-key-for-contentgenerator',
    });
    const generator = await createContentGenerator(config);
    expect(generator).toBeInstanceOf(LLMServiceContentGenerator);
  });

  it('should throw for unsupported provider via factory', async () => {
    const config = new MockConfig({
      llmProvider: 'unknown-provider' as LLMProvider, // Cast to satisfy type, factory will throw
      model: 'any-model',
    });
    await expect(createContentGenerator(config)).rejects.toThrow(/Unsupported LLM provider/);
  });


  // Old tests (commented out, would need significant rework)
  // it('should create a CodeAssistContentGenerator', async () => {
  //   const mockGenerator = {} as unknown;
  //   vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
  //     mockGenerator as never,
  //   );
  //   const generator = await createContentGenerator({ // This is old config shape
  //     model: 'test-model',
  //     authType: AuthType.LOGIN_WITH_GOOGLE_PERSONAL,
  //   });
  //   expect(createCodeAssistContentGenerator).toHaveBeenCalled();
  //   expect(generator).toBe(mockGenerator);
  // });

  // it('should create a GoogleGenAI content generator', async () => {
  //   const mockGenerator = {
  //     models: {},
  //   } as unknown;
  //   vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
  //   const generator = await createContentGenerator({ // This is old config shape
  //     model: 'test-model',
  //     apiKey: 'test-api-key',
  //     authType: AuthType.USE_GEMINI,
  //   });
  //   expect(GoogleGenAI).toHaveBeenCalledWith({
  //     apiKey: 'test-api-key',
  //     vertexai: undefined,
  //     httpOptions: { // This block was causing a syntax issue when commented partially
  //       headers: {
  //         'User-Agent': expect.any(String),
  //       },
  //     },
  //   });
  //   expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  // });
});
