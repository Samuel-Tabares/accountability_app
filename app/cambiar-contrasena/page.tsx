import { redirect } from "next/navigation";
import { dashboardPathForRole, getAuthContext } from "@/src/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/login?error=not_authenticated");
  }

  if (!auth.profile.must_change_password) {
    redirect(dashboardPathForRole(auth.profile.role));
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-login">
        <p className="eyebrow">TRABIX / contraseña temporal</p>
        <h1>Cambia tu contraseña para entrar.</h1>
        <p className="hero-copy">
          La contraseña temporal solo sirve para este primer acceso o para un reset solicitado al admin.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
