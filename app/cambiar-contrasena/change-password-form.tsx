"use client";

import { useState, type FormEvent } from "react";

type ChangePasswordResponse = {
  ok: boolean;
  message: string;
  redirectTo?: string;
};

export function ChangePasswordForm() {
  const [message, setMessage] = useState("Crea una contraseña permanente para continuar.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setIsSubmitting(true);
    setMessage("Actualizando contraseña...");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = (await response.json()) as ChangePasswordResponse;

      if (response.ok && payload.ok && payload.redirectTo) {
        window.location.assign(payload.redirectTo);
        return;
      }

      setMessage(payload.message ?? "No se pudo actualizar la contraseña.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Nueva contraseña</span>
        <input className="input" type="password" name="password" autoComplete="new-password" minLength={6} required />
      </label>
      <label className="field">
        <span>Confirmar contraseña</span>
        <input className="input" type="password" name="confirmation" autoComplete="new-password" minLength={6} required />
      </label>

      <p className="auth-banner" aria-live="polite">
        {message}
      </p>

      <div className="button-row">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </div>

      <p className="auth-footnote">Debe tener mínimo 6 caracteres y al menos una mayúscula.</p>
    </form>
  );
}
