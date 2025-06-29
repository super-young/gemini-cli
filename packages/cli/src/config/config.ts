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
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  FileDiscoveryService,
  TelemetryTarget,
  LLMProvider,
  MCPServerConfig, // Added for types
  AuthType, // Added for types (though selectedAuthType usage is questionable)
  BugCommandSettings, // Added for types
  TelemetrySettings as CoreTelemetrySettings, // Alias to avoid conflict
  // GenerationConfig, // Already in core/config
} from '@google/gemini-cli-core';
// import { Settings } from './settings.js'; // Will be replaced by ConfigYaml
import { Extension, ExtensionConfig } from './extension.js'; // Keep Extension type for now
import { getCliVersion } from '../utils/version.js';
import { type GenerationConfig } from '@google/genai'; // Import type
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml'; // Added
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
interface ConfigYaml {
  have_fun?: boolean;
  theme?: string;
  selectedAuthType?: AuthType;
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
function loadYamlFile(filePath: string): Partial<ConfigYaml> {
  if (fs.existsSync(filePath)) {
    try {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(fileContents) as Partial<ConfigYaml>;
      return parsed || {};
    } catch (e) {
      logger.error(`Error parsing YAML file at ${filePath}:`, e);
      return {}; // Return empty object on error
    }
  }
  return {}; // Return empty object if file doesn't exist
}

// Helper function to resolve environment variables in config object
// (Adapted from the old settings.ts)
function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
    }
    return match; // Return original if env var not found
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newObj as any)[key] = resolveEnvVarsInObject((newObj as any)[key]);
      }
    }
    return newObj;
  }
  return obj;
}


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
export async function loadCliConfig(sessionId: string): Promise<Config> {
  loadEnvironment(); // Load .env file first

  // 1. Load YAML configurations
  const userConfigPath = path.join(os.homedir(), GEMINI_DIR, 'config.yaml');
  const workspaceConfigPath = path.join(process.cwd(), GEMINI_DIR, 'config.yaml');

  let userYamlConfig = loadYamlFile(userConfigPath);
  userYamlConfig = resolveEnvVarsInObject(userYamlConfig); // Resolve env vars in user YAML

  let workspaceYamlConfig = loadYamlFile(workspaceConfigPath);
  workspaceYamlConfig = resolveEnvVarsInObject(workspaceYamlConfig); // Resolve env vars in workspace YAML

  // Merge YAML configs: workspace overrides user
  const mergedYamlConfig: Partial<ConfigYaml> = {
    ...userYamlConfig,
    ...workspaceYamlConfig,
    // Deep merge for nested objects if necessary, e.g., telemetry, code_review
    // For simplicity, direct override for now. Add deep merge if needed.
    telemetry: {
      ...userYamlConfig.telemetry,
      ...workspaceYamlConfig.telemetry,
    },
    code_review: {
      ...userYamlConfig.code_review,
      ...workspaceYamlConfig.code_review,
      pull_request_opened: {
        ...(userYamlConfig.code_review?.pull_request_opened || {}),
        ...(workspaceYamlConfig.code_review?.pull_request_opened || {}),
      }
    },
    fileFiltering: {
      ...userYamlConfig.fileFiltering,
      ...workspaceYamlConfig.fileFiltering,
    },
    accessibility: {
      ...userYamlConfig.accessibility,
      ...workspaceYamlConfig.accessibility,
    },
    checkpointing: {
      ...userYamlConfig.checkpointing,
      ...workspaceYamlConfig.checkpointing,
    },
    // Extensions: workspace completely overrides user for simplicity.
    // A more complex merge might combine them if desired.
    extensions: workspaceYamlConfig.extensions || userYamlConfig.extensions,
  };

  // 2. Parse command-line arguments, using YAML config for defaults
  const argv = await parseArguments(mergedYamlConfig);
  const debugMode = argv.debug ?? mergedYamlConfig.debugMode ?? false;
  const logLevel = mergedYamlConfig.logLevel; // Get logLevel from YAML

  // Potentially set a global log level here if your logger supports it
  // For example: logger.setLevel(logLevel || 'info');
  if (logLevel && logger.setLevel) { // Assuming logger has a setLevel method
    logger.setLevel(logLevel);
  } else if (debugMode && logger.setLevel) { // Fallback to debugMode for logger
    logger.setLevel('debug');
  }


  // 3. Process Extensions from YAML (if any)
  const loadedExtensions: Extension[] = [];
  const extensionContextFilePaths: string[] = [];
  if (mergedYamlConfig.extensions) {
    for (const [name, extConfig] of Object.entries(mergedYamlConfig.extensions)) {
      // Basic validation
      if (!extConfig.name || !extConfig.version) {
        logger.warn(`Extension "${name}" in config.yaml is missing name or version. Skipping.`);
        continue;
      }
      // Here, contextFiles paths would need to be resolved.
      // Assuming contextFileName in YAML is relative to workspace or a predefined extensions dir.
      // For now, let's assume they are relative to CWD if not absolute.
      // This part might need more robust path handling based on extension design.
      const contextFiles = (Array.isArray(extConfig.contextFileName) ? extConfig.contextFileName : (extConfig.contextFileName ? [extConfig.contextFileName] : []))
        .map(cf => path.resolve(process.cwd(), cf)) // Example: resolve relative to CWD
        .filter(cf => fs.existsSync(cf));

      loadedExtensions.push({ config: extConfig, contextFiles });
      extensionContextFilePaths.push(...contextFiles);
      logger.debug(`Loaded extension from config.yaml: ${extConfig.name}`);
    }
  }


  // Set the context filename in the server's memoryTool module
  const contextFileName = mergedYamlConfig.contextFileName || getCurrentGeminiMdFilename();
  setServerGeminiMdFilename(contextFileName);


  const fileService = new FileDiscoveryService(process.cwd());
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    fileService,
    extensionContextFilePaths, // Pass paths from YAML-defined extensions
  );

  // Merge MCP Servers: YAML base, then extensions from YAML
  let finalMcpServers = { ...(mergedYamlConfig.mcpServers || {}) };
  for (const ext of loadedExtensions) {
    if (ext.config.mcpServers) {
      for (const [key, server] of Object.entries(ext.config.mcpServers)) {
        if (finalMcpServers[key]) {
          logger.warn(
            `Skipping extension MCP config from YAML for server "${key}" as it already exists.`,
          );
        } else {
          finalMcpServers[key] = server;
        }
      }
    }
  }

  // Sandbox config depends on mergedYamlConfig and argv
  const sandboxConfig = await loadSandboxConfig(mergedYamlConfig, argv);

  // Telemetry settings: CLI > Env Var > YAML > Default
  const telemetryEnabled = argv.telemetry ?? process.env.GEMINI_TELEMETRY_ENABLED?.toLowerCase() === 'true' ?? mergedYamlConfig.telemetry?.enabled ?? false;
  const telemetryTarget = (argv.telemetryTarget || process.env.GEMINI_TELEMETRY_TARGET || mergedYamlConfig.telemetry?.target || 'local') as TelemetryTarget;
  const telemetryOtlpEndpoint = argv.telemetryOtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || mergedYamlConfig.telemetry?.otlpEndpoint;
  const telemetryLogPrompts = argv.telemetryLogPrompts ?? process.env.GEMINI_TELEMETRY_LOG_PROMPTS?.toLowerCase() === 'true' ?? mergedYamlConfig.telemetry?.logPrompts ?? true;

  // Final config object construction
  // TODO: Pass logLevel to Core Config if it supports it, or handle logging configuration here.
  // For now, debugMode is passed, and logLevel is used locally if the logger supports it.
  return new Config({
    sessionId,
    embeddingModel: mergedYamlConfig.embeddingModel || DEFAULT_GEMINI_EMBEDDING_MODEL, // Assuming embeddingModel can be in YAML
    sandbox: sandboxConfig,
    targetDir: process.cwd(),
    debugMode, // This is passed to the core Config
    question: argv.prompt || '',
    fullContext: argv.all_files || false, // No direct YAML equivalent assumed for fullContext
    coreTools: mergedYamlConfig.coreTools || undefined,
    excludeTools: mergedYamlConfig.excludeTools || undefined,
    toolDiscoveryCommand: mergedYamlConfig.toolDiscoveryCommand,
    toolCallCommand: mergedYamlConfig.toolCallCommand,
    mcpServerCommand: mergedYamlConfig.mcpServerCommand,
    mcpServers: finalMcpServers,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    showMemoryUsage: argv.show_memory_usage || mergedYamlConfig.showMemoryUsage || false,
    accessibility: mergedYamlConfig.accessibility,
    telemetry: {
      enabled: telemetryEnabled,
      target: telemetryTarget,
      otlpEndpoint: telemetryOtlpEndpoint,
      logPrompts: telemetryLogPrompts,
    },
    usageStatisticsEnabled: mergedYamlConfig.usageStatisticsEnabled ?? true,
    fileFiltering: { // CLI doesn't override these directly, so YAML or defaults
      respectGitIgnore: mergedYamlConfig.fileFiltering?.respectGitIgnore ?? true,
      enableRecursiveFileSearch: mergedYamlConfig.fileFiltering?.enableRecursiveFileSearch ?? true,
    },
    // CLI flag for checkpointing acts as an override if present
    checkpointing: argv.checkpointing !== undefined ? argv.checkpointing : (mergedYamlConfig.checkpointing?.enabled ?? false),
    proxy:
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
    cwd: process.cwd(),
    fileDiscoveryService: fileService,
    bugCommand: mergedYamlConfig.bugCommand,
    model: argv.model!, // Already incorporates YAML default via parseArguments
    extensionContextFilePaths,
    llmProvider: argv.llmProvider!, // Already incorporates YAML default
    openRouterApiKey: argv.openrouterApiKey || undefined, // Already incorporates YAML default, ensure undefined if empty
    generationConfig: mergedYamlConfig.generationConfig, // From YAML
  });
}

// Removed mergeMcpServers as its logic is now within loadCliConfig

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(os.homedir(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(os.homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (envFilePath) {
    dotenv.config({ path: envFilePath, quiet: true });
  }
}
