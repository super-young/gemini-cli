/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '@google/gemini-cli-core';

// These types are used by the new config.ts to structure extension
// configurations loaded from config.yaml.

export interface Extension {
  config: ExtensionConfig;
  contextFiles: string[]; // Resolved absolute paths to context files
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[]; // Original context file names/patterns from config
}
