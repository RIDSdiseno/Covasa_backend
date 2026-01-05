import express from "express";
import cors from "cors";
import { notFound, errorHandler } from "./middlewares/errorHandler";
import clientesRoutes from "./routes/clientes.routes";
import catalogoRoutes from "./routes/catalogo.routes";
import inventarioRoutes from "./routes/inventario.routes";
import stockAlertsRoutes from "./routes/stockAlerts.routes";
import cotizacionesRoutes from "./routes/cotizaciones.routes";
import crmCotizacionesRoutes from "./routes/crmCotizaciones.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/** ✅ Clientes */
app.use("/api/clientes", clientesRoutes);

/** ✅ Catálogo / Inventario están montados en /api porque adentro ya vienen /productos, /inventario, etc */
app.use("/api", catalogoRoutes);
app.use("/api", inventarioRoutes);

/** ✅ Stock alerts */
app.use("/api/stock-alerts", stockAlertsRoutes);

/** ✅ Cotizaciones: ESTE ERA EL ERROR */
app.use("/api/cotizaciones", cotizacionesRoutes);
app.use("/api/crm/cotizaciones", crmCotizacionesRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
