import { Auth } from "../auth"
import { Log } from "../util/log"
import path from "path"
import { BunProc } from "../bun-proc"

export interface AuthPluginHook {
  provider: string
  loader?: (getAuth: () => Promise<Auth.Info | undefined>, provider: any) => Promise<Record<string, any> | undefined | null>
}

const log = Log.create({ service: "oauth-plugins" })
const DEFAULT_AUTH_PLUGINS = ["opencode-copilot-auth@0.0.5", "opencode-anthropic-auth@0.0.2"]
const moduleCache = new Map<string, AuthPluginHook[]>()

const authClient = {
  auth: {
    async set(input: { path: { id: string }; body: Auth.Info }) {
      await Auth.set(input.path.id, input.body)
    },
  },
}

const pluginInput = {
  client: authClient,
  directory: process.cwd(),
  worktree: process.cwd(),
  project: {},
  $: Bun.$,
}

export async function loadAuthPlugins(pluginSpecs: string[], includeDefaults: boolean) {
  const specs = new Set(pluginSpecs ?? [])
  if (includeDefaults) {
    for (const spec of DEFAULT_AUTH_PLUGINS) specs.add(spec)
  }

  const hooks: AuthPluginHook[] = []

  for (const spec of specs) {
    const trimmed = spec?.trim()
    if (!trimmed) continue
    if (!shouldLoadAuthPlugin(trimmed)) continue

    const modulePath = await resolvePluginModule(trimmed)
    if (!modulePath) continue

    if (moduleCache.has(modulePath)) {
      hooks.push(...moduleCache.get(modulePath)!)
      continue
    }

    const moduleHooks: AuthPluginHook[] = []
    const mod = await import(modulePath).catch((error) => {
      log.warn("failed to load auth plugin module", { spec: trimmed, error })
      return undefined
    })
    if (!mod) {
      moduleCache.set(modulePath, moduleHooks)
      continue
    }

    for (const [exportName, factory] of Object.entries(mod)) {
      if (typeof factory !== "function") continue

      const pluginHooks = await (factory as any)(pluginInput).catch((error: any) => {
        log.warn("auth plugin init failed", { spec: trimmed, exportName, error })
        return undefined
      })
      if (!pluginHooks?.auth) continue
      moduleHooks.push(pluginHooks.auth)
    }

    moduleCache.set(modulePath, moduleHooks)
    hooks.push(...moduleHooks)
  }

  return hooks
}

function shouldLoadAuthPlugin(spec: string) {
  if (!spec) return false
  if (DEFAULT_AUTH_PLUGINS.includes(spec)) return true
  const parsed = parsePackageSpec(spec)
  // Check if package name includes "auth" or known auth plugins
  if (parsed && parsed.pkg.toLowerCase().includes("auth")) return true
  // Special case for @openhax/codex which is an OpenAI OAuth plugin
  if (parsed && parsed.pkg === "@openhax/codex") return true
  return spec.toLowerCase().includes("auth")
}

async function resolvePluginModule(spec: string) {
  if (!spec) return undefined
  const trimmed = spec.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("file://")) return trimmed
  if (trimmed.startsWith(".") || trimmed.startsWith("/")) {
    return path.resolve(process.cwd(), trimmed)
  }
  const parsed = parsePackageSpec(trimmed)
  if (!parsed) return undefined
  try {
    return await BunProc.install(parsed.pkg, parsed.version)
  } catch (error) {
    log.warn("failed to install auth plugin", { spec: trimmed, error })
    return undefined
  }
}

function parsePackageSpec(spec: string) {
  if (!spec) return undefined
  if (spec.startsWith("file://") || spec.startsWith(".") || spec.startsWith("/")) return undefined

  let pkg = spec
  let version = "latest"

  if (spec.startsWith("@")) {
    const slashIndex = spec.indexOf("/")
    if (slashIndex === -1) return { pkg, version }
    const atIndex = spec.indexOf("@", slashIndex)
    if (atIndex !== -1) {
      pkg = spec.slice(0, atIndex)
      version = spec.slice(atIndex + 1) || version
    }
  } else {
    const atIndex = spec.lastIndexOf("@")
    if (atIndex > 0) {
      pkg = spec.slice(0, atIndex)
      version = spec.slice(atIndex + 1) || version
    }
  }

  return { pkg, version }
}
