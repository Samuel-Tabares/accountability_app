import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { ExpenseRow, ProfileRow, SaleRow } from "@/src/lib/supabase/types";
import { redirect } from "next/navigation";

function sum(values: Array<number | string>) {
  return values.reduce<number>((total, value) => total + Number(value), 0);
}

function adminMessage(error?: string, notice?: string) {
  if (error === "not_authenticated") return "Inicia sesión para continuar.";
  if (error === "not_authorized") return "No tienes permisos para esa acción.";
  if (error === "profile_failed") return "No se pudo actualizar el embajador.";
  if (error === "invalid_embajador") return "Revisa el username, código y contraseña.";
  if (error === "embajador_failed") return "No se pudo crear el embajador.";
  if (error === "missing_profile") return "Selecciona un perfil válido.";
  if (notice === "embajador_created") return "Embajador creado correctamente.";
  return "";
}

type Props = {
  searchParams?: {
    error?: string;
    notice?: string;
  };
};

export default async function AdminPage({ searchParams }: Props) {
  const auth = await requireAuthContext("admin");
  const supabase = await createSupabaseServerClient();

  const [profilesResult, salesResult, expensesResult] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").order("created_at", { ascending: false })
  ]);

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];

  if (profilesResult.error || salesResult.error || expensesResult.error) {
    redirect("/login?error=profile_missing");
  }

  const activeAmbassadors = profiles.filter((profile) => profile.role === "embajador" && profile.is_active);
  const embajadores = profiles.filter((profile) => profile.role === "embajador");
  const stats = [
    { label: "Ventas", value: String(sales.length), detail: `${formatCurrency(sum(sales.map((sale) => sale.amount)))} en ingresos` },
    { label: "Gastos", value: String(expenses.length), detail: `${formatCurrency(sum(expenses.map((expense) => expense.amount)))} registrados` },
    { label: "Embajadores activos", value: String(activeAmbassadors.length), detail: "Perfiles con acceso a /embajador" },
    { label: "Perfil admin", value: auth.profile.full_name ?? auth.profile.username, detail: auth.profile.username }
  ];
  const notice = adminMessage(searchParams?.error, searchParams?.notice);

  return (
    <main className="app-shell">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Operación central con acceso total.</h1>
          <p className="hero-copy">
            Esta vista consulta Supabase directamente desde el servidor y deja la autorización en RLS, no en el
            navegador.
          </p>
          {notice ? <p className="auth-banner">{notice}</p> : null}
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="button button-ghost" type="submit">
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="stat-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.detail}</span>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Nuevo embajador</p>
              <h2>Crear acceso y perfil</h2>
            </div>
          </header>
          <form className="stack-form" action="/api/embajadores" method="post">
            <label className="field">
              <span>Username</span>
              <input className="input" type="text" name="username" placeholder="samuel" autoComplete="off" required />
            </label>
            <label className="field">
              <span>Código de embajador</span>
              <input className="input" type="text" name="code" placeholder="samuel" autoComplete="off" required />
            </label>
            <label className="field">
              <span>Nombre completo</span>
              <input className="input" type="text" name="full_name" placeholder="Samuel Tabares" autoComplete="name" required />
            </label>
            <label className="field">
              <span>Teléfono</span>
              <input className="input" type="tel" name="phone" placeholder="+57 300 000 0000" autoComplete="tel" required />
            </label>
            <label className="field">
              <span>Contraseña inicial</span>
              <input className="input" type="password" name="password" placeholder="••••••••" autoComplete="new-password" required />
            </label>
            <p className="auth-footnote">El username y el código deben coincidir. El correo interno se crea de forma automática.</p>
            <button className="button button-primary" type="submit">
              Crear embajador
            </button>
          </form>
        </section>

        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Nueva venta</p>
              <h2>Registrar movimiento</h2>
            </div>
          </header>
          <form className="stack-form" action="/api/sales" method="post">
            <label className="field">
              <span>Monto</span>
              <input className="input" type="number" min="0" step="1" name="amount" required />
            </label>
            <label className="field">
              <span>Cantidad</span>
              <input className="input" type="number" min="1" step="1" name="quantity" defaultValue="1" required />
            </label>
            <label className="field">
              <span>Embajador</span>
              <select className="input" name="ambassador_profile_id" defaultValue="">
                <option value="">Usar admin actual</option>
                {activeAmbassadors.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name ?? profile.username} {profile.ambassador_id ? `· ${profile.ambassador_id}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nota</span>
              <textarea className="input input-textarea" name="note" rows={3} />
            </label>
            <button className="button button-primary" type="submit">
              Guardar venta
            </button>
          </form>
        </section>

        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Nuevo gasto</p>
              <h2>Registrar gasto operativo</h2>
            </div>
          </header>
          <form className="stack-form" action="/api/expenses" method="post">
            <label className="field">
              <span>Categoría</span>
              <input className="input" type="text" name="category" placeholder="logistica" required />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="input" name="expense_type" defaultValue="monthly">
                <option value="monthly">Mensual</option>
                <option value="oneTime">Único</option>
                <option value="commission">Comisión</option>
                <option value="discount">Descuento</option>
              </select>
            </label>
            <label className="field">
              <span>Embajador relacionado</span>
              <select className="input" name="ambassador_profile_id" defaultValue="">
                <option value="">Sin relación</option>
                {activeAmbassadors.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name ?? profile.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Descripción</span>
              <textarea className="input input-textarea" name="description" rows={3} required />
            </label>
            <label className="field">
              <span>Monto</span>
              <input className="input" type="number" min="0" step="1" name="amount" required />
            </label>
            <button className="button button-secondary" type="submit">
              Guardar gasto
            </button>
          </form>
        </section>
      </section>

      <section className="panel-grid panel-grid-wide">
        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Embajadores</p>
              <h2>Administrar perfil y estado</h2>
            </div>
          </header>
          <div className="table-list">
            {embajadores.map((profile) => (
              <form className="table-row table-form" action="/api/profiles" method="post" key={profile.id}>
                <input type="hidden" name="profile_id" value={profile.id} />
                <label className="mini-field">
                  <span>Nombre</span>
                  <input className="input input-small" name="full_name" defaultValue={profile.full_name ?? ""} />
                </label>
                <label className="mini-field">
                  <span>Teléfono</span>
                  <input className="input input-small" name="phone" defaultValue={profile.phone ?? ""} />
                </label>
                <label className="mini-field">
                  <span>Código</span>
                  <input className="input input-small" defaultValue={profile.ambassador_id ?? profile.username} disabled />
                </label>
                <label className="mini-field">
                  <span>Activo</span>
                  <select className="input input-small" name="is_active" defaultValue={String(profile.is_active)}>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <span className="table-meta">{profile.username}</span>
                <span className="table-meta">{formatDate(profile.created_at)}</span>
                <button className="button button-ghost button-small" type="submit">
                  Guardar
                </button>
              </form>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Actividad</p>
              <h2>Últimos movimientos</h2>
            </div>
          </header>
          <div className="table-list">
            {sales.slice(0, 8).map((sale) => {
              const ambassador = profiles.find((profile) => profile.id === sale.ambassador_profile_id);
              return (
                <div className="table-row" key={sale.id}>
                  <strong>{formatCurrency(sale.amount)}</strong>
                  <span className="table-meta">{sale.quantity} uds</span>
                  <span className="table-meta">{ambassador?.full_name ?? ambassador?.username ?? "Sin embajador"}</span>
                  <span className="table-meta">{formatDate(sale.created_at)}</span>
                </div>
              );
            })}
            {expenses.slice(0, 8).map((expense) => {
              const ambassador = profiles.find((profile) => profile.id === expense.ambassador_profile_id);
              return (
                <div className="table-row" key={expense.id}>
                  <strong>{expense.category}</strong>
                  <span className="table-meta">{formatCurrency(expense.amount)}</span>
                  <span className="table-meta">{ambassador?.full_name ?? "General"}</span>
                  <span className="table-meta">{formatDate(expense.created_at)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
