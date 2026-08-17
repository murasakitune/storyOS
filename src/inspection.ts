import { analyzeStory, orderedScenes } from "./analysis";
import { defaultInspectionSettings } from "./defaults";
import type {
  CompletionCheck,
  InspectionFinding,
  InspectionSettings,
  IntegrityIssue,
  TimelineEvent,
  WorkBundle,
} from "./types";
export const countText = (text: string, needle: string) =>
  needle ? text.split(needle).length - 1 : 0;
const context = (text: string, index: number, length: number) =>
  text
    .slice(Math.max(0, index - 25), Math.min(text.length, index + length + 25))
    .replace(/\n/g, " ");
export function inspectManuscript(
  b: WorkBundle,
  settings: InspectionSettings = defaultInspectionSettings(),
): InspectionFinding[] {
  const out: InspectionFinding[] = [];
  const add = (
    type: string,
    sceneId: string,
    sceneTitle: string,
    ctx: string,
    reason: string,
    metric: string,
  ) =>
    out.push({
      id: `${type}:${sceneId}:${out.length}`,
      type,
      sceneId,
      sceneTitle,
      context: ctx,
      reason,
      metric,
    });
  for (const scene of b.scenes) {
    const text = scene.body;
    for (const rule of b.spellingRules)
      for (const variant of rule.variants)
        for (
          let pos = text.indexOf(variant);
          pos >= 0;
          pos = text.indexOf(variant, pos + variant.length)
        )
          add(
            "表記揺れ",
            scene.id,
            scene.title,
            context(text, pos, variant.length),
            `「${rule.canonical}」の別表記`,
            variant,
          );
    const paragraphs = text.split(/\n+/).filter(Boolean);
    paragraphs.forEach((p, i) => {
      if ([...p].length > settings.longParagraph)
        add(
          "長い段落",
          scene.id,
          scene.title,
          p.slice(0, 60),
          `段落${i + 1}が設定値を超えています`,
          `${[...p].length}字`,
        );
    });
    for (let i = 0; i <= paragraphs.length - settings.shortParagraphRun; i++)
      if (
        paragraphs
          .slice(i, i + settings.shortParagraphRun)
          .every((p) => [...p].length < settings.shortParagraph)
      )
        add(
          "短い段落の連続",
          scene.id,
          scene.title,
          paragraphs.slice(i, i + settings.shortParagraphRun).join(" / "),
          `${settings.shortParagraphRun}段落連続`,
          `各${settings.shortParagraph}字未満`,
        );
    for (const sentence of text.split(/(?<=[。！？])/)) {
      const len = [...sentence].length;
      if (len > settings.longSentence)
        add(
          "長い文",
          scene.id,
          scene.title,
          sentence.slice(0, 70),
          "一文が設定値を超えています",
          `${len}字`,
        );
      if (len > settings.punctuationless && !/[、。]/.test(sentence))
        add(
          "句読点の少ない長文",
          scene.id,
          scene.title,
          sentence.slice(0, 70),
          "長文に句読点がありません",
          `${len}字`,
        );
    }
    const words = settings.trackedWords;
    for (const word of words) {
      const positions: number[] = [];
      for (
        let p = text.indexOf(word);
        p >= 0;
        p = text.indexOf(word, p + word.length)
      )
        positions.push(p);
      for (let i = 1; i < positions.length; i++)
        if (positions[i] - positions[i - 1] <= settings.repetitionWindow)
          add(
            "連続使用",
            scene.id,
            scene.title,
            context(
              text,
              positions[i - 1],
              positions[i] - positions[i - 1] + word.length,
            ),
            `「${word}」が近い範囲で繰り返されています`,
            `${positions[i] - positions[i - 1]}字間隔`,
          );
    }
  }
  return out;
}
export function wordFrequency(
  b: WorkBundle,
  terms: string[],
  scope: "work" | "chapter" | "scene" = "work",
) {
  const excluded = new Set(
      b.workPreferences[0]?.inspection.excludedWords || [],
    ),
    targets = terms.filter((t) => t && !excluded.has(t));
  if (!targets.length) {
    const text = b.scenes.map((s) => s.body).join("\n");
    const candidates = text.match(/[一-龠ぁ-んァ-ヶー]{2,8}/g) || [];
    targets.push(...[...new Set(candidates)].slice(0, 30));
  }
  const groups =
    scope === "scene"
      ? b.scenes.map((s) => ({ label: s.title, text: s.body }))
      : scope === "chapter"
        ? b.chapters.map((c) => ({
            label: c.title,
            text: b.scenes
              .filter((s) => s.chapterId === c.id)
              .map((s) => s.body)
              .join("\n"),
          }))
        : [
            {
              label: b.work.title,
              text: b.scenes.map((s) => s.body).join("\n"),
            },
          ];
  return groups.map((g) => ({
    label: g.label,
    counts: targets
      .map((term) => ({ term, count: countText(g.text, term) }))
      .filter((x) => x.count)
      .sort((a, z) => z.count - a.count),
  }));
}
export function dialogueStats(b: WorkBundle) {
  return b.chapters.map((c) => {
    const text = b.scenes
        .filter((s) => s.chapterId === c.id)
        .map((s) => s.body)
        .join("\n"),
      dialogue = [...text.matchAll(/「([^」]*)」/g)].reduce(
        (n, m) => n + [...m[1]].length,
        0,
      ),
      total = [...text.replace(/\s/g, "")].length;
    return {
      chapter: c.title,
      dialogue,
      narrative: Math.max(0, total - dialogue),
      ratio: total ? Math.round((dialogue / total) * 100) : 0,
    };
  });
}
export function timelineCandidates(events: TimelineEvent[], b: WorkBundle) {
  const out: string[] = [];
  const ordered = [...events].sort((a, z) => a.order - z.order);
  for (let i = 1; i < ordered.length; i++)
    if (
      ordered[i - 1].storyDate &&
      ordered[i].storyDate &&
      ordered[i].storyDate < ordered[i - 1].storyDate
    )
      out.push(`「${ordered[i].title}」は前項目より前の日時です`);
  for (const e of events)
    if (e.sceneIds.some((id) => !b.scenes.some((s) => s.id === id)))
      out.push(`「${e.title}」が削除済みシーンを参照しています`);
  for (let i = 0; i < events.length; i++)
    for (let j = i + 1; j < events.length; j++)
      if (
        events[i].storyDate &&
        events[i].storyDate === events[j].storyDate &&
        events[i].characterIds.some((id) =>
          events[j].characterIds.includes(id),
        ) &&
        events[i].locationIds.length &&
        events[j].locationIds.length &&
        !events[i].locationIds.some((id) => events[j].locationIds.includes(id))
      )
        out.push(
          `同時刻に同一人物が異なる場所にいる候補: ${events[i].title} / ${events[j].title}`,
        );
  const sceneOrder = new Map(
    orderedScenes(b).map((scene, index) => [scene.id, index]),
  );
  for (let i = 1; i < ordered.length; i++) {
    const before = Math.min(
        ...ordered[i - 1].sceneIds.map((id) => sceneOrder.get(id) ?? Infinity),
      ),
      after = Math.min(
        ...ordered[i].sceneIds.map((id) => sceneOrder.get(id) ?? Infinity),
      );
    if (Number.isFinite(before) && Number.isFinite(after) && after + 3 < before)
      out.push(
        `「${ordered[i].title}」は章・シーン順と時系列が大きく異なる候補です`,
      );
  }
  return out;
}
export function completionChecks(b: WorkBundle): CompletionCheck[] {
  const chars = b.scenes.reduce(
      (n, s) => n + [...s.body.replace(/\s/g, "")].length,
      0,
    ),
    warnings = analyzeStory(b),
    findings = inspectManuscript(b),
    timeline = timelineCandidates(b.timelineEvents, b),
    ordered = orderedScenes(b),
    major = b.references.filter(
      (r) => r.category === "character" && r.importance === "主要",
    );
  return [
    {
      label: "目標文字数との差",
      count: Math.max(0, b.work.targetCharacters - chars),
      detail: `現在${chars.toLocaleString()}字`,
    },
    {
      label: "目標シーン数との差",
      count: Math.max(0, b.work.targetScenes - b.scenes.length),
      detail: `現在${b.scenes.length}シーン`,
    },
    {
      label: "未回収伏線",
      count: b.foreshadows.filter(
        (f) => !["回収済み", "意図的に未回収", "廃止"].includes(f.status),
      ).length,
      detail: "回収状態を確認",
    },
    {
      label: "未解決の問い",
      count: b.questions.filter((q) =>
        ["未解決", "一部解決"].includes(q.status),
      ).length,
      detail: "意図的な未解決は除外",
    },
    {
      label: "未処理の約束",
      count: b.promises.filter((p) => p.status === "未処理").length,
      detail: "履行・破棄を確認",
    },
    {
      label: "未完了のサブプロット",
      count: b.subplots.filter((s) => s.status !== "決着").length,
      detail: "副筋の決着を確認",
    },
    {
      label: "長編化支援の警告",
      count: warnings.length,
      detail: "助言として確認",
    },
    {
      label: "本文が空のシーン",
      count: b.scenes.filter((s) => !s.body.trim()).length,
      detail: "本文の入力状態を確認",
    },
    {
      label: "設計情報のみで本文がないシーン",
      count: b.scenes.filter(
        (s) =>
          !s.body.trim() &&
          Boolean(
            s.design.purpose ||
            s.design.obstacle ||
            s.design.result ||
            s.design.characterIds.length ||
            s.design.locationId,
          ),
      ).length,
      detail: "設計済み・本文未入力",
    },
    {
      label: "表記揺れ候補",
      count: findings.filter((f) => f.type === "表記揺れ").length,
      detail: "辞書による単純一致",
    },
    {
      label: "矛盾候補",
      count: timeline.length,
      detail: "タイムラインの機械判定",
    },
    {
      label: "主要人物の最終登場",
      count: major.filter((c) => {
        let last = -1;
        for (let i = ordered.length - 1; i >= 0; i--) {
          const scene = ordered[i];
          if (
            scene.design.characterIds.includes(c.id) ||
            scene.design.povCharacterId === c.id
          ) {
            last = i;
            break;
          }
        }
        return last >= 0 && last < ordered.length - 3;
      }).length,
      detail: "末尾3シーンに不在",
    },
  ];
}
export function diagnoseIntegrity(b: WorkBundle): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const scenes = new Set(b.scenes.map((s) => s.id)),
    chapters = new Set(b.chapters.map((c) => c.id)),
    refs = new Set(b.references.map((r) => r.id));
  b.scenes.forEach((s) => {
    if (!chapters.has(s.chapterId))
      issues.push({
        id: `orphan-scene:${s.id}`,
        severity: "要確認",
        type: "孤立シーン",
        message: `${s.title}の章がありません`,
        targetId: s.id,
      });
  });
  for (const c of b.chapters) {
    const orders = b.scenes
      .filter((s) => s.chapterId === c.id)
      .map((s) => s.order);
    if (new Set(orders).size !== orders.length)
      issues.push({
        id: `order:${c.id}`,
        severity: "自動修復可能",
        type: "重複した並び順",
        message: `${c.title}内でシーン順が重複`,
        targetId: c.id,
        repair: "normalize-order",
      });
  }
  b.timelineEvents.forEach((e) =>
    e.sceneIds
      .filter((id) => !scenes.has(id))
      .forEach((id) =>
        issues.push({
          id: `timeline:${e.id}:${id}`,
          severity: "要確認",
          type: "存在しないシーン参照",
          message: `${e.title}が削除済みシーンを参照`,
          targetId: e.id,
        }),
      ),
  );
  b.branchIdeas.forEach((x) => {
    let p = x.parentId;
    const seen = new Set([x.id]);
    while (p) {
      if (seen.has(p)) {
        issues.push({
          id: `cycle:${x.id}`,
          severity: "要確認",
          type: "循環した親子関係",
          message: `${x.title}の親案が循環`,
          targetId: x.id,
        });
        break;
      }
      seen.add(p);
      p = b.branchIdeas.find((y) => y.id === p)?.parentId || "";
    }
  });
  b.relationships.forEach((r) => {
    if (!refs.has(r.sourceCharacterId) || !refs.has(r.targetCharacterId))
      issues.push({
        id: `relation:${r.id}`,
        severity: "要確認",
        type: "孤立した関連データ",
        message: "人間関係の人物が存在しません",
        targetId: r.id,
      });
  });
  const all = [b.work, ...b.chapters, ...b.scenes];
  all.forEach((raw) => {
    const x = raw as unknown as Record<string, unknown> & { id?: string };
    if (!x.id)
      issues.push({
        id: `missing:${Math.random()}`,
        severity: "要確認",
        type: "必須項目の欠落",
        message: "IDがありません",
        targetId: "",
      });
    for (const k of ["createdAt", "updatedAt"])
      if (k in x && Number.isNaN(Date.parse(String(x[k]))))
        issues.push({
          id: `date:${x.id}:${k}`,
          severity: "要確認",
          type: "不正な日付",
          message: `${x.id}の${k}が不正`,
          targetId: x.id || "",
        });
  });
  return issues;
}
