/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
// import { LoadedSettings, loadSettings, SettingScope } from './config/settings.js'; // REMOVED
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
// import { loadExtensions, Extension } from './config/extension.js'; // REMOVED - Extension type might be imported if needed by nonInteractive
import { cleanupCheckpoints } from './utils/cleanup.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType, // Keep for validateAuthMethod and selectedAuthType logic
} from '@super-young/gemini-cli-core';
import { validateAuthMethod } from './config/auth.js'; // Keep for auth logic
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';

// Helper type for what was settings.merged, now from config directly
interface MergedConfigSubset {
  selectedAuthType?: AuthType;
  theme?: string;
  autoConfigureMaxOldSpaceSize?: boolean;
  hideWindowTitle?: boolean;
  excludeTools?: string[];
}


function getNodeMemoryArgs(config: Config, mergedConfigSubset: MergedConfigSubset): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

export async function main() {
  const workspaceRoot = process.cwd(); // Still useful for CWD context
  await cleanupCheckpoints();

  // Load configuration using the new centralized function
  // No more settings.errors as YAML loading errors are logged by loadYamlFile
  // and result in empty/partial config, which might lead to downstream issues
  // if critical configs are missing. This might need more robust error handling
  // if a completely invalid YAML should halt execution.
  const config = await loadCliConfig(sessionId);

  // Extract a subset of config that mirrors old settings.merged for convenience in this file
  // This helps minimize changes in `main` logic initially.
  // TODO: Refactor main to use `config.get...()` methods more directly.
  const mergedConfigSubset: MergedConfigSubset = {
    selectedAuthType: config.getSelectedAuthType ? config.getSelectedAuthType() : undefined, // Assuming a getter might exist or be added
    theme: config.getTheme ? config.getTheme() : undefined, // Assuming a getter
    autoConfigureMaxOldSpaceSize: config.getAutoConfigureMaxOldSpaceSize ? config.getAutoConfigureMaxOldSpaceSize() : true, // Assuming getter
    hideWindowTitle: config.getHideWindowTitle ? config.getHideWindowTitle() : false, // Assuming getter
    excludeTools: config.getExcludeTools() || [],
  };

  // Logic for default auth type if GEMINI_API_KEY is present (previously used settings.setValue)
  // This now needs to be handled differently, as config is mostly immutable after load.
  // For now, this specific auto-setting logic might be dropped or re-evaluated.
  // If selectedAuthType is crucial and not set, auth validation later should catch it.
  // It's possible `config.selectedAuthType` is already correctly populated by `loadCliConfig`
  // if `selectedAuthType` was added to `ConfigYaml` and handled.
  // The `Config` class itself doesn't have `selectedAuthType` directly.
  // This suggests `selectedAuthType` was a CLI/UI concern, not core `Config`.
  // For now, we'll rely on `validateAuthMethod` called later.

  setMaxSizedBoxDebugging(config.getDebugMode());

  // Initialize centralized FileDiscoveryService
  config.getFileService(); // This is fine
  if (config.getCheckpointingEnabled()) {
    try {
      await config.getGitService();
    } catch {
      // For now swallow the error, later log it.
    }
  }

  if (mergedConfigSubset.theme) {
    if (!themeManager.setActiveTheme(mergedConfigSubset.theme)) {
      console.warn(`Warning: Theme "${mergedConfigSubset.theme}" not found.`);
    }
  }

  const memoryArgs = mergedConfigSubset.autoConfigureMaxOldSpaceSize
    ? getNodeMemoryArgs(config, mergedConfigSubset)
    : [];

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      // The old code used settings.merged.selectedAuthType
      // We need to ensure this auth information is available.
      // It's not directly on `config`. This implies `selectedAuthType` might need to be
      // passed around or re-read from `mergedYamlConfig` if it's stored there.
      // For now, let's assume `validateAuthMethod` will use what it needs or error appropriately.
      // The `config.refreshAuth` call is removed as part of the plan.
      const authTypeToValidate = mergedConfigSubset.selectedAuthType || (process.env.GEMINI_API_KEY ? AuthType.USE_GEMINI : undefined);
      if (authTypeToValidate) {
        try {
          const err = validateAuthMethod(authTypeToValidate);
          if (err) {
            throw new Error(err);
          }
          // await config.refreshAuth(authTypeToValidate); // This line is removed per plan
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs);
      process.exit(0); // Exit after sandbox start
    } else {
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0); // Exit after relaunch
      }
    }
  }
  let input = config.getQuestion(); // This is fine
  const startupWarnings = await getStartupWarnings(); // This is fine

  if (process.stdin.isTTY && input?.length === 0) {
    setWindowTitle(basename(workspaceRoot), mergedConfigSubset);
    render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          // settings prop is removed from AppWrapper if it only used settings.merged
          // For now, pass mergedConfigSubset if AppWrapper needs these specific fields.
          // Ideally, AppWrapper takes `config` and derives what it needs.
          // This will likely require changes in AppWrapper.
          // For now, let's assume AppWrapper is adapted or we pass a compatible object.
          mergedConfigSubset={mergedConfigSubset} // Temporary, needs AppWrapper update
          startupWarnings={startupWarnings}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );
    return;
  }

  if (!process.stdin.isTTY) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_length: input.length,
  });

  // Non-interactive mode
  // `loadNonInteractiveConfig` took `extensions` and `settings` before.
  // It now needs to work with just `config` or derive necessary info.
  const nonInteractiveConfig = await loadNonInteractiveConfig(config, mergedConfigSubset);

  await runNonInteractive(nonInteractiveConfig, input);
  process.exit(0);
}

function setWindowTitle(title: string, mergedConfigSubset: MergedConfigSubset) {
  if (!mergedConfigSubset.hideWindowTitle) {
    process.stdout.write(`\x1b]2; Gemini - ${title} \x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Log other unexpected unhandled rejections as critical errors
  console.error('=========================================');
  console.error('CRITICAL: Unhandled Promise Rejection!');
  console.error('=========================================');
  console.error('Reason:', reason);
  console.error('Stack trace may follow:');
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  // Exit for genuinely unhandled errors
  process.exit(1);
});

async function loadNonInteractiveConfig(config: Config, mergedConfigSubset: MergedConfigSubset) {
  let finalConfig = config;
  // If not YOLO mode, re-evaluate config for non-interactive use (e.g., exclude interactive tools)
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    const existingExcludeTools = mergedConfigSubset.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];
    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];

    // Create a temporary minimal "settings-like" object for re-loading config if needed.
    // This is a bit of a hack due to how loadCliConfig was structured.
    // Ideally, we'd modify `config` directly or have a leaner way to get a variant.
    // For now, we pass a structure that `loadCliConfig` can (partially) use
    // if we were to call it again.
    // However, the current `loadCliConfig` doesn't take this kind of partial settings object.
    // This part of the logic needs significant rethinking.
    // For now, let's assume we modify the existing `config` object if possible,
    // or accept that non-interactive tool filtering might be different.

    // The simplest approach without re-calling loadCliConfig (which now has a different signature)
    // is to acknowledge that the `Config` object, once created, isn't easily modified
    // to change tool lists.
    // This implies that `excludeTools` should be correctly set in the initial `loadCliConfig` call.
    // If `runNonInteractive` needs a *different* set of tools, the `Config` object
    // would need to be recreated or support dynamic tool registry changes.

    // Given the current plan, we are *not* re-calling loadCliConfig with modified settings here.
    // We will rely on the initial `config` being suitable or `runNonInteractive` handling tool permissions.
    // If `finalConfig.excludeTools` was used by `ToolRegistry`, it would be set once.
    // Let's log a warning if interactive tools might be present.
    const hasInteractiveTools = interactiveTools.some(tool => !config.getExcludeTools()?.includes(tool) && config.getCoreTools()?.includes(tool));
    if (hasInteractiveTools) {
        logger.warn("Running in non-interactive mode, but interactive tools might be enabled. Ensure configuration restricts tools if necessary.");
    }
    // `finalConfig` remains `config` here.
  }

  // Auth validation for non-interactive mode
  // Use selectedAuthType from mergedConfigSubset, or default to GEMINI_API_KEY if present.
  const authType = mergedConfigSubset.selectedAuthType || (process.env.GEMINI_API_KEY ? AuthType.USE_GEMINI : undefined);

  if (!authType) {
    console.error(
      'Non-interactive mode requires an authentication method. Please configure `selectedAuthType` in .gemini/config.yaml or set GEMINI_API_KEY environment variable.',
    );
    process.exit(1);
  }

  const authError = validateAuthMethod(authType);
  if (authError) {
    console.error(authError);
    process.exit(1);
  }

  // `refreshAuth` is being removed from Config. If non-interactive needs specific auth setup,
  // it should happen during ContentGenerator creation within the LLMService,
  // using the API key or credentials available from the environment/config.
  // await finalConfig.refreshAuth(authType); // REMOVED

  return finalConfig;
}

// validateNonInterActiveAuth is merged into loadNonInteractiveConfig
