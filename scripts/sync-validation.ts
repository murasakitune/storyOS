import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { db } from "../src/db";
import {
  emptyCollections,
  mergeSyncData,
  validateSyncEnvelope,
} from "../src/sync/merge";
import {
  observeDatabaseMutations,
  prepareLocalSync,
} from "../src/sync/storage";

const local = emptyCollections(),
  remote = emptyCollections();
local.scenes = [
  { id: "same", updatedAt: "2026-01-01T00:00:00.000Z", body: "local-old" },
  { id: "local-only", updatedAt: "2026-03-01T00:00:00.000Z" },
];
remote.scenes = [
  { id: "same", updatedAt: "2026-02-01T00:00:00.000Z", body: "remote-new" },
  { id: "remote-only", updatedAt: "2026-04-01T00:00:00.000Z" },
  { id: "resurrect", updatedAt: "2026-05-01T00:00:00.000Z" },
];
const result = mergeSyncData(local, remote, [
  {
    collection: "scenes",
    id: "local-only",
    deletedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    collection: "scenes",
    id: "resurrect",
    deletedAt: "2026-04-01T00:00:00.000Z",
  },
]);
assert.equal(
  result.collections.scenes.find((record) => record.id === "same")?.body,
  "remote-new",
);
assert.equal(
  result.collections.scenes.some((record) => record.id === "local-only"),
  false,
);
assert.equal(
  result.collections.scenes.some((record) => record.id === "remote-only"),
  true,
);
assert.equal(
  result.collections.scenes.some((record) => record.id === "resurrect"),
  true,
);
assert.deepEqual(
  result.collections.scenes.map((record) => record.id),
  ["resurrect", "remote-only", "same"],
);
assert.equal(result.tombstones.length, 1);

const parsed = validateSyncEnvelope({
  appName: "Story OS",
  schemaVersion: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  collections: { scenes: remote.scenes },
  tombstones: [],
});
assert.equal(parsed.collections.scenes.length, 3);
assert.deepEqual(parsed.collections.references, []);
assert.throws(() =>
  validateSyncEnvelope({ appName: "Other", schemaVersion: 1 }),
);

await db.close();
await Dexie.delete("StoryOS");
await db.open();
let mutations = 0;
const stopObserving = observeDatabaseMutations(() => mutations++);
await db.table("works").put({
  id: "mutation-work",
  title: "mutation",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
assert.ok(mutations > 0);
stopObserving();
await db.syncMeta.put({
  id: "google-drive",
  knownIds: { scenes: ["deleted-scene"] },
  tombstones: [],
  lastSyncAt: "",
});
const prepared = await prepareLocalSync();
assert.equal(prepared.tombstones[0]?.id, "deleted-scene");
assert.equal(prepared.tombstones[0]?.collection, "scenes");
await db.close();

console.log(
  "Google Drive sync validation passed: UUID merge, timestamps, tombstones, sorting, validation, deletion detection.",
);
