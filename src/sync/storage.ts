import Dexie from "dexie";
import { db, now } from "../db";
import type { SyncMetaRecord, SyncTombstone } from "../types";
import { emptyCollections, mergeSyncData } from "./merge";
import {
  SYNC_COLLECTIONS,
  type DriveSyncEnvelope,
  type SyncCollections,
  type SyncRecord,
} from "./types";

export let syncMutationSuppressed = false;
const VIRTUAL_COLLECTIONS = new Set(["sceneBodies", "sceneDesigns"]);
export async function saveDriveFileId(fileId: string) {
  syncMutationSuppressed = true;
  try {
    const current = await readMeta();
    await db.syncMeta.put({ ...current, driveFileId: fileId });
  } finally {
    syncMutationSuppressed = false;
  }
}

export async function readCollections(): Promise<SyncCollections> {
  const result = {} as SyncCollections,
    scenes = (await db.scenes.toArray()) as unknown as SyncRecord[];
  for (const name of SYNC_COLLECTIONS) {
    if (name === "sceneBodies") {
      result[name] = scenes.map((scene) => ({
        id: scene.id,
        workId: scene.workId,
        body: scene.body,
        updatedAt: scene.bodyUpdatedAt || scene.updatedAt,
      }));
    } else if (name === "sceneDesigns") {
      result[name] = scenes.map((scene) => ({
        id: scene.id,
        workId: scene.workId,
        design: scene.design,
        updatedAt: scene.designUpdatedAt || scene.updatedAt,
      }));
    } else if (name === "scenes") {
      result[name] = scenes.map((scene) => {
        const metadata = { ...scene };
        delete metadata.body;
        delete metadata.design;
        return metadata;
      });
    } else result[name] = (await db.table(name).toArray()) as SyncRecord[];
  }
  return result;
}

const idsByCollection = (collections: SyncCollections) =>
  Object.fromEntries(
    SYNC_COLLECTIONS.map((name) => [name, collections[name].map((r) => r.id)]),
  );

async function readMeta(): Promise<SyncMetaRecord> {
  return (
    (await db.syncMeta.get("google-drive")) || {
      id: "google-drive",
      knownIds: {},
      tombstones: [],
      lastSyncAt: "",
    }
  );
}

export async function prepareLocalSync(): Promise<{
  collections: SyncCollections;
  tombstones: SyncTombstone[];
  meta: SyncMetaRecord;
}> {
  const [collections, meta] = await Promise.all([
    readCollections(),
    readMeta(),
  ]);
  const currentIds = idsByCollection(collections),
    tombstones = new Map(
      meta.tombstones.map((t) => [`${t.collection}:${t.id}`, t]),
    );
  for (const name of SYNC_COLLECTIONS) {
    const current = new Set(currentIds[name]);
    for (const id of meta.knownIds[name] || []) {
      const key = `${name}:${id}`;
      if (!current.has(id) && !tombstones.has(key))
        tombstones.set(key, { collection: name, id, deletedAt: now() });
    }
  }
  return { collections, tombstones: [...tombstones.values()], meta };
}

export async function applyMergedSync(
  local: SyncCollections,
  remote: DriveSyncEnvelope | null,
  localTombstones: SyncTombstone[],
  driveFileId?: string,
): Promise<DriveSyncEnvelope> {
  const merged = mergeSyncData(
    local,
    remote?.collections || emptyCollections(),
    [...localTombstones, ...(remote?.tombstones || [])],
  );
  syncMutationSuppressed = true;
  try {
    const physicalNames = SYNC_COLLECTIONS.filter(
        (name) => !VIRTUAL_COLLECTIONS.has(name),
      ),
      tables = [...physicalNames.map((name) => db.table(name)), db.syncMeta];
    await db.transaction("rw", tables, async () => {
      const bodies = new Map(
          merged.collections.sceneBodies.map((item) => [item.id, item]),
        ),
        designs = new Map(
          merged.collections.sceneDesigns.map((item) => [item.id, item]),
        );
      for (const name of physicalNames) {
        const table = db.table(name),
          tombstoned = merged.tombstones
            .filter((t) => t.collection === name)
            .map((t) => t.id);
        if (tombstoned.length) await table.bulkDelete(tombstoned);
        const records =
          name === "scenes"
            ? merged.collections.scenes.map((scene) => {
                const body = bodies.get(scene.id),
                  design = designs.get(scene.id);
                return {
                  ...scene,
                  body: String(body?.body || ""),
                  design: design?.design || {},
                  bodyUpdatedAt: String(
                    body?.updatedAt || scene.updatedAt || "",
                  ),
                  designUpdatedAt: String(
                    design?.updatedAt || scene.updatedAt || "",
                  ),
                };
              })
            : merged.collections[name];
        if (records.length) await table.bulkPut(records);
      }
      await db.syncMeta.put({
        id: "google-drive",
        knownIds: idsByCollection(merged.collections),
        tombstones: merged.tombstones,
        lastSyncAt: now(),
        driveFileId,
      });
    });
  } finally {
    syncMutationSuppressed = false;
  }
  return {
    appName: "Story OS",
    schemaVersion: 1,
    exportedAt: now(),
    collections: merged.collections,
    tombstones: merged.tombstones as DriveSyncEnvelope["tombstones"],
  };
}

export function observeDatabaseMutations(listener: () => void) {
  const handler = () => {
    if (!syncMutationSuppressed) listener();
  };
  Dexie.on("storagemutated", handler);
  return () => Dexie.on("storagemutated").unsubscribe(handler);
}
