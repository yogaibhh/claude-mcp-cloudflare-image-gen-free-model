const OPENAI_MODEL_PREFIXES = ["gpt-image", "dall-e"];
const CLOUDFLARE_MODEL_PREFIX = "@cf/";
export function resolveProviderForModel(model) {
    const normalized = model.trim().toLowerCase();
    if (normalized.startsWith(CLOUDFLARE_MODEL_PREFIX)) {
        return "cloudflare";
    }
    return OPENAI_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
        ? "openai"
        : "gemini";
}
export function getApiKeyForProvider(config, provider) {
    switch (provider) {
        case "openai":
            return config.openaiApiKey;
        case "cloudflare":
            return config.cloudflareApiToken;
        default:
            return config.geminiApiKey;
    }
}
export function getDefaultModelForProvider(config, provider) {
    switch (provider) {
        case "openai":
            return config.openaiDefaultModel;
        case "cloudflare":
            return config.cloudflareDefaultModel;
        default:
            return config.geminiDefaultModel;
    }
}
export function getApiKeyEnvVarForProvider(provider) {
    switch (provider) {
        case "openai":
            return "OPENAI_API_KEY";
        case "cloudflare":
            return "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN";
        default:
            return "GEMINI_API_KEY";
    }
}
