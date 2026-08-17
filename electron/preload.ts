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
  authorizeGoogle: (request) => ipcRenderer.invoke("google:authorize", request),
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
