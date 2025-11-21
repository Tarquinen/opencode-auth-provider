#!/usr/bin/env bun

import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { OpencodeAI } from "../src/index"
import { generateText } from "ai"
import { ProviderRuntimeOptions } from "../src/provider/provider"
import { ModelsDev } from "../src/provider/models"

async function prompt(question: string) {
    const rl = createInterface({ input, output })
    const answer = await rl.question(question)
    rl.close()
    return answer.trim()
}

function sortModels(models: ModelsDev.Provider["models"]) {
    return Object.entries(models)
        .filter(([, info]) => info)
        .sort((a, b) => a[0].localeCompare(b[0]))
}

async function main() {
    const options: ProviderRuntimeOptions = {
        workspaceDir: process.cwd(),
    }
    const runtime = new OpencodeAI(options)
    const providers = Object.values(await runtime.listProviders())

    if (providers.length === 0) {
        console.error("No providers found. Make sure opencode.jsonc/auth.json are configured.")
        process.exit(1)
    }

    console.log("Available providers:\n")
    providers.forEach((item, idx) => {
        const modelCount = Object.keys(item.info.models).length
        console.log(`${idx + 1}. ${item.info.name} (${item.info.id}) - ${modelCount} models`)
    })

    const defaultModel = await runtime.getDefaultModel()
    const providerAnswer = await prompt(
        `Select provider [1-${providers.length} or ID, default ${defaultModel.providerID}]: `,
    )

    const provider = (() => {
        if (!providerAnswer) return providers.find((item) => item.info.id === defaultModel.providerID)!
        const idx = Number(providerAnswer)
        if (!Number.isNaN(idx) && idx >= 1 && idx <= providers.length) {
            return providers[idx - 1]
        }
        return providers.find((item) => item.info.id === providerAnswer) ?? providers[0]
    })()

    const entries = sortModels(provider.info.models)
    console.log(`\nModels for ${provider.info.name}:\n`)
    entries.forEach(([id, model], idx) => {
        const line = `${idx + 1}. ${model!.name} (${id})`
        console.log(line)
    })

    const modelAnswer = await prompt(
        `Select model [1-${entries.length} or ID, default ${defaultModel.modelID}]: `,
    )
    const model = (() => {
        if (!modelAnswer) return provider.info.models[defaultModel.modelID] ?? provider.info.models[entries[0][0]]
        const idx = Number(modelAnswer)
        if (!Number.isNaN(idx) && idx >= 1 && idx <= entries.length) {
            return provider.info.models[entries[idx - 1][0]]
        }
        return provider.info.models[modelAnswer] ?? provider.info.models[entries[0][0]]
    })()
    const selectedModelID = Object.entries(provider.info.models).find(([, val]) => val === model)?.[0] ?? entries[0][0]

    const promptText = await prompt("Enter your prompt (blank to cancel): ")
    if (!promptText) {
        console.log("No prompt provided. Exiting.")
        return
    }

    console.log(`\nCalling ${provider.info.id}/${selectedModelID}...`)
    const languageModel = await runtime.getLanguageModel(provider.info.id, selectedModelID)
    const response = await generateText({
        model: languageModel,
        prompt: promptText,
    })

    console.log("\nResponse:\n")
    console.log(response.text)
}

main().catch((error) => {
    console.error("chat-with-provider failed", error)
    process.exit(1)
})
