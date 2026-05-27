"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import type { Sale } from "@/src/lib/types";

export type DashboardUser = {
  id: string;
  name: string;
  username: string;
  role: "admin";
};

export function Section({
  eyebrow,
  title,
  description,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="section-description">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  subtext,
  accent
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext: string;
  accent?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${accent ?? ""}`}>{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{subtext}</p>
    </article>
  );
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button button-${variant}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </button>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />;
}

export function displayNumber(value: number) {
  return value === 0 ? "" : String(value);
}

export function parseNumber(value: string) {
  if (value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function saleRealTotal(sale: Pick<Sale, "priceTotal" | "wholesaleNetTotal">) {
  return sale.wholesaleNetTotal ?? sale.priceTotal;
}

export async function postForm(
  path: string,
  fields: Record<string, string | number | boolean | null | undefined>
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      formData.set(key, String(value));
    }
  }

  const response = await fetch(path, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: { Accept: "application/json" }
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Redirect-style handlers may not always return JSON.
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "No se pudo guardar el cambio.";
    throw new Error(message);
  }

  return payload;
}
