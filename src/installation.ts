export namespace Installation {
  export const CHANNEL = process.env.OPENCODE_AUTH_PROVIDER_CHANNEL ?? "local"
  export const VERSION = process.env.OPENCODE_AUTH_PROVIDER_VERSION ?? "local"
  export const USER_AGENT = `opencode-auth-provider/${CHANNEL}/${VERSION}`

  export function isLocal() {
    return true
  }
}
