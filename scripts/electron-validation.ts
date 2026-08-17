import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [main, preload, renderer, bootstrap, syncUi, pkgText] = await Promise.all(
  [
    readFile("electron/main.ts", "utf8"),
    readFile("electron/preload.ts", "utf8"),
    readFile("src/App.tsx", "utf8"),
    readFile("src/main.tsx", "utf8"),
    readFile("src/sync/google-drive.ts", "utf8"),
    readFile("package.json", "utf8"),
  ],
);
const pkg = JSON.parse(pkgText) as {
  main?: string;
  build?: { appId?: string; nsis?: { deleteAppDataOnUninstall?: boolean } };
};

assert.match(main, /nodeIntegration:\s*false/);
assert.match(main, /contextIsolation:\s*true/);
assert.match(main, /sandbox:\s*true/);
assert.match(main, /webSecurity:\s*true/);
assert.match(main, /requestSingleInstanceLock\(\)/);
assert.match(main, /setWindowOpenHandler/);
assert.match(main, /Content-Security-Policy/);
assert.match(main, /registerSchemesAsPrivileged/);
assert.match(main, /Story OS Development/);
assert.match(main, /preload\.cjs/);
assert.match(preload, /contextBridge\.exposeInMainWorld/);
assert.doesNotMatch(preload, /\b(exec|spawn|eval)\s*\(/);
assert.match(bootstrap, /import\.meta\.env\.PROD/);
assert.match(bootstrap, /registration\.unregister\(\)/);
assert.doesNotMatch(syncUi, /\bprompt\s*\(/);
assert.match(
  renderer,
  /to=\{`\/works\/\$\{work\.id\}\/\$\{String\(path\)\}`\}/,
);
assert.doesNotMatch(renderer, /to=\{String\(path\)\}/);
assert.equal(pkg.build?.appId, "com.storyos.desktop");
assert.equal(pkg.main, "dist-electron/electron/main.cjs");
assert.equal(pkg.build?.nsis?.deleteAppDataOnUninstall, false);

console.log("Electron security and packaging validation passed.");
