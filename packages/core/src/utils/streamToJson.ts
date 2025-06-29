/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Asynchronously iterates over a ReadableStream of Uint8Array (like one from `fetch` response body),
 * decodes it as UTF-8, splits by newlines, and parses each line as JSON.
 * Handles Server-Sent Events (SSE) like format where lines might be prefixed with "data: ".
 *
 * @param stream A ReadableStream of Uint8Array.
 * @returns An async generator that yields parsed JSON objects or error objects.
 */
export async function* streamToJson<T = unknown>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T | { error: Error }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          // Process any remaining data in the buffer
          try {
            yield JSON.parse(buffer.trim()) as T;
          } catch (e) {
            yield { error: new Error(`Failed to parse remaining JSON: ${buffer.trim()}, Error: ${(e as Error).message}`) };
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split('\n');

      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue; // Skip empty lines

        let lineData = line.trim();
        // Handle SSE "data: " prefix
        if (lineData.startsWith('data: ')) {
          lineData = lineData.substring('data: '.length).trim();
        }

        // OpenAI-compatible streams sometimes send a [DONE] message
        if (lineData === '[DONE]') {
          // This signals the end of the stream for some providers.
          // We can choose to yield it or just break. For now, let's assume
          // the stream ending (`done` from reader.read()) is the primary signal.
          // If specific handling for [DONE] is needed, it can be added here.
          continue;
        }

        try {
          yield JSON.parse(lineData) as T;
        } catch (e) {
          yield { error: new Error(`Failed to parse JSON line: ${lineData}, Error: ${(e as Error).message}`) };
        }
      }
    }
  } catch (error) {
    yield { error: error instanceof Error ? error : new Error(String(error)) };
  } finally {
    reader.releaseLock();
    // Ensure buffer is flushed if stream ends abruptly or with an error
    if (buffer.trim()) {
        try {
            yield JSON.parse(buffer.trim()) as T;
        } catch (e) {
            yield { error: new Error(`Failed to parse final buffer content: ${buffer.trim()}, Error: ${(e as Error).message}`) };
        }
    }
  }
}
