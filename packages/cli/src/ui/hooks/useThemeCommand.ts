/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
// import { LoadedSettings } from '../../config/config.js'; // Removed
import { type HistoryItem, MessageType, SettingScope } from '../types.js'; // SettingScope from types.js
import { type Config } from '@super-young/gemini-cli-core'; // Added Config import
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void; // Added scope
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  config: Config, // Changed from loadedSettings
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  // Determine the effective theme
  const effectiveTheme = config.get('theme') as string | undefined; // Changed from loadedSettings

  // Initial state: Open dialog if no theme is set in either user or workspace settings
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(
    effectiveTheme === undefined && !process.env.NO_COLOR,
  );
  // TODO: refactor how theme's are accessed to avoid requiring a forced render.
  const [, setForceRender] = useState(0);

  // Apply initial theme on component mount
  useEffect(() => {
    if (effectiveTheme === undefined) {
      if (process.env.NO_COLOR) {
        addItem(
          {
            type: MessageType.INFO,
            text: 'Theme configuration unavailable due to NO_COLOR env variable.',
          },
          Date.now(),
        );
      }
      // If no theme is set and NO_COLOR is not set, the dialog is already open.
      return;
    }

    if (!themeManager.setActiveTheme(effectiveTheme)) {
      setIsThemeDialogOpen(true);
      setThemeError(`Theme "${effectiveTheme}" not found.`);
    } else {
      setThemeError(null);
    }
  }, [effectiveTheme, setThemeError, addItem]); // Re-run if effectiveTheme or setThemeError changes

  const openThemeDialog = useCallback(() => {
    if (process.env.NO_COLOR) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Theme configuration unavailable due to NO_COLOR env variable.',
        },
        Date.now(),
      );
      return;
    }
    setIsThemeDialogOpen(true);
  }, [addItem]);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      if (!themeManager.setActiveTheme(themeName)) {
        // If theme is not found, open the theme selection dialog and set error message
        setIsThemeDialogOpen(true);
        setThemeError(`Theme "${themeName}" not found.`);
      } else {
        setForceRender((v) => v + 1); // Trigger potential re-render
        setThemeError(null); // Clear any previous theme error on success
      }
    },
    [setForceRender, setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      // Added scope parameter
      try {
        config.set('theme', themeName); // Use config.set, scope is not directly used here
        // TODO: Re-evaluate how scope (User/Workspace) is handled with config.set
        applyTheme(config.get('theme') as string | undefined); // Apply the current theme
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme, config], // Changed loadedSettings to config
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
