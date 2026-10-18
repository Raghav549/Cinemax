export type ImagePurpose = "avatar" | "channel_profile" | "channel_banner" | "artwork";

/** Resize local artwork before it reaches the durable image store; server validates bytes and size again. */
export async function prepareImage(file: File, purpose: ImagePurpose): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const targetRatio = purpose === "channel_banner" ? 16 / 6 : 1;
    const maxEdge = purpose === "avatar" ? 640 : purpose === "channel_banner" ? 1600 : 1000;
    const sourceRatio = bitmap.width / bitmap.height;
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (purpose === "channel_banner") {
      if (sourceRatio > targetRatio) { sw = bitmap.height * targetRatio; sx = (bitmap.width - sw) / 2; }
      else { sh = bitmap.width / targetRatio; sy = (bitmap.height - sh) / 2; }
    } else {
      const edge = Math.min(bitmap.width, bitmap.height);
      sx = (bitmap.width - edge) / 2;
      sy = (bitmap.height - edge) / 2;
      sw = edge; sh = edge;
    }
    const width = Math.min(maxEdge, purpose === "channel_banner" ? Math.round(maxEdge) : Math.round(Math.min(sw, sh, maxEdge)));
    const height = Math.round(width / targetRatio);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .86));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } finally { bitmap.close(); }
}

export async function uploadImage(file: File, purpose: ImagePurpose): Promise<string> {
  const prepared = await prepareImage(file, purpose);
  const body = new FormData();
  body.set("file", prepared);
  body.set("purpose", purpose);
  const response = await fetch("/api/images", { method: "POST", body });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.url !== "string") throw new Error(result?.error || "Image upload failed.");
  return result.url;
}
