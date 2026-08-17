export interface FilePort {
  saveJson(data: unknown, name: string): Promise<void>;
  readJson(file: File): Promise<unknown>;
  openJson?(): Promise<unknown | null>;
  openCharacter?(): Promise<unknown | null>;
  saveCharacter?(data: unknown, name: string): Promise<void>;
  saveText?(
    content: string,
    name: string,
    format: "text" | "markdown",
  ): Promise<void>;
}
export const browserFilePort: FilePort = {
  async saveJson(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
  async readJson(file) {
    return JSON.parse(await file.text()) as unknown;
  },
  async saveCharacter(data, name) {
    await this.saveJson(data, name);
  },
  async saveText(content, name, format) {
    const blob = new Blob([content], {
        type: format === "markdown" ? "text/markdown" : "text/plain",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
};
export const electronFilePort: FilePort = {
  async saveJson(data, name) {
    const result = await window.electronAPI!.saveFile({
      kind: "json",
      defaultName: name,
      content: JSON.stringify(data, null, 2),
    });
    if (result.error) throw new Error(result.error);
  },
  async readJson(file) {
    return JSON.parse(await file.text()) as unknown;
  },
  async openJson() {
    const result = await window.electronAPI!.openBackup();
    if (result.error) throw new Error(result.error);
    if (result.canceled || !result.content) return null;
    return JSON.parse(result.content) as unknown;
  },
  async openCharacter() {
    const result = await window.electronAPI!.openCharacter();
    if (result.error) throw new Error(result.error);
    if (result.canceled || !result.content) return null;
    return JSON.parse(result.content) as unknown;
  },
  async saveCharacter(data, name) {
    const result = await window.electronAPI!.saveFile({
      kind: "character",
      defaultName: name,
      content: JSON.stringify(data, null, 2),
    });
    if (result.error) throw new Error(result.error);
  },
  async saveText(content, name, format) {
    const result = await window.electronAPI!.saveFile({
      kind: format,
      defaultName: name,
      content,
    });
    if (result.error) throw new Error(result.error);
  },
};
export const filePort: FilePort =
  typeof window !== "undefined" && window.electronAPI
    ? electronFilePort
    : browserFilePort;
export const environment = {
  kind: (typeof window !== "undefined" && window.electronAPI
    ? "electron"
    : "browser") as "browser" | "electron",
  supportsFileSystemAccess:
    typeof window !== "undefined" && "showSaveFilePicker" in window,
};
export const uiPreferences = {
  get: (key: string) => localStorage.getItem(`storyos-${key}`),
  set: (key: string, value: string) =>
    localStorage.setItem(`storyos-${key}`, value),
};
