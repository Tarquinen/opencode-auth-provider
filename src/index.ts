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

  /**
   * Get a suitable model for background analysis tasks like context pruning.
   * Prefers small/cheap models to minimize cost while maintaining quality.
   * 
   * @param options - Optional configuration to specify a particular provider/model
   * @returns A LanguageModel suitable for analysis tasks
   */
  async getAnalysisModel(options?: { provider?: string; model?: string }): Promise<LanguageModel> {
    // If user specified a model in config, use it
    if (options?.provider && options?.model) {
      return this.getLanguageModel(options.provider, options.model)
    }
    
    // Try to get a small, cheap model from the default provider
    const { providerID } = await this.getDefaultModel()
    const small = await this.getSmallModel(providerID)
    
    if (small) {
      return small.language
    }
    
    // Fallback to default model if no small model available
    const { modelID } = await this.getDefaultModel()
    return this.getLanguageModel(providerID, modelID)
  }
}

export type { ProviderRuntimeOptions, ModelsDev }
export { Auth }
