import React from "react";
import { matchRanges } from "../search";
export default function Highlight({ text, query }) {
  const ranges = matchRanges(text, query);
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
