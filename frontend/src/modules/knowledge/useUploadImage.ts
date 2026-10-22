import { useCallback } from "react";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import type { components } from "../../core/api/schema";
import { useToast } from "../../ui/useToast";
import { IMAGE_TYPES } from "./pageEditor";

type ImageType = components["schemas"]["ImageUpload"]["type"];

/** The largest image the server takes. */
const MAX_BYTES = 20 * 1024 * 1024;

/** The file's bytes as base64 (without the `data:` prefix). */
function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The file could not be read."));
    };
    reader.readAsDataURL(file);
  });
}

function isImageType(type: string): type is ImageType {
  return IMAGE_TYPES.has(type);
}

/**
 * Uploads an image for a page and resolves to its URL (the image node's
 * `src`), or to null after telling the user why it could not be added.
 * Images stay on this PC; they do not sync.
 */
export function useUploadImage(): (file: File) => Promise<string | null> {
  const client = useApiClient();
  const { show } = useToast();
  return useCallback(
    async (file: File) => {
      const fail = (description: string) => {
        show({ title: "Could not add the image", description, tone: "error" });
        return null;
      };
      if (!isImageType(file.type)) return fail("Use a PNG, JPEG, GIF or WebP image.");
      if (file.size > MAX_BYTES) return fail("Images are at most 20 MB.");
      try {
        const data = await readBase64(file);
        const saved = await unwrap(
          client.POST("/api/knowledge/images", { body: { data, type: file.type } }),
        );
        return saved.url;
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
    [client, show],
  );
}
