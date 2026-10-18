import { createHash, createHmac } from "node:crypto";

export type ObjectStorageConfig = {
  endpoint: URL;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
};

export function objectStorageConfig(): ObjectStorageConfig | null {
  const endpointValue = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpointValue || !bucket || !accessKey || !secretKey) return null;
  try {
    const endpoint = new URL(endpointValue);
    const local = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
    if (!(["https:", "http:"].includes(endpoint.protocol)) || (!local && endpoint.protocol !== "https:") || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    if (!/^[a-z0-9.-]{3,63}$/i.test(bucket)) return null;
    return { endpoint, bucket, region: process.env.S3_REGION || "auto", accessKey, secretKey };
  } catch {
    return null;
  }
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signingKey(secret: string, day: string, region: string): Buffer {
  const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
  const dateKey = hmac(Buffer.from(`AWS4${secret}`, "utf8"), day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function canonicalObjectUrl(config: ObjectStorageConfig, objectKey: string): URL {
  const url = new URL(config.endpoint.toString());
  const prefix = url.pathname.replace(/\/+$/, "");
  const path = [config.bucket, ...objectKey.split("/")].map(awsEncode).join("/");
  url.pathname = `${prefix}/${path}`;
  url.search = "";
  return url;
}

/** AWS Signature V4 presigned URL. Secrets remain on the server. */
export function presignObject(
  config: ObjectStorageConfig,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  objectKey: string,
  expiresSeconds = 900,
  contentType?: string,
): string {
  const url = canonicalObjectUrl(config, objectKey);
  const now = new Date();
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = date.slice(0, 8);
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKey}/${scope}`],
    ["X-Amz-Date", date],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQuery = query.map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("&");
  const canonicalHeaders = contentType
    ? `content-type:${contentType.trim()}\nhost:${url.host}\n`
    : `host:${url.host}\n`;
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretKey, day, config.region)).update(stringToSign).digest("hex");
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export async function objectHead(config: ObjectStorageConfig, objectKey: string): Promise<{ size: number; contentType: string } | null> {
  const response = await fetch(presignObject(config, "HEAD", objectKey, 90), {
    method: "HEAD", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage verification returned HTTP ${response.status}`);
  return {
    size: Number(response.headers.get("content-length") || 0),
    contentType: (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
  };
}

export async function deleteObject(config: ObjectStorageConfig, objectKey: string): Promise<void> {
  const response = await fetch(presignObject(config, "DELETE", objectKey, 90), {
    method: "DELETE", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Storage delete returned HTTP ${response.status}`);
}

export function isSupportedAudioSignature(prefix: Uint8Array, contentType: string): boolean {
  const ascii = (start: number, text: string) => text.split("").every((letter, index) => prefix[start + index] === letter.charCodeAt(0));
  const isMp3 = ascii(0, "ID3") || (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0);
  const isMp4 = prefix.length >= 8 && ascii(4, "ftyp");
  const isWav = ascii(0, "RIFF") && ascii(8, "WAVE");
  const isFlac = ascii(0, "fLaC");
  const isOgg = ascii(0, "OggS");
  const isWebm = prefix.length >= 4 && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3;
  const isAac = prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xf6) === 0xf0;
  const signatures: Record<string, boolean> = {
    "audio/mpeg": isMp3,
    "audio/mp3": isMp3,
    "audio/mp4": isMp4,
    "audio/aac": isAac,
    "audio/wav": isWav,
    "audio/x-wav": isWav,
    "audio/flac": isFlac,
    "audio/x-flac": isFlac,
    "audio/ogg": isOgg,
    "audio/opus": isOgg,
    "audio/webm": isWebm,
  };
  return signatures[contentType] === true;
}

/** Streams the private object through the app server to verify its SHA-256 and file signature. */
export async function verifyAudioObject(
  config: ObjectStorageConfig,
  objectKey: string,
  expectedSize: number,
  contentType: string,
  maxBytes = 60 * 1024 * 1024,
): Promise<string> {
  if (expectedSize > maxBytes) throw new Error("Audio file exceeds the configured upload limit.");
  const response = await fetch(presignObject(config, "GET", objectKey, 120), {
    cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error(`Storage checksum verification returned HTTP ${response.status}`);
  const hasher = createHash("sha256");
  let count = 0;
  const firstBytes = new Uint8Array(64);
  let firstLength = 0;
  for await (const rawChunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    const chunk = Buffer.from(rawChunk);
    count += chunk.byteLength;
    if (count > maxBytes || count > expectedSize) {
      await response.body.cancel().catch(() => undefined);
      throw new Error("Uploaded content exceeded its declared size.");
    }
    hasher.update(chunk);
    if (firstLength < firstBytes.length) {
      const take = Math.min(firstBytes.length - firstLength, chunk.length);
      firstBytes.set(chunk.subarray(0, take), firstLength);
      firstLength += take;
    }
  }
  if (count !== expectedSize) throw new Error("Uploaded file size did not match its declared size.");
  if (!isSupportedAudioSignature(firstBytes.subarray(0, firstLength), contentType)) {
    throw new Error("The uploaded file did not match a supported audio format.");
  }
  return hasher.digest("hex");
}
