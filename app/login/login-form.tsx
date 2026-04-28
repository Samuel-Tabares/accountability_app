"use client";

import { useState, type FormEvent } from "react";

type Props = {
  initialMessage: string;
};

type LoginResponse =
  | {
      ok: true;
      redirectTo: string;
      message?: string;
    }
  | {
      ok: false;
      message: string;
      retryAfterSeconds?: number;
    };

export function LoginForm({ initialMessage }: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value === "signup" ? "signup" : "login";
    const formData = new FormData(event.currentTarget);
    formData.set("mode", mode);

    setIsSubmitting(true);
    setMessage("Procesando credenciales...");

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json"
        }
      });

      const payload = (await response.json()) as LoginResponse;

      if (response.ok && payload.ok) {
        window.location.assign(payload.redirectTo);
        return;
      }

      setMessage(payload.message ?? "No se pudo completar la solicitud.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" action="/api/auth/session" method="post" onSubmit={handleSubmit}>
      <label className="field">
        <span>Correo</span>
        <input className="input" type="email" name="email" placeholder="tu@trabix.com" required />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input className="input" type="password" name="password" placeholder="••••••••" required />
      </label>

      <p className="auth-banner" aria-live="polite">
        {message}
      </p>

      <div className="button-row">
        <button className="button button-primary" type="submit" name="mode" value="login" disabled={isSubmitting}>
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
        <button className="button button-secondary" type="submit" name="mode" value="signup" disabled={isSubmitting}>
          {isSubmitting ? "Procesando..." : "Crear cuenta"}
        </button>
      </div>

      <p className="auth-footnote">
        El primer usuario registrado queda como admin automático. Después puedes promover o desactivar perfiles desde Supabase.
      </p>
    </form>
  );
}
