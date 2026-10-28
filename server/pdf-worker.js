import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
let task;
try {
  task = getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: 0,
    cMapUrl: fileURLToPath(
      new URL("./node_modules/pdfjs-dist/cmaps/", import.meta.url),
    ),
    cMapPacked: true,
    wasmUrl: fileURLToPath(
      new URL("./node_modules/pdfjs-dist/wasm/", import.meta.url),
    ),
    standardFontDataUrl: fileURLToPath(
      new URL("./node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
    ),
  });
  const pdf = await task.promise;
  if (pdf.numPages > 200)
    throw new Error("PDF vượt quá 200 trang. Hãy chia nhỏ tài liệu.");
  const pages = [];
  let bytes = 0;
  for (let page = 1; page <= pdf.numPages; page++) {
    const p = await pdf.getPage(page),
      content = await p.getTextContent();
    const text = content.items
      .map((item) => item.str + (item.hasEOL ? "\n" : " "))
      .join("")
      .trim();
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > 262144)
      throw new Error(
        "Văn bản trích xuất vượt quá 256 KiB. Hãy chia nhỏ tài liệu.",
      );
    pages.push({ page, text });
    p.cleanup();
  }
  parentPort.postMessage({ pages });
} catch (error) {
  const message = /Password/i.test(error.name)
    ? "PDF có mật khẩu. Hãy mở khoá trước khi tải lên."
    : /vượt quá/.test(error.message)
      ? error.message
      : "Không đọc được PDF. File có thể bị hỏng hoặc không được hỗ trợ.";
  parentPort.postMessage({ error: message });
} finally {
  await task?.destroy();
}
