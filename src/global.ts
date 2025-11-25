import fs from "fs/promises"
import { xdgCache, xdgConfig, xdgData, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"

const app = "opencode"

const data = path.join(xdgData ?? path.join(os.homedir(), ".local/share"), app)
const cache = path.join(xdgCache ?? path.join(os.homedir(), ".cache"), app)
const config = path.join(xdgConfig ?? path.join(os.homedir(), ".config"), app)
const state = path.join(xdgState ?? path.join(os.homedir(), ".local/state"), app)

export namespace Global {
  export const Path = {
    home: os.homedir(),
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  } as const
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "11"

// Minimum cache version we're compatible with (don't clear if version is >= this)
// This prevents cache thrashing when multiple packages with different CACHE_VERSION
// values are loaded in the same process (e.g., OpenCode + plugins)
const MIN_COMPATIBLE_VERSION = 9

// Don't clear cache if it was modified very recently (within this many ms)
// This prevents race conditions where OpenCode just set up the cache
const CACHE_AGE_THRESHOLD_MS = 5000

const versionFile = path.join(Global.Path.cache, "version")

const { version, mtime } = await fs
  .readFile(versionFile, "utf8")
  .then(async (content) => {
    const stat = await fs.stat(versionFile).catch(() => null)
    return { version: content.trim(), mtime: stat?.mtime }
  })
  .catch(() => ({ version: "0", mtime: undefined }))

const versionNum = parseInt(version, 10) || 0
const cacheAge = mtime ? Date.now() - mtime.getTime() : Infinity

// Only clear cache if:
// 1. Version is below minimum compatible version, AND
// 2. Cache wasn't just created/modified (prevents race with OpenCode)
const shouldClearCache = versionNum < MIN_COMPATIBLE_VERSION && cacheAge > CACHE_AGE_THRESHOLD_MS

if (shouldClearCache) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await fs.writeFile(versionFile, CACHE_VERSION)
} else if (version !== CACHE_VERSION && cacheAge > CACHE_AGE_THRESHOLD_MS) {
  // Update version file without clearing cache if we're compatible
  // but only if cache isn't freshly created (to avoid race conditions)
  await fs.writeFile(versionFile, CACHE_VERSION).catch(() => {})
}
