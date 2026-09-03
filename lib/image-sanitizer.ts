const ascii = (bytes: Uint8Array, start = 0, end = bytes.length) => String.fromCharCode(...bytes.slice(start, end));

export function containsBlockedSignature(bytes: Uint8Array) {
  const sample = new TextDecoder("latin1").decode(bytes);
  return sample.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") || /<script[\s>]/i.test(sample);
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0); const output = new Uint8Array(size); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function stripJpeg(bytes: Uint8Array) {
  const parts = [bytes.slice(0, 2)]; let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) { parts.push(bytes.slice(offset)); return concat(parts); }
    if (marker === 0xd9) { parts.push(bytes.slice(offset, offset + 2)); return concat(parts); }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) throw new Error("JPEG metadata structure is invalid");
    if (![0xe1, 0xed, 0xfe].includes(marker)) parts.push(bytes.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }
  throw new Error("JPEG image structure is incomplete");
}

function stripPng(bytes: Uint8Array) {
  const parts = [bytes.slice(0, 8)]; let offset = 8;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4); const length = view.getUint32(0); const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("PNG image structure is incomplete");
    const type = ascii(bytes, offset + 4, offset + 8);
    if (!["eXIf", "tEXt", "zTXt", "iTXt"].includes(type)) parts.push(bytes.slice(offset, end));
    offset = end; if (type === "IEND") return concat(parts);
  }
  throw new Error("PNG image structure is incomplete");
}

function stripWebp(bytes: Uint8Array) {
  const chunks: Uint8Array[] = []; let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4); const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true); const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error("WebP image structure is incomplete");
    if (!["EXIF", "XMP "].includes(type)) chunks.push(bytes.slice(offset, end));
    offset = end;
  }
  const body = concat(chunks); const output = new Uint8Array(12 + body.length); output.set(bytes.slice(0, 12)); output.set(body, 12);
  new DataView(output.buffer).setUint32(4, output.length - 8, true); return output;
}

export function sanitizeEvidenceImage(bytes: Uint8Array, declaredType: string) {
  if (containsBlockedSignature(bytes)) throw new Error("The uploaded file matched a blocked malware or script signature");
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  const detectedType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!detectedType) throw new Error("Use JPEG, PNG, or WebP evidence so private image metadata can be removed");
  if (declaredType !== detectedType) throw new Error("Declared image type does not match the file contents");
  const sanitized = isJpeg ? stripJpeg(bytes) : isPng ? stripPng(bytes) : stripWebp(bytes);
  if (!sanitized.length) throw new Error("Image sanitization failed");
  return { bytes: sanitized, contentType: detectedType, metadataRemoved: sanitized.length !== bytes.length };
}
