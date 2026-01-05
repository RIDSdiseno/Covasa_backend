import { Router } from "express";
import { getCrmCotizacionById, listCrmCotizaciones } from "../controllers/crmCotizaciones.controller";

const router = Router();

router.get("/", listCrmCotizaciones);
router.get("/:id", getCrmCotizacionById);

export default router;
