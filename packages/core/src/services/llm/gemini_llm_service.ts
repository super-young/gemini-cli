/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  GenerativeModel,
  GoogleGenerativeAI,
  Part,
} from '@google/genai';
import { Config } from '../../config/config.js';
import { GeminiAuthService } from '../auth/gemini_auth_service.js';
import {
  LLMService,
  ResponseMessage,
  ResponseMessageChunk,
  SendMessageParams,
} from './llm_service.js';
import { createUserContent } from '../../utils/geminiContent.js'; // Assuming a utility similar to @google/genai's internal
import { retryWithBackoff } from '../../utils/retry.js';
import { isFunctionResponse } from '../../utils/messageInspectors.js'; // May need adjustment or be moved
import { AuthType } from '../../core/contentGenerator.js'; // This might need to be refactored or made generic
import {
  logApiRequest,
  logApiResponse,
  logApiError
} from '../../telemetry/loggers.js'; // Assuming these can be reused/adapted
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent
} from '../../telemetry/types.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../../config/models.js'; // Re-evaluate if this is needed here or in factory
import { getStructuredResponse, getStructuredResponseFromParts } from '../../utils/generateContentResponseUtilities.js';


// Helper function to map LLMService SendMessageParams to Gemini's Content array
// This is a simplified version and might need to be more robust
function mapToGeminiContent(message: string | Part | (string | Part)[]): Content[] {
  if (Array.isArray(message)) {
    // This simplistic mapping assumes an array of parts forms a single user message.
    // More complex scenarios (e.g., mixed roles in array) are not handled here.
    return [createUserContent(message)];
  }
  return [createUserContent(message)];
}


/**
 * LLMService implementation for Google's Gemini models.
 */
export class GeminiLLMService implements LLMService {
  private generativeModel: GenerativeModel;
  private history: Content[] = []; // Manages conversation history for the session

  constructor(
    private readonly config: Config,
    private readonly authService: GeminiAuthService,
    // generationConfig can be part of config or passed separately
    private readonly generationConfig: GenerateContentConfig = {}
  ) {
    const apiKey = this.authService.getApiKey();
    if (!apiKey) {
      // This service should ideally not be instantiated if auth fails.
      // The factory should handle this.
      throw new Error('Gemini API key is not available. Cannot initialize GeminiLLMService.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.generativeModel = genAI.getGenerativeModel({
      model: this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL,
      // Safety settings and other fixed generation configs could be set here from global config
    });
  }

  // Placeholder for logging - adapt from GeminiChat
  private _getRequestTextFromContents(contents: Content[]): string {
    return contents
      .flatMap((content) => content.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('');
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(this.config, new ApiRequestEvent(model, requestText));
  }

  private async _logApiResponse(
    durationMs: number,
    usageMetadata?: unknown, // Define a more specific type later
    responseText?: string,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(durationMs: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        errorType,
      ),
    );
  }

  // TODO: Implement Flash fallback logic similar to GeminiChat if needed.
  // This might be better handled in the factory or a higher-level component
  // if it's a general strategy.

  async sendMessage(params: SendMessageParams): Promise<ResponseMessage> {
    // 1. Construct chat history + new message
    // For now, this service will manage its own history.
    // More sophisticated history management might be needed for multi-turn conversations
    // that span multiple service instances (if that's a use case).
    const userContent = mapToGeminiContent(params.message)[0]; // Assuming mapToGeminiContent returns a single user message
    const requestContents = [...this.history, userContent];

    this._logApiRequest(requestContents, this.config.getModel());
    const startTime = Date.now();

    try {
      const chat = this.generativeModel.startChat({
        history: this.history, // Provide existing history
        generationConfig: { ...this.generationConfig, ...params.config }
      });

      const result = await chat.sendMessage(userContent.parts); // sendMessage in GenAI SDK takes Parts
      const response = result.response;

      const durationMs = Date.now() - startTime;
      this._logApiResponse(
        durationMs,
        response.usageMetadata,
        getStructuredResponse(response)
      );

      // Update history
      this.history.push(userContent);
      if (response.candidates?.[0]?.content) {
        this.history.push(response.candidates[0].content);
      } else {
        // Handle cases where there's no content (e.g. safety block)
        // This matches GeminiChat's behavior of adding an empty model part.
         this.history.push({ role: 'model', parts: [] });
      }

      // Map Gemini's GenerateContentResponse to our generic ResponseMessage
      return {
        text: () => response.text?.() || '',
        parts: response.candidates?.[0]?.content?.parts,
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
        // automaticFunctionCallingHistory: response.automaticFunctionCallingHistory // If applicable
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      throw error; // Rethrow or map to a generic error type
    }
  }

  async *sendMessageStream(params: SendMessageParams): AsyncGenerator<ResponseMessageChunk> {
    const userContent = mapToGeminiContent(params.message)[0];
    const requestContents = [...this.history, userContent];

    this._logApiRequest(requestContents, this.config.getModel());
    const startTime = Date.now();

    try {
      const chat = this.generativeModel.startChat({
        history: this.history,
        generationConfig: { ...this.generationConfig, ...params.config }
      });

      const result = await chat.sendMessageStream(userContent.parts);

      const streamHistoryUpdate: Content[] = [userContent];
      const allOutputParts: Part[] = [];

      for await (const chunk of result.stream) {
        const chunkDurationMs = Date.now() - startTime; // Log per chunk or final?
        // Not logging per chunk for now to avoid excessive logs.

        if (chunk.candidates?.[0]?.content?.parts) {
           allOutputParts.push(...chunk.candidates[0].content.parts);
        }

        yield {
          text: () => chunk.text?.() || '',
          parts: chunk.candidates?.[0]?.content?.parts,
          candidates: chunk.candidates,
          usageMetadata: chunk.usageMetadata, // Might only be in final chunk
        };
      }

      // After stream is complete, log the full response and update history
      const durationMs = Date.now() - startTime;
      const fullResponseText = getStructuredResponseFromParts(allOutputParts);
      // TODO: How to get final UsageMetadata for stream? The SDK might provide it on the `result.response` promise.
      const finalResponse = await result.response; // This promise resolves when stream is done.

      this._logApiResponse(
        durationMs,
        finalResponse.usageMetadata,
        fullResponseText,
      );

      // Update history
      this.history.push(userContent);
      if (finalResponse.candidates?.[0]?.content) {
        this.history.push(finalResponse.candidates[0].content);
      } else {
         this.history.push({ role: 'model', parts: [] });
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      throw error; // Rethrow or map
    }
  }

  // TODO: Add methods for managing history if needed (e.g., clearHistory, getHistory)
  // These would be specific to this service's stateful nature if we keep history here.
  // Alternatively, history could be managed by ContentGenerator and passed in each call.
}
