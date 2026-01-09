import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

import fs from "node:fs";

function tailFile(filePath, lines = 300) {
  const data = fs.readFileSync(filePath, "utf8");
  const arr = data.split("\n");
  return arr.slice(-lines).join("\n");
}

app.get("/api/logs/:service", (req, res) => {
  // Ajuste caminhos conforme onde o PM2 está rodando (root vs ubuntu)
  const home = process.env.HOME || "/root";
  const pm2LogsRoot = `${home}/.pm2/logs`;

const map = {
  dashboard: `/root/.pm2/logs/ocpp-dashboard-out.log`,
  dashboard_err: `/root/.pm2/logs/ocpp-dashboard-error.log`,

  // ✅ Gateway OCPP (processo: ocpp-server)
  gateway: `/root/.pm2/logs/ocpp-server-out.log`,
  gateway_err: `/root/.pm2/logs/ocpp-server-error.log`,

  nginx: `/var/log/nginx/error.log`,
  nginx_access: `/var/log/nginx/access.log`,
};


  const key = req.params.service;
  const file = map[key];

  if (!file) return res.status(404).json({ ok: false, error: "unknown service" });

  try {
    if (!fs.existsSync(file)) {
      return res.status(404).json({ ok: false, error: `file not found: ${file}` });
    }
    const log = tailFile(file, 400);
    res.json({ ok: true, file, log });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), file });
  }
});

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:3000";

// health
app.get("/health", (req, res) => res.json({ ok: true }));

// expor config pro painel
app.get("/api/config", (req, res) => {
  res.json({ ok: true, gatewayUrl: GATEWAY_URL });
});

// servir estático do painel (se você usa pelo node)
// se você serve pelo nginx em /painel, pode deixar assim ou remover.
app.use("/", express.static(path.join(__dirname, "public")));

// listar clientes do gateway
app.get("/api/clients", async (req, res) => {
  try {
    const r = await fetch(`${GATEWAY_URL}/ocpp/clients`);
    const j = await r.json();

    // Aceita formatos: [...], {clients:[...]}, {ok:true, clients:[...]}
    const raw = Array.isArray(j) ? j : (j.clients || []);

    // Normaliza para ARRAY DE STRINGS
    const clients = raw
      .map((c) => {
        if (typeof c === "string") return c;
        if (!c || typeof c !== "object") return null;
        return (
          c.serialNumber ||
          c.chargePointId ||
          c.id ||
          c.sn ||
          c.name ||
          null
        );
      })
      .filter(Boolean);

    res.json({ ok: true, clients });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), clients: [] });
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
