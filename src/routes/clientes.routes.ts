import { Router } from "express";
import {
  createCliente,
  getClientes,
  getClienteById,
  updateCliente,
  deleteCliente,
} from "../controllers/clientes.controller";


const router = Router();

router.get("/", getClientes);
router.get("/:id", getClienteById);
router.post("/", createCliente);
router.patch("/:id", updateCliente);
router.delete("/:id", deleteCliente);

export default router;
