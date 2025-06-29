/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthCredentials, AuthService } from './auth_service.js';

/**
 * A generic authentication service for providers that use a simple API key.
 */
export class ApiKeyAuthService implements AuthService {
  private apiKey: string;

  /**
   * @param apiKey The API key to be used for authentication.
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      // Considered throwing an error, but the factory might decide
      // to instantiate this even if a key isn't immediately available,
      // relying on `isAuthenticated` or explicit checks later.
      // For OpenRouter, the key is essential.
      // Let's make it strict here.
      throw new Error('API key must be provided for ApiKeyAuthService.');
    }
    this.apiKey = apiKey;
  }

  async getCredentials(): Promise<AuthCredentials> {
    return { type: 'apiKey', apiKey: this.apiKey };
  }

  async isAuthenticated(): Promise<boolean> {
    // For this service, "authenticated" simply means an API key was provided at construction.
    // The validity of the key is only checked when an actual API call is made.
    return !!this.apiKey;
  }

  /**
   * Retrieves the API key directly.
   * @returns The API key string.
   */
  getApiKey(): string {
    return this.apiKey;
  }
}
