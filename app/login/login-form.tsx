"use client";

import { useState, type FormEvent } from "react";

type Props = {
  initialMessage?: string;
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

    const formData = new FormData(event.currentTarget);

    setIsSubmitting(true);
    setMessage("Validando usuario...");

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        body: formData,
        credentials: "include",
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
        <span>Código o usuario</span>
        <input className="input" type="text" name="identifier" placeholder="samuel o emb-001" autoComplete="username" required />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input className="input" type="password" name="password" placeholder="••••••••" autoComplete="current-password" required />
      </label>

      {message ? (
        <p className="auth-banner" aria-live="polite">
          {message}
        </p>
      ) : null}

      <div className="button-row">
        <button className="button button-primary" type="submit" name="mode" value="login" disabled={isSubmitting}>
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </form>
  );
}
