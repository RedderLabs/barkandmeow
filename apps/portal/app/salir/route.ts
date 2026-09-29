import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/* Cierra la sesión en el API y borra la cookie. Después, a entrar. */
export async function GET(req: NextRequest) {
  const c = (await cookies()).get("bam_owner");
  if (c) {
    await fetch(`${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4601"}/owners/v1/logout`, {
      method: "POST",
      headers: { cookie: `bam_owner=${c.value}` },
    }).catch(() => {});
  }
  const r = NextResponse.redirect(new URL("/mi-mascota/entrar", req.url));
  r.cookies.delete("bam_owner");
  return r;
}
