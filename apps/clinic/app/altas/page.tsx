import { redirect } from "next/navigation";

/* Pedir un alta ya no es una página aparte (decidido 2026-10-01): sale del chip que se
   lee en la portada. Se conserva la dirección por si alguien la tiene guardada. */
export default function Altas() {
  redirect("/");
}
