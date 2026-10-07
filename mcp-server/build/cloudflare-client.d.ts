import type { AspectRatio, GenerateImageInput, GenerateImageResult, ImageProviderClient, ReferenceImage } from "./types.js";
/**
 * Workers AI documents reference images for FLUX.2 as "smaller than 512x512".
 * Larger ones are scaled down to fit this box before upload.
 */
export declare const MAX_CLOUDFLARE_REFERENCE_DIMENSION = 500;
export interface CloudflareModelSpec {
    /** FLUX.2 models only accept multipart form data, even when the request is a bare prompt. */
    requestFormat: "multipart" | "json";
    /**
     * Whether width/height may be sent. flux-1-schnell's input schema sets
     * additionalProperties: false, so sending a size there is a 400.
     */
    supportsSize: boolean;
    maxReferenceImages: number;
}
/**
 * The Workers AI image models this client knows how to call, taken from each
 * model's published input schema (developers.cloudflare.com/workers-ai/models).
 *
 * This is a fixed list rather than a discovered one because the request shape
 * differs per model (multipart vs JSON, size allowed or not), so a model that
 * appears in the catalog is not necessarily one this client can drive.
 */
export declare const CLOUDFLARE_IMAGE_MODELS: Readonly<Record<string, CloudflareModelSpec>>;
export declare const CLOUDFLARE_IMAGE_MODEL_IDS: string[];
export declare function mapAspectRatioToCloudflareSize(aspectRatio: AspectRatio | undefined): {
    width: number;
    height: number;
};
export interface CloudflareConfig {
    accountId: string;
    apiToken: string;
    requestTimeoutMs: number;
    /** Injectable for tests; defaults to the global fetch. */
    fetchImpl?: typeof fetch;
}
interface CloudflareApiError {
    code?: number;
    message?: string;
}
interface CloudflareEnvelope {
    success?: boolean;
    errors?: CloudflareApiError[];
    result?: {
        image?: string;
    };
    image?: string;
}
/**
 * Turns a non-2xx Workers AI response into a caller-facing failure.
 *
 * Running out of the free daily allocation is its own code because it is the
 * one failure a caller can do nothing about until the allocation resets.
 * Other 4xx answers describe the caller's own request, so their text is passed
 * through; 5xx stays generic.
 */
export declare function describeCloudflareFailure(status: number, body: CloudflareEnvelope | undefined, rawText: string): {
    errorCode: string;
    error: string;
    internalError: string;
};
/**
 * Scales a reference image down to fit the box Workers AI accepts. Images that
 * already fit are sent untouched, in their original encoding.
 */
export declare function prepareCloudflareReferenceImage(reference: ReferenceImage): Promise<{
    data: Buffer;
    mimeType: string;
}>;
export declare class CloudflareImageClient implements ImageProviderClient {
    private readonly config;
    private readonly fetchImpl;
    constructor(config: CloudflareConfig);
    generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}
export {};
