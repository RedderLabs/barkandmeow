/* Servicio del pepper, aislado a propósito.
   La API puede pedirle que indexe un identificador, pero no puede leer el
   pepper: vive solo aquí, en otro proceso y con otro secreto. Sin este
   servicio, quien robe la base de datos no puede recorrer números de chip. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PEPPER = process.env.CHIP_PEPPER;
const TOKEN = process.env.PEPPER_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 4600);

if (!PEPPER) {
  console.error("Falta CHIP_PEPPER. El servicio no arranca sin pepper.");
  process.exit(1);
}

const autorizado = (req) => {
  if (!TOKEN) return true; // en desarrollo, sin token
  const dado = Buffer.from(req.headers["x-pepper-token"] ?? "");
  const esperado = Buffer.from(TOKEN);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
};

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end('{"ok":true}');
  }
  if (req.method !== "POST" || req.url !== "/index") {
    res.writeHead(404);
    return res.end();
  }
  if (!autorizado(req)) {
    res.writeHead(401);
    return res.end();
  }

  let cuerpo = "";
  req.on("data", (c) => {
    cuerpo += c;
    if (cuerpo.length > 4096) req.destroy();
  });
  req.on("end", () => {
    try {
      const { valores } = JSON.parse(cuerpo);
      if (!Array.isArray(valores) || valores.length > 8) throw new Error("mal");
      const indices = valores.map((v) =>
        createHmac("sha256", PEPPER).update(String(v)).digest("base64"),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ indices }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
}).listen(PORT, () => console.log(`pepper escuchando en ${PORT}`));
