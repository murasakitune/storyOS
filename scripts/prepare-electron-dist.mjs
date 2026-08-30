import { readFile, rename, rm, writeFile } from "node:fs/promises";

function readEnvValue(source, name) {
  const line = source
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(`${name}=`));
  if (!line) return "";
  const value = line.slice(line.indexOf("=") + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  )
    return value.slice(1, -1);
  return value;
}

// The application package is ESM, while Electron's main and sandboxed preload
// bundles are deliberately compiled as CommonJS. Use an explicit extension so
// this remains unambiguous after electron-builder places them inside app.asar.
const modules = [
  "main",
  "preload",
  "google-auth",
  "google-drive",
  "oauth-helpers",
  "oauth-config",
];
for (const name of modules) {
  const source = `dist-electron/electron/${name}.js`;
  const target = `dist-electron/electron/${name}.cjs`;
  await rm(target, { force: true });
  await rename(source, target);
}

for (const name of ["main", "google-auth", "google-drive"]) {
  const target = `dist-electron/electron/${name}.cjs`,
    source = await readFile(target, "utf8");
  await writeFile(
    target,
    source.replace(
      /require\("\.\/(google-auth|google-drive|oauth-helpers|oauth-config)\.js"\)/g,
      'require("./$1.cjs")',
    ),
    "utf8",
  );
}

const envSource = await readFile(".env.local", "utf8").catch(() => ""),
  desktopSecret =
    readEnvValue(envSource, "GOOGLE_DESKTOP_CLIENT_SECRET") ||
    readEnvValue(envSource, "VITE_GOOGLE_DESKTOP_CLIENT_SECRET");
await writeFile(
  "dist-electron/electron/oauth-config.cjs",
  `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.GOOGLE_DESKTOP_CLIENT_SECRET = ${JSON.stringify(desktopSecret)};\n`,
  { encoding: "utf8", mode: 0o600 },
);
