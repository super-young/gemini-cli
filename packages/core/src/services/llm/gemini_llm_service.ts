/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
  UsageMetadata as SDKUsageMetadata,
  GenerateContentResponseUsageMetadata, // For ApiResponseEvent
  // GenerateContentResponsePart, // Not a top-level export
  // StreamRes, // Let type inference handle resultStream type
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
// import { retryWithBackoff } from '../../utils/retry.js'; // Not used directly in current methods
// import { isFunctionResponse } from '../../utils/messageInspectors.js'; // Not used
// import { AuthType } from '../../core/contentGenerator.js'; // Not used
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
  private genAI: GoogleGenAI;
  private history: Content[] = []; // Manages conversation history for the session
  // private modelName: string; // Model will be specified in each request to ai.models

  constructor(
    private readonly config: Config, // Still needed for logging, other configs potentially
    private readonly authService: GeminiAuthService,
    private readonly defaultGenerationConfig: GenerateContentConfig = {}
  ) {
    const apiKey = this.authService.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is not available. Cannot initialize GeminiLLMService.');
    }
    this.genAI = new GoogleGenAI({ apiKey });
    // this.modelName = this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL; // Store if needed for default
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
    usageMetadata?: GenerateContentResponseUsageMetadata | undefined,
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
    const userContentParts = mapToGeminiContent(params.message)[0].parts; // Get parts from the new message
    const currentHistory = [...this.history]; // Current history before adding new user message
    const requestContents: Content[] = [...currentHistory, { role: 'user', parts: userContentParts }];
    const modelForThisRequest = this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;

    this._logApiRequest(requestContents, modelForThisRequest);
    const startTime = Date.now();

    try {
      // Define the request structure inline based on SDK examples
      // as GenerateContentRequest type import was problematic.
      const request = {
        model: modelForThisRequest,
        contents: requestContents,
        generationConfig: { ...this.defaultGenerationConfig, ...params.config },
        // tools: ...,
        // safetySettings: ...,
      };

      const result = await this.genAI.models.generateContent(request);
      // result is directly GenerateContentResponse, no .response property needed after this call.
      const response = result; // Adjusted based on ai.models.generateContent typical return

      const durationMs = Date.now() - startTime;
      // Ensure usageMetadata is correctly typed or cast if necessary for _logApiResponse
      // const meta: SDKUsageMetadata | undefined = response.usageMetadata;
      this._logApiResponse(
        durationMs,
        response.usageMetadata, // No cast needed if types align
        getStructuredResponse(response)
      );

      // Update history
      this.history.push({ role: 'user', parts: userContentParts });
      if (response.candidates?.[0]?.content) {
        this.history.push(response.candidates[0].content);
      } else {
        this.history.push({ role: 'model', parts: [] }); // Safety block or empty response
      }

      return {
        text: () => response.text || '', // Use .text getter
        parts: response.candidates?.[0]?.content?.parts, // Correct mapping for parts
        candidates: response.candidates, // Assign raw candidates
        usageMetadata: response.usageMetadata as SDKUsageMetadata,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error); // Log with instance's modelName
      throw error; // Rethrow or map to a generic error type
    }
  }

  async *sendMessageStream(params: SendMessageParams): AsyncGenerator<ResponseMessageChunk> {
    const userContent = mapToGeminiContent(params.message)[0];
    const userContentParts = mapToGeminiContent(params.message)[0].parts;
    const currentHistory = [...this.history];
    const requestContents: Content[] = [...currentHistory, { role: 'user', parts: userContentParts }];
    const modelForThisRequest = this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;

    this._logApiRequest(requestContents, modelForThisRequest);
    const startTime = Date.now();

    try {
      // Define the request structure inline
      const request = {
        model: modelForThisRequest,
        contents: requestContents,
        generationConfig: { ...this.defaultGenerationConfig, ...params.config },
        // tools: ...,
        // safetySettings: ...,
      };

      const stream = await this.genAI.models.generateContentStream(request); // stream is the AsyncGenerator

      const collectedParts: Part[] = [];
      let lastChunk: any; // Let type be inferred for now, or will be GenerateContentResponsePart

      for await (const chunk of stream) {
        lastChunk = chunk;
        if (chunk.candidates?.[0]?.content?.parts) {
          collectedParts.push(...chunk.candidates[0].content.parts);
        }
        // Debugging chunk.text()
        // const textFn = chunk.text; // text is a function, so this would assign the function itself
        // const textVal = typeof chunk.text === 'function' ? chunk.text() : ''; // Check before calling
        // Restore yield
        yield {
          text: () => ((chunk as any).text && typeof (chunk as any).text === 'function' ? (chunk as any).text() : (chunk as any).text || ''),
          parts: (chunk as any).candidates?.[0]?.content?.parts,
          candidates: (chunk as any).candidates,
          usageMetadata: (chunk as any).usageMetadata as SDKUsageMetadata | undefined,
        };
      }

      // Assuming the last chunk might contain the aggregated usage metadata
      const finalUsageMetadata = (lastChunk as any)?.usageMetadata;

      const durationMs = Date.now() - startTime;
      const fullResponseText = getStructuredResponseFromParts(collectedParts);

      this._logApiResponse(
        durationMs,
        finalUsageMetadata, // No cast needed if types align
        fullResponseText,
      );

      // Update history based on collected parts; model's full response content is built from chunks
      this.history.push({ role: 'user', parts: userContentParts });
      // Create a representative 'model' content from all collected parts for history
      if (collectedParts.length > 0) {
          // We need to construct a Content object for the history.
          // The lastChunk.candidates[0].content would be ideal if it represents the full message.
          // If not, we use the collected parts.
          // For simplicity, if lastChunk and its content exist, use that. Otherwise, build from parts.
          if (lastChunk?.candidates?.[0]?.content) {
            this.history.push(lastChunk.candidates[0].content);
          } else if (collectedParts.length > 0) {
            this.history.push({role: 'model', parts: collectedParts});
          } else {
            this.history.push({ role: 'model', parts: [] });
          }
      } else {
        this.history.push({ role: 'model', parts: [] }); // If no parts, still add empty model response
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      throw error;
    }
  }

  // TODO: Add methods for managing history if needed (e.g., clearHistory, getHistory)
  // These would be specific to this service's stateful nature if we keep history here.
  // Alternatively, history could be managed by ContentGenerator and passed in each call.
}
