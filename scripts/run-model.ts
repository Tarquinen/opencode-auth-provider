#!/usr/bin/env bun

import { OpencodeAI } from "../src/index"
import { generateText } from "ai"

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    const [key, maybeValue] = token.slice(2).split("=", 2)
    if (maybeValue !== undefined) {
      args[key] = maybeValue
      continue
    }
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      args[key] = next
      i++
      continue
    }
    args[key] = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const workspaceDir = typeof args.cwd === "string" ? args.cwd : process.cwd()
  const runtime = new OpencodeAI({ workspaceDir })

  const defaultModel = await runtime.getDefaultModel()
  const providerID = typeof args.provider === "string" ? args.provider : defaultModel.providerID
  const modelID = typeof args.model === "string" ? args.model : defaultModel.modelID

  const prompt = typeof args.prompt === "string" ? args.prompt : "Summarize the recent project updates."

  console.log(`Using provider=${providerID} model=${modelID}`)
  const languageModel = await runtime.getLanguageModel(providerID, modelID)

  const result = await generateText({
    model: languageModel,
    prompt,
  })

  console.log("\nResponse:\n")
  console.log(result.text)
}

main().catch((error) => {
  console.error("run-model failed", error)
  process.exit(1)
})
