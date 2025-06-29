/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { ApiKeyAuthService } from '../auth/api_key_auth_service.js';
import {
  LLMService,
  ResponseMessage,
  ResponseMessageChunk,
  SendMessageParams,
} from './llm_service.js';
import { fetch, Agent, RequestInfo, RequestInit, Response } from 'undici';
import { Part } from '@google/genai'; // Using this for Part type, might need a generic one
import { streamToJson } from '../../utils/streamToJson.js'; // Utility to parse NDJSON stream
import {
  logApiRequest,
  logApiResponse,
  logApiError
} from '../../telemetry/loggers.js';
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent
} from '../../telemetry/types.js';


const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// TODO: Define more specific OpenRouter request/response types if needed
interface OpenRouterRequestBody {
  model: string;
  messages: { role: string; content: string }[]; // Simplified, OpenRouter might support more complex messages
  stream?: boolean;
  // Other OpenRouter parameters (temperature, max_tokens, etc.) can be added
  temperature?: number;
  max_tokens?: number;
}

// Based on OpenRouter docs and typical OpenAI-compatible responses
interface OpenRouterResponseChoice {
  message?: {
    role: string;
    content: string | null;
    // Could also include function_call, tool_calls here
  };
  delta?: { // For streaming
    role?: string;
    content?: string | null;
  };
  finish_reason?: string | null;
  index?: number;
}

interface OpenRouterResponse {
  id?: string;
  object?: string; // e.g., "chat.completion" or "chat.completion.chunk"
  created?: number;
  model?: string;
  choices: OpenRouterResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens?: number; // Not always present in stream
    total_tokens: number;
  };
}


/**
 * LLMService implementation for OpenRouter.
 */
export class OpenRouterLLMService implements LLMService {
  private apiKey: string;
  private httpClient: Agent; // undici Agent for potential connection pooling, keep-alive

  constructor(
    private readonly config: Config,
    private readonly authService: ApiKeyAuthService,
  ) {
    this.apiKey = this.authService.getApiKey();
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is not available.');
    }
    this.httpClient = new Agent({
      // TODO: Configure keep-alive, timeouts, etc. as needed
      // connections: 10, // Example: Max 10 connections
    });
  }

  private mapToOpenRouterMessages(message: string | Part | (string | Part)[]): { role: string; content: string }[] {
    // TODO: This is a very basic mapping. OpenRouter expects an array of messages (history).
    // For now, it assumes `message` is the latest user message.
    // Proper history management needs to be implemented, likely by `ContentGenerator`
    // passing history in `SendMessageParams`.
    let content = '';
    if (typeof message === 'string') {
      content = message;
    } else if (Array.isArray(message)) { // Array of Parts or strings
      content = message.map(part => (typeof part === 'string' ? part : part.text || '')).join('');
    } else { // Single Part
      content = message.text || '';
    }
    return [{ role: 'user', content }];
  }

  // Placeholder for logging - adapt from GeminiChat/GeminiLLMService
  private _logApiRequest(
    model: string,
    requestBody: OpenRouterRequestBody,
  ): void {
    const requestText = requestBody.messages.map(m => m.content).join('\n');
    logApiRequest(this.config, new ApiRequestEvent(model, requestText));
  }

  private _logApiResponse(
    model: string,
    durationMs: number,
    usageMetadata?: unknown,
    responseText?: string,
  ): void {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        model,
        durationMs,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(model: string, durationMs: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        model,
        errorMessage,
        durationMs,
        errorType,
      ),
    );
  }


  async sendMessage(params: SendMessageParams): Promise<ResponseMessage> {
    const model = this.config.getModel(); // Model should be set in config for OpenRouter
    if (!model) {
      throw new Error("OpenRouter model not specified in config.");
    }

    const requestBody: OpenRouterRequestBody = {
      model,
      messages: this.mapToOpenRouterMessages(params.message),
      stream: false,
      // TODO: Map params.config (temperature, etc.) to OpenRouter params
      // temperature: params.config?.temperature,
      // max_tokens: params.config?.maxTokens, // Adjust names as per OpenRouter
    };
    if (params.config?.temperature) requestBody.temperature = params.config.temperature;
    // Add other compatible params from params.config to requestBody

    this._logApiRequest(model, requestBody);
    const startTime = Date.now();

    try {
      const undiciResponse: Response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Optional headers for OpenRouter ranking:
          // 'HTTP-Referer': YOUR_SITE_URL,
          // 'X-Title': YOUR_APP_NAME,
        },
        body: JSON.stringify(requestBody),
        dispatcher: this.httpClient,
      });

      const durationMs = Date.now() - startTime;

      if (!undiciResponse.ok) {
        const errorBody = await undiciResponse.text();
        this._logApiError(model, durationMs, new Error(`OpenRouter API Error: ${undiciResponse.status} ${errorBody}`));
        throw new Error(`OpenRouter API Error: ${undiciResponse.status} ${errorBody}`);
      }

      const responseData = await undiciResponse.json() as OpenRouterResponse;

      const responseText = responseData.choices?.[0]?.message?.content || '';
      this._logApiResponse(model, durationMs, responseData.usage, responseText);

      // Map OpenRouterResponse to generic ResponseMessage
      return {
        text: () => responseText,
        // TODO: Map OpenRouter choices to generic parts if needed.
        // For now, focusing on simple text response.
        // parts: responseData.choices?.[0]?.message ? [{text: responseData.choices[0].message.content || ''}] : [],
        usageMetadata: responseData.usage,
        // rawResponse: responseData, // Optionally include raw response
      };

    } catch (error) {
      const durationMs = Date.now() - startTime; // Recalculate if error before API call
      this._logApiError(model, durationMs, error);
      throw error;
    }
  }

  async *sendMessageStream(params: SendMessageParams): AsyncGenerator<ResponseMessageChunk> {
    const model = this.config.getModel();
    if (!model) {
      throw new Error("OpenRouter model not specified in config.");
    }

    const requestBody: OpenRouterRequestBody = {
      model,
      messages: this.mapToOpenRouterMessages(params.message),
      stream: true,
      // TODO: Map params.config to OpenRouter params
    };
    if (params.config?.temperature) requestBody.temperature = params.config.temperature;

    this._logApiRequest(model, requestBody);
    const startTime = Date.now();
    let responseText = ''; // Accumulate text for final logging

    try {
      const undiciResponse: Response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        dispatcher: this.httpClient,
      });

      if (!undiciResponse.ok) {
        const errorBody = await undiciResponse.text();
        this._logApiError(model, Date.now() - startTime, new Error(`OpenRouter API Error: ${undiciResponse.status} ${errorBody}`));
        throw new Error(`OpenRouter API Error: ${undiciResponse.status} ${errorBody}`);
      }

      if (!undiciResponse.body) {
        this._logApiError(model, Date.now() - startTime, new Error('OpenRouter stream response body is null'));
        throw new Error('OpenRouter stream response body is null');
      }

      // Process the stream (NDJSON)
      for await (const jsonEvent of streamToJson(undiciResponse.body)) {
        if (jsonEvent.error) { // streamToJson can yield error objects
            this._logApiError(model, Date.now() - startTime, new Error(`OpenRouter stream parsing error: ${jsonEvent.error.message}`));
            throw new Error(`OpenRouter stream parsing error: ${jsonEvent.error.message}`);
        }

        const chunk = jsonEvent as OpenRouterResponse; // Assuming streamToJson yields parsed chunks
        const chunkContent = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content ||'';
        responseText += chunkContent;

        yield {
          text: () => chunkContent,
          // parts: chunk.choices?.[0]?.delta?.content ? [{text: chunk.choices[0].delta.content}] : [],
          usageMetadata: chunk.usage, // Usage might be in the last chunk or not at all in stream
          // rawChunk: chunk,
        };

        // Handle finish reason if needed (e.g. stop, length)
        if (chunk.choices?.[0]?.finish_reason) {
          // Streaming finished
          break;
        }
      }

      const durationMs = Date.now() - startTime;
      // TODO: OpenRouter streaming usually doesn't send full usage in each chunk.
      // It might be in the last "done" event or require a separate call if needed.
      // For now, logging accumulated text and no specific stream usage.
      this._logApiResponse(model, durationMs, undefined /* No specific usage from stream */, responseText);

    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(model, durationMs, error);
      throw error;
    }
  }
}
