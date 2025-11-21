const FALLBACK_FILE = new URL("./models-static.json", import.meta.url)

export async function data() {
  const path = Bun.env.MODELS_DEV_API_JSON
  if (path) {
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.text()
    }
  }

  const response = await fetch("https://models.dev/api.json").catch(() => undefined)
  if (response?.ok) {
    return await response.text()
  }

  return Bun.file(FALLBACK_FILE).text()
}
