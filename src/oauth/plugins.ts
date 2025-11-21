import { Auth } from "../auth"
import { Log } from "../util/log"

export interface AuthPluginHook {
  provider: string
  loader?: (getAuth: () => Promise<Auth.Info | undefined>, provider: any) => Promise<Record<string, any> | undefined | null>
}

const log = Log.create({ service: "oauth-plugins" })

const SUPPORTED_PLUGINS: Record<string, () => Promise<(input: any) => Promise<{ auth?: AuthPluginHook }>>> = {
  "opencode-anthropic-auth": async () => ((await import("opencode-anthropic-auth")) as any).AnthropicAuthPlugin,
  "opencode-copilot-auth": async () => ((await import("opencode-copilot-auth")) as any).CopilotAuthPlugin,
  "opencode-gemini-auth": async () => ((await import("opencode-gemini-auth")) as any).GeminiCLIOAuthPlugin,
}

const DEFAULT_PLUGINS = ["opencode-copilot-auth@0.0.5", "opencode-anthropic-auth@0.0.2"]

export async function loadAuthPlugins(pluginSpecs: string[], includeDefaults: boolean) {
  const specs = new Set(pluginSpecs ?? [])
  if (includeDefaults) {
    for (const item of DEFAULT_PLUGINS) specs.add(item)
  }

  const hooks: AuthPluginHook[] = []
  const cache = new Map<string, AuthPluginHook>()

  for (const spec of specs) {
    const pkg = resolvePackageName(spec)
    if (!pkg) continue
    if (cache.has(pkg)) {
      hooks.push(cache.get(pkg)!)
      continue
    }
    const loader = SUPPORTED_PLUGINS[pkg]
    if (!loader) continue
    const factory = await loader().catch((error) => {
      log.warn("failed to load auth plugin", { pkg, error })
      return undefined
    })
    if (!factory) continue
    const pluginHooks = await factory({
      client: authClient,
      directory: process.cwd(),
      worktree: process.cwd(),
      project: {},
      $: Bun.$,
    }).catch((error: any) => {
      log.warn("auth plugin init failed", { pkg, error })
      return undefined
    })
    if (!pluginHooks?.auth) continue
    cache.set(pkg, pluginHooks.auth)
    hooks.push(pluginHooks.auth)
  }

  return hooks
}

const authClient = {
  auth: {
    async set(input: { path: { id: string }; body: Auth.Info }) {
      await Auth.set(input.path.id, input.body)
    },
  },
}

function resolvePackageName(spec: string) {
  if (!spec) return undefined
  if (spec.startsWith("file://")) return undefined
  if (spec.startsWith(".")) return undefined
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/")
    if (slash === -1) return spec
    const atIndex = spec.indexOf("@", slash)
    return atIndex === -1 ? spec : spec.slice(0, atIndex)
  }
  const atIndex = spec.lastIndexOf("@")
  if (atIndex <= 0) return spec
  return spec.slice(0, atIndex)
}
