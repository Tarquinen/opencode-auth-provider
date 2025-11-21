import path from "path"
import fs from "fs/promises"
import { mergeDeep } from "remeda"
import { parse } from "jsonc-parser"
import { Global } from "./global"
import { Flag } from "./flag"

export interface ProviderConfigEntry {
  name?: string
  env?: string[]
  api?: string
  npm?: string
  options?: Record<string, any>
  models?: Record<
    string,
    {
      id?: string
      name?: string
      provider?: { npm?: string }
      cost?: Record<string, number>
      options?: Record<string, any>
      limit?: { context: number; output: number }
      release_date?: string
      attachment?: boolean
      reasoning?: boolean
      temperature?: boolean
      tool_call?: boolean
      modalities?: { input: string[]; output: string[] }
      headers?: Record<string, string>
    }
  >
}

export interface OpencodeConfig {
  provider?: Record<string, ProviderConfigEntry>
  plugin?: string[]
  disabled_providers?: string[]
  model?: string
  small_model?: string
}

export interface LoadConfigOptions {
  workspaceDir?: string
  extraFiles?: string[]
}

export async function loadConfig(options: LoadConfigOptions = {}) {
  let result: OpencodeConfig = {}

  for (const file of await defaultConfigFiles()) {
    result = mergeDeep(result, await readConfigFile(file))
  }

  if (Flag.OPENCODE_CONFIG) {
    result = mergeDeep(result, await readConfigFile(Flag.OPENCODE_CONFIG))
  }

  const workspaceDir = options.workspaceDir ? path.resolve(options.workspaceDir) : process.cwd()
  for (const file of await workspaceConfigFiles(workspaceDir)) {
    result = mergeDeep(result, await readConfigFile(file))
  }

  for (const file of options.extraFiles ?? []) {
    result = mergeDeep(result, await readConfigFile(file))
  }

  if (Flag.OPENCODE_CONFIG_CONTENT) {
    try {
      result = mergeDeep(result, JSON.parse(Flag.OPENCODE_CONFIG_CONTENT))
    } catch (error) {
      // Silently ignore parse errors
    }
  }

  result.provider ??= {}
  result.plugin ??= []

  return result
}

async function defaultConfigFiles() {
  const files: string[] = []
  const candidates = [
    path.join(Global.Path.config, "opencode.jsonc"),
    path.join(Global.Path.config, "opencode.json"),
  ]
  if (Flag.OPENCODE_CONFIG_DIR) {
    candidates.push(path.join(Flag.OPENCODE_CONFIG_DIR, "opencode.jsonc"))
    candidates.push(path.join(Flag.OPENCODE_CONFIG_DIR, "opencode.json"))
  }
  for (const file of candidates) {
    if (await exists(file)) files.push(file)
  }
  return files
}

async function workspaceConfigFiles(start: string) {
  const seen = new Set<string>()
  const files: string[] = []
  const directories: string[] = []
  let current = path.resolve(start)
  while (true) {
    directories.push(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  directories.reverse()
  for (const dir of directories) {
    for (const name of ["opencode.jsonc", "opencode.json"]) {
      const target = path.join(dir, name)
      if (seen.has(target)) continue
      if (await exists(target)) {
        files.push(target)
        seen.add(target)
      }
    }
    const hidden = path.join(dir, ".opencode")
    for (const name of ["opencode.jsonc", "opencode.json"]) {
      const target = path.join(hidden, name)
      if (seen.has(target)) continue
      if (await exists(target)) {
        files.push(target)
        seen.add(target)
      }
    }
  }
  return files
}

async function readConfigFile(file: string) {
  if (!(await exists(file))) return {}
  try {
    const text = await fs.readFile(file, "utf8")
    const errors: { error: number; offset: number; length: number }[] = []
    const parsed = parse(text, errors, { allowTrailingComma: true }) as OpencodeConfig | undefined
    if (!parsed) return {}
    return parsed
  } catch (error) {
    return {}
  }
}

async function exists(file: string) {
  return fs.access(file).then(() => true).catch(() => false)
}
