import { ApiKeyAuthService } from './api_key_auth_service.js';
import { describe, it, expect } from 'vitest';

describe('ApiKeyAuthService', () => {
  it('should throw an error if API key is not provided in constructor', () => {
    expect(() => new ApiKeyAuthService('')).toThrow('API key must be provided for ApiKeyAuthService.');
    expect(() => new ApiKeyAuthService(null as any)).toThrow('API key must be provided for ApiKeyAuthService.');
    expect(() => new ApiKeyAuthService(undefined as any)).toThrow('API key must be provided for ApiKeyAuthService.');
  });

  it('should report as authenticated if API key is provided', async () => {
    const apiKey = 'test-api-key';
    const authService = new ApiKeyAuthService(apiKey);
    expect(await authService.isAuthenticated()).toBe(true);
  });

  it('should return the correct API key via getCredentials', async () => {
    const apiKey = 'test-api-key';
    const authService = new ApiKeyAuthService(apiKey);
    const credentials = await authService.getCredentials();
    expect(credentials.type).toBe('apiKey');
    if (credentials.type === 'apiKey') {
      expect(credentials.apiKey).toBe(apiKey);
    }
  });

  it('should return the correct API key via getApiKey helper', () => {
    const apiKey = 'test-api-key';
    const authService = new ApiKeyAuthService(apiKey);
    expect(authService.getApiKey()).toBe(apiKey);
  });
});
