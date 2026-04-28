import { redirect } from "next/navigation";
import { dashboardPathForRole, getAuthContext } from "@/src/lib/auth";

function messageFor(error?: string, notice?: string) {
  if (error === "missing_credentials") return "Faltan credenciales.";
  if (error === "login_failed") return "No se pudo iniciar sesión.";
  if (error === "signup_failed") return "No se pudo crear la cuenta.";
  if (error === "profile_missing") return "La cuenta no tiene perfil activo.";
  if (error === "profile_inactive") return "La cuenta fue desactivada.";
  if (error === "not_authorized") return "No tienes permisos para esa acción.";
  if (error === "not_authenticated") return "Inicia sesión para continuar.";
  if (error === "invalid_sale") return "La venta enviada no es válida.";
  if (error === "invalid_expense") return "El gasto enviado no es válido.";
  if (error === "expense_failed") return "No se pudo guardar el gasto.";
  if (error === "sale_failed") return "No se pudo guardar la venta.";
  if (error === "profile_failed") return "No se pudo actualizar el perfil.";
  if (notice === "account_created") return "Cuenta creada. Ahora puedes iniciar sesión.";
  return "Acceso protegido por Supabase Auth y RLS.";
}

type Props = {
  searchParams?: {
    error?: string;
    notice?: string;
  };
};

export default async function LoginPage({ searchParams }: Props) {
  const auth = await getAuthContext();
  if (auth) {
    redirect(dashboardPathForRole(auth.profile.role));
  }

  const error = searchParams?.error;
  const notice = searchParams?.notice;

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-login">
        <p className="eyebrow">TRABIX / Supabase-first</p>
        <h1>Acceso de admin y embajador.</h1>
        <p className="hero-copy">{messageFor(error, notice)}</p>

        <div className="auth-grid">
          <div className="auth-panel">
            <p className="panel-label">Lo que protege este flujo</p>
            <ul className="feature-list">
              <li>Sesión firmada por Supabase Auth.</li>
              <li>Redirección por rol con middleware.</li>
              <li>Acceso a datos limitado por RLS.</li>
            </ul>
          </div>

          <form className="auth-form" action="/api/auth/session" method="post">
            <label className="field">
              <span>Correo</span>
              <input className="input" type="email" name="email" placeholder="tu@trabix.com" required />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input className="input" type="password" name="password" placeholder="••••••••" required />
            </label>

            <div className="button-row">
              <button className="button button-primary" type="submit" name="mode" value="login">
                Entrar
              </button>
              <button className="button button-secondary" type="submit" name="mode" value="signup">
                Crear cuenta
              </button>
            </div>

            <p className="auth-footnote">
              El primer usuario registrado queda como admin automático. Después puedes promover o desactivar perfiles
              desde Supabase.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
