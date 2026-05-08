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
        <img className="auth-logo" src="/site-assets/brand/logo-trabix.png" alt="TRABIX Granizados" />
        <p className="auth-tagline">cambio de contraseña</p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
