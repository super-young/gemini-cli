/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, GenerateContentConfig, Part, Candidate, UsageMetadata as SDKUsageMetadata } from "@google/genai";

// Define generic parameter types, adaptable from existing Gemini types
// These may need further generalization as more providers are added.

export interface SendMessageParams {
  message: string | Part | (string | Part)[];
  config?: GenerateContentConfig;
  // TODO: Consider adding a field for a general model identifier if not already in config
  // model?: string;
}

export interface ResponseMessage {
  text?: () => string; // For simple text responses
  parts?: Part[]; // For more complex responses with multiple parts
  // TODO: Add other common fields from LLM responses, e.g., usage metadata
  // usageMetadata?: UsageMetadata;
  // TODO: Consider a rawResponse field for provider-specific data
  // rawResponse?: unknown;
  // TODO: Define a way to access function calls if they are part of the response
  // functionCalls?: FunctionCall[];
  automaticFunctionCallingHistory?: Content[]; // Keep if relevant for AFC
  candidates?: Candidate[]; // Changed from Content[] to Candidate[]
  usageMetadata?: SDKUsageMetadata | unknown; // More specific for Gemini, general for others
}

export interface ResponseMessageChunk {
  text?: () => string;
  parts?: Part[];
  // TODO: Add other common fields from LLM stream chunks
  // usageMetadata?: UsageMetadata; // Usage metadata might only be in the final chunk
  // TODO: Consider a rawChunk field
  // rawChunk?: unknown;
  automaticFunctionCallingHistory?: Content[];
  candidates?: Candidate[]; // Changed from Content[] to Candidate[]
  usageMetadata?: SDKUsageMetadata | unknown; // Consistent with ResponseMessage
}

// TODO: Define UsageMetadata if it's to be a common field.
// export interface UsageMetadata {
//   promptTokenCount?: number;
//   candidatesTokenCount?: number;
//   totalTokenCount?: number;
// }

// TODO: Define FunctionCall if it's to be a common field.
// export interface FunctionCall {
//   name: string;
//   args: object;
// }


/**
 * Interface for a Large Language Model (LLM) service.
 * This defines a standard way to interact with different LLM providers.
 */
export interface LLMService {
  /**
   * Sends a non-streaming message to the LLM.
   * @param params Parameters for sending the message.
   * @returns A promise that resolves to the LLM's response.
   */
  sendMessage(params: SendMessageParams): Promise<ResponseMessage>;

  /**
   * Sends a streaming message to the LLM.
   * @param params Parameters for sending the message.
   * @returns An async generator that yields chunks of the LLM's response.
   */
  sendMessageStream(params: SendMessageParams): AsyncGenerator<ResponseMessageChunk>;
}
