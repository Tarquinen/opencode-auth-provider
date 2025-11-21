import z from "zod"
import { Global } from "./global"
import path from "path"
import { NamedError } from "./util/error"
import { readableStreamToText } from "bun"

export namespace BunProc {
  export async function run(cmd: string[], options?: Bun.SpawnOptions.OptionsObject<any, any, any>) {
    const result = Bun.spawn([which(), ...cmd], {
      ...options,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...options?.env,
        BUN_BE_BUN: "1",
      },
    })
    const code = await result.exited
    const stdout = result.stdout
      ? typeof result.stdout === "number"
        ? result.stdout
        : await readableStreamToText(result.stdout)
      : undefined
    const stderr = result.stderr
      ? typeof result.stderr === "number"
        ? result.stderr
        : await readableStreamToText(result.stderr)
      : undefined
    if (code !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}`)
    }
    return result
  }

  export function which() {
    return process.execPath
  }

  export const InstallFailedError = NamedError.create(
    "BunInstallFailedError",
    z.object({
      pkg: z.string(),
      version: z.string(),
    }),
  )

  export async function install(pkg: string, version = "latest") {
    const mod = path.join(Global.Path.cache, "node_modules", pkg)
    const pkgjson = Bun.file(path.join(Global.Path.cache, "package.json"))
    const parsed = await pkgjson.json().catch(async () => {
      const result = { dependencies: {} as Record<string, string> }
      await Bun.write(pkgjson.name!, JSON.stringify(result, null, 2))
      return result
    })
    if (parsed.dependencies[pkg] === version) return mod

    const args = ["add", "--force", "--exact", "--cwd", Global.Path.cache, pkg + "@" + version]

    const total = 3
    const wait = 500

    const runInstall = async (count: number = 1): Promise<void> => {
      await BunProc.run(args, {
        cwd: Global.Path.cache,
      }).catch(async (error) => {
        if (count >= total) {
          throw new InstallFailedError(
            { pkg, version },
            {
              cause: error,
            },
          )
        }
        const delay = wait * count
        await Bun.sleep(delay)
        return runInstall(count + 1)
      })
    }

    await runInstall()

    parsed.dependencies[pkg] = version
    await Bun.write(pkgjson.name!, JSON.stringify(parsed, null, 2))
    return mod
  }
}
