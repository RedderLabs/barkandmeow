/* DATOS DE DEMOSTRACIÓN — sintéticos.
   No hay clínicas piloto ni pacientes reales. Los nombres de clínica van entre
   corchetes, igual que en las pantallas del lienzo, y ninguna cifra de aquí
   puede presentarse como métrica del producto. */

export type EstadoEnvio = "sellado" | "en-cola" | "fallido";

export type Envio = {
  id: string;
  hora: string;
  paciente: string;
  chip: string;
  destinatario: string;
  estado: EstadoEnvio;
  tipo: string;
  /* Solo en los fallidos: qué pasó y cómo se sale de ahí. */
  motivo?: string;
  recuperacion?: string;
};

export type Permiso = {
  id: string;
  paciente: string;
  chip: string;
  concedido: string;
  caduca: string | null;
  /* Días que quedan; null cuando el permiso es permanente. */
  diasRestantes: number | null;
};

export type Conexion = {
  software: string;
  version: string;
  ultimaSync: string;
  estado: "activa" | "degradada" | "ninguna";
  detalle: string;
};

export const clinica = {
  nombre: "[Nombre de la clínica]",
  ciudad: "Lisboa",
  pais: "PT",
};

export const conexionActiva: Conexion = {
  software: "[Software de gestión]",
  version: "4.2",
  ultimaSync: "hace 3 min",
  estado: "activa",
  detalle: "Los informes salen firmados y cifrados en cuanto cierras la consulta.",
};

export const conexionNinguna: Conexion = {
  software: "",
  version: "",
  ultimaSync: "",
  estado: "ninguna",
  detalle:
    "Todavía no hay ningún software conectado. Puedes enviar informes a mano mientras tanto.",
};

export const contadores = [
  { etiqueta: "Enviados hoy", valor: "12" },
  { etiqueta: "En cola", valor: "2" },
  { etiqueta: "Fallidos", valor: "1" },
  { etiqueta: "Permisos vigentes", valor: "38" },
];

export const envios: Envio[] = [
  {
    id: "e1",
    hora: "18:42",
    paciente: "[Nombre]",
    chip: "724 098 100 001 234",
    destinatario: "Su dueño",
    estado: "sellado",
    tipo: "Informe de consulta",
  },
  {
    id: "e2",
    hora: "18:07",
    paciente: "[Nombre]",
    chip: "620 044 900 887 100",
    destinatario: "Su dueño",
    estado: "sellado",
    tipo: "Analítica",
  },
  {
    id: "e3",
    hora: "17:55",
    paciente: "[Nombre]",
    chip: "724 098 100 004 871",
    destinatario: "Su dueño",
    estado: "en-cola",
    tipo: "Informe de consulta",
  },
  {
    id: "e4",
    hora: "17:31",
    paciente: "[Nombre]",
    chip: "nonISO:A4F92C1",
    destinatario: "Su dueño",
    estado: "fallido",
    tipo: "Vacunación",
    motivo: "El permiso del dueño caducó a las 17:12.",
    recuperacion: "Pide un permiso nuevo y el envío se reintenta solo.",
  },
  {
    id: "e5",
    hora: "16:48",
    paciente: "[Nombre]",
    chip: "724 098 100 002 205",
    destinatario: "Su dueño",
    estado: "sellado",
    tipo: "Informe de consulta",
  },
];

export const permisos: Permiso[] = [
  {
    id: "p1",
    paciente: "[Nombre]",
    chip: "724 098 100 001 234",
    concedido: "02/06/2026",
    caduca: null,
    diasRestantes: null,
  },
  {
    id: "p2",
    paciente: "[Nombre]",
    chip: "620 044 900 887 100",
    concedido: "24/09/2026",
    caduca: "27/09/2026",
    diasRestantes: 1,
  },
  {
    id: "p3",
    paciente: "[Nombre]",
    chip: "724 098 100 002 205",
    concedido: "19/09/2026",
    caduca: "03/10/2026",
    diasRestantes: 7,
  },
];

export type Rol = "admin" | "vet" | "assistant";

export type Miembro = {
  id: string;
  nombre: string;
  rol: Rol;
  alta: string;
  estado: "activo" | "pendiente";
};

export const equipo: Miembro[] = [
  { id: "m1", nombre: "[Nombre del administrador]", rol: "admin", alta: "12/09/2026", estado: "activo" },
  { id: "m2", nombre: "[Nombre]", rol: "vet", alta: "12/09/2026", estado: "activo" },
  { id: "m3", nombre: "[Nombre]", rol: "vet", alta: "18/09/2026", estado: "activo" },
  { id: "m4", nombre: "[Nombre]", rol: "assistant", alta: "22/09/2026", estado: "activo" },
  { id: "m5", nombre: "[Nombre]", rol: "assistant", alta: "25/09/2026", estado: "pendiente" },
];

export const rolNombre: Record<Rol, string> = {
  admin: "ADMINISTRADOR",
  vet: "VETERINARIO",
  assistant: "AUXILIAR",
};

/* Código de recuperación de ejemplo. El real se genera en el navegador. */
export const codigoRecuperacion = [
  "BARK", "4F2K", "9QTB", "L7XM",
  "R3NP", "8WCD", "V6YH", "2JSA",
];

export const registroTxt = "barkandmeow-verify=8f3a1c94e07b2d65";
