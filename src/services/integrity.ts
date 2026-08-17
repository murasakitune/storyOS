import { db } from "../db";
import type { IntegrityIssue } from "../types";
export async function diagnoseDatabaseReferences(): Promise<IntegrityIssue[]> {
  const workIds = new Set(
      (await db.works.toCollection().primaryKeys()).map(String),
    ),
    tables = [
      db.chapters,
      db.scenes,
      db.references,
      db.relationships,
      db.foreshadows,
      db.questions,
      db.promises,
      db.subplots,
      db.timelineEvents,
      db.knowledgeItems,
      db.branchIdeas,
    ];
  const issues: IntegrityIssue[] = [];
  for (const table of tables) {
    const rows = (await table.toArray()) as { id: string; workId: string }[];
    for (const row of rows)
      if (!workIds.has(row.workId))
        issues.push({
          id: `orphan-work:${table.name}:${row.id}`,
          severity: "要確認",
          type: "存在しない作品IDへの参照",
          message: `${table.name}/${row.id} が存在しない作品を参照`,
          targetId: row.id,
        });
  }
  return issues;
}
