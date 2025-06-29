# Gemini CLI Configuration

Gemini CLI offers several ways to configure its behavior, including environment variables, command-line arguments, and settings files. This document outlines the different configuration methods and available settings.

## Configuration layers

Configuration is applied in the following order of precedence (higher numbers override lower numbers):

1.  **Default values:** Hardcoded defaults within the application.
2.  **User `config.yaml` file:** Global settings for the current user, located at `~/.gemini/config.yaml`.
3.  **Workspace `config.yaml` file:** Workspace-specific settings, located at `./.gemini/config.yaml` (relative to the current working directory). Workspace settings override user settings.
4.  **Environment variables:** System-wide or session-specific variables, potentially loaded from `.env` files (see below).
5.  **Command-line arguments:** Values passed when launching the CLI.

## The `config.yaml` file

Gemini CLI uses `config.yaml` files for persistent configuration. There are two locations for these files:

- **User `config.yaml` file:**
  - **Location:** `~/.gemini/config.yaml` (where `~` is your home directory).
  - **Scope:** Applies to all Gemini CLI sessions for the current user.
- **Workspace `config.yaml` file:**
  - **Location:** `.gemini/config.yaml` within your project's root directory (or current working directory).
  - **Scope:** Applies only when running Gemini CLI from that specific workspace. Workspace settings override corresponding user settings.

**Note on environment variables in `config.yaml`:** String values within your `config.yaml` files can reference environment variables using either `$VAR_NAME` or `${VAR_NAME}` syntax. These variables will be automatically resolved when the configuration is loaded. For example, if you have an environment variable `MY_API_TOKEN`, you could use it in `config.yaml` like this: `openRouterApiKey: "$MY_API_TOKEN"`.

### The `.gemini` directory in your project

In addition to a workspace `config.yaml` file, a project's `.gemini` directory can contain other project-specific files related to Gemini CLI's operation, such as:

- [Custom sandbox profiles](#sandboxing) (e.g., `.gemini/sandbox-macos-custom.sb`, `.gemini/sandbox.Dockerfile`).
- Context files (e.g., `GEMINI.md`, `AGENTS.md`) if not specified differently by `contextFileName` in `config.yaml`.

### Available settings in `config.yaml`:

The `config.yaml` file uses YAML syntax. Below is a comprehensive list of available settings. Not all settings need to be present; defaults will be used for missing entries.

```yaml
# General settings
have_fun: false
theme: 'DefaultDark' # Sets the visual theme. See ./themes.md
# selectedAuthType: 'oauth-personal' # No longer primary way to set auth, prefer environment variables or provider-specific keys.
sandbox: false # boolean or string (e.g., 'docker', 'podman'). Controls sandboxing. See Sandboxing section.
showMemoryUsage: false # If true, shows memory usage in status bar.
# Specifies the filename for context files (e.g., GEMINI.md, AGENTS.md).
# Can be a single filename or a list of accepted filenames.
contextFileName: 'GEMINI.md' # or ['GEMINI.md', 'AGENTS.md']
accessibility:
  disableLoadingPhrases: false # Disables animated loading phrases.
preferredEditor: 'code' # Preferred editor for viewing diffs (e.g., 'vscode', 'vim').
autoConfigureMaxOldSpaceSize: true # Allow Gemini to attempt to relaunch with more memory if needed.
hideWindowTitle: false # If true, Gemini CLI will not attempt to set the terminal window title.

# Code review settings (for features like automated PR reviews if enabled)
code_review:
  disable: false
  comment_severity_threshold: HIGH # e.g., LOW, MEDIUM, HIGH
  max_review_comments: -1 # -1 for no limit
  pull_request_opened:
    help: false
    summary: true
    code_review: true

# File patterns to ignore for context processing and some tools.
# Uses .gitignore syntax.
ignore_patterns:
  - 'node_modules/'
  - 'dist/'
  - '*.log'

# Core tools settings
# List of core tools to enable. If not specified, all default tools are enabled.
# See Built-in Tools documentation for available tool names.
# Example: ['LSTool', 'ReadFileTool']
coreTools: []
# List of core tools to disable.
# Example: ['GrepTool']
excludeTools: []

# Custom tool settings
# Command to discover custom tools. Must output JSON array of function declarations.
toolDiscoveryCommand: ''
# Command to call a custom tool. Takes tool name as arg1, JSON args on stdin.
toolCallCommand: ''

# MCP (Multi-Context Prompt) Server settings
# Command to start a default MCP server if not using keyed mcpServers.
mcpServerCommand: ''
# Keyed collection of MCP servers.
mcpServers:
  # my_custom_server:
  #   command: 'node'
  #   args: ['my_server.js']
  #   env: { 'MY_VAR': 'value' }
  #   cwd: '/path/to/server' # Working directory for the server
  #   url: 'http://localhost:8080' # For SSE transport
  #   httpUrl: 'http://localhost:8081' # For streamable HTTP transport
  #   tcp: 'localhost:8082' # For WebSocket transport
  #   timeout: 5000 # Milliseconds
  #   trust: false # If true, bypasses tool call confirmations for this server
  #   description: 'My custom MCP server'

# Telemetry settings (see Telemetry documentation for details)
telemetry:
  enabled: true
  target: 'local' # 'local' or 'gcp'
  otlpEndpoint: 'http://localhost:4317' # OTLP endpoint if target is 'gcp' or for custom local collectors
  logPrompts: true # If false, user prompts will not be logged.

# Usage statistics (separate from detailed telemetry)
usageStatisticsEnabled: true

# Bug reporting command
bugCommand:
  urlTemplate: 'https://github.com/google/gemini-code-assist/issues/new?template=bug_report.yml&title=[BUG]%20{TITLE}&body={BODY}'

# Checkpointing settings (see Checkpointing documentation)
checkpointing:
  enabled: false

# Git-aware file filtering
fileFiltering:
  respectGitIgnore: true # If true, .gitignore rules are respected by file tools.
  enableRecursiveFileSearch: true # For @file completions.

# LLM Provider Settings
llmProvider: 'gemini' # 'gemini' or 'openrouter'
# API key for OpenRouter, if llmProvider is 'openrouter'.
# Recommended to set via OPENROUTER_API_KEY environment variable for security.
# Can use $VAR substitution: e.g., "$OPENROUTER_API_KEY"
openRouterApiKey: ''
# Default model to use.
# For Gemini provider: e.g., "gemini-1.5-pro-latest", "gemini-1.0-pro"
# For OpenRouter provider: e.g., "openai/gpt-4o", "anthropic/claude-3-opus" (MUST be specified for OpenRouter)
model: 'gemini-1.0-pro' # Example, adjust to your preferred default.
# Generation Config for Gemini models (see Google AI documentation for GenerationConfig options)
generationConfig:
  # temperature: 0.9
  # topK: 1
  # topP: 1
  # maxOutputTokens: 2048
  # stopSequences: []

# Extensions configuration
# This section holds configurations for any installed/managed extensions.
# The structure here mirrors how extensions would define their configuration.
extensions: {}
  # Example for an extension named 'my-custom-extension':
  # my-custom-extension:
  #   name: 'my-custom-extension' # Should match the key
  #   version: '1.0.0'
  #   # MCP servers specific to this extension
  #   mcpServers:
  #     ext_server_1:
  #       command: 'npm'
  #       args: ['run', 'start-ext-server']
  #       cwd: 'path/to/extension/src' # Path resolution depends on extension system
  #   # Context files for this extension. Paths are typically relative to workspace
  #   # or a defined extension directory.
  #   contextFileName: ['README.md', 'EXTENSION_CONTEXT.md']

```

Many of these settings correspond to command-line arguments and environment variables, which can override the values in `config.yaml`.

## Shell History

The CLI keeps a history of shell commands you run. To avoid conflicts between different projects, this history is stored in a project-specific directory within your user's home folder.

- **Location:** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` is a unique identifier generated from your project's root path.
  - The history is stored in a file named `shell_history`.

## Environment Variables & `.env` Files

Environment variables are a common way to configure applications, especially for sensitive information like API keys or for settings that might change between environments.

The CLI automatically loads environment variables from an `.env` file. The loading order is:

1.  `.env` file in the current working directory.
2.  If not found, it searches upwards in parent directories until it finds an `.env` file or reaches the project root (identified by a `.git` folder) or the home directory.
3.  If still not found, it looks for `~/.env` (in the user's home directory).

- **`GEMINI_API_KEY`**:
  - Your API key for the Gemini API, used when `llmProvider` is `gemini` (default).
  - Crucial for operation when using the Gemini provider with an API key.
  - Set this in your shell profile (e.g., `~/.bashrc`, `~/.zshrc`) or an `.env` file.
- **`OPENROUTER_API_KEY`**:
  - Your API key for OpenRouter.ai, used when `llmProvider` is `openrouter`.
  - Required if using the OpenRouter provider and `--openrouter-api-key` argument is not set.
  - Set this in your shell profile or an `.env` file.
- **`GEMINI_MODEL`**:
  - Specifies the default model to use when the provider is `gemini`.
  - Overrides the hardcoded default Gemini model.
  - For other providers like OpenRouter, the model must be specified using the `--model` command-line argument.
  - Example: `export GEMINI_MODEL="gemini-1.5-flash"`
- **`GOOGLE_API_KEY`**:
  - Your Google Cloud API key.
  - Required for using Vertex AI in express mode.
  - Ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`.
- **`GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID.
  - Required for using Code Assist or Vertex AI.
  - If using Vertex AI, ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_APPLICATION_CREDENTIALS`** (string):
  - **Description:** The path to your Google Application Credentials JSON file.
  - **Example:** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID for Telemetry in Google Cloud
  - Example: `export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_CLOUD_LOCATION`**:
  - Your Google Cloud Project Location (e.g., us-central1).
  - Required for using Vertex AI in non express mode.
  - If using Vertex AI, ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`.
- **`GEMINI_SANDBOX`**:
  - Alternative to the `sandbox` setting in `settings.json`.
  - Accepts `true`, `false`, `docker`, `podman`, or a custom command string.
- **`SEATBELT_PROFILE`** (macOS specific):
  - Switches the Seatbelt (`sandbox-exec`) profile on macOS.
  - `permissive-open`: (Default) Restricts writes to the project folder (and a few other folders, see `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) but allows other operations.
  - `strict`: Uses a strict profile that declines operations by default.
  - `<profile_name>`: Uses a custom profile. To define a custom profile, create a file named `sandbox-macos-<profile_name>.sb` in your project's `.gemini/` directory (e.g., `my-project/.gemini/sandbox-macos-custom.sb`).
- **`DEBUG` or `DEBUG_MODE`** (often used by underlying libraries or the CLI itself):
  - Set to `true` or `1` to enable verbose debug logging, which can be helpful for troubleshooting.
- **`NO_COLOR`**:
  - Set to any value to disable all color output in the CLI.
- **`CLI_TITLE`**:
  - Set to a string to customize the title of the CLI.
- **`CODE_ASSIST_ENDPOINT`**:
  - Specifies the endpoint for the code assist server.
  - This is useful for development and testing.

## LLM Provider Configuration

Gemini CLI allows you to choose different Large Language Model (LLM) providers for generating responses.

### Default Provider: Google Gemini

By default, Gemini CLI uses Google's Gemini models.
- **Authentication**: If you are using a Gemini API key, ensure the `GEMINI_API_KEY` environment variable is set. The CLI will automatically pick it up.
  ```bash
  export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
  gemini --prompt "Hello"
  ```
- **Model Selection**: You can specify a Gemini model using the `--model` argument (e.g., `gemini --model "gemini-1.5-flash"`) or by setting the `GEMINI_MODEL` environment variable. If not specified, a default Gemini model will be used.

### Using OpenRouter

[OpenRouter.ai](https://openrouter.ai/) provides access to a variety of LLMs from different developers through a unified API. To use OpenRouter with Gemini CLI, you need to configure three main things: the provider, your API key, and the specific model you want to use.

**1. Command-Line Arguments:**

   You can configure OpenRouter directly via command-line arguments:
   - **Set the LLM Provider**: Use `--llm-provider openrouter`.
   - **Provide an API Key**:
     - Use `--openrouter-api-key YOUR_OPENROUTER_KEY` (replace `YOUR_OPENROUTER_KEY` with your actual key). This will override any key set in `config.yaml` or environment variables for this session.
     - Or, set the `OPENROUTER_API_KEY` environment variable (overrides `config.yaml`).
     - Or, set `openRouterApiKey` in `config.yaml`.
   - **Specify a Model**: You **must** specify a model compatible with OpenRouter using the `--model "vendor/model-name"` argument (e.g., `--model "openai/gpt-4o"`, `--model "anthropic/claude-3-opus"`). This overrides `model` in `config.yaml`. Refer to the [OpenRouter documentation](https://openrouter.ai/docs#models) for available model strings.

   **Example using CLI arguments (overriding other sources):**
   ```bash
   gemini --llm-provider openrouter \
          --model "openai/gpt-4o" \
          --openrouter-api-key "sk-or-v1-cli-provided-key" \
          --prompt "Translate 'hello world' to French."
   ```

   **Example using environment variable for API key (overrides `config.yaml`):**
   ```bash
   export OPENROUTER_API_KEY="sk-or-v1-env-var-key"
   gemini --llm-provider openrouter \
          --model "openai/gpt-4o" \
          --prompt "Translate 'hello world' to French."
   ```

**2. Using `config.yaml`:**

   You can configure OpenRouter in your user or workspace `config.yaml` file (`~/.gemini/config.yaml` or `./.gemini/config.yaml`). This is useful for persistent configuration.

   Set the following keys in your `config.yaml`:
   - **`llmProvider`**: Set to `openrouter`.
   - **`model`**: Set to the desired OpenRouter model string (e.g., `"openai/gpt-4o"`). This is **required** when `llmProvider` is `openrouter`.
   - **`openRouterApiKey`**: Your OpenRouter API key. You can also use environment variable substitution (e.g., `"$OPENROUTER_API_KEY"`).

   **Example `config.yaml` for OpenRouter:**
   ```yaml
   llmProvider: 'openrouter'
   model: 'anthropic/claude-3-sonnet'
   openRouterApiKey: 'sk-or-v1-your-api-key-here'
   # ... other settings
   ```
   Or, using an environment variable for the key within `config.yaml`:
   ```yaml
   llmProvider: 'openrouter'
   model: 'google/gemini-pro' # OpenRouter also proxies some Gemini models
   openRouterApiKey: '$OPENROUTER_API_KEY' # Will be replaced by the env var value
   # ... other settings
   ```
   With these settings in `config.yaml`, you can simply run:
   ```bash
   gemini --prompt "Tell me a joke about OpenRouter."
   ```
   The CLI will use the OpenRouter configuration from your `config.yaml` file. Command-line arguments and environment variables will still override `config.yaml` values if provided, following the precedence rules.

**Important for OpenRouter:**
- Always ensure `model` is set to a valid OpenRouter model string (either via CLI argument or in `config.yaml`).
- Ensure your `openRouterApiKey` (via CLI, env var `OPENROUTER_API_KEY`, or `config.yaml`) is correctly set.

---

## Command-Line Arguments

Arguments passed directly when running the CLI have the highest precedence and override settings from environment variables and `config.yaml` files.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Specifies the model to use.
  - For the default Gemini provider, e.g., `"gemini-1.5-pro-latest"`.
  - For OpenRouter, this **must** be specified with the provider/model format, e.g., `"openai/gpt-4o"`.
  - Example: `gemini --model "gemini-1.5-pro-latest"`
  - Example (OpenRouter): `gemini --llm-provider openrouter --model "openai/gpt-4o"`
- **`--llm-provider <provider>`**:
  - Specifies the LLM provider to use.
  - **Choices**: `gemini`, `openrouter`
  - **Default**: `gemini` (or as set in `config.yaml`)
  - Example: `gemini --llm-provider openrouter`
- **`--openrouter-api-key <key>`**:
  - API key for OpenRouter.ai.
  - Required if `--llm-provider` is `openrouter` and the key is not set via `OPENROUTER_API_KEY` environment variable or in `config.yaml`.
  - Example: `gemini --llm-provider openrouter --openrouter-api-key "sk-or-v1-..."`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Used to pass a prompt directly to the command. This invokes Gemini CLI in a non-interactive mode.
- **`--sandbox`** (**`-s`**):
  - Enables sandbox mode for this session. Overrides `sandbox` setting in `config.yaml`.
- **`--sandbox-image <uri>`**:
  - Sets the sandbox image URI. Overrides `sandbox.image` from `config.yaml` if sandbox is specified as an object there.
- **`--debug`** (**`-d`**): (Note: a previous version of this doc incorrectly listed `--debug_mode`)
  - Enables debug mode for this session, providing more verbose output.
- **`--all_files`** (**`-a`**):
  - If set, recursively includes all files within the current directory as context for the prompt.
- **`--help`** (or **`-h`**):
  - Displays help information about command-line arguments.
- **`--show_memory_usage`**:
  - Displays the current memory usage. Overrides `showMemoryUsage` in `config.yaml`.
- **`--yolo`** (**`-y`**):
  - Enables YOLO mode, which automatically approves all tool calls.
- **`--telemetry <boolean>`**:
  - Explicitly enables or disables [telemetry](../telemetry.md) for this session. Overrides `telemetry.enabled` in `config.yaml`.
- **`--telemetry-target <target>`**:
  - Sets the telemetry target (e.g., `local`, `gcp`). Overrides `telemetry.target` in `config.yaml`. See [telemetry](../telemetry.md) for more information.
- **`--telemetry-otlp-endpoint <endpoint>`**:
  - Sets the OTLP endpoint for telemetry. Overrides `telemetry.otlpEndpoint` in `config.yaml`. See [telemetry](../telemetry.md) for more information.
- **`--telemetry-log-prompts <boolean>`**:
  - Enables or disables logging of prompts for telemetry for this session. Overrides `telemetry.logPrompts` in `config.yaml`. See [telemetry](../telemetry.md) for more information.
- **`--checkpointing <boolean>`**:
  - Explicitly enables or disables [checkpointing](./commands.md#checkpointing-commands) for this session. Overrides `checkpointing.enabled` in `config.yaml`.
- **`--version`** (**`-v`**):
  - Displays the version of the CLI.

## Context Files (Hierarchical Instructional Context)

While not strictly configuration for the CLI's _behavior_, context files (defaulting to `GEMINI.md` but configurable via the `contextFileName` setting) are crucial for configuring the _instructional context_ (also referred to as "memory") provided to the Gemini model. This powerful feature allows you to give project-specific instructions, coding style guides, or any relevant background information to the AI, making its responses more tailored and accurate to your needs. The CLI includes UI elements, such as an indicator in the footer showing the number of loaded context files, to keep you informed about the active context.

- **Purpose:** These Markdown files contain instructions, guidelines, or context that you want the Gemini model to be aware of during your interactions. The system is designed to manage this instructional context hierarchically.

### Example Context File Content (e.g., `GEMINI.md`)

Here's a conceptual example of what a context file at the root of a TypeScript project might contain:

```markdown
# Project: My Awesome TypeScript Library

## General Instructions:

- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 18+.

## Coding Style:

- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`

- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.

## Regarding Dependencies:

- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.
```

This example demonstrates how you can provide general project context, specific coding conventions, and even notes about particular files or components. The more relevant and precise your context files are, the better the AI can assist you. Project-specific context files are highly encouraged to establish conventions and context.

- **Hierarchical Loading and Precedence:** The CLI implements a sophisticated hierarchical memory system by loading context files (e.g., `GEMINI.md`) from several locations. Content from files lower in this list (more specific) typically overrides or supplements content from files higher up (more general). The exact concatenation order and final context can be inspected using the `/memory show` command. The typical loading order is:
  1.  **Global Context File:**
      - Location: `~/.gemini/<contextFileName>` (e.g., `~/.gemini/GEMINI.md` in your user home directory).
      - Scope: Provides default instructions for all your projects.
  2.  **Project Root & Ancestors Context Files:**
      - Location: The CLI searches for the configured context file in the current working directory and then in each parent directory up to either the project root (identified by a `.git` folder) or your home directory.
      - Scope: Provides context relevant to the entire project or a significant portion of it.
  3.  **Sub-directory Context Files (Contextual/Local):**
      - Location: The CLI also scans for the configured context file in subdirectories _below_ the current working directory (respecting common ignore patterns like `node_modules`, `.git`, etc.).
      - Scope: Allows for highly specific instructions relevant to a particular component, module, or sub-section of your project.
- **Concatenation & UI Indication:** The contents of all found context files are concatenated (with separators indicating their origin and path) and provided as part of the system prompt to the Gemini model. The CLI footer displays the count of loaded context files, giving you a quick visual cue about the active instructional context.
- **Commands for Memory Management:**
  - Use `/memory refresh` to force a re-scan and reload of all context files from all configured locations. This updates the AI's instructional context.
  - Use `/memory show` to display the combined instructional context currently loaded, allowing you to verify the hierarchy and content being used by the AI.
  - See the [Commands documentation](./commands.md#memory) for full details on the `/memory` command and its sub-commands (`show` and `refresh`).

By understanding and utilizing these configuration layers and the hierarchical nature of context files, you can effectively manage the AI's memory and tailor the Gemini CLI's responses to your specific needs and projects.

## Sandboxing

The Gemini CLI can execute potentially unsafe operations (like shell commands and file modifications) within a sandboxed environment to protect your system.

Sandboxing is disabled by default, but you can enable it in a few ways:

- Using `--sandbox` or `-s` flag.
- Setting `GEMINI_SANDBOX` environment variable.
- Sandbox is enabled in `--yolo` mode by default.

By default, it uses a pre-built `gemini-cli-sandbox` Docker image.

For project-specific sandboxing needs, you can create a custom Dockerfile at `.gemini/sandbox.Dockerfile` in your project's root directory. This Dockerfile can be based on the base sandbox image:

```dockerfile
FROM gemini-cli-sandbox

# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

When `.gemini/sandbox.Dockerfile` exists, you can use `BUILD_SANDBOX` environment variable when running Gemini CLI to automatically build the custom sandbox image:

```bash
BUILD_SANDBOX=1 gemini -s
```

## Usage Statistics

To help us improve the Gemini CLI, we collect anonymized usage statistics. This data helps us understand how the CLI is used, identify common issues, and prioritize new features.

**What we collect:**

- **Tool Calls:** We log the names of the tools that are called, whether they succeed or fail, and how long they take to execute. We do not collect the arguments passed to the tools or any data returned by them.
- **API Requests:** We log the Gemini model used for each request, the duration of the request, and whether it was successful. We do not collect the content of the prompts or responses.
- **Session Information:** We collect information about the configuration of the CLI, such as the enabled tools and the approval mode.

**What we DON'T collect:**

- **Personally Identifiable Information (PII):** We do not collect any personal information, such as your name, email address, or API keys.
- **Prompt and Response Content:** We do not log the content of your prompts or the responses from the Gemini model.
- **File Content:** We do not log the content of any files that are read or written by the CLI.

**How to opt out:**

You can opt out of usage statistics collection at any time by setting the `usageStatisticsEnabled` key to `false` in your `config.yaml` file:

```yaml
# In ~/.gemini/config.yaml or ./.gemini/config.yaml
usageStatisticsEnabled: false
```
