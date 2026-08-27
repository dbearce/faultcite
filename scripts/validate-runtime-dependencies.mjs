import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));

const reviewed = {
  react: "19.2.8",
  "react-dom": "19.2.8",
  "react-server-dom-webpack": "19.2.8",
};

for (const [name, version] of Object.entries(reviewed)) {
  const declared = pkg.dependencies?.[name] || pkg.devDependencies?.[name];
  assert.equal(declared, version, `${name} must be exactly ${version}`);
  assert.equal(lock.packages?.[`node_modules/${name}`]?.version, version, `${name} lock entry must be ${version}`);
}

console.log("Bundled React and React Server Components runtime versions match the reviewed security release.");
