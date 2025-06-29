/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthClient } from 'google-auth-library';
import {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongrunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import {
  // CountTokensParameters, // Removed as ContentGenerator no longer has countTokens
  // CountTokensResponse, // Removed
  // EmbedContentParameters, // Removed
  // EmbedContentResponse, // Removed
  // GenerateContentParameters, // Replaced by SendMessageParams
  // GenerateContentResponse, // Replaced by ResponseMessage
} from '@google/genai'; // Keep for other types if converter still uses them
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import {
  ResponseMessage,
  ResponseMessageChunk,
  SendMessageParams,
} from '../services/llm/llm_service.js'; // Corrected path
import {
  // CaCountTokenResponse, // Converter for countTokens might be removed
  CaGenerateContentResponse, // Assuming converter can adapt or is still needed for this specific server's backend
  // fromCountTokenResponse, // Converter for countTokens might be removed
  fromGenerateContentResponse, // Assuming this can be adapted to return ResponseMessage
  // toCountTokenRequest, // Converter for countTokens might be removed
  toGenerateContentRequest, // Assuming this can take SendMessageParams (or parts of it)
} from './converter.js';
import { PassThrough } from 'node:stream';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

// TODO: Use production endpoint once it supports our methods.
export const CODE_ASSIST_ENDPOINT =
  process.env.CODE_ASSIST_ENDPOINT ?? 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly auth: AuthClient,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
  ) {}

  async generateContentStream(
    req: SendMessageParams,
  ): Promise<AsyncGenerator<ResponseMessageChunk>> {
    // TODO: Adapt toGenerateContentRequest if SendMessageParams is too different
    // from GenerateContentParameters for the existing converter.
    // For now, assume `req` can be passed to `toGenerateContentRequest` or
    // `toGenerateContentRequest` is adapted to handle `SendMessageParams`.
    // The `req.config?.abortSignal` might need to be accessed differently if `config` structure changed in SendMessageParams.
    // Assuming SendMessageParams has `config.abortSignal` or similar.
    const resps = await this.streamEndpoint<CaGenerateContentResponse>(
      'streamGenerateContent',
      // Assuming toGenerateContentRequest can handle SendMessageParams or we adapt it.
      // The original GenerateContentParameters had `model` and `contents`. SendMessageParams has `message`.
      // This will likely require changes in `toGenerateContentRequest`.
      toGenerateContentRequest(req as any, this.projectId), // Using `as any` for now, converter needs update
      req.config?.abortSignal,
    );
    return (async function* (): AsyncGenerator<ResponseMessageChunk> {
      for await (const resp of resps) {
        // TODO: Adapt fromGenerateContentResponse to return ResponseMessageChunk
        // or ensure its existing output is compatible.
        yield fromGenerateContentResponse(resp) as ResponseMessageChunk; // Using `as ResponseMessageChunk`
      }
    })();
  }

  async generateContent(
    req: SendMessageParams,
  ): Promise<ResponseMessage> {
    // TODO: Adapt toGenerateContentRequest and fromGenerateContentResponse
    const resp = await this.callEndpoint<CaGenerateContentResponse>(
      'generateContent',
      // Assuming toGenerateContentRequest can handle SendMessageParams or we adapt it.
      toGenerateContentRequest(req as any, this.projectId), // Using `as any` for now, converter needs update
      req.config?.abortSignal,
    );
    // Assuming fromGenerateContentResponse can be adapted to return ResponseMessage
    return fromGenerateContentResponse(resp) as ResponseMessage; // Using `as ResponseMessage`
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongrunningOperationResponse> {
    return await this.callEndpoint<LongrunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.callEndpoint<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.getEndpoint<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.callEndpoint<CodeAssistGlobalUserSettingResponse>(
      'setCodeAssistGlobalUserSetting',
      req,
    );
  }

  // Removed countTokens and embedContent as they are not part of the ContentGenerator interface anymore
  // async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
  //   const resp = await this.callEndpoint<CaCountTokenResponse>(
  //     'countTokens',
  //     toCountTokenRequest(req),
  //   );
  //   return fromCountTokenResponse(resp);
  // }

  // async embedContent(
  //   _req: EmbedContentParameters,
  // ): Promise<EmbedContentResponse> {
  //   throw Error();
  // }

  async callEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }

  async getEndpoint<T>(method: string, signal?: AbortSignal): Promise<T> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data as T;
  }

  async streamEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'stream',
      body: JSON.stringify(req),
      signal,
    });

    return (async function* (): AsyncGenerator<T> {
      const rl = readline.createInterface({
        input: res.data as PassThrough,
        crlfDelay: Infinity, // Recognizes '\r\n' and '\n' as line breaks
      });

      let bufferedLines: string[] = [];
      for await (const line of rl) {
        // blank lines are used to separate JSON objects in the stream
        if (line === '') {
          if (bufferedLines.length === 0) {
            continue; // no data to yield
          }
          yield JSON.parse(bufferedLines.join('\n')) as T;
          bufferedLines = []; // Reset the buffer after yielding
        } else if (line.startsWith('data: ')) {
          bufferedLines.push(line.slice(6).trim());
        } else {
          throw new Error(`Unexpected line format in response: ${line}`);
        }
      }
    })();
  }
}
