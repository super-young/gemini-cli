/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import {
  // AuthType, // Commented out since unused
  // ContentGeneratorConfig, // Commented out since unused
  // createContentGeneratorConfig, // This function was removed/commented out
} from '../core/contentGenerator.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { MemoryTool, setGeminiMdFilename } from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { GeminiClient } from '../core/client.js';
import { GEMINI_CONFIG_DIR as GEMINI_DIR } from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { getProjectTempDir } from '../utils/paths.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
  StartSessionEvent,
} from '../telemetry/index.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  // GenerationConfig, // Will be imported from @google/genai
} from './models.js';
import { type GenerationConfig } from '@google/genai'; // Import type
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';

// LLM Provider types
export type LLMProvider = 'gemini' | 'openrouter';

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  logPrompts?: boolean;
}

export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
  ) {}
}

export interface SandboxConfig {
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
) => Promise<boolean>;

export interface ConfigParameters {
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  bugCommand?: BugCommandSettings;
  model: string;
  extensionContextFilePaths?: string[];
  llmProvider?: LLMProvider; // New field for LLM provider
  openRouterApiKey?: string; // New field for OpenRouter API key
  generationConfig?: GenerationConfig; // To store generation config for Gemini
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private readonly sessionId: string;
  // private contentGeneratorConfig!: ContentGeneratorConfig; // Commented out - part of old model config
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    enableRecursiveFileSearch: boolean;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private _model: string; // Made mutable for setModel/resetModelToDefault
  private readonly initialModel: string; // Store the initial model
  private readonly extensionContextFilePaths: string[];
  private modelSwitchedDuringSession: boolean = false;
  readonly llmProvider: LLMProvider; // Removed public modifier
  readonly openRouterApiKey?: string; // Removed public modifier
  readonly generationConfig?: GenerationConfig; // Removed public modifier
  flashFallbackHandler?: FlashFallbackHandler;
  private settings: Record<string, unknown> = {}; // Changed any to unknown

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.llmProvider = params.llmProvider || 'gemini'; // Default to gemini
    this.openRouterApiKey = params.openRouterApiKey;
    this.generationConfig = params.generationConfig;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      logPrompts: params.telemetry?.logPrompts ?? true,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this._model = params.model;
    this.initialModel = params.model; // Store initial model
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }

    if (this.getUsageStatisticsEnabled()) {
      ClearcutLogger.getInstance(this)?.logStartSessionEvent(
        new StartSessionEvent(this),
      );
    } else {
      console.log('Data collection is disabled.');
    }
  }

  // The refreshAuth method has been removed as it's non-functional in the current
  // architecture. Authentication is handled during LLMService instantiation.

  getSessionId(): string {
    return this.sessionId;
  }

  // getContentGeneratorConfig(): ContentGeneratorConfig {
  //   // return this.contentGeneratorConfig; // Old way
  //   throw new Error("getContentGeneratorConfig is deprecated.");
  // }

  getModel(): string {
    return this._model;
  }

  setModel(newModel: string): void {
    // TODO: This needs to potentially reconfigure/recreate the LLMService.
    // For now, this method doesn't change the actual model used by an active LLMService.
    // It only updates the config's 'default' model and flags that a switch was attempted.
    this._model = newModel; // Actually update the model
    console.warn(
      `Config.setModel() called with ${newModel}. The base model for new LLMService instances may change, but existing services are not affected. Model switching logic needs review.`
    );
    this.modelSwitchedDuringSession = true;
  }

  isModelSwitchedDuringSession(): boolean {
    return this.modelSwitchedDuringSession;
  }

  resetModelToDefault(): void {
    // TODO: This method's purpose needs review in context of LLMService.
    // If LLMService instances are immutable regarding their model, this might only affect
    // the 'default' model stored in Config for future service instantiations.
    // For now, just reset the flag and model to its initial state.
    this._model = this.initialModel;
    this.modelSwitchedDuringSession = false;
  }

  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getToolRegistry(): Promise<ToolRegistry> {
    return Promise.resolve(this.toolRegistry);
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    return getProjectTempDir(this.getProjectRoot());
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      await this.gitService.initialize();
    }
    return this.gitService;
  }

  // private settings: Record<string, unknown> = {}; // Removed duplicate declaration

  get(key: string): unknown {
    return this.settings[key];
  }

  set(key: string, value: unknown): void {
    this.settings[key] = value;
  }

  refreshAuth(): Promise<void> {
    // TODO: Implement actual authentication refresh logic
    console.warn('Config.refreshAuth() is not implemented yet');
    return Promise.resolve();
  }
}

export function createConfig(): { config: Config; yamlConfig: Partial<Config> & Record<string, unknown> } {
  // TODO: Implement actual config loading logic
  const config = new Config({
    targetDir: process.cwd(),
    sessionId: 'default-session',
    debugMode: false,
    cwd: process.cwd(),
    model: DEFAULT_GEMINI_FLASH_MODEL
  });
  return {
    config,
    yamlConfig: {
      // Simulate loaded YAML config
      model: DEFAULT_GEMINI_FLASH_MODEL,
      approvalMode: ApprovalMode.DEFAULT
    }
  };
}

export function createToolRegistry(config: Config): Promise<ToolRegistry> {
  const registry = new ToolRegistry(config);
  const targetDir = config.getTargetDir();
  const tools = config.getCoreTools()
    ? new Set(config.getCoreTools())
    : undefined;
  const excludeTools = config.getExcludeTools()
    ? new Set(config.getExcludeTools())
    : undefined;

  // helper to create & register core tools that are enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
    // check both the tool name (.Name) and the class name (.name)
    if (
      // coreTools contain tool name
      (!tools || tools.has(ToolClass.Name) || tools.has(ToolClass.name)) &&
      // excludeTools don't contain tool name
      (!excludeTools ||
        (!excludeTools.has(ToolClass.Name) &&
          !excludeTools.has(ToolClass.name)))
    ) {
      registry.registerTool(new ToolClass(...args));
    }
  };

  registerCoreTool(LSTool, targetDir, config);
  registerCoreTool(ReadFileTool, targetDir, config);
  registerCoreTool(GrepTool, targetDir);
  registerCoreTool(GlobTool, targetDir, config);
  registerCoreTool(EditTool, config);
  registerCoreTool(WriteFileTool, config);
  registerCoreTool(WebFetchTool, config);
  registerCoreTool(ReadManyFilesTool, targetDir, config);
  registerCoreTool(ShellTool, config);
  registerCoreTool(MemoryTool);
  registerCoreTool(WebSearchTool, config);
  return (async () => {
    await registry.discoverTools();
    return registry;
  })();
}

// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
