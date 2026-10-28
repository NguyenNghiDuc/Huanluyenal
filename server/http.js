import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
export function configureHttp(app) {
  const origin = process.env.WEB_ORIGIN || "http://localhost:5173";
  app.use((req, res, next) => {
    if (req.headers.origin && req.headers.origin !== origin)
      return res.status(403).json({ error: "Origin không được phép." });
    next();
  });
  app.use(cors({ origin }));
  app.use("/api", (_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Bạn gửi quá nhanh. Hãy chờ một phút." },
    }),
  );
  app.use(
    "/api/chat",
    rateLimit({
      windowMs: 60000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Bạn gửi tin nhắn quá nhanh. Hãy chờ một phút." },
    }),
  );
  const uploadLimiter = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Tối đa 10 lần tải tài liệu mỗi phút." },
  });
  app.use("/api/documents", (req, res, next) =>
    req.method === "POST" ? uploadLimiter(req, res, next) : next(),
  );
  app.use(
    "/api/artifacts/generate",
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Tối đa 10 yêu cầu soạn bản nháp mỗi phút." },
    }),
  );
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.publicMessage
    ? error.status
    : error.status === 413
      ? 413
      : error.type === "entity.parse.failed"
        ? 400
        : 500;
  res
    .status(status)
    .json({
      error:
        error.publicMessage ||
        (status === 500
          ? "Có lỗi phía server. Vui lòng thử lại."
          : "Yêu cầu không hợp lệ hoặc quá lớn."),
    });
}
