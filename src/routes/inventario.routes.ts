import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import {
  createInventario,
  getInventarios,
  getInventarioById,
  updateInventario,
  deleteInventario,
  importInventarioExcel,
} from "../controllers/inventario.controller";

const router = Router();

/* =========================
   Upload Excel (memoria)
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowedMime = new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls (a veces)
    ]);

    const ext = (file.originalname.split(".").pop() || "").toLowerCase();
    const allowedExt = ext === "xlsx" || ext === "xls";

    if (allowedMime.has(file.mimetype) || allowedExt) return cb(null, true);

    return cb(new Error("Archivo inválido. Sube un Excel .xlsx/.xls"));
  },
});

/* =========================
   Rutas CRUD
========================= */

router.post("/inventario", createInventario);
router.get("/inventario", getInventarios);
router.get("/inventario/:id", getInventarioById);
router.patch("/inventario/:id", updateInventario);
router.delete("/inventario/:id", deleteInventario);

router.post(
  "/inventario/import-excel",
  upload.single("file"),
  importInventarioExcel,
);

/* =========================
   Error handler Multer
========================= */

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Archivo demasiado grande (máx 15MB)." });
    }
    return res.status(400).json({ error: `Error de subida: ${err.code}` });
  }

  if (err instanceof Error && err.message.includes("Archivo inválido")) {
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

export default router;
