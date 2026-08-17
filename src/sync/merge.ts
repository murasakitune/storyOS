import type { SyncTombstone } from "../types";
import {
  SYNC_COLLECTIONS,
  type DriveSyncEnvelope,
  type SyncCollection,
  type SyncCollections,
  type SyncRecord,
} from "./types";

const dateValue = (record: SyncRecord) =>
  String(
    record.updatedAt ||
      record.savedAt ||
      record.createdAt ||
      "1970-01-01T00:00:00.000Z",
  );

const newer = (left: SyncRecord, right: SyncRecord) =>
  dateValue(left).localeCompare(dateValue(right)) >= 0 ? left : right;

export function emptyCollections(): SyncCollections {
  return Object.fromEntries(
    SYNC_COLLECTIONS.map((name) => [name, []]),
  ) as unknown as SyncCollections;
}

export function validateSyncEnvelope(value: unknown): DriveSyncEnvelope {
  if (!value || typeof value !== "object")
    throw new Error("Drive同期データが不正です。");
  const source = value as Record<string, unknown>;
  if (source.appName !== "Story OS" || source.schemaVersion !== 1)
    throw new Error("対応していないDrive同期形式です。");
  if (!source.collections || typeof source.collections !== "object")
    throw new Error("同期コレクションがありません。");
  const collections = emptyCollections();
  for (const name of SYNC_COLLECTIONS) {
    const records = (source.collections as Record<string, unknown>)[name];
    if (records == null) continue;
    if (
      !Array.isArray(records) ||
      records.some(
        (r) =>
          !r ||
          typeof r !== "object" ||
          typeof (r as SyncRecord).id !== "string",
      )
    )
      throw new Error(`同期データ「${name}」が不正です。`);
    collections[name] = records as SyncRecord[];
  }
  const tombstones = Array.isArray(source.tombstones)
    ? source.tombstones.filter(
        (item): item is DriveSyncEnvelope["tombstones"][number] =>
          !!item &&
          typeof item === "object" &&
          SYNC_COLLECTIONS.includes(
            (item as { collection: SyncCollection }).collection,
          ) &&
          typeof (item as { id: unknown }).id === "string" &&
          typeof (item as { deletedAt: unknown }).deletedAt === "string",
      )
    : [];
  return {
    appName: "Story OS",
    schemaVersion: 1,
    exportedAt:
      typeof source.exportedAt === "string"
        ? source.exportedAt
        : new Date(0).toISOString(),
    collections,
    tombstones,
  };
}

export function mergeSyncData(
  local: SyncCollections,
  remote: SyncCollections,
  tombstones: SyncTombstone[],
): { collections: SyncCollections; tombstones: SyncTombstone[] } {
  const tombstoneMap = new Map<string, SyncTombstone>();
  for (const tombstone of tombstones) {
    const key = `${tombstone.collection}:${tombstone.id}`,
      current = tombstoneMap.get(key);
    if (!current || current.deletedAt < tombstone.deletedAt)
      tombstoneMap.set(key, tombstone);
  }
  const collections = emptyCollections();
  for (const name of SYNC_COLLECTIONS) {
    const records = new Map<string, SyncRecord>();
    for (const record of [...local[name], ...remote[name]]) {
      const current = records.get(record.id);
      records.set(record.id, current ? newer(current, record) : record);
    }
    for (const [id, record] of records) {
      const key = `${name}:${id}`,
        tombstone = tombstoneMap.get(key);
      if (tombstone && tombstone.deletedAt >= dateValue(record))
        records.delete(id);
      else if (tombstone) tombstoneMap.delete(key);
    }
    collections[name] = [...records.values()].sort(
      (a, b) =>
        dateValue(b).localeCompare(dateValue(a)) || a.id.localeCompare(b.id),
    );
  }
  return { collections, tombstones: [...tombstoneMap.values()] };
}
