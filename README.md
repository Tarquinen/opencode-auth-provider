# opencode-auth-provider

A reusable runtime that mirrors OpenCode's provider discovery logic so plugins can reuse the credentials stored in `~/.local/share/opencode/auth.json` (API keys and OAuth) to run clean AI calls via the Vercel AI SDK.

## Features

- Loads the same `opencode.jsonc` configuration layers (global + workspace) and merges provider overrides
- Reads `~/.local/share/opencode/auth.json` and environment variables just like the CLI
- Installs provider SDK packages on-demand (via Bun) and exposes ready-to-use `LanguageModel` instances
- Boots the same OAuth auth plugins as the CLI (Anthropic + Copilot by default, plus anything listed in your `opencode.jsonc`, e.g. `opencode-gemini-auth`) so refresh logic matches the CLI
- Keeps models in sync with [models.dev](https://models.dev) and applies the same filtering rules (e.g. experimental flags)

## Usage

```ts
import { OpencodeAI } from "opencode-auth-provider"
import { generateText } from "ai"

const runtime = new OpencodeAI({ workspaceDir: process.cwd() })

const { providerID, modelID } = await runtime.getDefaultModel()
const model = await runtime.getLanguageModel(providerID, modelID)

const result = await generateText({
  model,
  prompt: "Summarize the most recent changes",
})

console.log(result.text)
```

### Selecting providers directly

```ts
const githubModel = await runtime.getLanguageModel("github-copilot", "gpt-4o-mini")
const response = await generateText({
  model: githubModel,
  messages: [{ role: "user", content: "Explain the PR diff" }],
})
```

### Refreshing state

Call `runtime.reset()` if you update `opencode.jsonc` or `auth.json` during runtime.

## Demo script

A ready-to-run script lives at `scripts/run-model.ts`. It uses the package to pick a model and print the response.

### Prerequisites

1. Bun ≥ 1.1 installed.
2. OpenCode credentials configured (e.g. `~/.local/share/opencode/auth.json` plus any `opencode.jsonc` files you rely on).
3. This repo checked out (e.g. `/home/dan/.config/opencode/opencode-auth-provider`).

### Steps

```bash
cd /home/dan/.config/opencode/opencode-auth-provider
bun install           # install deps (already done if you ran it once)
```

**Quick single-shot call**

```bash
bun scripts/run-model.ts --prompt "Say hello"
```

- Use `--provider <id>` and `--model <id>` to override the defaults (otherwise it uses whatever `opencode.jsonc` marks as default).
- Use `--cwd /path/to/project` if you want the runtime to load configs from another workspace.
- The script outputs which provider/model were chosen and prints the model text. Any OAuth refresh handling happens automatically.

**Interactive picker**

```bash
bun scripts/chat-with-provider.ts
```

- Shows every detected provider + model and lets you pick by number or ID.
- Prompts for the message text and prints the resulting completion.
- Press Enter to accept defaults (the same ones OpenCode would use).

## Notes

- The package requires Bun (matching OpenCode) because it relies on `Bun.spawn`, `Bun.hash`, and Bun's package installer for on-demand provider SDKs.
- Additional OAuth plugins can be added by listing them in `opencode.jsonc` and installing their npm packages alongside this library.
- By default the Anthropic and Copilot auth plugins are always loaded (unless `OPENCODE_DISABLE_DEFAULT_PLUGINS=1`).
- A bundled snapshot of `models.dev` is included so cold starts work offline; when the network is available, it continues to refresh the cache hourly just like the CLI.
