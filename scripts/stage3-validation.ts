import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import Dexie from "dexie";
await Dexie.delete("StoryOS");
const { db, createWork, getBundle, now } = await import("../src/db");
const {
  inspectManuscript,
  countText,
  completionChecks,
  diagnoseIntegrity,
  timelineCandidates,
} = await import("../src/inspection");
const { createSnapshot, restoreSnapshot } =
  await import("../src/services/snapshots");
const work = await createWork("第3段階検証");
let b = await getBundle(work.id);
assert(b);
assert.equal(b.workPreferences.length, 1, "新規作品に点検設定を作成");
const scene = b.scenes[0];
await db.scenes.put({
  ...scene,
  body: "ありすは走った。ありすは走った。\n「待って」とアリスは言った。",
});
await db.spellingRules.add({
  id: "spell",
  workId: work.id,
  canonical: "アリス",
  variants: ["ありす"],
  createdAt: now(),
  updatedAt: now(),
});
b = await getBundle(work.id);
assert(b);
assert.equal(countText(b.scenes[0].body, "ありす"), 2);
assert(
  inspectManuscript(b).some((x) => x.type === "表記揺れ"),
  "表記揺れを検出",
);
assert(
  completionChecks(b).some(
    (x) => x.label === "本文が空のシーン" && x.count === 0,
  ),
  "完結前チェックを集計",
);
await db.timelineEvents.add({
  id: "event",
  workId: work.id,
  title: "過去",
  description: "",
  storyDate: "2020-01-01",
  order: 1,
  sceneIds: ["deleted"],
  characterIds: [],
  locationIds: [],
  visibility: "公開情報",
  notes: "",
  createdAt: now(),
  updatedAt: now(),
});
b = await getBundle(work.id);
assert(b);
assert(
  timelineCandidates(b.timelineEvents, b).some((x) => x.includes("削除済み")),
  "タイムライン矛盾候補",
);
assert(
  diagnoseIntegrity(b).some((x) => x.type === "存在しないシーン参照"),
  "整合性診断",
);
const snap = await createSnapshot(work.id, "復元テスト");
await db.scenes.update(scene.id, { body: "変更後" });
await restoreSnapshot(snap.id);
b = await getBundle(work.id);
assert.equal(
  b?.scenes[0].body.includes("ありす"),
  true,
  "スナップショット復元",
);
assert(
  (await db.snapshots.where("workId").equals(work.id).count()) >= 2,
  "復元直前の自動スナップショット",
);
await db.delete();
console.log(
  "Stage 3 validation passed: inspection, counts, completion, timeline candidates, integrity, snapshot restore.",
);
