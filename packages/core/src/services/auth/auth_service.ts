/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents the credentials that an AuthService can provide.
 * This is a union type to accommodate different types of credentials.
 */
export type AuthCredentials =
  | { type: 'apiKey'; apiKey: string }
  | { type: 'oauthToken'; token: string }
  // Future credential types can be added here
  | { type: 'none' }; // For services that don't require auth

/**
 * Interface for an Authentication Service.
 * This defines a standard way to obtain and manage authentication
 * credentials for different LLM providers or other services.
 */
export interface AuthService {
  /**
   * Retrieves the authentication credentials.
   * This might involve fetching a token, reading an API key from a config, etc.
   * @returns A promise that resolves to the AuthCredentials.
   */
  getCredentials(): Promise<AuthCredentials>;

  /**
   * Checks if the user is currently authenticated or if credentials are valid.
   * The exact meaning can depend on the authentication method.
   * For API keys, it might just check if a key is present.
   * For OAuth, it might check token validity.
   * @returns A promise that resolves to true if authenticated/credentials are valid, false otherwise.
   */
  isAuthenticated(): Promise<boolean>;
}
