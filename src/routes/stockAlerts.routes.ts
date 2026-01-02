import { Router } from "express";
import { listStockAlerts, ackStockAlert, countStockAlerts, resolveStockAlert } from "../controllers/stockAlerts.controller";

const router = Router();

router.get("/", listStockAlerts);
router.get("/count", countStockAlerts);
router.post("/:id/ack", ackStockAlert);
router.post("/:id/resolve", resolveStockAlert);

export default router;
