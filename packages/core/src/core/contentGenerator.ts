/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  // CountTokensResponse, // Assuming this will be handled by LLMService if needed
  // GenerateContentResponse, // Will use LLMService's ResponseMessage
  GenerateContentParameters, // This is from @google/genai, consider if it needs to be generic
  // CountTokensParameters, // Assuming this will be handled by LLMService if needed
  // EmbedContentResponse, // Out of scope for now
  // EmbedContentParameters, // Out of scope for now
  // GoogleGenAI, // No longer directly used here
  Part, // Keep Part or make generic
} from '@google/genai';
// import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js'; // May not be needed
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
// import { getEffectiveModel } from './modelCheck.js'; // May need to be re-evaluated or moved
import { Config } from '../config/config.js'; // Import main Config
import { LLMService, SendMessageParams, ResponseMessage, ResponseMessageChunk } from '../services/llm/llm_service.js';
import { LLMServiceFactory } from '../services/llm/llm_service_factory.js';

/**
 * Interface abstracting the core functionalities for generating content.
 * This now primarily delegates to an LLMService instance.
 */
export interface ContentGenerator {
  generateContent(
    // request: GenerateContentParameters, // Old
    request: SendMessageParams, // New: Use generic params
  ): Promise<ResponseMessage>; // New: Use generic response

  generateContentStream(
    // request: GenerateContentParameters, // Old
    request: SendMessageParams, // New: Use generic params
  ): Promise<AsyncGenerator<ResponseMessageChunk>>; // New: Use generic chunk

  // countTokens(request: CountTokensParameters): Promise<CountTokensResponse>; // TODO: Add if needed via LLMService
  // embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>; // TODO: Add if needed via LLMService
}

// AuthType might still be relevant for determining how to configure the factory or GeminiAuthService
export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal', // This might need special handling or be out of scope for pure API key auth
  USE_GEMINI = 'gemini-api-key', // Represents Gemini API Key
  USE_OPENROUTER = 'openrouter-api-key', // New type for OpenRouter
  USE_VERTEX_AI = 'vertex-ai', // Keep if Vertex is still a target
}

// ContentGeneratorConfig might simplify or change based on LLMServiceFactory handling config
export type ContentGeneratorConfig = {
  model: string; // Model name is still crucial
  apiKey?: string; // Generic API key, used by factory/auth services
  vertexai?: boolean; // Specific to Vertex
  authType?: AuthType | undefined; // To guide auth strategy if needed beyond provider
  // llmProvider will be read from the main Config object by the factory
};


// This function's role changes. It might not be needed if LLMServiceFactory handles all setup.
// Or it could be a simplified version that prepares some high-level config for the factory.
// For now, let's assume LLMServiceFactory will read most of what it needs from the main Config.
/*
export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined, // This authType might be redundant if config.llmProvider is used
  config?: { getModel?: () => string, llmProvider?: string, openRouterApiKey?: string }, // Main config passed here
): Promise<ContentGeneratorConfig> {
  // ... logic to determine effective model and auth details ...
  // This function becomes less critical as LLMServiceFactory takes over.
  // We will primarily rely on the main Config object.
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;
  return {
    model: effectiveModel,
    authType: authType, // This might be derived from llmProvider in the factory
    apiKey: authType === AuthType.USE_OPENROUTER ? config?.openRouterApiKey : process.env.GEMINI_API_KEY,
  };
}
*/

/**
 * Implementation of ContentGenerator that uses an LLMService.
 */
class LLMServiceContentGenerator implements ContentGenerator {
  private llmService: LLMService;

  constructor(config: Config) { // Takes the main Config object
    const factory = new LLMServiceFactory(config);
    this.llmService = factory.createLLMService();
    // TODO: Handle potential errors from factory.createLLMService()
  }

  async generateContent(request: SendMessageParams): Promise<ResponseMessage> {
    // The `model` should be part of SendMessageParams or implicitly handled by LLMService
    // based on its initial configuration from Config.
    // If `request` needs to override the model, SendMessageParams should include `model`.
    return this.llmService.sendMessage(request);
  }

  async generateContentStream(request: SendMessageParams): Promise<AsyncGenerator<ResponseMessageChunk>> {
    return this.llmService.sendMessageStream(request);
  }

  // TODO: Implement countTokens and embedContent if they become part of LLMService interface
  // async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
  //   // Delegate to this.llmService.countTokens(request) if implemented
  //   throw new Error('countTokens not yet implemented in LLMServiceContentGenerator');
  // }
  // async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
  //   // Delegate to this.llmService.embedContent(request) if implemented
  //   throw new Error('embedContent not yet implemented in LLMServiceContentGenerator');
  // }
}


// The main factory function now creates LLMServiceContentGenerator
export async function createContentGenerator(
  // config: ContentGeneratorConfig, // Old: Takes specific generator config
  config: Config, // New: Takes the main application Config
): Promise<ContentGenerator> {
  // The version and httpOptions for User-Agent could be passed into LLMServiceFactory
  // or handled within each LLMService implementation if they make direct HTTP calls
  // and need to set a User-Agent. For now, this direct instantiation is simpler.

  // The old logic for choosing between GoogleGenAI, CodeAssist, etc. is now
  // encapsulated within the LLMServiceFactory and the specific LLMService implementations.

  // return new LLMServiceContentGenerator(config.llmProvider, config.model, config.openRouterApiKey, config);
  return new LLMServiceContentGenerator(config);


  // Old logic below, for reference during refactoring:
  // const version = process.env.CLI_VERSION || process.version;
  // const httpOptions = {
  //   headers: {
  //     'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
  //   },
  // };
  // if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
  //   return createCodeAssistContentGenerator(httpOptions, config.authType);
  // }

  // if (
  //   config.authType === AuthType.USE_GEMINI ||
  //   config.authType === AuthType.USE_VERTEX_AI
  // ) {
  //   const googleGenAI = new GoogleGenAI({
  //     apiKey: config.apiKey === '' ? undefined : config.apiKey,
  //     vertexai: config.vertexai,
  //     httpOptions,
  //   });
  //   // This returned `googleGenAI.models` which is a `GenerativeModel` instance,
  //   // not directly matching our old ContentGenerator interface but had similar methods.
  //   // The new LLMService implementations will provide a more direct mapping.
  //   // This part needs careful adaptation.
  //   // For now, we assume the factory handles this.
  //   throw new Error("Old GoogleGenAI path in createContentGenerator needs to be fully replaced by LLMServiceFactory logic.");
  // }

  // throw new Error(
  //   `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  // );
}
