import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  net,
  screen,
  session,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import type {
  MenuAction,
  NativeSaveRequest,
} from "../src/shared/electron-api.js";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "storyos",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);
const isDev = !app.isPackaged && process.env.STORYOS_ELECTRON_DEV === "1",
  isSmokeTest =
    process.env.STORYOS_SMOKE_TEST === "1" ||
    process.env.STORYOS_NAV_SMOKE_TEST === "1" ||
    process.env.STORYOS_CHARACTER_SMOKE_TEST === "1" ||
    process.env.STORYOS_EDITOR_SMOKE_TEST === "1" ||
    process.env.STORYOS_SETTINGS_SMOKE_TEST === "1",
  MAX_FILE_BYTES = 512 * 1024 * 1024;
app.setName("Story OS");
if (isDev && !isSmokeTest) {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "Story OS Development"),
  );
}
let mainWindow: BrowserWindow | null = null,
  allowClose = false,
  lastBackupDir = "";
interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}
const statePath = () => path.join(app.getPath("userData"), "window-state.json");
async function readState(): Promise<WindowState> {
  try {
    const value = JSON.parse(
      await fs.readFile(statePath(), "utf8"),
    ) as WindowState;
    const visible = screen
      .getAllDisplays()
      .some(
        (d) =>
          value.x < d.bounds.x + d.bounds.width &&
          value.x + value.width > d.bounds.x &&
          value.y < d.bounds.y + d.bounds.height &&
          value.y + value.height > d.bounds.y,
      );
    if (visible) return value;
  } catch (error) {
    void error;
  }
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + 80,
    y: area.y + 50,
    width: Math.min(1440, area.width - 160),
    height: Math.min(960, area.height - 100),
    maximized: false,
  };
}
async function saveState(win: BrowserWindow) {
  if (win.isMinimized()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  await fs
    .writeFile(
      statePath(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
      "utf8",
    )
    .catch(() => undefined);
}
function send(action: MenuAction) {
  mainWindow?.webContents.send("menu:action", action);
}
function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "ファイル",
      submenu: [
        {
          label: "新規作品",
          accelerator: "CmdOrCtrl+N",
          click: () => send("new-work"),
        },
        {
          label: "作品を開く",
          accelerator: "CmdOrCtrl+O",
          click: () => send("open-work"),
        },
        { type: "separator" },
        {
          label: "バックアップを書き出す",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => send("export-backup"),
        },
        { label: "バックアップを読み込む", click: () => send("import-backup") },
        {
          label: "本文をMarkdownで書き出す",
          click: () => send("export-manuscript"),
        },
        { type: "separator" },
        { label: "終了", role: "quit" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "元に戻す" },
        { role: "redo", label: "やり直す" },
        { type: "separator" },
        { role: "cut", label: "切り取り" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "貼り付け" },
        { role: "selectAll", label: "すべて選択" },
        { type: "separator" },
        {
          label: "検索",
          accelerator: "CmdOrCtrl+F",
          click: () => send("search"),
        },
      ],
    },
    {
      label: "表示",
      submenu: [
        { role: "reload", label: "再読み込み" },
        { role: "togglefullscreen", label: "全画面表示" },
        { role: "zoomIn", label: "拡大" },
        { role: "zoomOut", label: "縮小" },
        { role: "resetZoom", label: "標準倍率" },
        {
          label: "集中モード",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => send("focus-mode"),
        },
        ...(isDev
          ? [{ role: "toggleDevTools" as const, label: "開発者ツール" }]
          : []),
      ],
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "Story OSについて",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: "Story OSについて",
              message: `Story OS ${app.getVersion()}`,
              detail:
                "本文や設定を外部送信しない、オフライン中心の小説執筆環境です。",
            }),
        },
        {
          label: "データ保存場所を開く",
          click: () => void shell.openPath(app.getPath("userData")),
        },
        { label: "バックアップ方法", click: () => send("backup-help") },
        {
          label: "バージョン情報",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              message: `Story OS ${app.getVersion()}`,
              detail: `Electron ${process.versions.electron}\nChromium ${process.versions.chrome}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function setupProtocol() {
  const root = path.resolve(__dirname, "../../dist");
  protocol.handle("storyos", async (request) => {
    const url = new URL(request.url),
      relative = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      ),
      file = path.resolve(root, `.${relative}`);
    if (
      !file.startsWith(root + path.sep) &&
      file !== path.join(root, "index.html")
    )
      return new Response("Forbidden", { status: 403 });
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
function setupSecurity() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isAppResponse = isDev
      ? details.url.startsWith("http://localhost:5173")
      : details.url.startsWith("storyos://app");
    if (!isAppResponse)
      return callback({ responseHeaders: details.responseHeaders });
    const policy = isDev
      ? "default-src 'self' http://localhost:5173 ws://localhost:5173; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:5173 http://localhost:5173 https://www.googleapis.com"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://www.googleapis.com; object-src 'none'; base-uri 'none'; frame-src 'none'";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}
async function requestClose(win: BrowserWindow) {
  const id = crypto.randomUUID();
  const result = await new Promise<{ success: boolean; error?: string }>(
    (resolve) => {
      const timer = setTimeout(() => {
        ipcMain.removeAllListeners(`close:${id}`);
        resolve({
          success: false,
          error: "保存処理が時間内に完了しませんでした。",
        });
      }, 8000);
      ipcMain.once(`close:${id}`, (_e, payload) => {
        clearTimeout(timer);
        resolve(payload as { success: boolean; error?: string });
      });
      win.webContents.send("app:prepare-close", id);
    },
  );
  if (result.success) {
    allowClose = true;
    await saveState(win);
    win.close();
    return;
  }
  const answer = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["執筆画面へ戻る", "保存せず終了"],
    defaultId: 0,
    cancelId: 0,
    title: "保存を確認できません",
    message: "保留中の内容を保存できませんでした。",
    detail:
      result.error || "アプリへ戻ってバックアップを作成することを推奨します。",
  });
  if (answer.response === 1) {
    allowClose = true;
    await saveState(win);
    win.close();
  }
}
async function createWindow() {
  const state = await readState();
  const win = new BrowserWindow({
    title: "Story OS",
    ...state,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: "#171916",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => {
    win.show();
    if (process.env.STORYOS_SETTINGS_SMOKE_TEST === "1") {
      setTimeout(async () => {
        try {
          const result = await win.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const setValue = (element, value) => {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
              };
              for (let index = 0; index < 30 && !document.querySelector('.drive-sync > button'); index++)
                await wait(100);
              document.querySelector('.drive-sync > button')?.click();
              await wait(200);
              const dialog = document.querySelector('.drive-settings-dialog');
              const inputs = dialog?.querySelectorAll('input');
              if (!dialog || inputs?.length !== 2) return { success: false, stage: 'dialog', text: document.body.innerText, href: location.href, readyState: document.readyState };
              setValue(inputs[0], '123-example.apps.googleusercontent.com');
              await wait(50);
              setValue(inputs[1], 'https://example.vercel.app/oauth-callback.html');
              await wait(50);
              dialog.querySelector('footer .primary')?.click();
              await wait(100);
              return {
                success: !document.querySelector('.drive-settings-dialog') &&
                  document.querySelector('.drive-sync')?.textContent?.includes('未接続'),
                stage: 'saved',
                syncText: document.querySelector('.drive-sync')?.textContent,
                dialogOpen: Boolean(document.querySelector('.drive-settings-dialog')),
                error: document.querySelector('.drive-settings-error')?.textContent
              };
            })()
          `);
          app.exit(result.success ? 0 : 18);
        } catch {
          app.exit(19);
        }
      }, 500);
    } else if (process.env.STORYOS_EDITOR_SMOKE_TEST === "1") {
      setTimeout(async () => {
        try {
          const success = await win.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const setValue = (element, value) => {
                const prototype = element instanceof HTMLTextAreaElement
                  ? HTMLTextAreaElement.prototype
                  : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
              };
              document.querySelector('.library-head .primary')?.click();
              await wait(500);
              document.querySelector('.tabs a[href$="/write"]')?.click();
              await wait(300);
              const area = document.querySelector('.manuscript');
              if (!area) return false;
              setValue(area, '一行目\\n検索語です');
              await wait(100);
              area.setSelectionRange(0, 0);
              area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
              await wait(100);
              document.querySelector('.editor-search-button')?.click();
              await wait(100);
              const search = document.querySelector('.manuscript-find input');
              if (!search) return false;
              setValue(search, '検索語');
              search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              await wait(100);
              return area.value.charCodeAt(0) === 0x3000 &&
                area.value.slice(area.selectionStart, area.selectionEnd) === '検索語' &&
                Boolean(document.querySelector('.manuscript-status'));
            })()
          `);
          app.exit(success ? 0 : 16);
        } catch {
          app.exit(17);
        }
      }, 500);
    } else if (process.env.STORYOS_CHARACTER_SMOKE_TEST === "1") {
      setTimeout(async () => {
        try {
          const success = await win.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              document.querySelector('.library-head .primary')?.click();
              await wait(500);
              document.querySelector('.tabs a[href$="/reference"]')?.click();
              await wait(300);
              document.querySelector('.section-heading .primary')?.click();
              await wait(200);
              return document.querySelectorAll('.character-sheet-editor textarea').length === 41;
            })()
          `);
          app.exit(success ? 0 : 14);
        } catch {
          app.exit(15);
        }
      }, 500);
    } else if (process.env.STORYOS_NAV_SMOKE_TEST === "1") {
      setTimeout(async () => {
        try {
          const success = await win.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              document.querySelector('.library-head .primary')?.click();
              await wait(500);
              for (const path of ['home', 'write', 'reference', 'plot', 'inspect', 'data']) {
                const link = document.querySelector('.tabs a[href$="/' + path + '"]');
                if (!link) return false;
                link.click();
                await wait(200);
                if (!location.hash.includes('/' + path)) return false;
              }
              return true;
            })()
          `);
          app.exit(success ? 0 : 12);
        } catch {
          app.exit(13);
        }
      }, 500);
    } else if (process.env.STORYOS_SMOKE_TEST === "1")
      setTimeout(() => win.close(), 1500);
  });
  win.on("close", (e) => {
    if (!allowClose) {
      e.preventDefault();
      void requestClose(win);
    }
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  const allowedExternalHosts = new Set<string>();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("https://") &&
      allowedExternalHosts.has(new URL(url).hostname)
    )
      void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? url.startsWith("http://localhost:5173")
      : url.startsWith("storyos://app");
    if (!allowed) event.preventDefault();
  });
  if (isDev)
    await win.loadURL(
      process.env.VITE_DEV_SERVER_URL || "http://localhost:5173",
    );
  else await win.loadURL("storyos://app/index.html");
}
function validSaveRequest(value: unknown): value is NativeSaveRequest {
  if (!value || typeof value !== "object") return false;
  const x = value as Record<string, unknown>;
  return (
    ["json", "character", "text", "markdown"].includes(String(x.kind)) &&
    typeof x.defaultName === "string" &&
    x.defaultName.length <= 180 &&
    typeof x.content === "string" &&
    Buffer.byteLength(x.content, "utf8") <= MAX_FILE_BYTES
  );
}
function setupIpc() {
  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath("userData"),
  }));
  ipcMain.handle("app:open-user-data", async () => {
    const error = await shell.openPath(app.getPath("userData"));
    return error ? { ok: false, error } : { ok: true };
  });
  ipcMain.handle("google:authorize", async (_event, value: unknown) => {
    if (!value || typeof value !== "object")
      return { error: "OAuth設定が不正です。" };
    const request = value as Record<string, unknown>,
      clientId = String(request.clientId || ""),
      redirectUri = String(request.redirectUri || ""),
      state = String(request.state || "");
    if (
      !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      !state ||
      !(
        /^https:\/\//.test(redirectUri) ||
        /^http:\/\/localhost(?::\d+)?\//.test(redirectUri)
      )
    )
      return {
        error: "Google OAuth Client IDまたはリダイレクトURIが不正です。",
      };
    const auth = new BrowserWindow({
      parent: mainWindow || undefined,
      modal: true,
      width: 520,
      height: 720,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "token");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/drive.appdata",
    );
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result: object) => {
        if (settled) return;
        settled = true;
        if (!auth.isDestroyed()) auth.destroy();
        resolve(result);
      };
      const inspect = (_event: Electron.Event, target: string) => {
        const actual = new URL(target),
          expected = new URL(redirectUri);
        if (
          actual.origin !== expected.origin ||
          actual.pathname !== expected.pathname
        )
          return;
        _event.preventDefault();
        const hash = new URL(target).hash.slice(1),
          params = new URLSearchParams(hash);
        if (params.get("state") !== state)
          return finish({ error: "OAuth stateが一致しません。" });
        const accessToken = params.get("access_token");
        finish(
          accessToken
            ? {
                accessToken,
                expiresIn: Number(params.get("expires_in") || 3600),
              }
            : {
                error:
                  params.get("error_description") ||
                  params.get("error") ||
                  "Google認証に失敗しました。",
              },
        );
      };
      auth.webContents.on("will-redirect", inspect);
      auth.webContents.on("will-navigate", inspect);
      auth.on("closed", () =>
        finish({ error: "Google認証がキャンセルされました。" }),
      );
      auth.once("ready-to-show", () => auth.show());
      void auth
        .loadURL(url.toString())
        .catch((error) => finish({ error: String(error) }));
    });
  });
  ipcMain.handle("file:save", async (_event, value: unknown) => {
    if (!validSaveRequest(value))
      return { canceled: false, error: "保存内容が不正または大きすぎます。" };
    const ext =
        value.kind === "json"
          ? "json"
          : value.kind === "character"
            ? "chara"
            : value.kind === "markdown"
              ? "md"
              : "txt",
      result = await dialog.showSaveDialog(mainWindow!, {
        title: "ファイルを書き出す",
        defaultPath: path.join(
          lastBackupDir || app.getPath("documents"),
          value.defaultName.replace(/[<>:"/\\|?*]/g, "_"),
        ),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await fs.writeFile(result.filePath, value.content, "utf8");
      lastBackupDir = path.dirname(result.filePath);
      return { canceled: false, filePath: result.filePath };
    } catch {
      return {
        canceled: false,
        error:
          "ファイルを書き込めませんでした。保存先と空き容量を確認してください。",
      };
    }
  });
  ipcMain.handle("file:open-backup", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Story OSバックアップを読み込む",
      properties: ["openFile"],
      filters: [{ name: "Story OS JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const stat = await fs.stat(result.filePaths[0]);
      if (stat.size > MAX_FILE_BYTES)
        return { canceled: false, error: "ファイルが大きすぎます。" };
      return {
        canceled: false,
        name: path.basename(result.filePaths[0]),
        content: await fs.readFile(result.filePaths[0], "utf8"),
      };
    } catch {
      return { canceled: false, error: "ファイルを読み込めませんでした。" };
    }
  });
  ipcMain.handle("file:open-character", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "キャラクターシートを読み込む",
      properties: ["openFile"],
      filters: [{ name: "キャラクターシート", extensions: ["chara", "json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const stat = await fs.stat(result.filePaths[0]);
      if (stat.size > MAX_FILE_BYTES)
        return { canceled: false, error: "ファイルが大きすぎます。" };
      return {
        canceled: false,
        name: path.basename(result.filePaths[0]),
        content: await fs.readFile(result.filePaths[0], "utf8"),
      };
    } catch {
      return {
        canceled: false,
        error: "キャラクターシートを読み込めませんでした。",
      };
    }
  });
  ipcMain.on("app:close-ready", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const x = payload as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.success !== "boolean") return;
    ipcMain.emit(
      `close:${x.id}`,
      {},
      {
        success: x.success,
        error: typeof x.error === "string" ? x.error : undefined,
      },
    );
  });
}
// Automated packaged-app smoke tests use an isolated profile and must not be
// redirected to a user's already-running Story OS window.
const lock = isSmokeTest || app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("com.storyos.desktop");
      if (!isDev) await setupProtocol();
      setupSecurity();
      setupIpc();
      buildMenu();
      await createWindow();
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Story OSを起動できません",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
  app.on("before-quit", () => {
    if (mainWindow && !allowClose) {
      /* closeイベントで保存確認する */
    }
  });
  app.on("window-all-closed", () => app.quit());
}
