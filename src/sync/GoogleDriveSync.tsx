import { useCallback, useEffect, useRef, useState } from "react";
import { now } from "../db";
import {
  authorizeGoogleDrive,
  getGoogleDriveConfiguration,
  downloadDriveSync,
  findDriveSyncFile,
  googleDriveConfigured,
  loadStoredToken,
  saveGoogleDriveConfiguration,
  uploadDriveSync,
} from "./google-drive";
import {
  applyMergedSync,
  observeDatabaseMutations,
  prepareLocalSync,
  saveDriveFileId,
} from "./storage";
import type { SyncPhase } from "./types";

const ENABLED_KEY = "storyos-google-sync-enabled";
const CHANGE_KEY = "storyos-sync-local-change";
const canonicalCollections = (
  collections: Record<string, Array<Record<string, unknown>>>,
) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(collections).map(([name, records]) => [
        name,
        [...records].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      ]),
    ),
  );

export function GoogleDriveSync({
  onDataChanged,
}: {
  onDataChanged: () => void;
}) {
  const [configured, setConfigured] = useState(googleDriveConfigured),
    [phase, setPhase] = useState<SyncPhase>(() =>
      configured ? (loadStoredToken() ? "未接続" : "未接続") : "未設定",
    ),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settings, setSettings] = useState(getGoogleDriveConfiguration);
  const uploadTimer = useRef<number | undefined>(undefined),
    running = useRef<Promise<void> | null>(null),
    clientIdInput = useRef<HTMLInputElement>(null),
    redirectUriInput = useRef<HTMLInputElement>(null);

  const synchronize = useCallback(
    async (interactive = false) => {
      if (running.current) return running.current;
      const task = (async () => {
        if (!configured)
          throw new Error(
            "Google Drive同期のOAuth Client IDが設定されていません。",
          );
        if (window.storyOSFlush && !(await window.storyOSFlush()))
          throw new Error(
            "編集中の本文を保存できなかったため同期を中止しました。",
          );
        let token = loadStoredToken();
        if (!token && interactive) {
          token = await authorizeGoogleDrive();
          localStorage.setItem(ENABLED_KEY, "1");
        }
        if (!token) {
          setPhase("未接続");
          return;
        }
        setPhase("同期中");
        setError("");
        const local = await prepareLocalSync(),
          before = canonicalCollections(local.collections),
          file = await findDriveSyncFile(token.accessToken),
          remote = file
            ? await downloadDriveSync(token.accessToken, file.id)
            : null,
          merged = await applyMergedSync(
            local.collections,
            remote,
            local.tombstones,
            file?.id,
          ),
          fileId = await uploadDriveSync(token.accessToken, merged, file?.id);
        if (!file?.id) await saveDriveFileId(fileId);
        const completedAt = now();
        localStorage.setItem("storyos-sync-last-success", completedAt);
        localStorage.removeItem(CHANGE_KEY);
        setLastSync(completedAt);
        setPhase("同期完了");
        if (before !== canonicalCollections(merged.collections))
          onDataChanged();
      })()
        .catch((cause) => {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setError(message);
          setPhase("同期失敗");
        })
        .finally(() => {
          running.current = null;
        });
      running.current = task;
      return task;
    },
    [configured, onDataChanged],
  );

  useEffect(() => {
    if (!configured || localStorage.getItem(ENABLED_KEY) !== "1") return;
    void synchronize(false);
    const periodic = window.setInterval(
        () => void synchronize(false),
        5 * 60 * 1000,
      ),
      visibility = () => {
        if (document.visibilityState === "visible") void synchronize(false);
      };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(periodic);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [configured, synchronize]);

  useEffect(
    () =>
      observeDatabaseMutations(() => {
        const changedAt = now();
        localStorage.setItem(CHANGE_KEY, changedAt);
        if (localStorage.getItem(ENABLED_KEY) !== "1") return;
        setPhase("変更待ち");
        clearTimeout(uploadTimer.current);
        uploadTimer.current = window.setTimeout(
          () => void synchronize(false),
          10_000,
        );
      }),
    [synchronize],
  );

  useEffect(() => () => clearTimeout(uploadTimer.current), []);

  function manualSync() {
    if (configured) return void synchronize(true);
    setError("");
    setSettings(getGoogleDriveConfiguration());
    setSettingsOpen(true);
  }

  function saveSettings() {
    try {
      // Browser/Electron autofill and some IME composition paths can update the
      // input DOM value before React's change state is committed. Read the
      // visible values at the moment Save is pressed so those values are never
      // discarded.
      const clientId = clientIdInput.current?.value ?? settings.clientId,
        redirectUri = redirectUriInput.current?.value ?? settings.redirectUri;
      saveGoogleDriveConfiguration(clientId, redirectUri);
      setSettings({ clientId: clientId.trim(), redirectUri: redirectUri.trim() });
      setConfigured(true);
      setPhase("未接続");
      setError("");
      setSettingsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("同期失敗");
    }
  }

  return (
    <aside className={`drive-sync drive-${phase}`} aria-live="polite">
      <div>
        <i />
        <span>{phase}</span>
        {lastSync && (
          <small>
            {new Date(lastSync).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        )}
      </div>
      <button onClick={manualSync} disabled={phase === "同期中"}>
        {!configured ? "設定" : loadStoredToken() ? "同期" : "Drive接続"}
      </button>
      {error && !settingsOpen && <p>{error}</p>}
      {settingsOpen && (
        <div
          className="drive-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            className="drive-settings-dialog"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <small>Google Drive appDataFolder</small>
                <h2>同期設定</h2>
              </div>
              <button
                className="icon"
                onClick={() => setSettingsOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </header>
            <div className="drive-settings-body">
              <label>
                <span>OAuth Client ID</span>
                <input
                  ref={clientIdInput}
                  autoFocus
                  value={settings.clientId}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      clientId: event.target.value,
                    }))
                  }
                  placeholder="000000000000-example.apps.googleusercontent.com"
                />
              </label>
              <label>
                <span>承認済みリダイレクトURI</span>
                <input
                  ref={redirectUriInput}
                  value={settings.redirectUri}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      redirectUri: event.target.value,
                    }))
                  }
                  placeholder="https://your-story-os.vercel.app/oauth-callback.html"
                />
              </label>
              <p>
                Google
                Cloudへ登録した値を入力します。クライアントシークレットは不要です。
              </p>
              {error && <div className="drive-settings-error">{error}</div>}
            </div>
            <footer>
              <button onClick={() => setSettingsOpen(false)}>キャンセル</button>
              <button className="primary" onClick={saveSettings}>
                保存
              </button>
            </footer>
          </section>
        </div>
      )}
    </aside>
  );
}
