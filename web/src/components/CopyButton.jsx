import React, { useState, useRef, useEffect } from "react";
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* Try selection-based clipboard below. */
    }
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand?.("copy"))
      throw new Error("Clipboard unavailable");
  } finally {
    field.remove();
    previous?.focus({ preventScroll: true });
  }
}
export default function CopyButton({
  text,
  label = "Sao chép",
  className = "",
}) {
  const [status, setStatus] = useState("");
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await copyText(text);
      setStatus("Đã sao chép");
    } catch {
      setStatus("Không sao chép được. Hãy chọn và chép thủ công.");
    }
    timer.current = setTimeout(() => setStatus(""), 3000);
  }
  return (
    <span className={"copy-control " + className}>
      <button
        type="button"
        className="copy-button"
        aria-label={label}
        onClick={copy}
      >
        {status === "Đã sao chép" ? "✓ Đã sao chép" : label}
      </button>
      <span className="sr-only" role="status">
        {status}
      </span>
    </span>
  );
}
