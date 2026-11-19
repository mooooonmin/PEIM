import { build } from "esbuild";
import { cp } from "node:fs/promises";
await build({
  entryPoints: ["app/frontend/main.js"],
  bundle: true,
  format: "esm",
  outdir: "app/static/assets",
  minify: true,
});
await build({
  entryPoints: ["node_modules/pdfjs-dist/build/pdf.worker.mjs"],
  bundle: true,
  format: "esm",
  outfile: "app/static/assets/pdf-worker.js",
  minify: true,
});
for (const folder of ["cmaps", "standard_fonts"]) {
  await cp(`node_modules/pdfjs-dist/${folder}`, `app/static/assets/${folder}`, {
    recursive: true,
  });
}
