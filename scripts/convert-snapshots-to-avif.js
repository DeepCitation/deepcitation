#!/usr/bin/env node
/**
 * Convert Playwright snapshots from PNG to AVIF format
 * Usage: node scripts/convert-snapshots-to-avif.js [--remove-png]
 *
 * Converts visual test snapshots from PNG to AVIF for ~50% size savings
 * Used by CI/CD to optimize snapshot storage while maintaining quality
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.join(__dirname, '../tests/playwright/specs/__snapshots__');
const REMOVE_PNG = process.argv.includes('--remove-png');

async function convertSnapshotsToAvif() {
  try {
    // Check if sharp is available, if not use dynamic import and fallback
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      console.error('❌ sharp not found. Install with: npm install --save-dev sharp');
      process.exit(1);
    }

    // Check if snapshots directory exists
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      console.log('ℹ️  Snapshots directory not found');
      return;
    }

    // Find all PNG snapshot files
    const pngFiles = [];
    const walkDir = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (file.endsWith('.png')) {
          pngFiles.push(fullPath);
        }
      }
    };

    walkDir(SNAPSHOTS_DIR);

    if (pngFiles.length === 0) {
      console.log('ℹ️  No PNG snapshots found');
      return;
    }

    console.log(`🎨 Converting ${pngFiles.length} PNG snapshots to AVIF...\n`);

    let totalOriginal = 0;
    let totalConverted = 0;
    const failed = [];

    for (const pngPath of pngFiles) {
      const avifPath = pngPath.replace(/\.png$/, '.avif');
      const relativePath = path.relative(SNAPSHOTS_DIR, pngPath);

      const pngSize = fs.statSync(pngPath).size;
      totalOriginal += pngSize;

      try {
        // Use lossy AVIF conversion (quality=60 for good compression)
        // effort=4 balances speed vs compression
        await sharp(pngPath)
          .avif({ quality: 60, effort: 4 })
          .toFile(avifPath);

        const avifSize = fs.statSync(avifPath).size;
        totalConverted += avifSize;

        const savings = ((1 - avifSize / pngSize) * 100).toFixed(1);
        console.log(`  ✓ ${relativePath.substring(0, 60)}`);
        if (relativePath.length > 60) console.log(`    ${relativePath.substring(60)}`);
        console.log(`    → AVIF (${savings}% smaller)\n`);

        if (REMOVE_PNG) {
          fs.unlinkSync(pngPath);
        }
      } catch (error) {
        console.error(`  ✗ Failed: ${relativePath}`);
        failed.push({ file: relativePath, error: error.message });
      }
    }

    // Print summary
    console.log('━'.repeat(60));
    console.log('📊 Summary:');
    console.log(`  Original (PNG):    ${(totalOriginal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Converted (AVIF):  ${(totalConverted / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Total savings:     ${((1 - totalConverted / totalOriginal) * 100).toFixed(1)}%`);
    console.log('━'.repeat(60));

    if (failed.length > 0) {
      console.log(`\n⚠️  ${failed.length} conversions failed:`);
      failed.forEach(({ file, error }) => {
        console.log(`  - ${file}: ${error}`);
      });
    }

    if (!REMOVE_PNG) {
      console.log(`\n💡 Tip: Use --remove-png to delete original PNG files after conversion`);
    } else {
      console.log(`\n✅ Conversion complete - PNG files removed`);
    }

  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    process.exit(1);
  }
}

convertSnapshotsToAvif().catch(console.error);
