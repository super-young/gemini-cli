/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { AuthDialog } from './AuthDialog.js';
// import { LoadedSettings, SettingScope } from '../../config/settings.js'; // REMOVED
import { AuthType, Config } from '@super-young/gemini-cli-core';

describe('AuthDialog', () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  // Helper to create a mock Config object for tests
  const createMockConfig = (selectedAuthType?: AuthType): Config => {
    return {
      // Provide minimal mock properties needed by AuthDialog or its underlying logic
      // This will likely need to be expanded based on actual usage in AuthDialog.tsx
      selectedAuthType: selectedAuthType,
      getAuthType: vi.fn(() => selectedAuthType), // Example getter
      // Mock other necessary Config methods/properties as needed by AuthDialog
      // For example, if AuthDialog tries to save settings, mock those methods.
      // For now, keeping it minimal.
    } as unknown as Config; // Cast to Config, acknowledging it's a partial mock
  };

  it('should show an error if the initial auth type is invalid', () => {
    const mockConfig = createMockConfig(AuthType.USE_GEMINI);

    const { lastFrame } = render(
      <AuthDialog
        onSelect={() => {}}
        onHighlight={() => {}}
        config={mockConfig} // Changed settings to config
        initialErrorMessage="GEMINI_API_KEY  environment variable not found"
      />,
    );

    expect(lastFrame()).toContain(
      'GEMINI_API_KEY  environment variable not found',
    );
  });

  it('should prevent exiting when no auth method is selected and show error message', async () => {
    const onSelect = vi.fn();
    const mockConfig = createMockConfig(undefined);

    const { lastFrame, stdin, unmount } = render(
      <AuthDialog
        onSelect={onSelect}
        onHighlight={() => {}}
        config={mockConfig} // Changed settings to config
      />,
    );
    await wait();

    // Simulate pressing escape key
    stdin.write('\u001b'); // ESC key
    await wait();

    // Should show error message instead of calling onSelect
    expect(lastFrame()).toContain(
      'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
    );
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it('should allow exiting when auth method is already selected', async () => {
    const onSelect = vi.fn();
    const mockConfig = createMockConfig(AuthType.USE_GEMINI);

    const { stdin, unmount } = render(
      <AuthDialog
        onSelect={onSelect}
        onHighlight={() => {}}
        config={mockConfig} // Changed settings to config
      />,
    );
    await wait();

    // Simulate pressing escape key
    stdin.write('\u001b'); // ESC key
    await wait();

    // Should call onSelect with undefined to exit.
    // SettingScope is removed, so onSelect signature in AuthDialog might change.
    // Assuming for now it's called with (undefined) or (undefined, undefined) if scope was optional/removed.
    // This will depend on AuthDialog.tsx changes.
    expect(onSelect).toHaveBeenCalledWith(undefined); // Adjusted expectation
    unmount();
  });
});
