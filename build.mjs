/**
 * Simple build: run tsc, then stitch the emitted scripts into one userscript.
 *
 *   src/css.ts + src/main.ts --tsc--> dist/{css,main}.js --wrap--> dist/hn-tweak.user.js
 *
 * Both sources are plain global scripts (no imports), so tsc emits them as-is
 * and we only have to concatenate them in dependency order inside an IIFE.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const banner = `// ==UserScript==
// @name         HN Tweak
// @namespace    hn-tweak
// @version      ${pkg.version}
// @description  Readable, dark, mobile-friendly Hacker News
// @match        https://news.ycombinator.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==
`;

execSync("npx tsc -p tsconfig.json", { cwd: root, stdio: "inherit", shell: true });

// css.ts must precede main.ts: main.ts calls hnBuildCss at load time.
const parts = ["css.js", "main.js"].map((f) =>
  readFileSync(join(root, "dist", f), "utf8").replace(/^"use strict";\n/m, ""),
);

const body = `(function () {\n"use strict";\n\n${parts.join("\n")}\n})();\n`;
const out = join(root, "dist", "hn-tweak.user.js");
writeFileSync(out, `${banner}\n${body}`);

console.log(`built ${out} (${(Buffer.byteLength(banner + body) / 1024).toFixed(1)} KB)`);
