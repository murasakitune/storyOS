import { app, net } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GoogleAuthManager } from "./google-auth.js";

export const DRIVE_FILE_NAME = "story-os-sync-v1.json";
const GOOGLE_API = "https://www.googleapis.com";

export interface NativeDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

function safeGoogleUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== GOOGLE_API)
    throw new Error("許可されていないDrive API URLです。");
  return url.toString();
}

export class GoogleDriveClient {
  constructor(private readonly auth: GoogleAuthManager) {}

  private async authorizedFetch(
    url: string,
    init?: RequestInit,
    usePending = false,
    retry = true,
    forceRefresh = false,
  ): Promise<Response> {
    const accessToken = await this.auth.getAccessToken(
        usePending,
        forceRefresh,
      ),
      response = await net.fetch(safeGoogleUrl(url), {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers || {}),
        },
      });
    if (response.status === 401 && retry)
      return this.authorizedFetch(url, init, usePending, false, true);
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        detail = payload.error?.message || detail;
      } catch {
        // Keep the status-only message. Tokens and response bodies are not logged.
      }
      throw new Error(`Google Drive API: ${detail}`);
    }
    return response;
  }

  async findSyncFile(usePending = false): Promise<NativeDriveFile | null> {
    const params = new URLSearchParams({
        spaces: "appDataFolder",
        q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
        fields: "files(id,name,modifiedTime)",
        pageSize: "10",
      }),
      response = await this.authorizedFetch(
        `${GOOGLE_API}/drive/v3/files?${params}`,
        undefined,
        usePending,
      ),
      result = (await response.json()) as { files?: NativeDriveFile[] };
    return (
      result.files?.sort((left, right) =>
        String(right.modifiedTime).localeCompare(String(left.modifiedTime)),
      )[0] || null
    );
  }

  async download(fileId: string, usePending = false): Promise<unknown> {
    if (!/^[\w-]+$/.test(fileId)) throw new Error("Drive file IDが不正です。");
    const response = await this.authorizedFetch(
      `${GOOGLE_API}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      undefined,
      usePending,
    );
    return response.json();
  }

  async upload(
    envelope: unknown,
    fileId?: string,
    usePending = false,
  ): Promise<string> {
    const content = JSON.stringify(envelope);
    if (Buffer.byteLength(content, "utf8") > 512 * 1024 * 1024)
      throw new Error("Drive同期データが大きすぎます。");
    if (fileId) {
      if (!/^[\w-]+$/.test(fileId))
        throw new Error("Drive file IDが不正です。");
      await this.authorizedFetch(
        `${GOOGLE_API}/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: content,
        },
        usePending,
      );
      return fileId;
    }
    const boundary = `storyos-${crypto.randomUUID()}`,
      body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`,
      response = await this.authorizedFetch(
        `${GOOGLE_API}/upload/drive/v3/files?uploadType=multipart&fields=id`,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
        usePending,
      ),
      result = (await response.json()) as { id?: string };
    if (!result.id)
      throw new Error("Drive同期ファイルを作成できませんでした。");
    return result.id;
  }

  async saveSwitchBackup(content: string) {
    if (Buffer.byteLength(content, "utf8") > 512 * 1024 * 1024)
      throw new Error("切替前バックアップが大きすぎます。");
    const directory = path.join(
        app.getPath("userData"),
        "account-switch-backups",
      ),
      stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(
      directory,
      `story-os-before-account-switch-${stamp}.json`,
    );
    await fs.writeFile(target, content, { encoding: "utf8", mode: 0o600 });
    return target;
  }
}
