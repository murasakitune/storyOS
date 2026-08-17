import type { ReferenceEntry } from "./types";

export const CHARACTER_SHEET_SECTIONS = [
  {
    title: "基本情報",
    fields: [
      "名前",
      "性別",
      "年齢",
      "誕生日",
      "血液型",
      "身長",
      "体重",
      "利き手",
      "出身",
      "職業",
      "一人称/二人称",
      "イメージモチーフ/イメージカラー",
    ],
  },
  {
    title: "外見",
    fields: ["髪型", "髪色", "瞳の色", "肌の色", "特徴", "匂い"],
  },
  {
    title: "性格",
    fields: [
      "性質",
      "長所",
      "短所",
      "信じているもの/こと",
      "信じていないもの/こと",
      "喜ぶもの/こと",
      "怒るもの/こと",
      "悲しむもの/こと",
      "口調",
      "文体",
      "一言",
    ],
  },
  {
    title: "好みと生活",
    fields: [
      "好きなもの",
      "嫌いなもの",
      "趣味/特技",
      "休日の過ごし方",
      "部屋の様子",
      "金銭感覚",
      "生活能力",
      "癖",
    ],
  },
  { title: "過去", fields: ["成功体験", "トラウマ", "特異点"] },
  { title: "その他", fields: ["メモ"] },
] as const;

export type CharacterSheetData = Record<string, string>;
export const CHARACTER_SHEET_FIELDS = CHARACTER_SHEET_SECTIONS.flatMap(
  (section) => [...section.fields],
);

export function characterToSheet(
  character: ReferenceEntry,
): CharacterSheetData {
  const sheet: CharacterSheetData = Object.fromEntries(
    CHARACTER_SHEET_FIELDS.map((field) => [
      field,
      character.characterProfile?.[field] || "",
    ]),
  );
  sheet["名前"] = character.name;
  sheet["性別"] = character.gender;
  sheet["年齢"] = character.age;
  sheet["特徴"] ||= character.appearance;
  sheet["性質"] ||= character.personality;
  sheet["口調"] ||= character.speech;
  sheet["一人称/二人称"] ||= [character.firstPerson, character.secondPerson]
    .filter(Boolean)
    .join(" / ");
  sheet["メモ"] ||= character.notes;
  return sheet;
}

export function parseCharacterSheet(value: unknown): CharacterSheetData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("キャラクターシートの形式ではありません。");
  const source = value as Record<string, unknown>;
  if (!CHARACTER_SHEET_FIELDS.some((field) => field in source))
    throw new Error("対応するキャラクター項目が見つかりません。");
  const result: CharacterSheetData = {};
  for (const field of CHARACTER_SHEET_FIELDS) {
    const fieldValue = source[field];
    if (fieldValue != null && typeof fieldValue !== "string")
      throw new Error(`「${field}」は文字列である必要があります。`);
    result[field] = fieldValue || "";
  }
  return result;
}

export function applySheetToCharacter(
  character: ReferenceEntry,
  source: unknown,
): ReferenceEntry {
  const sheet = parseCharacterSheet(source);
  const persons = sheet["一人称/二人称"].split(/\s*[／/]\s*/, 2);
  return {
    ...character,
    name: sheet["名前"].trim() || character.name || "名称未設定",
    gender: sheet["性別"],
    age: sheet["年齢"],
    appearance: sheet["特徴"] || character.appearance,
    personality: sheet["性質"] || character.personality,
    speech: sheet["口調"] || character.speech,
    firstPerson: persons[0] || character.firstPerson,
    secondPerson: persons[1] || character.secondPerson,
    notes: sheet["メモ"] || character.notes,
    characterProfile: sheet,
  };
}

export function characterSheetFilename(character: ReferenceEntry) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const safeName = (character.name.trim() || "無題").replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  return `${stamp}_${safeName}.chara`;
}
