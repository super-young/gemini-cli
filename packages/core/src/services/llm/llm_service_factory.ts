/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { ApiKeyAuthService } from '../auth/api_key_auth_service.js';
import { AuthService } from '../auth/auth_service.js';
import { GeminiAuthService } from '../auth/gemini_auth_service.js';
import { GeminiLLMService } from './gemini_llm_service.js';
import { LLMService } from './llm_service.js';
import { OpenRouterLLMService } from './openrouter_llm_service.js';

/**
 * Factory class for creating LLMService instances.
 * It determines which LLM service and corresponding authentication service to use
 * based on the provided configuration.
 */
export class LLMServiceFactory {
  constructor(private readonly config: Config) {}

  /**
   * Creates and returns an LLMService instance based on the current configuration.
   * @returns An instance of a class that implements the LLMService interface.
   * @throws Error if the configured LLM provider is not supported or if
   *         necessary configuration (like API keys) is missing.
   */
  createLLMService(): LLMService {
    const provider = this.config.llmProvider?.toLowerCase();

    switch (provider) {
      case 'gemini': {
        const geminiAuthService = new GeminiAuthService(this.config);
        // It might be good practice for AuthService to throw if it cannot be initialized,
        // or for the factory to explicitly check isAuthenticated after construction.
        // For now, GeminiLLMService constructor will throw if API key is missing from auth.
        return new GeminiLLMService(this.config, geminiAuthService, this.config.generationConfig);
      }
      case 'openrouter': {
        if (!this.config.openRouterApiKey) {
          throw new Error(
            'OpenRouter API key is not configured. Please set it using --openrouter-api-key or in the config.',
          );
        }
         if (!this.config.getModel()) { // Use getter
            throw new Error(
              'OpenRouter model is not configured. Please set it using --model or in the config.',
            );
        }
        const openRouterAuthService = new ApiKeyAuthService(this.config.openRouterApiKey);
        return new OpenRouterLLMService(this.config, openRouterAuthService);
      }
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}. Supported providers are 'gemini', 'openrouter'.`);
    }
  }

  /**
   * Helper method to create an AuthService instance based on configuration.
   * This might be useful if AuthService needs to be accessed independently.
   * @returns An instance of a class that implements the AuthService interface.
   * @throws Error if the provider or auth configuration is invalid.
   */
  createAuthService(): AuthService {
    const provider = this.config.llmProvider?.toLowerCase();

    switch (provider) {
      case 'gemini':
        return new GeminiAuthService(this.config);
      case 'openrouter':
        if (!this.config.openRouterApiKey) {
          throw new Error('OpenRouter API key is not configured for AuthService creation.');
        }
        return new ApiKeyAuthService(this.config.openRouterApiKey);
      default:
        // Perhaps return a "null" auth service or throw, depending on expected usage.
        throw new Error(`Cannot create AuthService for unsupported LLM provider: ${this.config.llmProvider}`);
    }
  }
}
