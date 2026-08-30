import { useCallback, useEffect, useRef, useState } from "react";
import { now } from "../db";
import type { GoogleAuthStatus } from "../shared/electron-api";
import {
  authorizeGoogleDrive,
  beginElectronGoogleConnection,
  cancelElectronGoogleConnection,
  commitElectronGoogleConnection,
  disconnectElectronGoogle,
  downloadDriveSync,
  findDriveSyncFile,
  getElectronGoogleAuthStatus,
  getGoogleDriveConfiguration,
  googleDriveConfigurationError,
  googleDriveConfigured,
  loadStoredToken,
  saveGoogleDriveConfiguration,
  uploadDriveSync,
} from "./google-drive";
import {
  applyMergedSync,
  observeDatabaseMutations,
  prepareLocalSync,
  replaceLocalWithDrive,
  saveDriveFileId,
} from "./storage";
import type { DriveSyncEnvelope, SyncPhase } from "./types";

const ENABLED_KEY = "storyos-google-sync-enabled";
const CHANGE_KEY = "storyos-sync-local-change";
const isElectron = () => Boolean(window.electronAPI);
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

interface PendingAccount {
  email: string;
  name?: string;
  remoteFileId?: string;
}

export function GoogleDriveSync({
  onDataChanged,
}: {
  onDataChanged: () => void;
}) {
  const [configured, setConfigured] = useState(googleDriveConfigured),
    [phase, setPhase] = useState<SyncPhase>(configured ? "未接続" : "未設定"),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settings, setSettings] = useState(getGoogleDriveConfiguration),
    [auth, setAuth] = useState<GoogleAuthStatus | null>(null),
    [pendingAccount, setPendingAccount] = useState<PendingAccount | null>(null),
    [busy, setBusy] = useState(false);
  const uploadTimer = useRef<number | undefined>(undefined),
    running = useRef<Promise<void> | null>(null),
    paused = useRef(false),
    clientIdInput = useRef<HTMLInputElement>(null),
    redirectUriInput = useRef<HTMLInputElement>(null);

  const refreshElectronStatus = useCallback(async () => {
    const status = await getElectronGoogleAuthStatus();
    if (!status) return null;
    setAuth(status);
    if (status.connected) {
      localStorage.setItem(ENABLED_KEY, "1");
      setPhase((current) => (current === "同期中" ? current : "未接続"));
    } else {
      localStorage.removeItem(ENABLED_KEY);
      setPhase("未接続");
    }
    if (status.error) setError(status.error);
    return status;
  }, []);

  const synchronize = useCallback(
    async (interactive = false) => {
      if (paused.current || running.current) return running.current;
      const task = (async () => {
        if (!configured)
          throw new Error(
            "Google Drive同期のOAuth Client IDが設定されていません。",
          );
        if (window.storyOSFlush && !(await window.storyOSFlush()))
          throw new Error(
            "編集中の本文を保存できなかったため同期を中止しました。",
          );
        let token = "electron-main";
        if (isElectron()) {
          const status = auth || (await refreshElectronStatus());
          if (!status?.connected) {
            setPhase("未接続");
            return;
          }
        } else {
          const stored = loadStoredToken();
          if (stored) token = stored.accessToken;
          else if (interactive) {
            const authorized = await authorizeGoogleDrive();
            token = authorized.accessToken;
            localStorage.setItem(ENABLED_KEY, "1");
          } else {
            setPhase("未接続");
            return;
          }
        }
        setPhase("同期中");
        setError("");
        const local = await prepareLocalSync(),
          before = canonicalCollections(local.collections),
          file = await findDriveSyncFile(token),
          remote = file ? await downloadDriveSync(token, file.id) : null,
          merged = await applyMergedSync(
            local.collections,
            remote,
            local.tombstones,
            file?.id,
          ),
          fileId = await uploadDriveSync(token, merged, file?.id);
        if (!file?.id) await saveDriveFileId(fileId);
        const completedAt = now();
        localStorage.setItem("storyos-sync-last-success", completedAt);
        localStorage.removeItem(CHANGE_KEY);
        setLastSync(completedAt);
        setPhase("同期完了");
        if (before !== canonicalCollections(merged.collections))
          onDataChanged();
      })()
        .catch(async (cause) => {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setError(message);
          setPhase("同期失敗");
          if (isElectron()) {
            const status = await refreshElectronStatus();
            if (!status?.connected) setPhase("未接続");
          }
        })
        .finally(() => {
          running.current = null;
        });
      running.current = task;
      return task;
    },
    [auth, configured, onDataChanged, refreshElectronStatus],
  );

  useEffect(() => {
    if (!isElectron()) return;
    void refreshElectronStatus();
  }, [refreshElectronStatus]);

  useEffect(() => {
    if (
      !configured ||
      paused.current ||
      localStorage.getItem(ENABLED_KEY) !== "1"
    )
      return;
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
  }, [auth?.connected, configured, synchronize]);

  useEffect(
    () =>
      observeDatabaseMutations(() => {
        localStorage.setItem(CHANGE_KEY, now());
        if (paused.current || localStorage.getItem(ENABLED_KEY) !== "1") return;
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

  async function beginAccountChange() {
    paused.current = true;
    clearTimeout(uploadTimer.current);
    setBusy(true);
    setError("");
    try {
      const result = await beginElectronGoogleConnection();
      if (!result.pending || !result.accountEmail)
        throw new Error(result.error || "Google認証がキャンセルされました。");
      const remote = await findDriveSyncFile("electron-main", true);
      setPendingAccount({
        email: result.accountEmail,
        name: result.accountName,
        remoteFileId: remote?.id,
      });
    } catch (cause) {
      await cancelElectronGoogleConnection();
      paused.current = false;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function acceptLocalData() {
    setBusy(true);
    try {
      const status = await commitElectronGoogleConnection();
      setAuth(status);
      setPendingAccount(null);
      paused.current = false;
      localStorage.setItem(ENABLED_KEY, "1");
      setSettingsOpen(false);
      window.setTimeout(() => void synchronize(false), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function acceptDriveData() {
    if (!pendingAccount?.remoteFileId) return;
    if (
      !confirm(
        "現在のローカルデータを、新しいアカウントのDriveデータへ置き換えます。切替前バックアップを作成してから続行しますか？",
      )
    )
      return;
    setBusy(true);
    try {
      const local = await prepareLocalSync(),
        backup: DriveSyncEnvelope = {
          appName: "Story OS",
          schemaVersion: 1,
          exportedAt: now(),
          collections: local.collections,
          tombstones: local.tombstones as DriveSyncEnvelope["tombstones"],
        };
      await window.electronAPI!.saveGoogleSwitchBackup(JSON.stringify(backup));
      const remote = await downloadDriveSync(
        "electron-main",
        pendingAccount.remoteFileId,
        true,
      );
      const status = await commitElectronGoogleConnection();
      await replaceLocalWithDrive(remote, pendingAccount.remoteFileId);
      setAuth(status);
      setPendingAccount(null);
      paused.current = false;
      localStorage.setItem(ENABLED_KEY, "1");
      setPhase("同期完了");
      setSettingsOpen(false);
      onDataChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAccountChange() {
    await cancelElectronGoogleConnection();
    setPendingAccount(null);
    paused.current = false;
    if (auth?.connected) localStorage.setItem(ENABLED_KEY, "1");
  }

  async function closeSettings() {
    if (pendingAccount) await cancelAccountChange();
    setSettingsOpen(false);
  }

  async function disconnect() {
    if (!confirm("Drive連携を解除します。ローカル作品は削除されません。"))
      return;
    paused.current = true;
    setBusy(true);
    try {
      await disconnectElectronGoogle();
      localStorage.removeItem(ENABLED_KEY);
      setAuth(await getElectronGoogleAuthStatus());
      setPendingAccount(null);
      setPhase("未接続");
      setSettingsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      paused.current = false;
      setBusy(false);
    }
  }

  function saveSettings() {
    try {
      const clientId = clientIdInput.current?.value ?? settings.clientId,
        redirectUri = redirectUriInput.current?.value ?? settings.redirectUri;
      saveGoogleDriveConfiguration(clientId, redirectUri);
      setSettings({
        clientId: clientId.trim(),
        redirectUri: redirectUri.trim(),
      });
      setConfigured(true);
      setPhase("未接続");
      setError("");
      setSettingsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("同期失敗");
    }
  }

  const electronConnected = Boolean(auth?.connected),
    webConnected = Boolean(loadStoredToken()),
    connected = isElectron() ? electronConnected : webConnected;
  const configurationError = googleDriveConfigurationError();

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
      <button
        onClick={() => {
          setError("");
          setSettings(getGoogleDriveConfiguration());
          setSettingsOpen(true);
        }}
        disabled={phase === "同期中"}
      >
        Drive
      </button>
      {error && !settingsOpen && <p>{error}</p>}
      {settingsOpen && (
        <div
          className="drive-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void closeSettings();
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
                onClick={() => void closeSettings()}
                aria-label="閉じる"
              >
                ×
              </button>
            </header>
            <div className="drive-settings-body">
              {isElectron() ? (
                <section className="drive-account-section">
                  <span>接続状態</span>
                  <strong>{connected ? "接続済み" : "Drive未接続"}</strong>
                  {auth?.accountEmail && <p>接続中：{auth.accountEmail}</p>}
                  {!configured && (
                    <div className="drive-settings-error">
                      {configurationError ||
                        "VITE_GOOGLE_DESKTOP_CLIENT_IDを設定して再ビルドしてください。"}
                    </div>
                  )}
                  {auth && !auth.secureStorageAvailable && (
                    <div className="drive-settings-error">
                      OSの安全な資格情報ストレージを利用できません。
                    </div>
                  )}
                  <div className="drive-account-actions">
                    {connected && (
                      <button
                        onClick={() => void synchronize(false)}
                        disabled={busy}
                      >
                        今すぐ同期
                      </button>
                    )}
                    <button
                      onClick={() => void beginAccountChange()}
                      disabled={busy || !configured}
                    >
                      {connected ? "アカウントを変更" : "Google Driveに接続"}
                    </button>
                    {connected && (
                      <button
                        className="danger-text"
                        onClick={() => void disconnect()}
                        disabled={busy}
                      >
                        Drive連携を解除
                      </button>
                    )}
                  </div>
                </section>
              ) : (
                <>
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
                    />
                  </label>
                  <p>
                    Web版はブラウザセッション中だけ認証を保持します。クライアントシークレットは不要です。
                  </p>
                  {configured && (
                    <button
                      onClick={() => void synchronize(true)}
                      disabled={busy}
                    >
                      Google Driveに接続／同期
                    </button>
                  )}
                </>
              )}
              {pendingAccount && (
                <section className="drive-switch-choice">
                  <h3>{pendingAccount.email} への切替方法</h3>
                  <button
                    onClick={() => void acceptLocalData()}
                    disabled={busy}
                  >
                    現在のローカルデータをこのアカウントと同期する
                  </button>
                  <small>
                    Driveに既存データがある場合はUUIDと更新日時で安全にマージします。
                  </small>
                  <button
                    onClick={() => void acceptDriveData()}
                    disabled={busy || !pendingAccount.remoteFileId}
                  >
                    このアカウントのDriveデータを使用する
                  </button>
                  <small>
                    {pendingAccount.remoteFileId
                      ? "ローカルをバックアップしてからDriveデータへ置き換えます。"
                      : "このアカウントにStory OSデータはありません。"}
                  </small>
                  <button
                    onClick={() => void cancelAccountChange()}
                    disabled={busy}
                  >
                    切替をキャンセル
                  </button>
                </section>
              )}
              {error && <div className="drive-settings-error">{error}</div>}
            </div>
            {!isElectron() && (
              <footer>
                <button onClick={() => void closeSettings()}>キャンセル</button>
                <button className="primary" onClick={saveSettings}>
                  保存
                </button>
              </footer>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
