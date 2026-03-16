/**
 * Prepare the app for demo static export.
 *
 * Next.js `output: "export"` does not support:
 * - Dynamic Route Handlers (POST, DELETE, etc.)
 * - Route handlers under dynamic segments ([param])
 * - Server Actions ("use server")
 * - `await searchParams` in pages (triggers dynamic rendering)
 *
 * This script:
 * - Deletes route.ts files under dynamic segments
 * - Replaces static route.ts files with a minimal GET stub
 * - Stubs out Server Action files with no-op exports
 * - Injects `export const dynamic = "force-static"` into pages using searchParams
 *
 * Run ONLY in CI or disposable builds — it overwrites/deletes files in-place.
 */

import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "app");
const API_DIR = join(APP_DIR, "(app)/api");

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

async function findFiles(dir, name) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, name)));
    } else if (entry.name === name) {
      files.push(fullPath);
    }
  }
  return files;
}

// -------------------------------------------------------------------------
// 1. Delete all API route handlers (not needed for static demo)
// -------------------------------------------------------------------------

const routeFiles = await findFiles(API_DIR, "route.ts");
for (const file of routeFiles) {
  await unlink(file);
  console.log(`Deleted (route): ${file}`);
}

// -------------------------------------------------------------------------
// 2. Stub Server Action files ("use server")
// -------------------------------------------------------------------------

const ACTION_STUB = `// Stubbed for demo static export
// biome-ignore lint: stub for static export
export async function updateDatasetName(_input: any) {
  throw new Error("Not available in demo mode");
}
`;

const actionFiles = await findFiles(APP_DIR, "actions.ts");
for (const file of actionFiles) {
  await writeFile(file, ACTION_STUB);
  console.log(`Stubbed (action): ${file}`);
}

// -------------------------------------------------------------------------
// 3. Inject `export const dynamic = "force-static"` into pages using searchParams
//    (Route segment config must be a static literal, so we inject it at build time)
// -------------------------------------------------------------------------

const FORCE_STATIC_LINE = 'export const dynamic = "force-static";\n';

const allPages = await findFiles(APP_DIR, "page.tsx");
let patchedCount = 0;
for (const file of allPages) {
  const content = await readFile(file, "utf-8");
  // Only patch pages that access searchParams and don't already have `export const dynamic`
  if (
    content.includes("searchParams") &&
    !content.includes("export const dynamic")
  ) {
    // Insert after the last import line
    const lines = content.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i])) lastImportIdx = i;
    }
    if (lastImportIdx >= 0) {
      // Find end of multi-line import (next non-import, non-empty line after import block)
      let insertIdx = lastImportIdx + 1;
      // Skip closing lines of multi-line imports like `} from "...";`
      while (
        insertIdx < lines.length &&
        (lines[insertIdx].startsWith("  ") ||
          lines[insertIdx].startsWith("}") ||
          lines[insertIdx].trim() === "")
      ) {
        if (lines[insertIdx].trim() === "" && insertIdx > lastImportIdx + 1)
          break;
        insertIdx++;
      }

      // Insert after the export const generateStaticParams block if present
      for (let i = insertIdx; i < lines.length; i++) {
        if (lines[i].includes("generateStaticParams")) {
          // Skip past the generateStaticParams declaration (may span 2 lines)
          insertIdx = i + 1;
          while (insertIdx < lines.length && lines[insertIdx].startsWith("  "))
            insertIdx++;
          break;
        }
        if (lines[i].trim() !== "") break;
      }

      lines.splice(insertIdx, 0, FORCE_STATIC_LINE);
      await writeFile(file, lines.join("\n"));
      console.log(`Patched (force-static): ${file}`);
      patchedCount++;
    }
  }
}

console.log(
  `\nDone: ${routeFiles.length} route(s) + ${actionFiles.length} action(s) + ${patchedCount} page(s) processed.`,
);
