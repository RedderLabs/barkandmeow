/* Sin dependencias: lo importan también las webs, sin arrastrar zod. */

/* El dominio de la clínica sale de su correo. Un correo gratuito no dice nada
   de la clínica: cualquiera puede abrir clinicavet@gmail.com en un minuto. */
const CORREO_GRATUITO = [
  /^gmail\.com$/, /^googlemail\.com$/, /^(hotmail|outlook|live|msn)\.[a-z.]+$/,
  /^yahoo\.[a-z.]+$/, /^ymail\.com$/, /^(icloud|me|mac)\.com$/, /^aol\.[a-z.]+$/,
  /^proton(mail)?\.(me|com|ch)$/, /^pm\.me$/, /^gmx\.[a-z.]+$/, /^mail\.com$/,
  /^yandex\.[a-z.]+$/, /^zoho(mail)?\.[a-z.]+$/, /^tutanota\.[a-z.]+$/, /^tuta\.io$/,
  /^(sapo|iol|clix|netcabo)\.pt$/, /^(telefonica|terra|ya|movistar)\.(net|es|com)$/,
  /^(orange|free|laposte|sfr|wanadoo|neuf|bbox)\.(fr|net)$/, /^web\.de$/, /^libero\.it$/,
];

export function dominioDeCorreo(email: string): string | null {
  const d = email.trim().toLowerCase().split("@")[1];
  if (!d || CORREO_GRATUITO.some((r) => r.test(d))) return null;
  return d;
}
