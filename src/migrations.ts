import { normalizeBundle } from "./defaults";
import type { ExportEnvelope, WorkBundle } from "./types";
export const CURRENT_SCHEMA_VERSION = 4;
export function migrateExport(input: unknown): ExportEnvelope {
  if (!input || typeof input !== "object")
    throw new Error("JSONのルートがオブジェクトではありません。");
  const source = input as Record<string, unknown>;
  if (source.appName !== "Story OS")
    throw new Error("Story OSのバックアップではありません。");
  const version = source.schemaVersion;
  if (typeof version !== "number" || version < 1)
    throw new Error("schemaVersionが不正です。");
  if (version > CURRENT_SCHEMA_VERSION)
    throw new Error(`このファイルは新しい形式（v${version}）です。`);
  if (source.kind !== "work" && source.kind !== "all")
    throw new Error("バックアップ種別が不正です。");
  const raw = Array.isArray(source.data) ? source.data : [source.data];
  const bundles = raw.map((value) => {
    if (!value || typeof value !== "object")
      throw new Error("作品データが不正です。");
    const b = value as Partial<WorkBundle>;
    if (!b.work || !Array.isArray(b.chapters) || !Array.isArray(b.scenes))
      throw new Error("作品、章、シーンの必須データがありません。");
    return normalizeBundle(
      b as Partial<WorkBundle> &
        Pick<WorkBundle, "work" | "chapters" | "scenes">,
    );
  });
  return {
    appName: "Story OS",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt:
      typeof source.exportedAt === "string"
        ? source.exportedAt
        : new Date().toISOString(),
    kind: source.kind,
    data: source.kind === "all" ? bundles : bundles[0],
    snapshots: Array.isArray(source.snapshots)
      ? (source.snapshots as ExportEnvelope["snapshots"])
      : [],
  };
}
