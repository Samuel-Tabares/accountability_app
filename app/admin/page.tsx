import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { ExpenseRow, ProfileRow, SaleRow } from "@/src/lib/supabase/types";
import { redirect } from "next/navigation";

function sum(values: Array<number | string>) {
  return values.reduce<number>((total, value) => total + Number(value), 0);
}

export default async function AdminPage() {
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
  const stats = [
    { label: "Ventas", value: String(sales.length), detail: `${formatCurrency(sum(sales.map((sale) => sale.amount)))} en ingresos` },
    { label: "Gastos", value: String(expenses.length), detail: `${formatCurrency(sum(expenses.map((expense) => expense.amount)))} registrados` },
    { label: "Embajadores activos", value: String(activeAmbassadors.length), detail: "Perfiles con acceso a /embajador" },
    { label: "Perfil admin", value: auth.profile.full_name ?? auth.email, detail: auth.profile.email }
  ];

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
                    {profile.full_name ?? profile.email} {profile.ambassador_id ? `· ${profile.ambassador_id}` : ""}
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
                    {profile.full_name ?? profile.email}
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
              <p className="eyebrow">Perfiles</p>
              <h2>Administrar roles y estado</h2>
            </div>
          </header>
          <div className="table-list">
            {profiles.map((profile) => (
              <form className="table-row table-form" action="/api/profiles" method="post" key={profile.id}>
                <input type="hidden" name="profile_id" value={profile.id} />
                <label className="mini-field">
                  <span>Nombre</span>
                  <input className="input input-small" name="full_name" defaultValue={profile.full_name ?? ""} />
                </label>
                <label className="mini-field">
                  <span>Rol</span>
                  <select className="input input-small" name="role" defaultValue={profile.role}>
                    <option value="admin">Admin</option>
                    <option value="embajador">Embajador</option>
                  </select>
                </label>
                <label className="mini-field">
                  <span>Código</span>
                  <input className="input input-small" name="ambassador_id" defaultValue={profile.ambassador_id ?? ""} />
                </label>
                <label className="mini-field">
                  <span>Activo</span>
                  <select className="input input-small" name="is_active" defaultValue={String(profile.is_active)}>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <span className="table-meta">{profile.email}</span>
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
                  <span className="table-meta">{ambassador?.full_name ?? ambassador?.email ?? "Sin embajador"}</span>
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
