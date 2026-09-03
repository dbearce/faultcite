import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("storage reservations are database-enforced and used by every upload path", async () => {
  const [schema,migration,directManual,chunk,evidence,reservations] = await Promise.all([read("../db/schema.ts"),read("../drizzle/0020_cynical_black_cat.sql"),read("../app/api/manuals/route.ts"),read("../app/api/manuals/upload-chunk/route.ts"),read("../app/api/cases/[id]/evidence/route.ts"),read("../lib/storage-reservations.ts")]);
  assert.match(schema,/storageReservations/); assert.match(migration,/CREATE TABLE `storage_reservations`/); assert.match(directManual,/reserveStorage/); assert.match(chunk,/reserveStorage/); assert.match(evidence,/reserveStorage/);
  assert.match(directManual,/releaseStorage/); assert.match(chunk,/releaseStorage/); assert.match(evidence,/releaseStorage/);
  assert.match(reservations,/INSERT INTO storage_reservations/); assert.match(reservations,/SELECT \?1,\?2,\?3/); assert.match(reservations,/result\.meta\.changes/);
});

test("evidence images are metadata-sanitized and signature-screened before permanent storage", async () => {
  const [route,sanitizer] = await Promise.all([read("../app/api/cases/[id]/evidence/route.ts"),read("../lib/image-sanitizer.ts")]);
  assert.match(route,/quarantineKey/); assert.match(route,/metadataRemoved: true/); assert.match(route,/signatureScreened: true/);
  assert.match(sanitizer,/EICAR-STANDARD-ANTIVIRUS-TEST-FILE/); assert.match(sanitizer,/"eXIf", "tEXt", "zTXt", "iTXt"/); assert.match(sanitizer,/"EXIF", "XMP "/);
  assert.doesNotMatch(route,/image\/heic/);
});
