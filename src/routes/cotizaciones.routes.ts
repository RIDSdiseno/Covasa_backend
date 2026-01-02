import { Router } from "express";
import {
  listCotizaciones,
  getCotizacionById,
  patchCotizacion,
  convertToCrm,
  unlinkCrm,
  createCotizacion,
} from "../controllers/cotizaciones.controller";

const router = Router();

router.get("/", listCotizaciones);
router.post("/", createCotizacion);

router.get("/:id", getCotizacionById);
router.patch("/:id", patchCotizacion);

router.post("/:id/convert-to-crm", convertToCrm);
router.post("/:id/unlink-crm", unlinkCrm);

export default router;
