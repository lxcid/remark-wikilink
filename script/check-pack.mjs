// Verify the published tarball actually ships what consumers need:
// production and development builds, declarations, license, readme, and
// third-party notices — and no stray build or test artifacts.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: root,
  encoding: "utf8",
  // `npm pack --json` still writes notices to stderr; keep stdout clean.
  stdio: ["ignore", "pipe", "pipe"],
});

const [report] = JSON.parse(output);
const files = new Set(report.files.map((file) => file.path));

const required = [
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/gfm.js",
  "dist/gfm.d.ts",
  "dist/syntax.js",
  "dist/table-syntax.js",
  "dist/from-markdown.js",
  "dist/to-markdown.js",
  "dist/dev/index.js",
  "dist/dev/gfm.js",
];

const missing = required.filter((file) => !files.has(file));

const forbidden = [...files].filter(
  (file) =>
    file.startsWith("src/") ||
    file.startsWith("test/") ||
    file.startsWith("test-dist/") ||
    file.startsWith("coverage/") ||
    file.endsWith(".tsbuildinfo"),
);

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) {
    console.error("Missing from the npm tarball:", missing);
  }
  if (forbidden.length > 0) {
    console.error("Should not ship in the npm tarball:", forbidden);
  }
  process.exit(1);
}

console.log(
  `npm tarball ok: ${files.size} files, ${report.size} bytes (${report.name}@${report.version})`,
);
