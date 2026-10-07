import test from "node:test";
import assert from "node:assert/strict";
import { Jimp } from "jimp";
import {
  CloudflareImageClient,
  CLOUDFLARE_IMAGE_MODEL_IDS,
  MAX_CLOUDFLARE_REFERENCE_DIMENSION,
  describeCloudflareFailure,
  mapAspectRatioToCloudflareSize,
} from "../build/cloudflare-client.js";

const KLEIN_4B = "@cf/black-forest-labs/flux-2-klein-4b";
const SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
const LUCID = "@cf/leonardo/lucid-origin";

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png-body"),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("fake-jpeg-body")]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createFakeFetch(responseFactory) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return responseFactory
      ? responseFactory(url, init)
      : jsonResponse({ success: true, result: { image: PNG_BYTES.toString("base64") } });
  };
  return { calls, fetchImpl };
}

function createClient(fetchImpl) {
  return new CloudflareImageClient({
    accountId: "account-123",
    apiToken: "token-abc",
    requestTimeoutMs: 5_000,
    fetchImpl,
  });
}

async function createReferenceImage(width, height, mimeType = "image/png") {
  const image = new Jimp({ width, height, color: 0x336699ff });
  const data = await image.getBuffer(mimeType);
  return {
    filePath: `C:\\refs\\ref-${width}x${height}.${mimeType === "image/png" ? "png" : "jpg"}`,
    base64Data: data.toString("base64"),
    mimeType,
  };
}

test("mapAspectRatioToCloudflareSize keeps sizes near one megapixel in multiples of 16", () => {
  assert.deepEqual(mapAspectRatioToCloudflareSize(undefined), { width: 1024, height: 1024 });
  assert.deepEqual(mapAspectRatioToCloudflareSize("16:9"), { width: 1280, height: 720 });
  assert.deepEqual(mapAspectRatioToCloudflareSize("2:3"), { width: 832, height: 1248 });

  for (const id of ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]) {
    const { width, height } = mapAspectRatioToCloudflareSize(id);
    assert.equal(width % 16, 0, id);
    assert.equal(height % 16, 0, id);
    assert.ok(width <= 1920 && height <= 1920, id);
  }
});

test("klein models are called with multipart form data carrying prompt and size", async () => {
  const { calls, fetchImpl } = createFakeFetch();
  const result = await createClient(fetchImpl).generateImage({
    prompt: "a quiet harbour at dawn",
    model: KLEIN_4B,
    aspectRatio: "16:9",
  });

  assert.equal(result.success, true, result.error);
  assert.equal(result.mimeType, "image/png");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-2-klein-4b"
  );
  assert.equal(calls[0].init.headers.Authorization, "Bearer token-abc");
  assert.equal(calls[0].init.headers["Content-Type"], undefined);

  const form = calls[0].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("prompt"), "a quiet harbour at dawn");
  assert.equal(form.get("width"), "1280");
  assert.equal(form.get("height"), "720");
});

test("flux-1-schnell is called with JSON and never sends a size", async () => {
  const { calls, fetchImpl } = createFakeFetch();
  const result = await createClient(fetchImpl).generateImage({
    prompt: "paper texture",
    model: SCHNELL,
    aspectRatio: "16:9",
  });

  assert.equal(result.success, true, result.error);
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { prompt: "paper texture" });
  assert.ok(result.warnings?.some((warning) => warning.includes("does not accept a size")));
});

test("leonardo models receive width and height in the JSON body", async () => {
  const { calls, fetchImpl } = createFakeFetch();
  await createClient(fetchImpl).generateImage({
    prompt: "ceramic bowl",
    model: LUCID,
    aspectRatio: "4:3",
  });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    prompt: "ceramic bowl",
    width: 1152,
    height: 864,
  });
});

test("large reference images are scaled down to fit before upload", async () => {
  const { calls, fetchImpl } = createFakeFetch();
  const large = await createReferenceImage(1200, 800);
  const small = await createReferenceImage(300, 200, "image/jpeg");

  const result = await createClient(fetchImpl).generateImage({
    prompt: "same style, new subject",
    model: KLEIN_4B,
    referenceImages: [large, small],
  });

  assert.equal(result.success, true, result.error);
  const form = calls[0].init.body;

  const first = form.get("input_image_0");
  assert.ok(first instanceof Blob);
  assert.equal(first.type, "image/png");
  const resized = await Jimp.read(Buffer.from(await first.arrayBuffer()));
  assert.ok(resized.width <= MAX_CLOUDFLARE_REFERENCE_DIMENSION);
  assert.ok(resized.height <= MAX_CLOUDFLARE_REFERENCE_DIMENSION);
  assert.equal(resized.width, MAX_CLOUDFLARE_REFERENCE_DIMENSION);

  // Already small enough: sent in its original encoding, byte for byte.
  const second = form.get("input_image_1");
  assert.equal(second.type, "image/jpeg");
  assert.deepEqual(
    Buffer.from(await second.arrayBuffer()),
    Buffer.from(small.base64Data, "base64")
  );
});

test("options a Cloudflare model cannot honour are rejected without a request", async () => {
  const reference = await createReferenceImage(64, 64);
  const cases = [
    { input: { mask: reference, referenceImages: [reference] }, code: "OPTION_UNSUPPORTED_BY_MODEL" },
    { input: { background: "transparent" }, code: "OPTION_UNSUPPORTED_BY_MODEL" },
    { input: { model: SCHNELL, referenceImages: [reference] }, code: "TOO_MANY_REFERENCE_IMAGES" },
    {
      input: { referenceImages: [reference, reference, reference, reference, reference] },
      code: "TOO_MANY_REFERENCE_IMAGES",
    },
    {
      input: { referenceImages: [{ ...reference, mimeType: "image/webp" }] },
      code: "REFERENCE_IMAGE_UNSUPPORTED_TYPE",
    },
    { input: { model: "@cf/unknown/model" }, code: "INVALID_MODEL" },
  ];

  for (const { input, code } of cases) {
    const { calls, fetchImpl } = createFakeFetch();
    const result = await createClient(fetchImpl).generateImage({
      prompt: "x",
      model: KLEIN_4B,
      ...input,
    });

    assert.equal(result.success, false, code);
    assert.equal(result.errorCode, code);
    assert.equal(calls.length, 0, `${code} should not reach the API`);
  }
});

test("a top-level image field and a JPEG payload are both accepted", async () => {
  const { fetchImpl } = createFakeFetch(() =>
    jsonResponse({ image: JPEG_BYTES.toString("base64") })
  );
  const result = await createClient(fetchImpl).generateImage({
    prompt: "x",
    model: KLEIN_4B,
    outputFormat: "png",
  });

  assert.equal(result.success, true, result.error);
  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(result.warnings?.some((warning) => warning.includes("outputFormat")));
});

test("a binary image response is accepted", async () => {
  const { fetchImpl } = createFakeFetch(
    () => new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } })
  );
  const result = await createClient(fetchImpl).generateImage({ prompt: "x", model: KLEIN_4B });

  assert.equal(result.success, true, result.error);
  assert.equal(Buffer.from(result.base64Data, "base64").equals(PNG_BYTES), true);
});

test("an empty or non-image payload fails clearly", async () => {
  const empty = await createClient(
    createFakeFetch(() => jsonResponse({ success: true, result: {} })).fetchImpl
  ).generateImage({ prompt: "x", model: KLEIN_4B });
  assert.equal(empty.errorCode, "CLOUDFLARE_EMPTY_RESPONSE");

  const garbage = await createClient(
    createFakeFetch(() =>
      jsonResponse({ success: true, result: { image: Buffer.from("nope").toString("base64") } })
    ).fetchImpl
  ).generateImage({ prompt: "x", model: KLEIN_4B });
  assert.equal(garbage.errorCode, "CLOUDFLARE_UNRECOGNIZED_IMAGE");
});

test("API failures map to stable error codes", async () => {
  const cases = [
    {
      status: 429,
      body: { success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] },
      code: "CLOUDFLARE_QUOTA_EXCEEDED",
    },
    {
      status: 403,
      body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
      code: "CLOUDFLARE_AUTH_ERROR",
    },
    {
      status: 400,
      body: { success: false, errors: [{ code: 5006, message: "Invalid input: prompt too long" }] },
      code: "CLOUDFLARE_API_ERROR",
      passesThrough: "prompt too long",
    },
    {
      status: 500,
      body: { success: false, errors: [{ code: 1, message: "upstream exploded" }] },
      code: "CLOUDFLARE_API_ERROR",
    },
  ];

  for (const { status, body, code, passesThrough } of cases) {
    const { fetchImpl } = createFakeFetch(() => jsonResponse(body, status));
    const result = await createClient(fetchImpl).generateImage({ prompt: "x", model: KLEIN_4B });

    assert.equal(result.success, false);
    assert.equal(result.errorCode, code, `HTTP ${status}`);
    assert.ok(result.internalError.includes(`HTTP ${status}`));
    if (passesThrough) {
      assert.ok(result.error.includes(passesThrough));
    }
  }

  // 5xx wording stays generic: it describes infrastructure, not the caller's request.
  assert.equal(
    describeCloudflareFailure(502, { errors: [{ message: "bad gateway" }] }, "").error,
    "Cloudflare Workers AI image generation failed."
  );
});

test("a thrown fetch is reported as an API error rather than crashing", async () => {
  const result = await createClient(async () => {
    throw new Error("socket hang up");
  }).generateImage({ prompt: "x", model: KLEIN_4B });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "CLOUDFLARE_API_ERROR");
  assert.equal(result.internalError, "socket hang up");
});

test("the model list includes the default klein model", () => {
  assert.ok(CLOUDFLARE_IMAGE_MODEL_IDS.includes(KLEIN_4B));
});
