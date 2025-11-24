import z from "zod"
import { mergeDeep, sortBy } from "remeda"
import { NoSuchModelError, type LanguageModel, type Provider as SDK } from "ai"
import { BunProc } from "../bun-proc"
import { ModelsDev } from "./models"
import { NamedError } from "../util/error"
import { Auth } from "../auth"
import { Flag } from "../flag"
import { iife } from "../util/iife"
import { loadConfig, type OpencodeConfig } from "../config"
import { loadAuthPlugins } from "../oauth/plugins"

type CustomLoader = (provider: ModelsDev.Provider) => Promise<{
  autoload: boolean
  getModel?: (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
  options?: Record<string, any>
}>

type Source = "env" | "config" | "custom" | "api"

const CUSTOM_LOADERS: Record<string, CustomLoader> = {
  async anthropic() {
    return {
      autoload: false,
      options: {
        headers: {
          "anthropic-beta":
            "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        },
      },
    }
  },
  async opencode(input) {
    const hasKey = await (async () => {
      if (input.env.some((item: string) => process.env[item])) return true
      if (await Auth.get(input.id)) return true
      return false
    })()

    if (!hasKey) {
      for (const [key, value] of Object.entries(input.models) as [string, ModelsDev.Model][]) {
        if (value.cost.input === 0) continue
        delete input.models[key]
      }
    }

    return {
      autoload: Object.keys(input.models).length > 0,
      options: hasKey ? {} : { apiKey: "public" },
    }
  },
  openai: async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        return sdk.responses(modelID)
      },
      options: {},
    }
  },
  azure: async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
        if (options?.["useCompletionUrls"]) {
          return sdk.chat(modelID)
        } else {
          return sdk.responses(modelID)
        }
      },
      options: {},
    }
  },
  "azure-cognitive-services": async () => {
    const resourceName = process.env["AZURE_COGNITIVE_SERVICES_RESOURCE_NAME"]
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
        if (options?.["useCompletionUrls"]) {
          return sdk.chat(modelID)
        } else {
          return sdk.responses(modelID)
        }
      },
      options: {
        baseURL: resourceName ? `https://${resourceName}.cognitiveservices.azure.com/openai` : undefined,
      },
    }
  },
  "amazon-bedrock": async () => {
    if (!process.env["AWS_PROFILE"] && !process.env["AWS_ACCESS_KEY_ID"] && !process.env["AWS_BEARER_TOKEN_BEDROCK"])
      return { autoload: false }

    const region = process.env["AWS_REGION"] ?? "us-east-1"

    const { fromNodeProviderChain } = await import("@aws-sdk/credential-providers")
    return {
      autoload: true,
      options: {
        region,
        credentialProvider: fromNodeProviderChain(),
      },
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        let regionPrefix = region.split("-")[0]

        switch (regionPrefix) {
          case "us": {
            const modelRequiresPrefix = [
              "nova-micro",
              "nova-lite",
              "nova-pro",
              "nova-premier",
              "claude",
              "deepseek",
            ].some((m) => modelID.includes(m))
            const isGovCloud = region.startsWith("us-gov")
            if (modelRequiresPrefix && !isGovCloud) {
              modelID = `${regionPrefix}.${modelID}`
            }
            break
          }
          case "eu": {
            const regionRequiresPrefix = [
              "eu-west-1",
              "eu-west-2",
              "eu-west-3",
              "eu-north-1",
              "eu-central-1",
              "eu-south-1",
              "eu-south-2",
            ].some((r) => region.includes(r))
            const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((m) =>
              modelID.includes(m),
            )
            if (regionRequiresPrefix && modelRequiresPrefix) {
              modelID = `${regionPrefix}.${modelID}`
            }
            break
          }
          case "ap": {
            const isAustraliaRegion = ["ap-southeast-2", "ap-southeast-4"].includes(region)
            if (
              isAustraliaRegion &&
              ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((m) => modelID.includes(m))
            ) {
              regionPrefix = "au"
              modelID = `${regionPrefix}.${modelID}`
            } else {
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) => modelID.includes(m))
              if (modelRequiresPrefix) {
                regionPrefix = "apac"
                modelID = `${regionPrefix}.${modelID}`
              }
            }
            break
          }
        }

        return sdk.languageModel(modelID)
      },
    }
  },
  openrouter: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "HTTP-Referer": "https://opencode.ai/",
          "X-Title": "opencode",
        },
      },
    }
  },
  vercel: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "http-referer": "https://opencode.ai/",
          "x-title": "opencode",
        },
      },
    }
  },
  "google-vertex": async () => {
    const project = process.env["GOOGLE_CLOUD_PROJECT"] ?? process.env["GCP_PROJECT"] ?? process.env["GCLOUD_PROJECT"]
    const location = process.env["GOOGLE_CLOUD_LOCATION"] ?? process.env["VERTEX_LOCATION"] ?? "us-east5"
    const autoload = Boolean(project)
    if (!autoload) return { autoload: false }
    return {
      autoload: true,
      options: {
        project,
        location,
      },
      async getModel(sdk: any, modelID: string) {
        const id = String(modelID).trim()
        return sdk.languageModel(id)
      },
    }
  },
  "google-vertex-anthropic": async () => {
    const project = process.env["GOOGLE_CLOUD_PROJECT"] ?? process.env["GCP_PROJECT"] ?? process.env["GCLOUD_PROJECT"]
    const location = process.env["GOOGLE_CLOUD_LOCATION"] ?? process.env["VERTEX_LOCATION"] ?? "global"
    const autoload = Boolean(project)
    if (!autoload) return { autoload: false }
    return {
      autoload: true,
      options: {
        project,
        location,
      },
      async getModel(sdk: any, modelID: string) {
        const id = String(modelID).trim()
        return sdk.languageModel(id)
      },
    }
  },
  zenmux: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "HTTP-Referer": "https://opencode.ai/",
          "X-Title": "opencode",
        },
      },
    }
  },
}

interface ProviderState {
  models: Map<string, { providerID: string; modelID: string; info: ModelsDev.Model; language: LanguageModel; npm?: string }>
  providers: {
    [providerID: string]: {
      source: Source
      info: ModelsDev.Provider
      getModel?: (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
      options: Record<string, any>
    }
  }
  sdk: Map<number, SDK>
  realIdByKey: Map<string, string>
  config: OpencodeConfig
}

export interface ProviderRuntimeOptions {
  workspaceDir?: string
  extraConfigFiles?: string[]
}

export class ProviderRuntime {
  private statePromise?: Promise<ProviderState>

  constructor(private readonly options: ProviderRuntimeOptions = {}) {}

  reset() {
    this.statePromise = undefined
  }

  async list() {
    return this.state().then((state) => state.providers)
  }

  async getProvider(providerID: string) {
    return this.state().then((s) => s.providers[providerID])
  }

  async getModel(providerID: string, modelID: string) {
    const key = `${providerID}/${modelID}`
    const s = await this.state()
    if (s.models.has(key)) return s.models.get(key)!

    const provider = s.providers[providerID]
    if (!provider) throw new ModelNotFoundError({ providerID, modelID })
    const info = provider.info.models[modelID]
    if (!info) throw new ModelNotFoundError({ providerID, modelID })
    const sdk = await this.getSDK(provider.info, info, s)

    try {
      const keyReal = `${providerID}/${modelID}`
      const realID = s.realIdByKey.get(keyReal) ?? info.id
      const language = provider.getModel ? await provider.getModel(sdk, realID, provider.options) : sdk.languageModel(realID)
      const payload = {
        providerID,
        modelID,
        info,
        language,
        npm: info.provider?.npm ?? provider.info.npm,
      }
      s.models.set(key, payload)
      return payload
    } catch (e) {
      if (e instanceof NoSuchModelError)
        throw new ModelNotFoundError(
          {
            modelID: modelID,
            providerID,
          },
          { cause: e },
        )
      throw e
    }
  }

  async getSmallModel(providerID: string) {
    const s = await this.state()
    const cfg = s.config

    if (cfg.small_model) {
      const parsed = ProviderRuntime.parseModel(cfg.small_model)
      return this.getModel(parsed.providerID, parsed.modelID)
    }

    const provider = s.providers[providerID]
    if (!provider) return
    let priority = ["claude-haiku-4-5", "claude-haiku-4.5", "3-5-haiku", "3.5-haiku", "gemini-2.5-flash", "gpt-5-nano"]
    if (providerID === "github-copilot") {
      priority = priority.filter((m) => m !== "claude-haiku-4.5")
    }
    if (providerID === "opencode" || providerID === "local") {
      priority = ["gpt-5-nano"]
    }
    for (const item of priority) {
      for (const model of Object.keys(provider.info.models)) {
        if (model.includes(item)) return this.getModel(providerID, model)
      }
    }
  }

  async defaultModel() {
    const s = await this.state()
    const cfg = s.config
    if (cfg.model) return ProviderRuntime.parseModel(cfg.model)

    const provider = await this.list()
      .then((val) => Object.values(val))
      .then((x) => x.find((p) => !cfg.provider || Object.keys(cfg.provider).length === 0 || Object.keys(cfg.provider).includes(p.info.id)))
    if (!provider) throw new Error("no providers found")
    const [model] = ProviderRuntime.sort(Object.values(provider.info.models))
    if (!model) throw new Error("no models found")
    return {
      providerID: provider.info.id,
      modelID: model.id,
    }
  }

  private async state() {
    if (!this.statePromise) {
      this.statePromise = this.buildState()
    }
    return this.statePromise
  }

  private async buildState(): Promise<ProviderState> {
    const config = await loadConfig({
      workspaceDir: this.options.workspaceDir,
      extraFiles: this.options.extraConfigFiles,
    })
    const database = await ModelsDev.get()

    const providers: ProviderState["providers"] = {}
    const models = new Map<
      string,
      {
        providerID: string
        modelID: string
        info: ModelsDev.Model
        language: LanguageModel
        npm?: string
      }
    >()
    const sdk = new Map<number, SDK>()
    const realIdByKey = new Map<string, string>()

    function mergeProvider(
      id: string,
      options: Record<string, any>,
      source: Source,
      getModel?: (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>,
    ) {
      const provider = providers[id]
      if (!provider) {
        const info = database[id]
        if (!info) return
        if (info.api && !options["baseURL"]) options["baseURL"] = info.api
        providers[id] = {
          source,
          info,
          options,
          getModel,
        }
        return
      }
      provider.options = mergeDeep(provider.options, options)
      provider.source = source
      provider.getModel = getModel ?? provider.getModel
    }

    const configProviders = Object.entries(config.provider ?? {})

    if (database["github-copilot"]) {
      const githubCopilot = database["github-copilot"]
      database["github-copilot-enterprise"] = {
        ...githubCopilot,
        id: "github-copilot-enterprise",
        name: "GitHub Copilot Enterprise",
        api: undefined,
      }
    }

    for (const [providerID, provider] of configProviders) {
      const existing = database[providerID]
      const parsed: ModelsDev.Provider = {
        id: providerID,
        npm: provider.npm ?? existing?.npm,
        name: provider.name ?? existing?.name ?? providerID,
        env: provider.env ?? existing?.env ?? [],
        api: provider.api ?? existing?.api,
        models: existing?.models ?? {},
      }

      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        const existingModel = parsed.models[model.id ?? modelID]
        const name = iife(() => {
          if (model.name) return model.name
          if (model.id && model.id !== modelID) return modelID
          return existingModel?.name ?? modelID
        })
        const providerOverride = model.provider?.npm ? { npm: model.provider.npm } : undefined
        type Modalities = NonNullable<ModelsDev.Model["modalities"]>
        const fallbackModalities: Modalities = {
          input: ["text"] as Modalities["input"],
          output: ["text"] as Modalities["output"],
        }
        const modalitiesOverride = model.modalities
          ? {
              input: model.modalities.input as Modalities["input"],
              output: model.modalities.output as Modalities["output"],
            }
          : undefined
        const parsedModel: ModelsDev.Model = {
          id: modelID,
          name,
          release_date: model.release_date ?? existingModel?.release_date ?? new Date().toISOString(),
          attachment: model.attachment ?? existingModel?.attachment ?? false,
          reasoning: model.reasoning ?? existingModel?.reasoning ?? false,
          temperature: model.temperature ?? existingModel?.temperature ?? false,
          tool_call: model.tool_call ?? existingModel?.tool_call ?? true,
          cost:
            !model.cost && !existingModel?.cost
              ? {
                  input: 0,
                  output: 0,
                  cache_read: 0,
                  cache_write: 0,
                }
              : {
                  cache_read: 0,
                  cache_write: 0,
                  ...existingModel?.cost,
                  ...model.cost,
                },
          options: {
            ...existingModel?.options,
            ...model.options,
          },
          limit: model.limit ??
            existingModel?.limit ?? {
              context: 0,
              output: 0,
            },
          modalities: modalitiesOverride ?? existingModel?.modalities ?? fallbackModalities,
          headers: model.headers,
          provider: providerOverride ?? existingModel?.provider,
        }
        if (model.id && model.id !== modelID) {
          realIdByKey.set(`${providerID}/${modelID}`, model.id)
        }
        parsed.models[modelID] = parsedModel
      }
      database[providerID] = parsed
    }

    const disabled = new Set(config.disabled_providers ?? [])

    for (const [providerID, provider] of Object.entries(database)) {
      if (disabled.has(providerID)) continue
      const apiKey = provider.env.map((item) => process.env[item]).at(0)
      if (!apiKey) continue
      mergeProvider(providerID, provider.env.length === 1 ? { apiKey } : {}, "env")
    }

    for (const [providerID, provider] of Object.entries(await Auth.all())) {
      if (disabled.has(providerID)) continue
      if (provider.type === "api") {
        mergeProvider(providerID, { apiKey: provider.key }, "api")
      }
    }

    for (const [providerID, fn] of Object.entries(CUSTOM_LOADERS)) {
      if (disabled.has(providerID)) continue
      const result = await fn(database[providerID])
      if (result && (result.autoload || providers[providerID])) {
        mergeProvider(providerID, result.options ?? {}, "custom", result.getModel)
      }
    }

    const pluginHooks = await loadAuthPlugins(config.plugin ?? [], !Flag.OPENCODE_DISABLE_DEFAULT_PLUGINS)

    for (const hook of pluginHooks) {
      const providerID = hook.provider
      if (!providerID) continue
      if (disabled.has(providerID)) continue

      let hasAuth = false
      const auth = await Auth.get(providerID)
      if (auth) hasAuth = true

      if (providerID === "github-copilot" && !hasAuth) {
        const enterpriseAuth = await Auth.get("github-copilot-enterprise")
        if (enterpriseAuth) hasAuth = true
      }

      if (!hasAuth) continue
      if (!hook.loader) continue

      const providerInfo = database[providerID]
      if (!providerInfo) continue

      if (auth) {
        const options = await hook.loader(() => Auth.get(providerID) as any, providerInfo)
        mergeProvider(providerID, options ?? {}, "custom")
      }

      if (providerID === "github-copilot") {
        const enterpriseProviderID = "github-copilot-enterprise"
        if (!disabled.has(enterpriseProviderID)) {
          const enterpriseInfo = database[enterpriseProviderID]
          if (!enterpriseInfo) continue
          const enterpriseAuth = await Auth.get(enterpriseProviderID)
          if (enterpriseAuth) {
            const enterpriseOptions = await hook.loader(
              () => Auth.get(enterpriseProviderID) as any,
              enterpriseInfo,
            )
            mergeProvider(enterpriseProviderID, enterpriseOptions ?? {}, "custom")
          }
        }
      }
    }

    for (const [providerID, provider] of configProviders) {
      mergeProvider(providerID, provider.options ?? {}, "config")
    }

    for (const [providerID, provider] of Object.entries(providers)) {
      const filteredModels = Object.fromEntries(
        Object.entries(provider.info.models)
          .filter(
            ([modelID]) => modelID !== "gpt-5-chat-latest" && !(providerID === "openrouter" && modelID === "openai/gpt-5-chat"),
          )
          .filter(
            ([, model]) =>
              ((!model.experimental && model.status !== "alpha") || Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) &&
              model.status !== "deprecated",
          ),
      )
      provider.info.models = filteredModels

      if (Object.keys(provider.info.models).length === 0) {
        delete providers[providerID]
        continue
      }

      if (providerID === "openrouter") {
        provider.info.npm = "@openrouter/ai-sdk-provider"
      }
    }

    return {
      models,
      providers,
      sdk,
      realIdByKey,
      config,
    }
  }

  private async getSDK(provider: ModelsDev.Provider, model: ModelsDev.Model, state: ProviderState) {
    return (async () => {
      const pkg = model.provider?.npm ?? provider.npm ?? provider.id
      const options = { ...state.providers[provider.id]?.options }
      if (pkg.includes("@ai-sdk/openai-compatible") && options["includeUsage"] === undefined) {
        options["includeUsage"] = true
      }

      const key = Bun.hash.xxHash32(JSON.stringify({ pkg, options }))
      const existing = state.sdk.get(key)
      if (existing) return existing

      let installedPath: string
      if (!pkg.startsWith("file://")) {
        installedPath = await BunProc.install(pkg, "latest")
      } else {
        installedPath = pkg
      }

      const modPath = provider.id === "google-vertex-anthropic" ? `${installedPath}/dist/anthropic/index.mjs` : installedPath
      const mod = await import(modPath)

      const customFetch = options["fetch"]

      options["fetch"] = async (input: any, init?: RequestInit) => {
        const fetchFn = customFetch ?? fetch
        const opts = init ?? {}

        if (options["timeout"] !== undefined && options["timeout"] !== null) {
          const signals: AbortSignal[] = []
          if (opts.signal) signals.push(opts.signal)
          if (options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]))

          const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

          opts.signal = combined
        }

        return fetchFn(input, {
          ...opts,
          timeout: false as any,
        })
      }
      const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
      const loaded = fn({
        name: provider.id,
        ...options,
      })
      state.sdk.set(key, loaded)
      return loaded as SDK
    })().catch((e) => {
      throw new InitError({ providerID: provider.id }, { cause: e })
    })
  }

  static parseModel(model: string) {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: providerID,
      modelID: rest.join("/"),
    }
  }

  static sort(models: ModelsDev.Model[]) {
    const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
    return sortBy(
      models,
      [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
      [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
      [(model) => model.id, "desc"],
    )
  }
}

export const ModelNotFoundError = NamedError.create(
  "ProviderModelNotFoundError",
  z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
)

export const InitError = NamedError.create(
  "ProviderInitError",
  z.object({
    providerID: z.string(),
  }),
)
