import type { Request, Response, NextFunction } from "express";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: "Not found" });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);

  if (err?.name === "ZodError") {
    return res.status(400).json({ message: "Validation error", issues: err.issues });
  }

  return res.status(err?.status || 500).json({
    message: err?.message || "Internal server error",
  });
}
