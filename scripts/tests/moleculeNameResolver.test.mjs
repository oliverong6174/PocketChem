// A failed read of the offline name database is reported with its original cause preserved, and stays
// distinct from "no such name". This file runs in its own process on purpose: it makes the database
// fetch fail, which must not affect the other suites that read the real index.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let resolver;
let input;

before(async () => {
  await loadEngine();
  globalThis.window.location = { origin: "http://localhost", href: "http://localhost/", pathname: "/" };
  resolver = await loadModule("/src/utils/moleculeNameResolver.ts");
  input = await loadModule("/src/utils/moleculeInput.ts");
});

after(async () => {
  await closeEngine();
});

const MESSAGE = "PocketChem could not read its local chemical-name database.";

describe("asLookupFailure", () => {
  test("an Error is passed on unchanged (same object, same message, same cause)", () => {
    const original = new Error("index parse failed", { cause: "deeper" });
    const result = resolver.asLookupFailure(original);
    assert.equal(result, original);
    assert.equal(result.message, "index parse failed");
    assert.equal(result.cause, "deeper");
    class CustomError extends Error {}
    const custom = new CustomError("custom");
    assert.equal(resolver.asLookupFailure(custom), custom);
  });

  test("anything else becomes the plain user-facing message with the original value kept as cause", () => {
    for (const rejected of ["a string", 42, null, undefined, { code: "EIO", detail: "disk" }, Symbol.for("x")]) {
      const result = resolver.asLookupFailure(rejected);
      assert.ok(result instanceof Error);
      assert.equal(result.message, MESSAGE);
      assert.ok(Object.prototype.hasOwnProperty.call(result, "cause"), "cause is attached");
      assert.equal(result.cause, rejected);
      assert.doesNotMatch(result.message, /disk|EIO|a string|42/, "internal details stay out of the message");
    }
  });
});

describe("a failing database read versus a name that is not found", () => {
  test("[engine] a database that cannot be read is an Error, not a 'not found'; the message is the existing one", async () => {
    globalThis.fetch = async () => { throw new Error("network down"); };
    await assert.rejects(resolver.resolveMoleculeName("acetone"), (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error instanceof resolver.MoleculeNameNotFoundError, false);
      assert.match(error.message, /could not load its bundled offline chemical-name database/);
      return true;
    });
  });

  test("[engine] the input layer still reports it as lookup-failed (valid SMILES still load, with a note)", async () => {
    globalThis.fetch = async () => { throw new Error("network down"); };
    await assert.rejects(input.resolveMoleculeInput("not-a-molecule-name"), (error) => {
      assert.equal(error.name, "MoleculeInputError");
      assert.equal(error.code, "lookup-failed");
      return true;
    });
    const smiles = await input.resolveMoleculeInput("CCCC");
    assert.equal(smiles.kind, "smiles");
    assert.match(smiles.notes[0], /name lookup was unavailable/);
  });

  test("[engine] a real database still distinguishes 'not found' from a failure, and still resolves names", async () => {
    const bytes = fs.readFileSync(path.join(root, "public", "data", "chemical-names.index.json.gz"));
    globalThis.fetch = async (url) =>
      String(url).includes("chemical-names.index.json.gz")
        ? new Response(bytes, { status: 200, headers: { "content-type": "application/gzip" } })
        : new Response("", { status: 404 });
    await assert.rejects(resolver.resolveMoleculeName("zzzz-no-such-molecule-name-zzzz"), (error) => error instanceof resolver.MoleculeNameNotFoundError);
    const acetone = await resolver.resolveMoleculeName("acetone");
    assert.match(acetone.smiles, /C/);
  });

  test("[source] the module has no other place that rethrows a replacement error without its cause", () => {
    const source = fs.readFileSync(path.join(root, "src", "utils", "moleculeNameResolver.ts"), "utf8");
    assert.equal((source.match(/catch \(/g) ?? []).length, 1);
    assert.match(source, /new Error\("PocketChem could not read its local chemical-name database\.", \{ cause: error \}\)/);
  });
});
