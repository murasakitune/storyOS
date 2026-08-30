import { app, net, safeStorage, shell } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { createPkcePair, isInvalidGrant } from "./oauth-helpers.js";
import { GOOGLE_DESKTOP_CLIENT_SECRET } from "./oauth-config.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.appdata",
];

interface StoredCredential {
  version: 1;
  clientId: string;
  accountEmail: string;
  accountName?: string;
  encryptedRefreshToken: string;
  createdAt: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface SessionCredential {
  clientId: string;
  refreshToken: string;
  accountEmail: string;
  accountName?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

export interface GoogleAuthStatus {
  configured: boolean;
  connected: boolean;
  accountEmail?: string;
  accountName?: string;
  secureStorageAvailable: boolean;
  error?: string;
}

export interface GoogleConnectResult extends GoogleAuthStatus {
  pending?: boolean;
  canceled?: boolean;
}

const credentialPath = () =>
  path.join(app.getPath("userData"), "google-drive-auth.json");

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const oauth = value as {
      error?: string;
      error_description?: string;
    };
    const reason =
      oauth.error_description || oauth.error || response.statusText;
    throw new Error(`Google OAuth: ${reason || response.status}`);
  }
  return value;
}

export class GoogleAuthManager {
  private active: SessionCredential | null = null;
  private pending: SessionCredential | null = null;
  private refreshInFlight: Promise<string> | null = null;

  private secureStorageAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  private async readStored(): Promise<SessionCredential | null> {
    if (!this.secureStorageAvailable()) return null;
    try {
      const stored = JSON.parse(
        await fs.readFile(credentialPath(), "utf8"),
      ) as StoredCredential;
      if (
        stored.version !== 1 ||
        !stored.clientId ||
        !stored.encryptedRefreshToken ||
        !stored.accountEmail
      )
        return null;
      const refreshToken = safeStorage.decryptString(
        Buffer.from(stored.encryptedRefreshToken, "base64"),
      );
      return {
        clientId: stored.clientId,
        refreshToken,
        accountEmail: stored.accountEmail,
        accountName: stored.accountName,
      };
    } catch {
      return null;
    }
  }

  private async ensureLoaded() {
    if (!this.active) this.active = await this.readStored();
    return this.active;
  }

  private async persist(session: SessionCredential) {
    if (!this.secureStorageAvailable())
      throw new Error(
        "OSの安全な資格情報ストレージを利用できないため、Google Drive認証を保存できません。",
      );
    const value: StoredCredential = {
      version: 1,
      clientId: session.clientId,
      accountEmail: session.accountEmail,
      accountName: session.accountName,
      encryptedRefreshToken: safeStorage
        .encryptString(session.refreshToken)
        .toString("base64"),
      createdAt: new Date().toISOString(),
    };
    const target = credentialPath(),
      temporary = `${target}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(value), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, target);
  }

  async status(clientId: string): Promise<GoogleAuthStatus> {
    const active = await this.ensureLoaded(),
      secureStorageAvailable = this.secureStorageAvailable();
    if (!clientId)
      return { configured: false, connected: false, secureStorageAvailable };
    if (!active || active.clientId !== clientId)
      return {
        configured: true,
        connected: false,
        secureStorageAvailable,
        error:
          active && active.clientId !== clientId
            ? "OAuth Client IDが変更されたため再接続が必要です。"
            : undefined,
      };
    return {
      configured: true,
      connected: true,
      accountEmail: active.accountEmail,
      accountName: active.accountName,
      secureStorageAvailable,
    };
  }

  private async exchangeCode(
    clientId: string,
    code: string,
    redirectUri: string,
    verifier: string,
  ) {
    const response = await net.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: GOOGLE_DESKTOP_CLIENT_SECRET,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });
    return responseJson<TokenResponse>(response);
  }

  private async profile(accessToken: string) {
    const response = await net.fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return responseJson<{ email?: string; name?: string }>(response);
  }

  async beginConnection(clientId: string): Promise<GoogleConnectResult> {
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId))
      return {
        configured: false,
        connected: false,
        secureStorageAvailable: this.secureStorageAvailable(),
        error: "Desktop app用OAuth Client IDが設定されていません。",
      };
    if (!GOOGLE_DESKTOP_CLIENT_SECRET)
      return {
        configured: false,
        connected: false,
        secureStorageAvailable: this.secureStorageAvailable(),
        error: "Desktop app用OAuth Client Secretがビルドに設定されていません。",
      };
    if (!this.secureStorageAvailable())
      return {
        configured: true,
        connected: false,
        secureStorageAvailable: false,
        error: "OSの安全な資格情報ストレージを利用できません。",
      };
    this.pending = null;
    const { verifier, challenge } = createPkcePair(),
      state = randomUUID();
    return await new Promise((resolve) => {
      const control: { settled: boolean; timeout?: NodeJS.Timeout } = {
        settled: false,
      };
      const server = createServer(async (request, response) => {
        try {
          const received = new URL(
            request.url || "/",
            `http://${request.headers.host || "127.0.0.1"}`,
          );
          if (received.pathname !== "/oauth2/callback") {
            response.writeHead(404).end();
            return;
          }
          const code = received.searchParams.get("code"),
            receivedState = received.searchParams.get("state"),
            oauthError = received.searchParams.get("error");
          response.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          response.end(
            "<!doctype html><meta charset=utf-8><title>Story OS</title><p>Story OSへ戻ってください。このタブは閉じて構いません。</p>",
          );
          if (oauthError)
            return finish({
              configured: true,
              connected: Boolean(await this.ensureLoaded()),
              secureStorageAvailable: true,
              canceled: oauthError === "access_denied",
              error:
                oauthError === "access_denied"
                  ? "Google認証がキャンセルされました。"
                  : `Google認証に失敗しました（${oauthError}）。`,
            });
          if (!code || receivedState !== state)
            return finish({
              configured: true,
              connected: Boolean(await this.ensureLoaded()),
              secureStorageAvailable: true,
              error: "OAuth callbackを検証できませんでした。",
            });
          const address = server.address();
          if (!address || typeof address === "string")
            throw new Error("callback unavailable");
          const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`,
            token = await this.exchangeCode(
              clientId,
              code,
              redirectUri,
              verifier,
            );
          if (!token.access_token || !token.refresh_token)
            throw new Error("Googleからrefresh tokenを取得できませんでした。");
          const profile = await this.profile(token.access_token);
          if (!profile.email)
            throw new Error("Googleアカウントを識別できませんでした。");
          this.pending = {
            clientId,
            refreshToken: token.refresh_token,
            accountEmail: profile.email,
            accountName: profile.name,
            accessToken: token.access_token,
            accessTokenExpiresAt:
              Date.now() + Number(token.expires_in || 3600) * 1000,
          };
          finish({
            configured: true,
            connected: true,
            pending: true,
            accountEmail: profile.email,
            accountName: profile.name,
            secureStorageAvailable: true,
          });
        } catch (error) {
          finish({
            configured: true,
            connected: Boolean(await this.ensureLoaded()),
            secureStorageAvailable: true,
            error:
              error instanceof Error
                ? error.message
                : "Google認証に失敗しました。",
          });
        }
      });
      const finish = (result: GoogleConnectResult) => {
        if (control.settled) return;
        control.settled = true;
        if (control.timeout) clearTimeout(control.timeout);
        server.close();
        resolve(result);
      };
      server.on("error", () =>
        finish({
          configured: true,
          connected: false,
          secureStorageAvailable: true,
          error: "Google認証用のローカルcallbackを開始できませんでした。",
        }),
      );
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address();
        if (!address || typeof address === "string") return;
        const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`,
          target = new URL(AUTH_ENDPOINT);
        target.searchParams.set("client_id", clientId);
        target.searchParams.set("redirect_uri", redirectUri);
        target.searchParams.set("response_type", "code");
        target.searchParams.set("scope", SCOPES.join(" "));
        target.searchParams.set("access_type", "offline");
        target.searchParams.set("include_granted_scopes", "true");
        target.searchParams.set("prompt", "consent select_account");
        target.searchParams.set("code_challenge", challenge);
        target.searchParams.set("code_challenge_method", "S256");
        target.searchParams.set("state", state);
        try {
          await shell.openExternal(target.toString());
        } catch {
          finish({
            configured: true,
            connected: false,
            secureStorageAvailable: true,
            error: "既定ブラウザでGoogle認証画面を開けませんでした。",
          });
        }
      });
      control.timeout = setTimeout(
        () =>
          finish({
            configured: true,
            connected: false,
            secureStorageAvailable: true,
            canceled: true,
            error: "Google認証がタイムアウトしました。",
          }),
        180_000,
      );
    });
  }

  async commitPending() {
    if (!this.pending)
      throw new Error("確定待ちのGoogleアカウントがありません。");
    await this.persist(this.pending);
    this.active = this.pending;
    this.pending = null;
    return this.status(this.active.clientId);
  }

  async cancelPending() {
    const pending = this.pending;
    this.pending = null;
    if (pending)
      await net
        .fetch(REVOKE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: pending.refreshToken }).toString(),
        })
        .catch(() => undefined);
  }

  async getAccessToken(
    usePending = false,
    forceRefresh = false,
  ): Promise<string> {
    const session = usePending ? this.pending : await this.ensureLoaded();
    if (!session) throw new Error("Drive未接続です。再接続してください。");
    if (
      !forceRefresh &&
      session.accessToken &&
      (session.accessTokenExpiresAt || 0) > Date.now() + 60_000
    )
      return session.accessToken;
    if (usePending) return this.refresh(session, false);
    if (!this.refreshInFlight)
      this.refreshInFlight = this.refresh(session, true).finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  private async refresh(session: SessionCredential, clearInvalid: boolean) {
    const response = await net.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: session.clientId,
        client_secret: GOOGLE_DESKTOP_CLIENT_SECRET,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const value = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !value.access_token) {
      if (clearInvalid && isInvalidGrant(value)) await this.clearActive();
      throw new Error(
        isInvalidGrant(value)
          ? "Google Driveの認証が無効になりました。再接続してください。"
          : "Google Driveへ再接続できません。ネットワークを確認してください。",
      );
    }
    session.accessToken = value.access_token;
    session.accessTokenExpiresAt =
      Date.now() + Number(value.expires_in || 3600) * 1000;
    return session.accessToken;
  }

  private async clearActive() {
    this.active = null;
    this.refreshInFlight = null;
    await fs.rm(credentialPath(), { force: true }).catch(() => undefined);
  }

  async disconnect() {
    const session = await this.ensureLoaded();
    this.pending = null;
    if (session) {
      await net
        .fetch(REVOKE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: session.refreshToken }).toString(),
        })
        .catch(() => undefined);
    }
    await this.clearActive();
  }
}
