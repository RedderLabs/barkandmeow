/* ── SMS ──────────────────────────────────────────────────────
   Segundo factor del portal del dueño (decidido 2026-09-30). Twilio por su API
   REST, sin SDK: una sola llamada con autenticación básica. Con
   TWILIO_MESSAGING_SERVICE_SID manda Twilio el remitente; si no, TWILIO_FROM.
   Sin credenciales no hay a dónde enviar y el envío falla, como el correo.
   Los tests sustituyen el smsista y leen el código sin pasar por la red.

   Solo se envía a los prefijos de SMS_PREFIJOS: el fraude por SMS consiste en
   pedir códigos a números caros de otros países, y lo paga quien envía. */

export type Sms = { para: string; texto: string };
export type Smsista = (s: Sms) => Promise<void>;

/** Países de la UE y el EEE, Reino Unido y Suiza, por defecto. */
const PREFIJOS_UE =
  "+30,+31,+32,+33,+34,+351,+352,+353,+354,+356,+357,+358,+359,+36,+370,+371,+372,+385,+386,+39,+40,+41,+420,+421,+423,+43,+44,+45,+46,+47,+48,+49";

export const prefijosSms = () =>
  (process.env.SMS_PREFIJOS ?? PREFIJOS_UE)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\+\d{1,4}$/.test(p));

/** El número en E.164 si es válido y de un prefijo permitido; si no, null. */
export function normalizarTelefono(entrada: string): string | null {
  const t = entrada.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+[1-9]\d{7,14}$/.test(t)) return null;
  return prefijosSms().some((p) => t.startsWith(p)) ? t : null;
}

/** +34612345678 → +34 •••••• 678 */
export const enmascararTelefono = (t: string) => `${t.slice(0, 3)} ${"•".repeat(Math.max(3, t.length - 6))} ${t.slice(-3)}`;

let smsista: Smsista = async ({ para, texto }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const servicio = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const desde = process.env.TWILIO_FROM ?? "";
  if (!sid || !token || (!servicio && !desde))
    throw new Error("SMS sin configurar: faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_FROM o TWILIO_MESSAGING_SERVICE_SID");
  const cuerpo = new URLSearchParams({ To: para, Body: texto });
  if (servicio) cuerpo.set("MessagingServiceSid", servicio);
  else cuerpo.set("From", desde);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: cuerpo,
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
    throw new Error(`Twilio respondió ${r.status}${j.code ? ` (${j.code})` : ""}`);
  }
};

export const enviarSms = (s: Sms) => smsista(s);

export function usarSmsista(s: Smsista) {
  smsista = s;
}
