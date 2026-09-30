import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/api";

/* Borra el token del operador. Después, a entrar. */
export function GET(req: NextRequest) {
  const r = NextResponse.redirect(new URL("/operador/entrar", req.url));
  r.cookies.delete({ name: COOKIE, path: "/operador" });
  return r;
}
