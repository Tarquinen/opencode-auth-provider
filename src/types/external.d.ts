declare module "opencode-anthropic-auth" {
  export const AnthropicAuthPlugin: (input: any) => Promise<{ auth?: any }>
}

declare module "opencode-copilot-auth" {
  export const CopilotAuthPlugin: (input: any) => Promise<{ auth?: any }>
}

declare module "opencode-gemini-auth" {
  export const GeminiCLIOAuthPlugin: (input: any) => Promise<{ auth?: any }>
  export const GoogleOAuthPlugin: (input: any) => Promise<{ auth?: any }>
}
