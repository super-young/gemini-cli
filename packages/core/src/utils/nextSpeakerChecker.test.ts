/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { Content, GoogleGenAI, Models } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { checkNextSpeaker, NextSpeakerResponse } from './nextSpeakerChecker.js';
import { GeminiChat } from '../core/geminiChat.js';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');
vi.mock('../config/config.js');

import { ContentGenerator } from '../core/contentGenerator.js'; // Import ContentGenerator

// Define mocks for GoogleGenAI and Models instances that will be used across tests
// This mockModelsInstance is for the *old* @google/genai Models type,
// which GeminiChat constructor used to take. We'll replace its usage for GeminiChat.
const mockOldModelsInstance = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

// New mock for the ContentGenerator interface
const mockContentGeneratorForChat = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
} as unknown as ContentGenerator;


const mockGoogleGenAIInstance = {
  // getGenerativeModel is less relevant now if GeminiChat takes ContentGenerator directly
  getGenerativeModel: vi.fn().mockReturnValue(mockOldModelsInstance),
} as unknown as GoogleGenAI;

vi.mock('@google/genai', async () => {
  const actualGenAI =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenAI,
    GoogleGenAI: vi.fn(() => mockGoogleGenAIInstance),
  };
});

describe('checkNextSpeaker', () => {
  let chatInstance: GeminiChat;
  let mockGeminiClient: GeminiClient;
  let mockConfigObject: Config; // Use actual Config type for clarity
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    // Create a more complete mock for Config, similar to other tests
    mockConfigObject = {
      // GeminiChat uses config.getModel(), config.getVertexAI(), config.llmProvider
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getVertexAI: vi.fn().mockReturnValue(false),
      llmProvider: 'gemini',
      // Add other properties/methods if GeminiChat's constructor or methods need them
      // For instance, if retryWithBackoff's authType derivation is complex:
      // getAuthType: vi.fn().mockReturnValue(AuthType.USE_GEMINI) // Or similar
      getSessionId: () => 'test-session-id-nextspeaker',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      // Mock any other methods of Config that GeminiChat might use directly or indirectly
    } as unknown as Config;


    mockGeminiClient = new GeminiClient(mockConfigObject); // GeminiClient needs a Config instance

    // Reset mocks for the new ContentGenerator mock
    vi.mocked(mockContentGeneratorForChat.generateContent).mockReset();
    vi.mocked(mockContentGeneratorForChat.generateContentStream).mockReset();

    // Instantiate GeminiChat with the new mockContentGeneratorForChat
    chatInstance = new GeminiChat(
      mockConfigObject, // Pass the mock Config instance
      mockContentGeneratorForChat, // Pass the ContentGenerator mock
      {}, // empty GenerateContentConfig
      [], // initial history
    );

    // Spy on getHistory for chatInstance
    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if history is empty', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return null if the last speaker was the user', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ] as Content[]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it("should return { next_speaker: 'model' } when model intends to continue", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'I will now do something.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model stated it will do something.',
      next_speaker: 'model',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockGeminiClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it("should return { next_speaker: 'user' } when model asks a question", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'What would you like to do?' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model asked a question.',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it("should return { next_speaker: 'user' } when model makes a statement", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if geminiClient.generateJson throws an error', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockRejectedValue(
      new Error('API Error'),
    );

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if geminiClient.generateJson returns invalid JSON (missing next_speaker)', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'This is incomplete.',
    } as unknown as NextSpeakerResponse); // Type assertion to simulate invalid response

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns a non-string next_speaker', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 123, // Invalid type
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns an invalid next_speaker string value', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'neither', // Invalid enum value
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });
});
