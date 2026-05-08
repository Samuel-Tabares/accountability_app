import { redirect } from "next/navigation";
import Image from "next/image";
import { dashboardPathForRole, getAuthContext } from "@/src/lib/auth";
import logoTrabix from "@/public/site-assets/brand/logo-trabix.png";
import { LoginForm } from "./login-form";

function messageFor(error?: string, retryAfter?: string) {
  if (error === "missing_credentials") return "Faltan credenciales.";
  if (error === "login_failed") return "No se pudo iniciar sesión.";
  if (error === "profile_missing") return "La cuenta no tiene perfil activo.";
  if (error === "profile_inactive") return "La cuenta fue desactivada.";
  if (error === "not_authorized") return "No tienes permisos para esa acción.";
  if (error === "not_authenticated") return "Inicia sesión para continuar.";
  if (error === "invalid_sale") return "La venta enviada no es válida.";
  if (error === "invalid_expense") return "El gasto enviado no es válido.";
  if (error === "expense_failed") return "No se pudo guardar el gasto.";
  if (error === "sale_failed") return "No se pudo guardar la venta.";
  if (error === "profile_failed") return "No se pudo actualizar el perfil.";
  if (error === "invalid_identifier") return "El usuario o código no es válido.";
  if (error === "rate_limited") {
    return retryAfter ? `Demasiados intentos. Intenta de nuevo en ${retryAfter} segundos.` : "Demasiados intentos. Intenta más tarde.";
  }
  return undefined;
}

type Props = {
  searchParams?: Promise<{
    error?: string;
    notice?: string;
    retry_after?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const auth = await getAuthContext();
  if (auth) {
    if (auth.profile.must_change_password) {
      redirect("/cambiar-contrasena" as any);
    }
    redirect(dashboardPathForRole(auth.profile.role));
  }

  const params = (await searchParams) ?? {};
  const error = params.error;
  const retryAfter = params.retry_after;

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-login">
        <Image
          className="auth-logo"
          src={logoTrabix}
          alt="TRABIX Granizados"
          priority
          sizes="(max-width: 760px) 64vw, 250px"
        />
        <p className="auth-tagline">Embajadores</p>
        <LoginForm initialMessage={messageFor(error, retryAfter)} />
      </section>
    </main>
  );
}
