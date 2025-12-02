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

// Only create directories - let OpenCode handle cache versioning
await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(Global.Path.cache, { recursive: true }),
])
