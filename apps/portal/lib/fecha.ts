/** 2026-09-12T… → 12/09/2026. Fechas en el formato de una cartilla de papel. */
export const fecha = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
