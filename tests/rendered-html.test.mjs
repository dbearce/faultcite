import assert from "node:assert/strict";
import test from "node:test";

test("protects the application shell with ChatGPT sign-in", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 307);
  const location = response.headers.get("location") ?? "";
  assert.match(location, /\/signin-with-chatgpt\?/);
  assert.match(location, /return_to=%2F/);
});

test("standalone runtime selects FaultCite sign-in without trusting client headers", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("standalone", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("https://staging.faultcite.example/", {
    headers: { accept: "text/html", "oai-authenticated-user-email": "forged@example.test" },
  }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    FAULTCITE_RUNTIME: "standalone",
    FAULTCITE_APP_ORIGIN: "https://staging.faultcite.example",
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/sign-in\?return_to=%2F/);
  assert.doesNotMatch(response.headers.get("location") ?? "", /signin-with-chatgpt/);
});
