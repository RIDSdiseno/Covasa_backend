import { Router } from "express";
import {
  createProducto,
  deleteProducto,
  getProductoById,
  getProductos,
  updateProducto,
  // (opcional) deleteProductoImagen
} from "../controllers/productos.controller";
import {
  createProveedor,
  deleteProveedor,
  getProveedorById,
  getProveedores,
  updateProveedor,
} from "../controllers/proveedores.controller";
import {
  deletePrecioProveedor,
  getPreciosProveedor,
  upsertPrecioProveedor,
} from "../controllers/preciosProveedor.controller";

import { uploadImage } from "../controllers/uploads.controller";
import { uploadSingleImage, uploadMultiImages } from "../middlewares/upload";

const router = Router();

/** =========================
 * Upload genérico (1 imagen)
 * ========================= */
router.post("/uploads/image", uploadSingleImage, uploadImage);

/** =========================
 * Productos (con galería)
 * - field: "fotos" (multiple)
 * ========================= */
router.post("/productos", uploadMultiImages, createProducto);
router.get("/productos", getProductos);
router.get("/productos/:id", getProductoById);
router.patch("/productos/:id", uploadMultiImages, updateProducto);
router.delete("/productos/:id", deleteProducto);

/** =========================
 * (Opcional) borrar una imagen puntual de un producto
 * router.delete("/productos/:id/imagenes/:imageId", deleteProductoImagen);
 * ========================= */

/** =========================
 * Proveedores
 * ========================= */
router.post("/proveedores", createProveedor);
router.get("/proveedores", getProveedores);
router.get("/proveedores/:id", getProveedorById);
router.patch("/proveedores/:id", updateProveedor);
router.delete("/proveedores/:id", deleteProveedor);

/** =========================
 * Precios por proveedor
 * ========================= */
router.get("/precios-proveedor", getPreciosProveedor);
router.post("/precios-proveedor/upsert", upsertPrecioProveedor);
router.delete("/precios-proveedor/:id", deletePrecioProveedor);

export default router;
