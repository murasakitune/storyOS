import { rename, rm } from "node:fs/promises";

// The application package is ESM, while Electron's main and sandboxed preload
// bundles are deliberately compiled as CommonJS. Use an explicit extension so
// this remains unambiguous after electron-builder places them inside app.asar.
for (const name of ["main", "preload"]) {
  const source = `dist-electron/electron/${name}.js`;
  const target = `dist-electron/electron/${name}.cjs`;
  await rm(target, { force: true });
  await rename(source, target);
}
