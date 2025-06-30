/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
// import { LoadedSettings, SettingScope } from '../../config/config.js'; // REMOVED
import { type HistoryItem, MessageType, SettingScope } from '../types.js'; // SettingScope ADDED
import {
  allowEditorTypeInSandbox,
  checkHasEditorType,
  EditorType,
  type Config, // ADDED Config
} from '@super-young/gemini-cli-core';

interface UseEditorSettingsReturn {
  isEditorDialogOpen: boolean;
  openEditorDialog: () => void;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: SettingScope,
  ) => void;
  exitEditorDialog: () => void;
}

export const useEditorSettings = (
  config: Config, // CHANGED from loadedSettings
  setEditorError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseEditorSettingsReturn => {
  const [isEditorDialogOpen, setIsEditorDialogOpen] = useState(false);
  // TODO: Update logic that used loadedSettings.setValue

  const openEditorDialog = useCallback(() => {
    setIsEditorDialogOpen(true);
  }, []);

  const handleEditorSelect = useCallback(
    (editorType: EditorType | undefined, scope: SettingScope) => {
      if (
        editorType &&
        (!checkHasEditorType(editorType) ||
          !allowEditorTypeInSandbox(editorType))
      ) {
        return;
      }

      try {
        config.set('editor.type', editorType); // Use config.set, scope is not directly used here
        // TODO: Re-evaluate how scope (User/Workspace) is handled with config.set
        addItem(
          {
            type: MessageType.INFO,
            text: `Editor preference ${editorType ? `set to "${editorType}"` : 'cleared'} in ${scope} settings.`,
          },
          Date.now(),
        );
        setEditorError(null);
        setIsEditorDialogOpen(false);
      } catch (error) {
        setEditorError(`Failed to set editor preference: ${error}`);
      }
    },
    [config, setEditorError, addItem], // Changed loadedSettings to config
  );

  const exitEditorDialog = useCallback(() => {
    setIsEditorDialogOpen(false);
  }, []);

  return {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  };
};
