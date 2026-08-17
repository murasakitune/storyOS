import { db, getBundle, newId, now, putBundle } from "../db";
import type { Snapshot } from "../types";
export async function createSnapshot(
  workId: string,
  name: string,
  notes = "",
  scope: Snapshot["scope"] = "作品全体",
) {
  const bundle = await getBundle(workId);
  if (!bundle) throw new Error("作品がありません。");
  const snapshot: Snapshot = {
    id: newId(),
    workId,
    name,
    notes,
    scope,
    createdAt: now(),
    bundle,
  };
  await db.snapshots.add(snapshot);
  const pref = bundle.workPreferences[0],
    limit = pref?.snapshotLimit || 20,
    all = await db.snapshots.where("workId").equals(workId).sortBy("createdAt");
  if (all.length > limit)
    await db.snapshots.bulkDelete(
      all.slice(0, all.length - limit).map((s) => s.id),
    );
  return snapshot;
}
export async function restoreSnapshot(id: string) {
  const snapshot = await db.snapshots.get(id);
  if (!snapshot) throw new Error("スナップショットがありません。");
  await createSnapshot(
    snapshot.workId,
    "復元直前（自動）",
    `「${snapshot.name}」の復元前`,
  );
  await putBundle(snapshot.bundle);
}
export function snapshotDiff(
  snapshot: Snapshot,
  currentCharacters: number,
  currentScenes: number,
) {
  const oldCharacters = snapshot.bundle.scenes.reduce(
    (n, s) => n + [...s.body.replace(/\s/g, "")].length,
    0,
  );
  return {
    characters: currentCharacters - oldCharacters,
    scenes: currentScenes - snapshot.bundle.scenes.length,
    references: snapshot.bundle.references.length,
  };
}
