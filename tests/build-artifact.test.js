/**
 * Contract tests for the deployable artifact.
 *
 * These assert on *behaviour that matters in production* — which files reach
 * the web root, whether the audit gate passes, whether the checksum manifest
 * is complete — rather than on markup or wording, so ordinary copy and design
 * edits do not break them.
 *
 * Run: npm test   (requires `npm run build` to have produced dist/)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, describe } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "dist", "roboracer-site");

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", stdio: "pipe" });
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

before(() => {
  // The artifact is the subject under test; build it if it is not there.
  if (!fs.existsSync(DIST)) run("bash", ["tools/build-site-package.sh"]);
});

describe("deployable artifact", () => {
  test("contains every file the web server needs", () => {
    for (const name of [
      "index.html",
      "contact.html",
      "resource.html",
      "404.html",
      "robots.txt",
      "sitemap.xml",
      "site.webmanifest",
      ".htaccess",
      "assets/css/main.css",
      "assets/css/fonts.css",
      "assets/js/nav.js",
      "files/roboracer-board.pdf",
      "files/roboracer-board.zip",
    ]) {
      assert.ok(fs.existsSync(path.join(DIST, name)), `missing from artifact: ${name}`);
    }
  });

  test("excludes source, tooling, CI and secret-shaped files", () => {
    const forbidden = walk(DIST).filter((file) => {
      const rel = path.relative(DIST, file);
      return (
        /(^|\/)(node_modules|\.git|\.github|tools|tests|docs)(\/|$)/.test(rel) ||
        /\.(py|sh|md|map|yml|yaml|pem|key)$/.test(rel) ||
        /(^|\/)(package\.json|package-lock\.json|\.env.*|\.DS_Store)$/.test(rel)
      );
    });
    assert.deepEqual(forbidden, [], `these must never ship: ${forbidden.join(", ")}`);
  });

  test("ships no source maps and no node_modules", () => {
    assert.equal(walk(DIST).filter((f) => f.endsWith(".map")).length, 0);
    assert.ok(!fs.existsSync(path.join(DIST, "node_modules")));
  });

  test("SHA256SUMS covers every shipped file and the hashes match", () => {
    const manifestPath = path.join(DIST, "SHA256SUMS");
    assert.ok(fs.existsSync(manifestPath), "SHA256SUMS missing from artifact");

    const entries = fs
      .readFileSync(manifestPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.trim().split(/\s+/);
        return { hash, rel: rest.join(" ").replace(/^\.\//, "") };
      });

    const shipped = walk(DIST)
      .map((f) => path.relative(DIST, f))
      .filter((rel) => rel !== "SHA256SUMS")
      .sort();

    assert.deepEqual(
      entries.map((e) => e.rel).sort(),
      shipped,
      "SHA256SUMS does not list exactly the shipped files",
    );

    for (const { hash, rel } of entries) {
      const actual = createHash("sha256")
        .update(fs.readFileSync(path.join(DIST, rel)))
        .digest("hex");
      assert.equal(actual, hash, `checksum mismatch for ${rel}`);
    }
  });
});

describe("site audit gate", () => {
  test("the repository passes audit-site.py", () => {
    const out = run("python3", ["tools/audit-site.py", "--json"]);
    const report = JSON.parse(out);
    assert.deepEqual(report.errors, [], `audit errors: ${report.errors.join(" | ")}`);
    assert.ok(report.pages.length >= 4, "expected at least 4 pages");
  });

  test("the built artifact passes audit-site.py", () => {
    const out = run("python3", ["tools/audit-site.py", "--root", DIST, "--json"]);
    const report = JSON.parse(out);
    assert.deepEqual(report.errors, [], `audit errors: ${report.errors.join(" | ")}`);
  });

  test("the audit actually fails on a broken page (negative control)", () => {
    // A guard that always passes is worthless. Prove the gate can fail.
    const tmp = fs.mkdtempSync(path.join(REPO, "dist", "audit-negative-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "index.html"),
        "<!doctype html><html><body><p>no head</p></body></html>",
      );
      let failed = false;
      try {
        run("python3", ["tools/audit-site.py", "--root", tmp, "--json"]);
      } catch (err) {
        failed = true;
        const report = JSON.parse(err.stdout);
        assert.ok(report.errors.length > 0, "expected errors on a deliberately broken tree");
      }
      assert.ok(failed, "audit-site.py exited 0 on a broken tree");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("production URL hygiene", () => {
  const htmlFiles = () => walk(DIST).filter((f) => f.endsWith(".html"));

  test("no localhost URLs in shipped HTML", () => {
    for (const file of htmlFiles()) {
      const text = fs.readFileSync(file, "utf8");
      assert.ok(
        !/https?:\/\/(localhost|127\.0\.0\.1)/i.test(text),
        `localhost URL in ${path.relative(DIST, file)}`,
      );
    }
  });

  test("no AmbiSecure infrastructure leaks into RoboRacer", () => {
    for (const file of walk(DIST).filter((f) => /\.(html|css|js|json|xml|txt)$/.test(f))) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(DIST, file);
      assert.ok(!/ambisecure\.ambimat\.com/i.test(text), `AmbiSecure domain in ${rel}`);
      assert.ok(!/ambisecure-logo|--secure-cyan/i.test(text), `AmbiSecure asset/token in ${rel}`);
    }
  });

  test("every canonical points at the production origin", () => {
    for (const file of htmlFiles()) {
      const text = fs.readFileSync(file, "utf8");
      const match = text.match(/<link rel="canonical" href="([^"]+)"/);
      if (!match) continue;
      assert.ok(
        match[1].startsWith("https://roboracer.ambimat.com"),
        `bad canonical in ${path.relative(DIST, file)}: ${match[1]}`,
      );
    }
  });
});
