#!/usr/bin/env node
/**
 * Dependency licence report — run with `npm run licenses`.
 *
 * Reads the installed tree and prints every package with the licence identifier
 * its own package.json declares, plus the packages that declare none. This is
 * the authoritative list behind /attributions; the legal pages name the direct
 * dependencies, and this report is how that table is re-checked instead of
 * trusted.
 *
 *   node scripts/license-report.mjs            # summary + grouped list
 *   node scripts/license-report.mjs --json     # machine readable
 *   node scripts/license-report.mjs --csv      # name,version,licence
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const json = process.argv.includes("--json");
const csv = process.argv.includes("--csv");

if (!existsSync(modules)) {
  console.error("node_modules is missing - run `npm ci` first.");
  process.exit(1);
}

/** Every installed package, including scoped ones and nested copies. */
function collect(directory, found = new Map()) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const name = entry.name;
    if (name === ".bin" || name === ".cache") continue;
    if (name.startsWith("@")) {
      collect(join(directory, name), found);
      continue;
    }
    const packageDir = join(directory, name);
    const manifest = join(packageDir, "package.json");
    let scope = "";
    if (directory !== modules) scope = `${directory.slice(modules.length + 1).replace(/\\/g, "/")} > `;
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        const key = `${scope}${pkg.name ?? name}@${pkg.version ?? "?"}`;
        const licence = typeof pkg.license === "string"
          ? pkg.license
          : Array.isArray(pkg.licenses)
            ? pkg.licenses.map((item) => (typeof item === "string" ? item : item?.type)).filter(Boolean).join(" OR ")
            : "";
        found.set(key, { name: pkg.name ?? name, version: pkg.version ?? "?", licence: licence || "", nested: scope !== "" });
      } catch {
        /* An unreadable manifest is reported as unknown below. */
      }
    }
    // Nested node_modules (only interesting for duplicate versions).
    const nested = join(packageDir, "node_modules");
    if (existsSync(nested)) collect(nested, found);
  }
  return found;
}

const packages = [...collect(modules).values()].sort((a, b) => a.name.localeCompare(b.name));
const unknown = packages.filter((pkg) => !pkg.licence);

if (json) {
  console.log(JSON.stringify({ total: packages.length, packages, unknown: unknown.length }, null, 2));
  process.exit(0);
}
if (csv) {
  console.log("name,version,licence");
  for (const pkg of packages) console.log(`${pkg.name},${pkg.version},"${pkg.licence || "UNKNOWN"}"`);
  process.exit(0);
}

const byLicence = new Map();
for (const pkg of packages) {
  const key = pkg.licence || "UNKNOWN";
  byLicence.set(key, (byLicence.get(key) ?? 0) + 1);
}

console.log(`installed packages : ${packages.length}`);
console.log(`unique licences    : ${byLicence.size}`);
console.log(`without a licence  : ${unknown.length}`);
console.log("");
console.log("  licence                              packages");
console.log("  ───────────────────────────────────  ────────");
for (const [licence, count] of [...byLicence.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${licence.slice(0, 34).padEnd(34)}  ${String(count).padStart(8)}`);
}

const copyleft = packages.filter((pkg) => /GPL|AGPL|SSPL|CDDL|EPL/i.test(pkg.licence));
console.log("");
console.log(`copyleft / network-copyleft packages : ${copyleft.length}`);
for (const pkg of copyleft) console.log(`  ${pkg.name}@${pkg.version}  ${pkg.licence}`);

if (unknown.length) {
  console.log("");
  console.log("packages that declare no licence (check before publishing this report):");
  for (const pkg of unknown) console.log(`  ${pkg.name}@${pkg.version}`);
}
