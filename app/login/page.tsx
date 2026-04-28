import { redirect } from "next/navigation";
import { dashboardPathForRole, getAuthContext } from "@/src/lib/auth";
import { LoginForm } from "./login-form";

function messageFor(error?: string, notice?: string, retryAfter?: string) {
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
  return "Acceso protegido por Supabase Auth, alias internos y RLS.";
}

type Props = {
  searchParams?: {
    error?: string;
    notice?: string;
    retry_after?: string;
  };
};

export default async function LoginPage({ searchParams }: Props) {
  const auth = await getAuthContext();
  if (auth) {
    redirect(dashboardPathForRole(auth.profile.role));
  }

  const error = searchParams?.error;
  const notice = searchParams?.notice;
  const retryAfter = searchParams?.retry_after;

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-login">
        <p className="eyebrow">TRABIX / Supabase-first</p>
        <h1>Acceso de admin y embajador.</h1>
        <p className="hero-copy">{messageFor(error, notice, retryAfter)}</p>

        <div className="auth-grid">
          <div className="auth-panel">
            <p className="panel-label">Lo que protege este flujo</p>
            <ul className="feature-list">
              <li>Sesión firmada por Supabase Auth.</li>
              <li>Redirección por rol con middleware.</li>
              <li>Acceso a datos limitado por RLS.</li>
              <li>Rate limiting con Redis para login y embajador.</li>
              <li>Identificador visible por usuario o código, sin correo en UI.</li>
            </ul>
          </div>

          <LoginForm initialMessage={messageFor(error, notice, retryAfter)} />
        </div>
      </section>
    </main>
  );
}
