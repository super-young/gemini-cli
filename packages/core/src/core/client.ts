/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmbedContentParameters,
  GenerateContentConfig,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Turn,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ChatCompressionInfo,
} from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  ContentGenerator,
  createContentGenerator,
  ContentGeneratorConfig, // Uncommented or ensure it's imported
  AuthType,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { SendMessageParams, ResponseMessage } from '../services/llm/llm_service.js'; // Corrected path

function isThinkingSupported(model: string) {
  if (model.startsWith('gemini-2.5')) return true;
  return false;
}

export class GeminiClient {
  private chat?: GeminiChat;
  private contentGenerator?: ContentGenerator;
  private model: string;
  private embeddingModel: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    // Model and embeddingModel will be primarily sourced from config when LLMService is created.
    this.model = config.getModel(); // Use getter
    this.embeddingModel = config.getEmbeddingModel(); // Embedding model might be Gemini-specific
  }

  async initialize() { // No longer takes contentGeneratorConfig
    // createContentGenerator now takes the main Config object
    this.contentGenerator = await createContentGenerator(this.config);

    // StartChat will also need to be provider-aware or use the generic LLMService
    // For now, assuming GeminiChat is only used if provider is Gemini.
    // This part needs significant refactoring if GeminiChat itself is to be replaced
    // by a generic chat session manager.
    if (this.config.llmProvider === 'gemini') {
      this.chat = await this.startChat(); // startChat is Gemini-specific
    } else {
      // For other providers, a generic chat session manager or direct LLMService calls would be needed.
      // This is a simplification for now. `this.chat` might be undefined for non-Gemini.
      console.warn(`Chat session functionality is currently optimized for Gemini. Provider: ${this.config.llmProvider}`);
    }
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('Content generator not initialized');
    }
    return this.contentGenerator;
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  async getHistory(): Promise<Content[]> {
    return this.getChat().getHistory();
  }

  async setHistory(history: Content[]): Promise<void> {
    this.getChat().setHistory(history);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    await this.chat;
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
    });
    const context = `
  This is the Gemini CLI. We are setting up the context for our chat.
  Today's date is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- Full File Context ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
        console.error('Error reading full file context:', error);
        initialParts.push({
          text: '\n--- Error reading full file context ---',
        });
      }
    }

    return initialParts;
  }

  private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
    // This method is highly specific to GeminiChat and its way of initializing.
    // If the provider is not Gemini, this method might not be applicable,
    // or a generic chat abstraction would be needed.
    if (this.config.llmProvider !== 'gemini') {
      // This is a temporary measure. Ideally, chat functionality should be generic.
      throw new Error("GeminiClient.startChat() is only supported for the 'gemini' provider at this time.");
    }

    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const initialHistory: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
    ];
    const history = initialHistory.concat(extraHistory ?? []);
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      // Use the model from the main config for GeminiChat initialization
      const currentModelForChat = this.config.getModel(); // Use getter
      const generateContentConfigWithThinking = isThinkingSupported(currentModelForChat)
        ? {
            ...this.generateContentConfig, // This is GeminiClient's internal config
            thinkingConfig: {
              includeThoughts: true,
            },
          }
        : this.generateContentConfig;

      // GeminiChat now takes the main Config object.
      // The ContentGenerator passed to GeminiChat should be the one from this.getContentGenerator()
      // which is already initialized with the correct LLMService based on config.
      return new GeminiChat(
        this.config, // Pass the main Config
        this.getContentGenerator(), // Pass the initialized ContentGenerator
        { // This is GenerateContentConfig for the chat session
          systemInstruction,
          ...generateContentConfigWithThinking,
          tools,
          // model: currentModelForChat, // Model is now set within GeminiChat based on Config
        },
        history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    turns: number = this.MAX_TURNS,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (!turns) {
      return new Turn(this.getChat());
    }

    const compressed = await this.tryCompressChat();
    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }
    const turn = new Turn(this.getChat());
    const resultStream = turn.run(request, signal);
    for await (const event of resultStream) {
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, but the final
        // turn object will be from the top-level call.
        yield* this.sendMessageStream(nextRequest, signal, turns - 1);
      }
    }
    return turn;
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model: string = DEFAULT_GEMINI_FLASH_MODEL,
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      const apiCall = () => {
        // Ensure SendMessageParams is used if ContentGenerator expects it
        // This part assumes generateContent on ContentGenerator now takes SendMessageParams
        // and that these params can convey schema/responseMimeType if the underlying LLMService supports it.
        // This might require adding these to SendMessageParams or specific LLMService handling.
        // For now, assuming generateContent can still handle @google/genai's GenerateContentParameters
        // Adapt to SendMessageParams
        // The `model` parameter from generateJson is not directly part of SendMessageParams.
        // It's assumed the ContentGenerator's LLMService is already configured with a model,
        // or the model is specified within params.config if the LLMService supports it.
        // For now, the `model` argument to generateJson will be effectively ignored here
        // unless SendMessageParams.config can carry it and the LLMService uses it.
        const sendMessageParams: SendMessageParams = {
          // HACK: Casting Content[] to (string | Part)[] - this relies on underlying GeminiLLMService
          // being able to correctly interpret this if it receives it.
          // A proper mapping from Content[] to string|Part|(string|Part)[] is needed if this hack fails.
          // For example, message: contents.flatMap(c => c.parts.map(p => p.text || '')) if only text parts.
          message: contents as (string | Part)[],
          config: {
            ...requestConfig, // contains abortSignal, temperature, topP from this.generateContentConfig and config arg
            // systemInstruction should be part of the config for SendMessageParams
            // However, @google/genai's GenerateContentConfig doesn't have systemInstruction.
            // System instructions are usually set when the model/chat is initialized.
            // This is a point of mismatch if systemInstruction needs to be per-call here.
            // For now, assuming systemInstruction is handled by the chat session or model setup.
            // If GenerateContentConfig used by LLMService can take it, it would be:
            // ...systemInstruction, // This is not standard in GenerateContentConfig
            responseSchema: schema, // This is valid for @google/genai GenerateContentConfig
            responseMimeType: 'application/json', // Valid for @google/genai GenerateContentConfig
          },
        };
        // TODO: Re-evaluate how `systemInstruction` and `model` are passed to the LLMService
        // as `SendMessageParams` and its `config: GenerateContentConfig` might not fully support them per-call.
        return this.getContentGenerator().generateContent(sendMessageParams);
      }

      const result: ResponseMessage | GenerateContentResponse = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        // Determine AuthType based on config's llmProvider.
        // Assuming VertexAI is not used if llmProvider is 'gemini' without specific Vertex config,
        // which aligns with Config not having an explicit getVertexAI().
        authType: this.config.llmProvider === 'gemini' ? AuthType.USE_GEMINI
                  : this.config.llmProvider === 'openrouter' ? AuthType.USE_OPENROUTER
                  : undefined,
      });

      // Adapt to potentially different response structures
      let text: string | undefined;
      if ('text' in result && typeof result.text === 'function') { // Check if it's ResponseMessage
        text = result.text();
      } else if ('candidates' in result) { // Check if it's GenerateContentResponse (Gemini SDK)
        text = getResponseText(result as GenerateContentResponse);
      }
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch (parseError) {
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const modelToUse = this.model;
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      const apiCall = () => {
        // Similar to generateJson, adapt parameters for ContentGenerator / SendMessageParams
        // The model (`modelToUse`) is assumed to be handled by the ContentGenerator's LLMService configuration.
        // SystemInstruction is also assumed to be part of the model/chat setup or within requestConfig if supported.
        const sendMessageParams: SendMessageParams = {
          // HACK: Casting Content[] to (string | Part)[] - see note in generateJson
          message: contents as (string | Part)[],
          config: {
            ...requestConfig, // contains abortSignal, temperature, topP, and potentially systemInstruction
          },
        };
        // TODO: Re-evaluate how `systemInstruction` and `model` are passed.
        return this.getContentGenerator().generateContent(sendMessageParams);
      }

      const result: ResponseMessage | GenerateContentResponse = await retryWithBackoff(apiCall, {
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        // Determine AuthType based on config's llmProvider.
        authType: this.config.llmProvider === 'gemini' ? AuthType.USE_GEMINI
                  : this.config.llmProvider === 'openrouter' ? AuthType.USE_OPENROUTER
                  : undefined,
      });
      // If ContentGenerator returns ResponseMessage, and this function needs to return
      // GenerateContentResponse (from @google/genai), then a mapping is needed.
      // This indicates a type mismatch that needs resolving.
      // For now, we'll assume the Gemini path will still yield GenerateContentResponse.
      return result as GenerateContentResponse; // This cast might be unsafe if provider is not Gemini
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${modelToUse}.`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    // TODO: Embedding functionality needs to be part of LLMService if it's to be generic.
    // For now, this will likely fail if the ContentGenerator is not Gemini-based and
    // if the `embedContent` method was removed or not implemented on the generic interface.
    // This section is effectively out of scope for the current refactoring if
    // `embedContent` is not part of the `LLMService` and `ContentGenerator` interfaces.
    if (typeof (this.getContentGenerator() as any).embedContent !== 'function') {
      throw new Error('Embedding is not supported by the current LLM provider or configuration.');
    }

    const embedModelParams: EmbedContentParameters = {
      model: this.embeddingModel, // This assumes embeddingModel is Gemini-specific
      // For OpenRouter, a different embedding model might be needed, or it might use its own.
      // EmbedContentParameters expects contents: Content[]
      // Each text string needs to be mapped to a Content object.
      contents: texts.map(text => ({ role: 'user', parts: [{text}] })),
    };

    const embedContentResponse = await (this.getContentGenerator() as any).embedContent(embedModelParams);

    // The response structure for embeddings might also vary.
    // This assumes @google/genai's EmbedContentResponse structure.
    if (!embedContentResponse.embedding?.values || embedContentResponse.embedding.values.length === 0) {
      throw new Error('No embedding values found in API response.');
    }

    // Assuming one embedding per call for now, not batching as before
    // This part needs to be re-evaluated based on how `embedContent` is defined and used.
    // The original code expected an array of embeddings if multiple texts were sent.
    // The new @google/genai EmbedContentRequest takes a single Content.
    // For simplicity, let's assume we embed one by one or the API handles batching internally if `texts` were multiple parts.
    // This is a significant simplification and likely needs more work if batch embedding is required.
    return [embedContentResponse.embedding.values];


    // Original logic for multiple embeddings:
    // if (
    //   !embedContentResponse.embeddings ||
    //   embedContentResponse.embeddings.length === 0
    // ) {
    //   throw new Error('No embeddings found in API response.');
    // }
    // if (embedContentResponse.embeddings.length !== texts.length) {
    //   throw new Error(
    //     `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
    //   );
    // }
    // return embedContentResponse.embeddings.map((embedding, index) => {
    //   const values = embedding.values;
    //   if (!values || values.length === 0) {
    //     throw new Error(
    //       `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
    //     );
    //   }
    //   return values;
    // });
  }

  async tryCompressChat(
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    const history = this.getChat().getHistory(true); // Get curated history

    // Regardless of `force`, don't do anything if the history is empty.
    if (history.length === 0) {
      return null;
    }

    // TODO: countTokens also needs to be part of LLMService and ContentGenerator interface.
    // This will fail if not implemented.
    // This section is also out of scope if countTokens is not part of the generic interfaces.
    if (typeof (this.getContentGenerator()as any).countTokens !== 'function') {
      console.warn('countTokens is not supported by the current LLM provider. Skipping chat compression.');
      return null;
    }

    const countTokensParams = {
        model: this.config.getModel(), // Use getter
        contents: history,
    } as any; // Cast to any due to CountTokensParameters potentially not matching

    const { totalTokens: originalTokenCount } =
      await (this.getContentGenerator()as any).countTokens(countTokensParams);


    // If not forced, check if we should compress based on context size.
    if (!force) {
      if (originalTokenCount === undefined) {
        // If token count is undefined, we can't determine if we need to compress.
        console.warn(
           `Could not determine token count for model ${this.config.getModel()}. Skipping compression check.`, // Use getter
        );
        return null;
      }
      const tokenCount = originalTokenCount; // Now guaranteed to be a number

       const limit = tokenLimit(this.config.getModel()); // Use getter
      if (!limit) {
        // If no limit is defined for the model, we can't compress.
        console.warn(
           `No token limit defined for model ${this.config.getModel()}. Skipping compression check.`,
        );
        return null;
      }

      if (tokenCount < 0.95 * limit) {
        return null;
      }
    }

    const summarizationRequestMessage = {
      text: 'Summarize our conversation up to this point. The summary should be a concise yet comprehensive overview of all key topics, questions, answers, and important details discussed. This summary will replace the current chat history to conserve tokens, so it must capture everything essential to understand the context and continue our conversation effectively as if no information was lost.',
    };
    const response = await this.getChat().sendMessage({
      message: summarizationRequestMessage,
    });
    const newHistory = [
      {
        role: 'user',
        parts: [summarizationRequestMessage],
      },
      {
        role: 'model',
        // ResponseMessage has a text() method, not a direct text property.
        parts: [{ text: response.text ? response.text() : '' }],
      },
    ];
    this.chat = await this.startChat(newHistory);
    const newTokenCount = (
      await (this.getContentGenerator() as any).countTokens({ // Cast to any
        model: this.config.getModel(), // Use getter
        contents: newHistory,
      })
    ).totalTokens;

    return originalTokenCount !== undefined && newTokenCount !== undefined // Check for undefined
      ? {
          originalTokenCount,
          newTokenCount,
        }
      : null;
  }

  /**
   * Handles fallback to Flash model when persistent 429 errors occur for OAuth users.
   * Uses a fallback handler if provided by the config, otherwise returns null.
   */
  private async handleFlashFallback(authType?: string): Promise<string | null> {
    // Only handle fallback for OAuth users
    if (authType !== AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
      return null;
    }

    const currentModel = this.config.getModel(); // Get current model from config
    const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

    // Don't fallback if already using Flash model
    if (currentModel === fallbackModel) {
      return null;
    }

    // Check if config has a fallback handler (set by CLI package)
    const fallbackHandler = this.config.flashFallbackHandler;
    if (typeof fallbackHandler === 'function') {
      try {
        const accepted = await fallbackHandler(currentModel, fallbackModel);
        if (accepted) {
          this.config.setModel(fallbackModel); // This should update the model in the main Config
          // this.model = fallbackModel; // Client's local `this.model` may not be the source of truth anymore.
                                        // LLMService instances will get the model from Config.
          return fallbackModel;
        }
      } catch (error) {
        console.warn('Flash fallback handler failed:', error);
      }
    }

    return null;
  }
}
