/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import {
  Config,
  loadServerHierarchicalMemory,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  DEFAULT_GEMINI_MODEL,
  FileDiscoveryService,
  TelemetryTarget,
  LLMProvider,
  MCPServerConfig,
  BugCommandSettings,
  TelemetrySettings as CoreTelemetrySettings,
} from '@super-young/gemini-cli-core';
import { Extension, ExtensionConfig } from './extension.js';
import { getCliVersion } from '../utils/version.js';
import { type GenerationConfig } from '@google/genai';
import { loadSandboxConfig } from './sandboxConfig.js';

// TODO: Replace with a proper logger solution if available in the project
const logger = {
  currentLevel: 'info', // Default level
  setLevel: (level: string) => {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (validLevels.includes(level.toLowerCase())) {
      logger.currentLevel = level.toLowerCase();
      // Conditional logging for setLevel itself to avoid noise if not in debug
      if (logger.currentLevel === 'debug') {
        console.debug(`[Logger] Log level set to: ${logger.currentLevel}`);
      }
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => { if (logger.currentLevel === 'debug') console.debug('[DEBUG]', ...args); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => { if (['debug', 'info', 'warn'].includes(logger.currentLevel)) console.warn('[WARN]', ...args); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR]', ...args), // Errors always shown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]) => { if (['debug', 'info', 'warn', 'error'].includes(logger.currentLevel) && logger.currentLevel !== 'error' && logger.currentLevel !== 'warn') console.info('[INFO]', ...args); },
};

interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  'sandbox-image': string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  all_files: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpointing: boolean | undefined;
  telemetryTarget: string | undefined;
  telemetryOtlpEndpoint: string | undefined;
  telemetryLogPrompts: boolean | undefined;
  llmProvider: LLMProvider | undefined; // New CLI arg
  openrouterApiKey: string | undefined; // New CLI arg
  // No new args needed here for config.yaml path, those are fixed paths.
}

// Define the structure of our config.yaml content
// This is based on the previous 'Settings' interface and the new YAML structure plan
export interface ConfigYaml {
  have_fun?: boolean;
  theme?: string;
  sandbox?: boolean | string; // string can be path
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: {
    disableLoadingPhrases?: boolean;
  };
  telemetry?: CoreTelemetrySettings;
  usageStatisticsEnabled?: boolean;
  preferredEditor?: string;
  bugCommand?: BugCommandSettings;
  checkpointing?: {
    enabled?: boolean;
  };
  autoConfigureMaxOldSpaceSize?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  hideWindowTitle?: boolean;
  ignore_patterns?: string[]; // From existing .gemini/config.yaml
  code_review?: { // From existing .gemini/config.yaml
    disable?: boolean;
    comment_severity_threshold?: string; // Adjust type as per actual usage if not string
    max_review_comments?: number;
    pull_request_opened?: {
      help?: boolean;
      summary?: boolean;
      code_review?: boolean;
    };
  };
  extensions?: Record<string, ExtensionConfig>; // For extension configurations
  llmProvider?: LLMProvider;
  openRouterApiKey?: string;
  model?: string;
  generationConfig?: GenerationConfig; // From @google/genai
  embeddingModel?: string; // For specifying the embedding model
  debugMode?: boolean; // For enabling debug mode
  logLevel?: string; // For setting log level, e.g., "debug", "info", "warn"
}

// Helper function to load and parse a YAML file


async function parseArguments(mergedYamlConfig: Partial<ConfigYaml>): Promise<CliArgs> {
  // Defaults for yargs should now come from the merged YAML config or global defaults
  // if not present in YAML.
  const argv = await yargs(hideBin(process.argv))
    .option('model', {
      alias: 'm',
      type: 'string',
      description: 'Model to use. For Gemini, e.g., "gemini-pro". For OpenRouter, e.g., "openai/gpt-4o".',
      default: process.env.GEMINI_MODEL || mergedYamlConfig.model || DEFAULT_GEMINI_MODEL,
    })
    .option('llm-provider', {
      alias: 'lp',
      type: 'string',
      choices: ['gemini', 'openrouter'] as const,
      description: 'The LLM provider to use.',
      default: process.env.GEMINI_LLM_PROVIDER || mergedYamlConfig.llmProvider || ('gemini' as LLMProvider),
    })
    .option('openrouter-api-key', {
      alias: 'oak',
      type: 'string',
      description: 'API key for OpenRouter. Required if --llm-provider is openrouter. Can also be set via OPENROUTER_API_KEY env var or in config.yaml.',
      default: process.env.OPENROUTER_API_KEY || mergedYamlConfig.openRouterApiKey,
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Prompt. Appended to input on stdin (if any).',
    })
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: 'Run in sandbox?',
    })
    .option('sandbox-image', {
      type: 'string',
      description: 'Sandbox image URI.',
    })
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode?',
      default: mergedYamlConfig.debugMode ?? false, // Example if debugMode was in yaml
    })
    .option('all_files', {
      alias: 'a',
      type: 'boolean',
      description: 'Include ALL files in context?',
      default: false, // Assuming no direct YAML equivalent or handled differently
    })
    .option('show_memory_usage', {
      type: 'boolean',
      description: 'Show memory usage in status bar',
      default: mergedYamlConfig.showMemoryUsage ?? false,
    })
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description:
        'Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5PgG0 for more details)?',
      default: false, // Typically a command-line only flag
    })
    .option('telemetry', { // This flag enables/disables, specific values below
      type: 'boolean',
      description:
        'Enable telemetry? This flag specifically controls if telemetry is sent. Other --telemetry-* flags set specific values but do not enable telemetry on their own. Overrides config.yaml.',
      // `default` for this boolean is tricky; if undefined, it means "use YAML", if true/false, it overrides.
      // Yargs default will make it false if not present. We'll handle merging later.
    })
    .option('telemetry-target', {
      type: 'string',
      choices: ['local', 'gcp'] as const,
      description:
        'Set the telemetry target (local or gcp). Overrides config.yaml and environment variables.',
      default: process.env.GEMINI_TELEMETRY_TARGET || mergedYamlConfig.telemetry?.target,
    })
    .option('telemetry-otlp-endpoint', {
      type: 'string',
      description:
        'Set the OTLP endpoint for telemetry. Overrides config.yaml and environment variables.',
      default: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || mergedYamlConfig.telemetry?.otlpEndpoint,
    })
    .option('telemetry-log-prompts', {
      type: 'boolean',
      description:
        'Enable or disable logging of user prompts for telemetry. Overrides config.yaml.',
      // Yargs default will make it false if not present. We'll handle merging later.
    })
    .option('checkpointing', {
      alias: 'c',
      type: 'boolean',
      description: 'Enables checkpointing of file edits. Overrides config.yaml.',
      default: mergedYamlConfig.checkpointing?.enabled ?? false, // Handled carefully if flag not present
    })
    .version(await getCliVersion())
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict()
    .middleware((argv) => {
      // Validate conditional requirements
      if (argv.llmProvider === 'openrouter') {
        if (!argv.openrouterApiKey) {
          throw new Error('Missing required argument: --openrouter-api-key must be provided when --llm-provider is openrouter.');
        }
        // Model is also implicitly required for openrouter, but yargs default might satisfy it.
        // Add explicit check if model needs a different validation for openrouter.
        if (!argv.model || argv.model === DEFAULT_GEMINI_MODEL) {
            // If default Gemini model is still set, and provider is OpenRouter, user likely forgot to set a model.
            // However, OpenRouter itself has default models if not specified, so this might be too strict.
            // For now, we'll rely on OpenRouter to error if model is truly invalid for it.
            // console.warn("[WARN] Ensure the --model is set to a valid OpenRouter model identifier (e.g., 'openai/gpt-4o') when using --llm-provider=openrouter.");
        }
      }
    }).argv;

  return argv as CliArgs; // Cast because middleware might not perfectly type argv yet for all props
}

// This function is now a thin wrapper around the server's implementation.
// It's kept in the CLI for now as App.tsx directly calls it for memory refresh.
// TODO: Consider if App.tsx should get memory via a server call or if Config should refresh itself.
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    logger.debug(
      `CLI: Delegating hierarchical memory load to server for CWD: ${currentWorkingDirectory}`,
    );
  }
  // Directly call the server function.
  // The server function will use its own homedir() for the global path.
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
}

// Primary function to load all configurations
import { createConfig as createCoreConfig } from '@super-young/gemini-cli-core';

import { loadEnvironment } from './env';

export async function loadCliConfig(sessionId: string): Promise<{config: Config, yamlConfig: Partial<ConfigYaml>}> {
  loadEnvironment(process.cwd()); // Load .env file from current directory

  // Delegate to core to create config with merged YAML
  const { config: coreConfig, yamlConfig: mergedYamlConfig } = createCoreConfig();
  
  // Process Extensions from YAML (if any)
  const extensionContextFilePaths: string[] = [];
  if (mergedYamlConfig.extensions) {
    for (const [name, extConfig] of Object.entries(mergedYamlConfig.extensions)) {
      const extension = new Extension(name, extConfig);
      extensionContextFilePaths.push(...extension.contextFilePaths);
    }
  }

  // Set the context filename in the server's memoryTool module
  const contextFileName = mergedYamlConfig.contextFileName || getCurrentGeminiMdFilename();
  setServerGeminiMdFilename(contextFileName);

  const fileService = new FileDiscoveryService(process.cwd());
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    coreConfig.debugMode,
    fileService,
    extensionContextFilePaths
  );

  // Parse command-line arguments first
  const argv = await parseArguments(mergedYamlConfig);
  
  // Then load sandbox config using the parsed argv
  const sandboxConfig = await loadSandboxConfig(mergedYamlConfig, argv);

  // Merge MCP Servers: YAML base, then extensions from YAML
  const finalMcpServers = { ...(mergedYamlConfig.mcpServers || {}) };
  if (mergedYamlConfig.extensions) {
    for (const [_name, extConfig] of Object.entries(mergedYamlConfig.extensions)) {
      if (extConfig.mcpServers) {
        Object.assign(finalMcpServers, extConfig.mcpServers);
      }
    }
  }

  // Telemetry settings: CLI > Env Var > YAML > Default
  const telemetryEnabled =
    argv.telemetry ??
    (process.env.GEMINI_TELEMETRY_ENABLED ? process.env.GEMINI_TELEMETRY_ENABLED.toLowerCase() === 'true' : undefined) ??
    mergedYamlConfig.telemetry?.enabled ??
    false;
  const telemetryTarget = (argv.telemetryTarget || process.env.GEMINI_TELEMETRY_TARGET || mergedYamlConfig.telemetry?.target || 'local') as TelemetryTarget;
  const telemetryOtlpEndpoint = argv.telemetryOtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || mergedYamlConfig.telemetry?.otlpEndpoint;
  const telemetryLogPrompts =
    argv.telemetryLogPrompts ??
    (process.env.GEMINI_TELEMETRY_LOG_PROMPTS ? process.env.GEMINI_TELEMETRY_LOG_PROMPTS.toLowerCase() === 'true' : undefined) ??
    mergedYamlConfig.telemetry?.logPrompts ??
    true;

  // Update core config with CLI-specific settings
  coreConfig.sessionId = sessionId;
  coreConfig.userMemory = memoryContent;
  coreConfig.geminiMdFileCount = fileCount;
  coreConfig.sandbox = sandboxConfig;
  coreConfig.question = argv.prompt || '';
  coreConfig.fullContext = argv.all_files || false;
  coreConfig.approvalMode = argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;
  coreConfig.showMemoryUsage = argv.show_memory_usage || mergedYamlConfig.showMemoryUsage || false;
  coreConfig.telemetry = {
    enabled: telemetryEnabled,
    target: telemetryTarget,
    otlpEndpoint: telemetryOtlpEndpoint,
    logPrompts: telemetryLogPrompts
  };
  coreConfig.checkpointing = argv.checkpointing !== undefined ? argv.checkpointing : (mergedYamlConfig.checkpointing?.enabled ?? false);

  return {
    config: coreConfig,
    yamlConfig: mergedYamlConfig
  };
}

// Removed mergeMcpServers as its logic is now within loadCliConfig


