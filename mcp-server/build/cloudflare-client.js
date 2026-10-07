import { Jimp } from "jimp";
import { sniffImageMimeType } from "./reference-images.js";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./types.js";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts";
/**
 * Workers AI documents reference images for FLUX.2 as "smaller than 512x512".
 * Larger ones are scaled down to fit this box before upload.
 */
export const MAX_CLOUDFLARE_REFERENCE_DIMENSION = 500;
/**
 * The Workers AI image models this client knows how to call, taken from each
 * model's published input schema (developers.cloudflare.com/workers-ai/models).
 *
 * This is a fixed list rather than a discovered one because the request shape
 * differs per model (multipart vs JSON, size allowed or not), so a model that
 * appears in the catalog is not necessarily one this client can drive.
 */
export const CLOUDFLARE_IMAGE_MODELS = {
    "@cf/black-forest-labs/flux-2-klein-4b": {
        requestFormat: "multipart",
        supportsSize: true,
        maxReferenceImages: 4,
    },
    "@cf/black-forest-labs/flux-2-klein-9b": {
        requestFormat: "multipart",
        supportsSize: true,
        maxReferenceImages: 4,
    },
    "@cf/black-forest-labs/flux-1-schnell": {
        requestFormat: "json",
        supportsSize: false,
        maxReferenceImages: 0,
    },
    "@cf/leonardo/lucid-origin": {
        requestFormat: "json",
        supportsSize: true,
        maxReferenceImages: 0,
    },
    "@cf/leonardo/phoenix-1.0": {
        requestFormat: "json",
        supportsSize: true,
        maxReferenceImages: 0,
    },
};
export const CLOUDFLARE_IMAGE_MODEL_IDS = Object.keys(CLOUDFLARE_IMAGE_MODELS);
/**
 * Sizes of roughly one megapixel in multiples of 16. Workers AI bills image
 * models per 512x512 tile, so staying near 1MP keeps each image cheap on the
 * free daily allocation.
 */
const ASPECT_RATIO_DIMENSIONS = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "4:3": { width: 1152, height: 864 },
    "3:4": { width: 864, height: 1152 },
    "3:2": { width: 1248, height: 832 },
    "2:3": { width: 832, height: 1248 },
};
export function mapAspectRatioToCloudflareSize(aspectRatio) {
    return ASPECT_RATIO_DIMENSIONS[aspectRatio ?? "1:1"] ?? ASPECT_RATIO_DIMENSIONS["1:1"];
}
/**
 * Turns a non-2xx Workers AI response into a caller-facing failure.
 *
 * Running out of the free daily allocation is its own code because it is the
 * one failure a caller can do nothing about until the allocation resets.
 * Other 4xx answers describe the caller's own request, so their text is passed
 * through; 5xx stays generic.
 */
export function describeCloudflareFailure(status, body, rawText) {
    const apiMessage = body?.errors?.map((entry) => entry.message).filter(Boolean).join("; ") ||
        rawText.slice(0, 500) ||
        `HTTP ${status}`;
    const internalError = `HTTP ${status}: ${apiMessage}`;
    if (status === 429 || /free allocation|neurons/i.test(apiMessage)) {
        return {
            errorCode: "CLOUDFLARE_QUOTA_EXCEEDED",
            error: `Cloudflare Workers AI daily free allocation is used up (it resets at 00:00 UTC). The API answers: "${apiMessage}"`,
            internalError,
        };
    }
    if (status === 401 || status === 403) {
        return {
            errorCode: "CLOUDFLARE_AUTH_ERROR",
            error: `Cloudflare rejected the credentials: check CLOUDFLARE_ACCOUNT_ID and that CLOUDFLARE_API_TOKEN has the Workers AI permission. The API answers: "${apiMessage}"`,
            internalError,
        };
    }
    if (status >= 400 && status < 500) {
        return {
            errorCode: "CLOUDFLARE_API_ERROR",
            error: `Cloudflare rejected the request: ${apiMessage}`,
            internalError,
        };
    }
    return {
        errorCode: "CLOUDFLARE_API_ERROR",
        error: "Cloudflare Workers AI image generation failed.",
        internalError,
    };
}
/**
 * Scales a reference image down to fit the box Workers AI accepts. Images that
 * already fit are sent untouched, in their original encoding.
 */
export async function prepareCloudflareReferenceImage(reference) {
    const original = Buffer.from(reference.base64Data, "base64");
    const image = await Jimp.read(original);
    if (image.width <= MAX_CLOUDFLARE_REFERENCE_DIMENSION &&
        image.height <= MAX_CLOUDFLARE_REFERENCE_DIMENSION) {
        return { data: original, mimeType: reference.mimeType };
    }
    image.scaleToFit({
        w: MAX_CLOUDFLARE_REFERENCE_DIMENSION,
        h: MAX_CLOUDFLARE_REFERENCE_DIMENSION,
    });
    return { data: await image.getBuffer("image/png"), mimeType: "image/png" };
}
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
export class CloudflareImageClient {
    config;
    fetchImpl;
    constructor(config) {
        this.config = config;
        this.fetchImpl = config.fetchImpl ?? fetch;
    }
    async generateImage(input) {
        const modelName = input.model ?? "";
        const spec = CLOUDFLARE_IMAGE_MODELS[modelName];
        if (!spec) {
            return {
                success: false,
                errorCode: "INVALID_MODEL",
                error: `Unsupported Cloudflare model: ${modelName}. Supported models: ${CLOUDFLARE_IMAGE_MODEL_IDS.join(", ")}`,
            };
        }
        // Everything below is rejected before the request goes out, so a request
        // the model cannot honour never spends any of the daily allocation.
        if (input.mask) {
            return {
                success: false,
                errorCode: "OPTION_UNSUPPORTED_BY_MODEL",
                error: "mask is not supported by Cloudflare models; it is an OpenAI-only option.",
            };
        }
        if (input.background === "transparent") {
            return {
                success: false,
                errorCode: "OPTION_UNSUPPORTED_BY_MODEL",
                error: 'background: "transparent" is not supported by Cloudflare models; they always return an opaque image.',
            };
        }
        const referenceImages = input.referenceImages ?? [];
        if (referenceImages.length > spec.maxReferenceImages) {
            return {
                success: false,
                errorCode: "TOO_MANY_REFERENCE_IMAGES",
                error: spec.maxReferenceImages === 0
                    ? `${modelName} does not accept reference images. Use @cf/black-forest-labs/flux-2-klein-4b or flux-2-klein-9b for reference-guided generation.`
                    : `${modelName} accepts at most ${spec.maxReferenceImages} reference images; got ${referenceImages.length}.`,
            };
        }
        const webpReference = referenceImages.find((ref) => ref.mimeType === "image/webp");
        if (webpReference) {
            return {
                success: false,
                errorCode: "REFERENCE_IMAGE_UNSUPPORTED_TYPE",
                error: `Reference image "${webpReference.filePath}" is WebP, which cannot be resized for Cloudflare models; convert it to PNG or JPEG.`,
            };
        }
        const warnings = [];
        const { width, height } = mapAspectRatioToCloudflareSize(input.aspectRatio);
        if (!spec.supportsSize && input.aspectRatio && input.aspectRatio !== "1:1") {
            warnings.push(`${modelName} does not accept a size; generated at its default square size instead of ${input.aspectRatio}.`);
        }
        const timeoutMs = input.timeoutMs || this.config.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let body;
            const headers = {
                Authorization: `Bearer ${this.config.apiToken}`,
            };
            if (spec.requestFormat === "multipart") {
                const form = new FormData();
                form.append("prompt", input.prompt);
                form.append("width", String(width));
                form.append("height", String(height));
                for (const [index, reference] of referenceImages.entries()) {
                    const prepared = await prepareCloudflareReferenceImage(reference);
                    form.append(`input_image_${index}`, new Blob([new Uint8Array(prepared.data)], { type: prepared.mimeType }), `reference-${index}.${prepared.mimeType === "image/jpeg" ? "jpg" : "png"}`);
                }
                // fetch derives the multipart Content-Type, boundary included, from the FormData.
                body = form;
            }
            else {
                headers["Content-Type"] = "application/json";
                body = JSON.stringify({
                    prompt: input.prompt,
                    ...(spec.supportsSize ? { width, height } : {}),
                });
            }
            const response = await this.fetchImpl(`${CLOUDFLARE_API_BASE_URL}/${encodeURIComponent(this.config.accountId)}/ai/run/${modelName}`, { method: "POST", headers, body, signal: controller.signal });
            const contentType = response.headers.get("content-type") ?? "";
            let imageData;
            if (contentType.startsWith("image/")) {
                imageData = Buffer.from(await response.arrayBuffer());
            }
            else {
                const text = await response.text();
                const envelope = parseJson(text);
                if (!response.ok || envelope?.success === false) {
                    const described = describeCloudflareFailure(response.status, envelope, text);
                    return { success: false, warnings, ...described };
                }
                const base64Data = envelope?.result?.image ?? envelope?.image;
                if (base64Data) {
                    imageData = Buffer.from(base64Data, "base64");
                }
            }
            if (!response.ok) {
                const described = describeCloudflareFailure(response.status, undefined, "");
                return { success: false, warnings, ...described };
            }
            if (!imageData || imageData.length === 0) {
                return {
                    success: false,
                    errorCode: "CLOUDFLARE_EMPTY_RESPONSE",
                    error: "Cloudflare did not return a generated image.",
                    warnings,
                };
            }
            const mimeType = sniffImageMimeType(imageData);
            if (!mimeType) {
                return {
                    success: false,
                    errorCode: "CLOUDFLARE_UNRECOGNIZED_IMAGE",
                    error: "Cloudflare returned data that is not a PNG, JPEG or WebP image.",
                    warnings,
                };
            }
            if (input.outputFormat && `image/${input.outputFormat}` !== mimeType) {
                warnings.push(`outputFormat "${input.outputFormat}" is not supported by Cloudflare models; saved as ${mimeType} as returned.`);
            }
            return {
                success: true,
                base64Data: imageData.toString("base64"),
                mimeType,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        }
        catch (error) {
            if (controller.signal.aborted) {
                return {
                    success: false,
                    errorCode: "REQUEST_TIMEOUT",
                    error: `Image generation timed out after ${timeoutMs}ms.`,
                    internalError: error instanceof Error ? error.message : String(error),
                };
            }
            return {
                success: false,
                errorCode: "CLOUDFLARE_API_ERROR",
                error: "Cloudflare Workers AI image generation failed.",
                internalError: error instanceof Error ? error.message : String(error),
            };
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
}
