/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { AuthCredentials, AuthService } from './auth_service.js';

// Environment variable for Gemini API Key
const GEMINI_API_KEY_ENV_VAR = 'GEMINI_API_KEY';

/**
 * Authentication service for Gemini.
 * Handles API key-based authentication for Gemini.
 * TODO: Future enhancements could include OAuth support.
 */
export class GeminiAuthService implements AuthService {
  private apiKey: string | undefined;

  constructor(private readonly config: Config) {
    // Attempt to load API key from environment variable first,
    // then potentially from config if it were stored there (currently it's not directly).
    this.apiKey = process.env[GEMINI_API_KEY_ENV_VAR];

    // If not in env, check if it was passed via config (e.g. for future flexibility)
    // For now, the config object doesn't directly hold the Gemini API key,
    // but this structure allows for it.
    // if (!this.apiKey && this.config.geminiApiKey) {
    //   this.apiKey = this.config.geminiApiKey;
    // }
  }

  async getCredentials(): Promise<AuthCredentials> {
    if (this.apiKey) {
      return { type: 'apiKey', apiKey: this.apiKey };
    }
    // TODO: Enhance to guide user on how to set API key if missing.
    // For now, indicates no auth if key is not found.
    // This behavior might need adjustment depending on how strictly we enforce key presence.
    return { type: 'none' };
  }

  async isAuthenticated(): Promise<boolean> {
    // For API key auth, "authenticated" means an API key is present.
    // Actual validation of the key happens at the time of an API call.
    return !!this.apiKey;
  }

  /**
   * Retrieves the API key directly.
   * This is a helper specific to API key-based auth.
   * @returns The API key string if available, otherwise undefined.
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }
}
