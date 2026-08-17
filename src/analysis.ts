import type { StoryWarning, WorkBundle } from "./types";

export function orderedScenes(b: WorkBundle) {
  const chapterOrder = new Map(b.chapters.map((c) => [c.id, c.order]));
  return [...b.scenes].sort(
    (a, z) =>
      (chapterOrder.get(a.chapterId) ?? 0) -
        (chapterOrder.get(z.chapterId) ?? 0) || a.order - z.order,
  );
}
export function analyzeStory(b: WorkBundle): StoryWarning[] {
  if (!b.work.longFormSupport) return [];
  const scenes = orderedScenes(b),
    s = b.work.longFormSettings,
    w: StoryWarning[] = [];
  const add = (
    rule: string,
    targetType: StoryWarning["targetType"],
    targetId: string,
    targetLabel: string,
    reason: string,
    metric: string,
    severity: StoryWarning["severity"] = "注意",
  ) =>
    w.push({
      key: `${rule}:${targetId}`,
      rule,
      targetType,
      targetId,
      targetLabel,
      reason,
      metric,
      severity,
    });
  if (scenes.length < b.work.targetScenes)
    add(
      "目標シーン数との差",
      "work",
      b.work.id,
      b.work.title,
      "現在の構成は目標より短い段階です。物語を急いで畳んでいないか確認できます。",
      `${scenes.length} / ${b.work.targetScenes}シーン`,
      "情報",
    );
  scenes.forEach((scene, i) => {
    const d = scene.design;
    if (
      d.hasFullResolution &&
      (i + 1 < s.finalResolutionMinScene ||
        ((i + 1) / Math.max(1, b.work.targetScenes)) * 100 <
          s.finalResolutionMinProgress)
    )
      add(
        "序盤の完全解決",
        "scene",
        scene.id,
        scene.title,
        "設定した解決許可位置より前に完全解決が置かれています。",
        `シーン${i + 1} / ${s.finalResolutionMinScene}以降を推奨`,
      );
    if (d.purpose && !d.obstacle)
      add(
        "障害の未設定",
        "scene",
        scene.id,
        scene.title,
        "目的はありますが障害が未登録です。抵抗なく進む展開か確認できます。",
        "目的あり・障害なし",
        "情報",
      );
    const changes = [
      d.createsNewProblem,
      d.revealsInformation,
      d.changesRelationship,
      d.changesItemOrState,
      d.hasFullResolution,
    ].filter(Boolean).length;
    if (changes > s.maxChangesPerScene)
      add(
        "変化の集中",
        "scene",
        scene.id,
        scene.title,
        "一つのシーンに複数の大きな変化が集中しています。",
        `${changes}変化 / 許容${s.maxChangesPerScene}`,
      );
    if (d.multipleLocations || d.majorTimePassage)
      add(
        "場所移動・時間経過の集中",
        "scene",
        scene.id,
        scene.title,
        "複数場所の移動または大きな時間経過を一度に扱っています。",
        `${d.multipleLocations ? "複数場所 " : ""}${d.majorTimePassage ? "大きな時間経過" : ""}`.trim(),
        "情報",
      );
    if (
      s.warnInstantSuccess &&
      d.attempt &&
      d.result &&
      d.outcomeSuccessful &&
      !d.obstacle
    )
      add(
        "一度で成功する展開",
        "scene",
        scene.id,
        scene.title,
        "障害がないまま試行が成功しています。意図したテンポか確認できます。",
        "成功・障害なし",
        "情報",
      );
  });
  const failures = scenes.filter(
    (x) =>
      x.design.sceneType === "失敗" ||
      (x.design.result && !x.design.outcomeSuccessful),
  ).length;
  if (
    scenes.length >= 5 &&
    failures < Math.max(1, Math.floor(scenes.length * 0.08))
  )
    add(
      "失敗展開の少なさ",
      "work",
      b.work.id,
      b.work.title,
      "失敗または不成功のシーンが少ない構成です。",
      `${failures} / ${scenes.length}シーン`,
      "情報",
    );
  const openQuestions = b.questions.filter(
    (q) => q.status === "未解決" || q.status === "一部解決",
  ).length;
  if (openQuestions < s.minOpenThreads)
    add(
      "未解決の問いの少なさ",
      "work",
      b.work.id,
      b.work.title,
      "読者を先へ導く未解決項目が設定値より少ない状態です。",
      `${openQuestions}件 / 推奨${s.minOpenThreads}件`,
      "情報",
    );
  if (!b.foreshadows.length)
    add(
      "伏線なし",
      "work",
      b.work.id,
      b.work.title,
      "登録された伏線がありません。伏線を使わない構成なら無視できます。",
      "0件",
      "情報",
    );
  for (let i = 0; i < scenes.length;) {
    let j = i + 1;
    while (
      j < scenes.length &&
      scenes[j].design.sceneType === scenes[i].design.sceneType
    )
      j++;
    if (j - i > s.maxConsecutiveSceneType)
      add(
        "同種シーンの連続",
        "scene",
        scenes[i].id,
        scenes[i].title,
        "同じシーン種別が連続しています。リズムを確認できます。",
        `${scenes[i].design.sceneType}が${j - i}連続`,
        "情報",
      );
    i = j;
  }
  const major = b.references.filter(
    (r) => r.category === "character" && r.importance === "主要",
  );
  major.forEach((c) => {
    const indices = scenes
      .map((x, i) =>
        x.design.characterIds.includes(c.id) || x.design.povCharacterId === c.id
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    if (indices.length <= 1 && scenes.length >= 5)
      add(
        "重要人物の登場不足",
        "character",
        c.id,
        c.name,
        "主要人物として登録されていますが登場回数が少ない状態です。",
        `${indices.length}回`,
        "情報",
      );
    let gap = 0;
    for (let i = 1; i < indices.length; i++)
      gap = Math.max(gap, indices[i] - indices[i - 1]);
    if (gap > Math.max(5, Math.floor(scenes.length * 0.25)))
      add(
        "主要人物の長期不在",
        "character",
        c.id,
        c.name,
        "主要人物が長い区間にわたり登場していません。",
        `最大${gap - 1}シーン不在`,
        "情報",
      );
  });
  const index = new Map(scenes.map((x, i) => [x.id, i]));
  b.questions
    .filter((q) => q.importance === "高" && q.resolutionSceneId)
    .forEach((q) => {
      const a = index.get(q.occurrenceSceneId),
        z = index.get(q.resolutionSceneId);
      if (a !== undefined && z !== undefined && z - a <= 1)
        add(
          "中心問題の早期解決",
          "question",
          q.id,
          q.question,
          "重要な問いが発生直後に解決されています。意図した速度か確認できます。",
          `${z - a}シーン後に解決`,
        );
    });
  if (!b.subplots.length)
    add(
      "サブプロットなし",
      "work",
      b.work.id,
      b.work.title,
      "登録されたサブプロットがありません。本筋に集中する作品なら無視できます。",
      "0件",
      "情報",
    );
  return w;
}
export function foreshadowIssues(b: WorkBundle) {
  const scenes = orderedScenes(b),
    index = new Map(scenes.map((s, i) => [s.id, i]));
  return b.foreshadows.flatMap((f) => {
    const issues: string[] = [];
    const setup = index.get(f.setupSceneId),
      payoff = index.get(f.payoffSceneId),
      planned = index.get(f.plannedPayoffSceneId);
    if (
      f.status !== "回収済み" &&
      f.status !== "意図的に未回収" &&
      f.status !== "廃止" &&
      planned !== undefined &&
      planned < scenes.length - 1
    )
      issues.push("回収予定を超過");
    if (payoff !== undefined && (setup === undefined || payoff < setup))
      issues.push("設置前に回収");
    if (f.status !== "回収済み" && payoff !== undefined)
      issues.push("回収シーンあり・状態未更新");
    return issues.map((message) => ({ foreshadowId: f.id, message }));
  });
}
