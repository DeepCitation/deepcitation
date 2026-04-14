/**
 * Build corpus/pdf/*.pdf from corpus/md/*.md at install time.
 *
 * qmd is markdown-native. DeepCitation's verifier ingests PDFs, URLs, or
 * Office files — not plain text. To keep both halves honest we ship the
 * corpus twice: markdown for qmd to index, PDF for DeepCitation to verify
 * against. Filename stems match so `corpus/md/foo.md` pairs with
 * `corpus/pdf/foo.pdf`.
 *
 * Run manually: `bun run build:corpus`
 * Runs automatically via `postinstall` in package.json.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusRoot = resolve(__dirname, "../corpus");
const mdDir = resolve(corpusRoot, "md");
const pdfDir = resolve(corpusRoot, "pdf");

if (!existsSync(pdfDir)) mkdirSync(pdfDir, { recursive: true });

const mdFiles = readdirSync(mdDir).filter(name => name.endsWith(".md"));
if (mdFiles.length === 0) {
  console.error(`No markdown files found in ${mdDir}`);
  process.exit(1);
}

async function renderPdf(mdPath: string, pdfPath: string): Promise<void> {
  const markdown = readFileSync(mdPath, "utf-8");

  await new Promise<void>((resolveWrite, rejectWrite) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 72 });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => {
      writeFileSync(pdfPath, Buffer.concat(chunks));
      resolveWrite();
    });
    doc.on("error", rejectWrite);

    for (const rawLine of markdown.split("\n")) {
      const line = rawLine.trimEnd();
      if (line.startsWith("# ")) {
        doc.moveDown(0.5).fontSize(20).font("Helvetica-Bold").text(line.slice(2));
        doc.moveDown(0.5);
      } else if (line.startsWith("## ")) {
        doc.moveDown(0.3).fontSize(14).font("Helvetica-Bold").text(line.slice(3));
        doc.moveDown(0.2);
      } else if (line === "") {
        doc.moveDown(0.5);
      } else {
        doc.fontSize(11).font("Helvetica").text(line, { align: "left" });
      }
    }

    doc.end();
  });
}

let built = 0;
let skipped = 0;
for (const mdFile of mdFiles) {
  const mdPath = resolve(mdDir, mdFile);
  const pdfPath = resolve(pdfDir, `${basename(mdFile, ".md")}.pdf`);

  if (existsSync(pdfPath) && statSync(pdfPath).mtimeMs >= statSync(mdPath).mtimeMs) {
    skipped++;
    continue;
  }

  await renderPdf(mdPath, pdfPath);
  built++;
  console.log(`  built  ${basename(pdfPath)}`);
}

console.log(`\nCorpus ready: ${built} built, ${skipped} up-to-date (${pdfDir})`);
