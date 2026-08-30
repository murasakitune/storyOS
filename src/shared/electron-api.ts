export type MenuAction =
  | "new-work"
  | "open-work"
  | "export-backup"
  | "import-backup"
  | "export-manuscript"
  | "search"
  | "focus-mode"
  | "backup-help";
export interface NativeFileResult {
  canceled: boolean;
  name?: string;
  content?: string;
  error?: string;
}
export interface NativeSaveRequest {
  kind: "json" | "character" | "text" | "markdown";
  defaultName: string;
  content: string;
}
export interface NativeSaveResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}
export interface GoogleAuthStatus {
  configured: boolean;
  connected: boolean;
  accountEmail?: string;
  accountName?: string;
  secureStorageAvailable: boolean;
  pending?: boolean;
  canceled?: boolean;
  error?: string;
}
export interface NativeDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}
export interface ElectronAPI {
  isElectron: true;
  getAppInfo(): Promise<{
    name: string;
    version: string;
    platform: string;
    arch: string;
    userDataPath: string;
  }>;
  saveFile(request: NativeSaveRequest): Promise<NativeSaveResult>;
  openBackup(): Promise<NativeFileResult>;
  openCharacter(): Promise<NativeFileResult>;
  openUserData(): Promise<{ ok: boolean; error?: string }>;
  getGoogleAuthStatus(clientId: string): Promise<GoogleAuthStatus>;
  beginGoogleConnection(clientId: string): Promise<GoogleAuthStatus>;
  commitGoogleConnection(): Promise<GoogleAuthStatus>;
  cancelGoogleConnection(): Promise<void>;
  disconnectGoogle(): Promise<void>;
  findGoogleDriveFile(usePending?: boolean): Promise<NativeDriveFile | null>;
  downloadGoogleDriveFile(
    fileId: string,
    usePending?: boolean,
  ): Promise<unknown>;
  uploadGoogleDriveFile(request: {
    envelope: unknown;
    fileId?: string;
    usePending?: boolean;
  }): Promise<string>;
  saveGoogleSwitchBackup(content: string): Promise<string>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  onPrepareClose(listener: (requestId: string) => void): () => void;
  finishClose(requestId: string, success: boolean, error?: string): void;
}
