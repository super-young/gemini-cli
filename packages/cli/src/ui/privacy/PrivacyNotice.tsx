/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { type Config, AuthType } from '@google/gemini-cli-core';
import { GeminiPrivacyNotice } from './GeminiPrivacyNotice.js';
import { CloudPaidPrivacyNotice } from './CloudPaidPrivacyNotice.js';
import { CloudFreePrivacyNotice } from './CloudFreePrivacyNotice.js';

interface PrivacyNoticeProps {
  onExit: () => void;
  config: Config;
}

const PrivacyNoticeText = ({
  config,
  onExit,
}: {
  config: Config;
  onExit: () => void;
}) => {
  const getDerivedAuthType = (): AuthType | undefined => {
    if (config.llmProvider === 'gemini') {
      // Currently, no direct way to distinguish USE_VERTEX_AI from USE_GEMINI via config.llmProvider alone.
      // Defaulting to USE_GEMINI. If Vertex has a different privacy notice,
      // this logic or Config would need to be enhanced.
      return AuthType.USE_GEMINI;
    }
    if (config.llmProvider === 'openrouter') {
      return AuthType.USE_OPENROUTER;
    }
    // LOGIN_WITH_GOOGLE_PERSONAL is not typically determined by llmProvider in this context.
    // It was previously part of ContentGeneratorConfig.
    // For now, other providers or undefined llmProvider will result in `undefined`.
    return undefined;
  };

  const currentAuthType: AuthType | undefined = getDerivedAuthType();

  switch (currentAuthType) {
    case AuthType.USE_GEMINI:
      return <GeminiPrivacyNotice onExit={onExit} />;
    case AuthType.USE_VERTEX_AI:
      return <CloudPaidPrivacyNotice onExit={onExit} />;
    case AuthType.LOGIN_WITH_GOOGLE_PERSONAL:
    default:
      return <CloudFreePrivacyNotice config={config} onExit={onExit} />;
  }
};

export const PrivacyNotice = ({ onExit, config }: PrivacyNoticeProps) => (
  <Box borderStyle="round" padding={1} flexDirection="column">
    <PrivacyNoticeText config={config} onExit={onExit} />
  </Box>
);
