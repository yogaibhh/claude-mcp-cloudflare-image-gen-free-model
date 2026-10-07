import type { ImageProvider, RuntimeConfig } from "./types.js";

const OPENAI_MODEL_PREFIXES = ["gpt-image", "dall-e"] as const;
const CLOUDFLARE_MODEL_PREFIX = "@cf/";

export function resolveProviderForModel(model: string): ImageProvider {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith(CLOUDFLARE_MODEL_PREFIX)) {
    return "cloudflare";
  }

  return OPENAI_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ? "openai"
    : "gemini";
}

export function getApiKeyForProvider(
  config: RuntimeConfig,
  provider: ImageProvider
): string {
  switch (provider) {
    case "openai":
      return config.openaiApiKey;
    case "cloudflare":
      return config.cloudflareApiToken;
    default:
      return config.geminiApiKey;
  }
}

export function getDefaultModelForProvider(
  config: RuntimeConfig,
  provider: ImageProvider
): string {
  switch (provider) {
    case "openai":
      return config.openaiDefaultModel;
    case "cloudflare":
      return config.cloudflareDefaultModel;
    default:
      return config.geminiDefaultModel;
  }
}

export function getApiKeyEnvVarForProvider(provider: ImageProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "cloudflare":
      return "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN";
    default:
      return "GEMINI_API_KEY";
  }
}
