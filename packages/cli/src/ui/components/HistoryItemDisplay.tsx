/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessage } from './messages/ToolGroupMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';
import { CompressionMessage } from './messages/CompressionMessage.js';
import { Box } from 'ink';
import { AboutBox } from './AboutBox.js';
import { StatsDisplay } from './StatsDisplay.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import { Config } from '@super-young/gemini-cli-core';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  isPending: boolean;
  config?: Config;
  isFocused?: boolean;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  terminalWidth,
  isPending,
  config,
  isFocused = true,
}) => {
  // Helper to extract text from PartListUnion
  const getTextFromParts = (data: string | import('@google/genai').PartListUnion | undefined): string => {
    if (typeof data === 'string') {
      return data;
    }
    if (!data) {
      return '';
    }
    // At this point, data is PartListUnion (Part | Part[]) from @google/genai
    // or it could be a string if item.text was already a string.
    // HistoryItem.text is string | PartListUnion.
    // So, data parameter is string | Part | Part[] | undefined.

    const itemsToProcess: (string | import('@google/genai').Part)[] = Array.isArray(data) ? data : [data];

    return itemsToProcess
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        // item is Part
        if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return ''; // Or handle other Part types like inlineData if necessary
      })
      .join('');
  };

  return (
    <Box flexDirection="column" key={item.id}>
      {/* Render standard message types */}
      {item.type === 'user' && <UserMessage text={getTextFromParts(item.text)} />}
      {item.type === 'user_shell' && <UserShellMessage text={getTextFromParts(item.text)} />}
      {item.type === 'gemini' && (
      <GeminiMessage
        text={getTextFromParts(item.text)} // Apply helper
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />
    )}
    {item.type === 'gemini_content' && (
      <GeminiMessageContent
        text={getTextFromParts(item.text)} // Apply helper
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />
    )}
    {item.type === 'info' && <InfoMessage text={getTextFromParts(item.text)} />}
    {item.type === 'error' && <ErrorMessage text={getTextFromParts(item.text)} />}
    {item.type === 'about' && (
      <AboutBox
        cliVersion={item.cliVersion}
        osVersion={item.osVersion}
        sandboxEnv={item.sandboxEnv}
        modelVersion={item.modelVersion}
        selectedAuthType={item.selectedAuthType}
        gcpProject={item.gcpProject}
      />
    )}
    {item.type === 'stats' && (
      <StatsDisplay
        stats={item.stats}
        lastTurnStats={item.lastTurnStats}
        duration={item.duration}
      />
    )}
    {item.type === 'quit' && (
      <SessionSummaryDisplay stats={item.stats} duration={item.duration} />
    )}
    {item.type === 'tool_group' && (
      <ToolGroupMessage
        toolCalls={item.tools}
        groupId={item.id}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
        config={config}
        isFocused={isFocused}
      />
    )}
    {item.type === 'compression' && (
      <CompressionMessage compression={item.compression} />
    )}
  </Box>
  );
};
