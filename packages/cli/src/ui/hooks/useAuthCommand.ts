/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { AuthType, Config, clearCachedCredentialFile, getErrorMessage } from '@super-young/gemini-cli-core';

async function performAuthFlow(authMethod: AuthType, config: Config) {
  await config.refreshAuth();
  console.log(`Authenticated via "${authMethod}".`);
}

export const useAuthCommand = (
  setAuthError: (error: string | null) => void,
  config: Config,
) => {
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const authFlow = async () => {
      if (isAuthDialogOpen || !config.get('auth.type')) {
        return;
      }

      try {
        setIsAuthenticating(true);
        await performAuthFlow(
          config.get('auth.type') as AuthType,
          config,
        );
      } catch (e) {
        setAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
        openAuthDialog();
      } finally {
        setIsAuthenticating(false);
      }
    };

    void authFlow();
  }, [isAuthDialogOpen, config, setAuthError, openAuthDialog]); // Removed settings

  const handleAuthSelect = useCallback(
    async (authMethod: string | undefined) => {
      if (authMethod) {
        await clearCachedCredentialFile();
        config.set('auth.type', authMethod);
        try {
          await config.refreshAuth();
          setAuthError(null);
        } catch (error) {
          setAuthError(`Authentication failed: ${getErrorMessage(error)}`);
        }
      }
      setIsAuthDialogOpen(false);
    },
    [config, setAuthError],
  );

  const handleAuthHighlight = useCallback((_authMethod: string | undefined) => {
    // For now, we don't do anything on highlight.
  }, []);

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    handleAuthHighlight,
    isAuthenticating,
    cancelAuthentication,
  };
};
