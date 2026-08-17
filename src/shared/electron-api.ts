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
  authorizeGoogle(request: {
    clientId: string;
    redirectUri: string;
    state: string;
  }): Promise<{ accessToken?: string; expiresIn?: number; error?: string }>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  onPrepareClose(listener: (requestId: string) => void): () => void;
  finishClose(requestId: string, success: boolean, error?: string): void;
}
