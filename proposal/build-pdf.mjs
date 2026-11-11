// Renders proposal/ezpickle-proposal.html to PDF with the pre-installed Chromium.
//   node proposal/build-pdf.mjs            -> keeps the yellow placeholder highlights
//   node proposal/build-pdf.mjs --final    -> removes the highlights (use once filled in)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const final = process.argv.includes("--final");
const out = path.join(dir, final ? "ezpickle-proposal.pdf" : "ezpickle-proposal-template.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(dir, "ezpickle-proposal.html")).href, { waitUntil: "networkidle" });
if (final) await page.addStyleTag({ content: ".fill{background:none!important;padding:0!important}" });
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("Wrote", out);
