import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  NotAnImage,
  PhotoNotFound,
  PhotoStorageFailed,
  PhotoTooLarge,
  photoPath,
} from "../shared/wishlist.ts";

// Wish photos the owner uploads, kept in R2 so they stay up after a shop takes
// its own image down. Each photo's key is a random UUID, and its URL is
// /api/photos/<key>: guests load it with the list, so reading needs no sign-in.
//
// An upload lands under pending/, which R2 empties after a week, so a photo
// for a list that was never saved goes away by itself. Saving a list moves
// its photos out of pending/ (keep). Deleting a list, or an edit that drops a
// photo, deletes it (remove).

const pending = "pending/";
export const Photos = Cloudflare.R2.Bucket("Photos", {
  lifecycleRules: [
    {
      id: "expire-unsaved-photos",
      prefix: pending,
      deleteObjectsTransition: { condition: { type: "Age", maxAge: 7 * 24 * 60 * 60 } },
    },
  ],
});

// The browser redraws photos other than GIFs as 1600 px JPEGs, which stay well
// under this. GIFs are uploaded unchanged, so this is their limit.
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
    Effect.andThen(Effect.fail(new PhotoStorageFailed())),
  );

export const makePhotos = Effect.gen(function* () {
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(Photos);

  // POST /api/photos with the image as the body. viewer is the signed-in owner.
  const upload = Effect.fn("Photos.upload")(function* (viewer: string) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (Number(request.headers["content-length"] ?? 0) > maxBytes)
      return yield* new PhotoTooLarge();
    const bytes = new Uint8Array(yield* request.arrayBuffer.pipe(Effect.orDie));
    if (bytes.byteLength > maxBytes) return yield* new PhotoTooLarge();
    const contentType = imageType(bytes);
    if (contentType === undefined) return yield* new NotAnImage();
    const key = crypto.randomUUID();
    yield* bucket
      .put(`${pending}${key}`, bytes, {
        httpMetadata: { contentType },
        customMetadata: { owner: viewer },
      })
      .pipe(Effect.catchTag("R2Error", storageFailed));
    return { photo: `${photoPath}${key}` };
  });

  // GET /api/photos/<key>, saved or still pending. A key never gets new
  // content, so browsers keep it.
  const serve = Effect.fn("Photos.serve")(function* (key: string) {
    const object = yield* Effect.gen(function* () {
      return (yield* bucket.get(key)) ?? (yield* bucket.get(`${pending}${key}`));
    }).pipe(Effect.catchTag("R2Error", storageFailed));
    if (object === null) return yield* new PhotoNotFound();
    return HttpServerResponse.stream(object.body, {
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  });

  // Before a list is saved: moves the viewer's pending photos among keys out
  // of pending/. Photos already saved, or uploaded by someone else, stay as
  // they are. The copy is written before the pending one goes, so the photo
  // never stops loading.
  const keep = Effect.fn("Photos.keep")(
    function* (keys: ReadonlyArray<string>, viewer: string) {
      yield* Effect.forEach(
        new Set(keys),
        Effect.fnUntraced(function* (key) {
          const object = yield* bucket.get(`${pending}${key}`);
          if (object === null || object.customMetadata?.owner !== viewer) return;
          yield* bucket.put(key, yield* object.arrayBuffer(), {
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
          });
          yield* bucket.delete(`${pending}${key}`);
        }),
        { concurrency: 10, discard: true },
      );
    },
    Effect.catchTag("R2Error", storageFailed),
  );

  // After a list is deleted or an edit drops photos: deletes the ones the
  // viewer uploaded. A wish can point at anyone's photo, so the uploader is
  // checked. The list is already saved, so a failure is only logged; the
  // photo stays behind.
  const remove = Effect.fn("Photos.remove")(
    function* (keys: ReadonlyArray<string>, viewer: string) {
      const owned = yield* Effect.filter(
        keys,
        Effect.fnUntraced(function* (key) {
          const object = yield* bucket.head(key);
          return object?.customMetadata?.owner === viewer;
        }),
        { concurrency: 10 },
      );
      if (owned.length > 0) yield* bucket.delete(owned);
    },
    Effect.catchTag("R2Error", (error) => Effect.logError("Photo cleanup failed", error)),
  );

  return { upload, serve, keep, remove };
});
