// Immutable object publication with safe recovery after a lost upload response.
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export async function storeWasm(
  client,
  { bucket, key, bytes, digest, author, versioned },
  timeoutMs = 45_000,
) {
  const options = { abortSignal: AbortSignal.timeout(timeoutMs) };
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: 'application/wasm',
        CacheControl: 'public, max-age=31536000, immutable',
        ChecksumSHA256: Buffer.from(digest, 'hex').toString('base64'),
        Metadata: { sha256: digest, author },
        ...(versioned ? { IfNoneMatch: '*' } : {}),
      }),
      options,
    );
    return;
  } catch (error) {
    if (!versioned || ![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
  }
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), options);
  let identical =
    Number(head.ContentLength) === bytes.length &&
    (!head.Metadata?.author || head.Metadata.author === author);
  if (identical && head.Metadata?.sha256) identical = head.Metadata.sha256 === digest;
  else if (identical && head.ChecksumSHA256)
    identical = head.ChecksumSHA256 === Buffer.from(digest, 'hex').toString('base64');
  else if (identical) {
    // Existing objects predate digest metadata. Verify their actual bytes once;
    // never treat an ETag (which can be a multipart identifier) as a checksum.
    const existing = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), options);
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of existing.Body) {
        size += chunk.length;
        if (size > bytes.length) {
          identical = false;
          break;
        }
        hash.update(chunk);
      }
      identical &&= size === bytes.length && hash.digest('hex') === digest;
    } finally {
      existing.Body.destroy?.();
    }
  }
  if (!identical) {
    const error = new Error('This publisher/module/version already has a different Wasm artifact');
    error.name = 'PackageVersionExists';
    throw error;
  }
}
