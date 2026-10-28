// Keep Vietnamese folding consistent with web/src/search.js.
export function foldText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}
export function searchConversations(db, query) {
  const needle = foldText(query);
  const matches = db
    .prepare(
      `SELECT c.*,
    (SELECT m.id FROM messages m WHERE m.conversation_id=c.id
      AND instr(fold_text(m.content), @query)>0 ORDER BY m.id DESC LIMIT 1) AS match_message_id
    FROM conversations c WHERE instr(fold_text(c.title), @query)>0
      OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND instr(fold_text(m.content), @query)>0)
    ORDER BY c.updated_at DESC, c.id LIMIT 100`,
    )
    .all({ query: needle });
  const getMessage = db.prepare("SELECT content,role FROM messages WHERE id=?");
  return matches.map((item) => {
    if (!item.match_message_id) return { ...item, snippet: null };
    const message = getMessage.get(item.match_message_id);
    // Fold graphemes individually to retain offsets with both composed and decomposed accents.
    const segments = [
      ...new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(
        message.content,
      ),
    ];
    let folded = "",
      offsets = [];
    for (const part of segments) {
      const value = foldText(part.segment);
      for (let i = 0; i < value.length; i++) offsets.push(part.index);
      folded += value;
    }
    const at = offsets[folded.indexOf(needle)] ?? 0;
    const start = Math.max(0, at - 55),
      end = Math.min(message.content.length, at + query.length + 110);
    return {
      ...item,
      match_role: message.role,
      snippet:
        (start ? "…" : "") +
        message.content.slice(start, end).replace(/\s+/g, " ") +
        (end < message.content.length ? "…" : ""),
    };
  });
}
