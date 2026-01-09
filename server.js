import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(express.json());
app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    gatewayUrl: process.env.GATEWAY_URL || "http://localhost:3000",
  });
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:3000";

// serve arquivos estáticos do painel
app.use("/", express.static(path.join(__dirname, "public")));

// listar clientes do gateway
app.get("/api/clients", async (req, res) => {
  try {
    const r = await fetch(`${GATEWAY_URL}/ocpp/clients`);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// enviar comando via gateway
app.post("/api/send", async (req, res) => {
  const { serialNumber, action, payload } = req.body || {};
  if (!serialNumber || !action) {
    return res.status(400).json({ ok: false, error: "missing serialNumber/action" });
  }

  try {
    const r = await fetch(`${GATEWAY_URL}/ocpp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.GATEWAY_API_KEY ? { "x-api-key": process.env.GATEWAY_API_KEY } : {}),
      },
      body: JSON.stringify({ serialNumber, action, payload: payload || {} }),
    });

    const txt = await r.text();
    res.status(r.status).type("application/json").send(txt);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`OCPP Dashboard na porta ${PORT}`);
  console.log("Gateway:", GATEWAY_URL);
});

