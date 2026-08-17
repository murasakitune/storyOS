import { validateSyncEnvelope } from "./merge";
import type { DriveSyncEnvelope } from "./types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const DRIVE_FILE_NAME = "story-os-sync-v1.json";
const TOKEN_KEY = "storyos-google-drive-token";

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}
interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

const clientId = () =>
  String(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      localStorage.getItem("storyos-google-client-id") ||
      "",
  ).trim();
const redirectUri = () =>
  String(
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
      localStorage.getItem("storyos-google-redirect-uri") ||
      "",
  ).trim() || `${location.origin}/oauth-callback.html`;

export function getGoogleDriveConfiguration() {
  return { clientId: clientId(), redirectUri: redirectUri() };
}

export function saveGoogleDriveConfiguration(
  idValue: string,
  redirectValue: string,
) {
  const id = idValue.trim(),
    redirect = redirectValue.trim();
  if (!id) throw new Error("Google OAuth Client IDを入力してください。");
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id))
    throw new Error("Google OAuth Client IDの形式が正しくありません。");
  if (
    !/^https:\/\//.test(redirect) &&
    !/^http:\/\/localhost(?::\d+)?\//.test(redirect)
  )
    throw new Error(
      "リダイレクトURIはHTTPSまたはlocalhostの完全なURLで指定してください。",
    );
  localStorage.setItem("storyos-google-client-id", id);
  localStorage.setItem("storyos-google-redirect-uri", redirect);
}

export function googleDriveConfigured() {
  return (
    Boolean(clientId()) &&
    (!window.electronAPI ||
      /^https:\/\//.test(redirectUri()) ||
      /^http:\/\/localhost/.test(redirectUri()))
  );
}

export function loadStoredToken(): StoredToken | null {
  try {
    const token = JSON.parse(
      sessionStorage.getItem(TOKEN_KEY) || "null",
    ) as StoredToken | null;
    return token && token.expiresAt > Date.now() + 30_000 ? token : null;
  } catch {
    return null;
  }
}

function storeToken(accessToken: string, expiresIn = 3600) {
  const token = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

async function authorizeBrowser(): Promise<StoredToken> {
  const state = crypto.randomUUID(),
    target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", clientId());
  target.searchParams.set("redirect_uri", redirectUri());
  target.searchParams.set("response_type", "token");
  target.searchParams.set("scope", DRIVE_SCOPE);
  target.searchParams.set("include_granted_scopes", "true");
  target.searchParams.set("state", state);
  target.searchParams.set("prompt", "select_account");
  const popup = window.open(
    target.toString(),
    "storyos-google-drive",
    "popup,width=520,height=720",
  );
  if (!popup)
    throw new Error(
      "Google認証画面を開けません。ポップアップを許可してください。",
    );
  return await new Promise((resolve, reject) => {
    const expectedOrigin = new URL(redirectUri()).origin;
    const timeout = window.setTimeout(
      () => finish(new Error("Google認証がタイムアウトしました。")),
      120_000,
    );
    const finish = (error?: Error, token?: StoredToken) => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (!popup.closed) popup.close();
      if (error) reject(error);
      else if (token) resolve(token);
    };
    const receive = (event: MessageEvent) => {
      const data = event.data as Record<string, string> | null;
      if (
        event.origin !== expectedOrigin ||
        !data ||
        data.type !== "storyos-google-oauth" ||
        data.state !== state
      )
        return;
      if (data.error)
        return finish(new Error(data.error_description || data.error));
      if (!data.access_token)
        return finish(new Error("Googleアクセストークンがありません。"));
      finish(
        undefined,
        storeToken(data.access_token, Number(data.expires_in || 3600)),
      );
    };
    window.addEventListener("message", receive);
  });
}

export async function authorizeGoogleDrive(): Promise<StoredToken> {
  if (!googleDriveConfigured())
    throw new Error(
      "Google Drive同期が未設定です。VITE_GOOGLE_CLIENT_IDとリダイレクトURIを設定してください。",
    );
  if (window.electronAPI) {
    const state = crypto.randomUUID(),
      result = await window.electronAPI.authorizeGoogle({
        clientId: clientId(),
        redirectUri: redirectUri(),
        state,
      });
    if (!result.accessToken)
      throw new Error(result.error || "Google認証に失敗しました。");
    return storeToken(result.accessToken, result.expiresIn);
  }
  return authorizeBrowser();
}

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error("Google Driveの認証期限が切れました。再接続してください。");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      detail = (await response.json()).error?.message || detail;
    } catch {
      /* no JSON */
    }
    throw new Error(`Google Drive API: ${detail}`);
  }
  return response;
}

export async function findDriveSyncFile(
  token: string,
): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
    fields: "files(id,name,modifiedTime)",
    pageSize: "10",
  });
  const response = await driveFetch(
      token,
      `https://www.googleapis.com/drive/v3/files?${params}`,
    ),
    result = (await response.json()) as { files?: DriveFile[] };
  return (
    result.files?.sort((a, b) =>
      String(b.modifiedTime).localeCompare(String(a.modifiedTime)),
    )[0] || null
  );
}

export async function downloadDriveSync(token: string, fileId: string) {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
  );
  return validateSyncEnvelope(await response.json());
}

export async function uploadDriveSync(
  token: string,
  envelope: DriveSyncEnvelope,
  fileId?: string,
): Promise<string> {
  const content = JSON.stringify(envelope);
  if (fileId) {
    await driveFetch(
      token,
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: content,
      },
    );
    return fileId;
  }
  const boundary = `storyos-${crypto.randomUUID()}`,
    body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const response = await driveFetch(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const result = (await response.json()) as { id?: string };
  if (!result.id)
    throw new Error("Google Drive同期ファイルを作成できませんでした。");
  return result.id;
}
