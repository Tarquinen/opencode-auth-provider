import type { LanguageModel } from "ai"
import { Auth } from "./auth"
import { ProviderRuntime, type ProviderRuntimeOptions } from "./provider/provider"
import type { ModelsDev } from "./provider/models"

export class OpencodeAI {
  private readonly runtime: ProviderRuntime

  constructor(options: ProviderRuntimeOptions = {}) {
    this.runtime = new ProviderRuntime(options)
  }

  reset() {
    this.runtime.reset()
  }

  async listProviders() {
    return this.runtime.list()
  }

  async getProvider(providerID: string) {
    return this.runtime.getProvider(providerID)
  }

  async getModel(providerID: string, modelID: string) {
    return this.runtime.getModel(providerID, modelID)
  }

  async getLanguageModel(providerID: string, modelID: string): Promise<LanguageModel> {
    const model = await this.runtime.getModel(providerID, modelID)
    return model.language
  }

  async getSmallModel(providerID: string) {
    return this.runtime.getSmallModel(providerID)
  }

  async getDefaultModel() {
    return this.runtime.defaultModel()
  }
}

export type { ProviderRuntimeOptions, ModelsDev }
export { Auth }
