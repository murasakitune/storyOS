import { contextBridge, ipcRenderer } from "electron";
import type {
  ElectronAPI,
  MenuAction,
  NativeSaveRequest,
} from "../src/shared/electron-api.js";
const api: ElectronAPI = {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  saveFile: (request: NativeSaveRequest) =>
    ipcRenderer.invoke("file:save", request),
  openBackup: () => ipcRenderer.invoke("file:open-backup"),
  openCharacter: () => ipcRenderer.invoke("file:open-character"),
  openUserData: () => ipcRenderer.invoke("app:open-user-data"),
  getGoogleAuthStatus: (clientId) =>
    ipcRenderer.invoke("google:auth-status", clientId),
  beginGoogleConnection: (clientId) =>
    ipcRenderer.invoke("google:begin-connection", clientId),
  commitGoogleConnection: () => ipcRenderer.invoke("google:commit-connection"),
  cancelGoogleConnection: () => ipcRenderer.invoke("google:cancel-connection"),
  disconnectGoogle: () => ipcRenderer.invoke("google:disconnect"),
  findGoogleDriveFile: (usePending) =>
    ipcRenderer.invoke("google:drive-find", Boolean(usePending)),
  downloadGoogleDriveFile: (fileId, usePending) =>
    ipcRenderer.invoke("google:drive-download", fileId, Boolean(usePending)),
  uploadGoogleDriveFile: (request) =>
    ipcRenderer.invoke("google:drive-upload", request),
  saveGoogleSwitchBackup: (content) =>
    ipcRenderer.invoke("google:save-switch-backup", content),
  onMenuAction(listener) {
    const handler = (_event: Electron.IpcRendererEvent, action: MenuAction) =>
      listener(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
  onPrepareClose(listener) {
    const handler = (_event: Electron.IpcRendererEvent, id: string) =>
      listener(id);
    ipcRenderer.on("app:prepare-close", handler);
    return () => ipcRenderer.removeListener("app:prepare-close", handler);
  },
  finishClose: (id, success, error) =>
    ipcRenderer.send("app:close-ready", { id, success, error }),
};
contextBridge.exposeInMainWorld("electronAPI", api);
