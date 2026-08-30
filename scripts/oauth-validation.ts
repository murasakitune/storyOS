import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPkcePair, isInvalidGrant } from "../electron/oauth-helpers";

const [auth, nativeDrive, main, preload, api, webDrive, syncUi] =
  await Promise.all([
    readFile("electron/google-auth.ts", "utf8"),
    readFile("electron/google-drive.ts", "utf8"),
    readFile("electron/main.ts", "utf8"),
    readFile("electron/preload.ts", "utf8"),
    readFile("src/shared/electron-api.ts", "utf8"),
    readFile("src/sync/google-drive.ts", "utf8"),
    readFile("src/sync/GoogleDriveSync.tsx", "utf8"),
  ]);

assert.match(auth, /response_type", "code"/);
assert.match(auth, /code_challenge_method", "S256"/);
assert.match(auth, /access_type", "offline"/);
assert.match(auth, /127\.0\.0\.1/);
assert.match(auth, /encryptString\(session\.refreshToken\)/);
assert.match(auth, /safeStorage\.decryptString/);
assert.match(auth, /refreshInFlight/);
assert.match(auth, /Google OAuth:.*reason/);
assert.match(auth, /openid/);
assert.match(auth, /drive\.appdata/);
assert.match(auth, /client_secret: GOOGLE_DESKTOP_CLIENT_SECRET/);
assert.match(auth, /Desktop app用OAuth Client Secret/);
assert.match(nativeDrive, /appDataFolder/);
assert.match(nativeDrive, /url\.origin !== GOOGLE_API/);
assert.match(main, /google:begin-connection/);
assert.match(main, /google:disconnect/);
assert.doesNotMatch(main, /google:authorize/);
assert.doesNotMatch(preload, /accessToken/);
assert.doesNotMatch(api, /accessToken/);
assert.doesNotMatch(syncUi, /refreshToken|refresh_token/);
assert.doesNotMatch(syncUi, /CLIENT_SECRET|client_secret/);
assert.doesNotMatch(webDrive, /CLIENT_SECRET|client_secret/);
assert.match(webDrive, /response_type", "token"/);
assert.match(webDrive, /sessionStorage/);
assert.doesNotMatch(webDrive, /localStorage[^\n]+refresh/i);
assert.match(webDrive, /Electron版にWeb用OAuth Client IDが設定されています/);
assert.match(syncUi, /paused\.current = true/);
assert.match(syncUi, /acceptLocalData/);
assert.match(syncUi, /acceptDriveData/);
assert.match(syncUi, /saveGoogleSwitchBackup/);
assert.match(syncUi, /disconnectElectronGoogle/);

for (let index = 0; index < 20; index++) {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(
    challenge,
    createHash("sha256").update(verifier).digest("base64url"),
  );
}
assert.equal(isInvalidGrant({ error: "invalid_grant" }), true);
assert.equal(isInvalidGrant({ error: "temporarily_unavailable" }), false);

console.log(
  "OAuth validation passed: Electron PKCE/loopback/safeStorage/refresh isolation, safe account switching, and unchanged Web session auth.",
);
