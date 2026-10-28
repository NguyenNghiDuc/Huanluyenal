export function foldText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}
export function matchRanges(text, query) {
  const needle = foldText(query.trim());
  if (!needle) return [];
  let folded = "";
  const positions = [];
  for (const { segment, index } of new Intl.Segmenter("vi", {
    granularity: "grapheme",
  }).segment(text)) {
    const value = foldText(segment);
    for (let i = 0; i < value.length; i++)
      positions.push([index, index + segment.length]);
    folded += value;
  }
  const ranges = [];
  for (
    let at = 0;
    (at = folded.indexOf(needle, at)) !== -1;
    at += needle.length
  ) {
    ranges.push([positions[at][0], positions[at + needle.length - 1][1]]);
  }
  return ranges;
}
