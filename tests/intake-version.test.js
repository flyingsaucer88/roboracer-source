// The intake client is served `immutable` for a year, so its ?v= is the only
// thing that makes a returning visitor fetch a new copy. It must be the content
// hash: a hand-set date (?v=20260904) stayed put across every client change and
// pinned AmbiPower visitors to a stale client during the Central Intake canary.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const v = (rel) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(REPO, rel)))
    .digest("hex")
    .slice(0, 12);

test("intake.js / intake.css references carry their content hash", () => {
  const html = fs.readFileSync(path.join(REPO, "contact.html"), "utf8");
  for (const rel of ["assets/js/intake.js", "assets/css/intake.css"]) {
    const refs = [...html.matchAll(new RegExp(`/${rel.replace(/\./g, "\\.")}\\?v=([^"']*)`, "g"))];
    assert.ok(refs.length > 0, `contact.html does not reference ${rel}?v=`);
    for (const [, got] of refs) {
      assert.strictEqual(got, v(rel), `contact.html: ${rel}?v=${got} is stale — set it to ?v=${v(rel)}`);
    }
  }
});
