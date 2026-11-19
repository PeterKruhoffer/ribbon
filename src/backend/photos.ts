import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { photoPath } from "../shared/wishlist.ts";

// Wish photos the owner uploads, kept in R2 so they stay up after a shop takes
// its own image down. Each photo's key is a random UUID, and its URL is
// /api/photos/<key>: guests load it with the list, so reading needs no sign-in.

export const Photos = Cloudflare.R2.Bucket("Photos");

// The browser shrinks photos to 1600 px JPEGs, which stay well under this.
const maxBytes = 5 * 1024 * 1024;

// The type comes from the file's first bytes, never from the browser's header,
// so nothing but a raster image is ever served from our origin.
const imageType = (bytes: Uint8Array) => {
  const starts = (offset: number, ...signature: number[]) =>
    signature.every((byte, i) => bytes[offset + i] === byte);
  if (starts(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return undefined;
};

const storageFailed = (error: unknown) =>
  Effect.logError("Photo storage failed", error).pipe(
    Effect.as(HttpServerResponse.text("Photo storage failed, try again", { status: 502 })),
  );

export const makePhotos = Effect.gen(function* () {
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(Photos);

  // POST /api/photos with the image as the body. viewer is the signed-in owner.
  const upload = (viewer: string) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (Number(request.headers["content-length"] ?? 0) > maxBytes)
        return HttpServerResponse.text("Photos can be up to 5 MB", { status: 413 });
      const bytes = new Uint8Array(yield* request.arrayBuffer);
      if (bytes.byteLength > maxBytes)
        return HttpServerResponse.text("Photos can be up to 5 MB", { status: 413 });
      const contentType = imageType(bytes);
      if (contentType === undefined)
        return HttpServerResponse.text("Upload a JPEG, PNG, GIF, or WebP photo", { status: 415 });
      const key = crypto.randomUUID();
      yield* bucket.put(key, bytes, {
        httpMetadata: { contentType },
        customMetadata: { owner: viewer },
      });
      return yield* HttpServerResponse.json({ photo: `${photoPath}${key}` }, { status: 201 });
    }).pipe(Effect.catchTag("R2Error", storageFailed));

  // GET /api/photos/<key>. A key never gets new content, so browsers keep it.
  const serve = (key: string) =>
    Effect.gen(function* () {
      const object = yield* bucket.get(key);
      if (object === null) return HttpServerResponse.text("No such photo", { status: 404 });
      return HttpServerResponse.stream(object.body, {
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    }).pipe(Effect.catchTag("R2Error", storageFailed));

  return { upload, serve };
});
