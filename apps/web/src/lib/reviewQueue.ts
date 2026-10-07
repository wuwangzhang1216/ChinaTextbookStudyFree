import { getDueSrsEntries, type SrsMistakeEntry } from "@cstf/core/srs";

/** Free heart recovery may practise future entries without advancing their SRS. */
export function reviewQueue(bank: SrsMistakeEntry[], forHeartRecovery: boolean) {
  const due = getDueSrsEntries(bank);
  const key = (entry: SrsMistakeEntry) => `${entry.lessonId}:${entry.question.id}`;
  const seen = new Set(due.map(key));
  const queue = due.map(entry => ({ entry, scheduled: true }));
  if (forHeartRecovery) {
    for (const entry of bank) {
      if (queue.length >= 5) break;
      if (seen.has(key(entry))) continue;
      seen.add(key(entry));
      queue.push({ entry, scheduled: false });
    }
  }
  return queue;
}
