/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';

// Default name for the directory containing settings within a project.
export const SETTINGS_DIRECTORY_NAME = '.gemini';

// Default path for user-level global settings.
// This might vary slightly by OS in a more complex app, but
// ~/.config/gemini-cli is a common pattern.
export const USER_SETTINGS_DIR = path.join(os.homedir(), '.config', 'gemini-cli');
