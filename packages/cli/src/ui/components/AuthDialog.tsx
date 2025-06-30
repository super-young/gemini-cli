/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
// import { LoadedSettings, SettingScope } from '../../config/config.js'; // REMOVED
import { AuthType, type Config } from '@super-young/gemini-cli-core'; // Config ADDED & SCOPE CHANGED
import { validateAuthMethod } from '../../config/auth.js';
import { SettingScope } from '../types.js'; // CORRECTED Path

interface AuthDialogProps {
  onSelect: (authMethod: string | undefined, scope: SettingScope) => void;
  onHighlight: (authMethod: string | undefined) => void;
  config: Config; // CHANGED from settings: LoadedSettings
  initialErrorMessage?: string | null;
}

export function AuthDialog({
  onSelect,
  onHighlight,
  config, // CHANGED from settings
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  // TODO: Update how selectedAuthType is retrieved from config instead of settings.merged.selectedAuthType
  const items = [
    {
      label: 'Login with Google',
      value: AuthType.LOGIN_WITH_GOOGLE_PERSONAL,
    },
    { label: 'Gemini API Key (AI Studio)', value: AuthType.USE_GEMINI },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
  ];

  let initialAuthIndex = items.findIndex(
    (item) => item.value === (config.get('auth.type') as AuthType | undefined),
  );

  if (initialAuthIndex === -1) {
    initialAuthIndex = 0;
  }

  const handleAuthSelect = (authMethod: string) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      setErrorMessage(error);
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  useInput((_input, key) => {
    if (key.escape) {
      if ((config.get('auth.type') as AuthType | undefined) === undefined) {
        // Prevent exiting if no auth method is set
        setErrorMessage(
          'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
        );
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Auth Method</Text>
      <RadioButtonSelect
        items={items}
        initialIndex={initialAuthIndex}
        onSelect={handleAuthSelect}
        onHighlight={onHighlight}
        isFocused={true}
      />
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Gemini CLI</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {
            'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
          }
        </Text>
      </Box>
    </Box>
  );
}
