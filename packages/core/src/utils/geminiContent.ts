/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from "@google/genai";

/**
 * Utility to create a Gemini Content object with the 'user' role.
 * This is similar to internal utilities in @google/genai.
 *
 * @param message The message content, can be a string, a Part, or an array of Parts.
 * @returns A Content object with the user role and provided parts.
 */
export function createUserContent(message: string | Part | (string | Part)[]): Content {
  if (typeof message === 'string') {
    return { role: 'user', parts: [{ text: message }] };
  } else if (Array.isArray(message)) {
    const parts: Part[] = message.map(item =>
      typeof item === 'string' ? { text: item } : item
    );
    return { role: 'user', parts };
  } else {
    // It's a single Part object
    return { role: 'user', parts: [message] };
  }
}

/**
 * Utility to create a Gemini Content object with the 'model' role.
 * @param parts The parts of the model's response.
 * @returns A Content object with the model role and provided parts.
 */
export function createModelContent(parts: Part[]): Content {
  return { role: 'model', parts };
}

// Add other helper functions related to Gemini content construction if needed.
