import assert from "node:assert/strict";
import {
  applySheetToCharacter,
  CHARACTER_SHEET_FIELDS,
  characterToSheet,
  parseCharacterSheet,
} from "../src/character-sheet";
import { emptyReference, normalizeBundle } from "../src/defaults";

const raw = Object.fromEntries(
  CHARACTER_SHEET_FIELDS.map((field, index) => [field, `${field}-${index}`]),
);
raw["名前"] = "朝倉ひかり";
raw["一人称/二人称"] = "私 / あなた";

const base = emptyReference("character", "work", "character", "2026-01-01");
const imported = applySheetToCharacter(base, raw);
assert.equal(imported.name, "朝倉ひかり");
assert.equal(imported.firstPerson, "私");
assert.equal(imported.secondPerson, "あなた");
assert.deepEqual(characterToSheet(imported), raw);
assert.deepEqual(parseCharacterSheet(characterToSheet(imported)), raw);
assert.throws(() => parseCharacterSheet({ unknown: "value" }));
assert.throws(() => parseCharacterSheet({ 名前: 123 }));

const oldCharacter = { ...base } as typeof base & {
  characterProfile?: Record<string, string>;
};
delete oldCharacter.characterProfile;
const normalized = normalizeBundle({
  work: {
    id: "work",
    title: "旧作品",
    tagline: "",
    genre: "",
    status: "構想",
    synopsis: "",
    theme: "",
    targetCharacters: 0,
    targetScenes: 0,
    longFormSupport: false,
    longFormSettings: {} as never,
    createdAt: "",
    updatedAt: "",
    lastEditedAt: "",
  },
  chapters: [],
  scenes: [],
  references: [oldCharacter],
});
assert.deepEqual(normalized.references[0].characterProfile, {});

console.log(
  `Character sheet validation passed: ${CHARACTER_SHEET_FIELDS.length} fields, raw .chara round-trip, legacy normalization.`,
);
