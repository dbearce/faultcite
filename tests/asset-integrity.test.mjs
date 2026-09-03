import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("authenticated HTML references only packaged client assets", async () => {
  const workerPath = resolve(projectRoot, "dist/server/index.js");
  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("asset-integrity", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://faultcite.example/", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-email": "owner@example.test",
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  const assets = [...new Set(html.match(/\/assets\/[A-Za-z0-9_.-]+/g) || [])];
  assert.ok(assets.length >= 2, "expected the rendered shell to reference packaged JS and CSS assets");
  for (const asset of assets) await access(resolve(projectRoot, "dist/client", asset.slice(1)));
});

test("the client manifest points only to packaged files", async () => {
  const manifest = JSON.parse(await readFile(resolve(projectRoot, "dist/client/.vite/manifest.json"), "utf8"));
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry.file) files.add(entry.file);
    for (const css of entry.css || []) files.add(css);
  }
  assert.ok(files.size > 0);
  for (const file of files) await access(resolve(projectRoot, "dist/client", file));
});
