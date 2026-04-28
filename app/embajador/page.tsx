import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { ExpenseRow, SaleRow } from "@/src/lib/supabase/types";

function sum(values: Array<number | string>) {
  return values.reduce<number>((total, value) => total + Number(value), 0);
}

export default async function EmbajadorPage() {
  const auth = await requireAuthContext("embajador");
  const supabase = await createSupabaseServerClient();

  const [salesResult, expensesResult] = await Promise.all([
    supabase.from("sales").select("*").eq("ambassador_profile_id", auth.userId).order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("ambassador_profile_id", auth.userId).order("created_at", { ascending: false })
  ]);

  const sales = (salesResult.data ?? []) as SaleRow[];
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];

  const stats = [
    { label: "Ventas propias", value: String(sales.length), detail: `${formatCurrency(sum(sales.map((sale) => sale.amount)))} en ingresos` },
    { label: "Gastos asociados", value: String(expenses.length), detail: `${formatCurrency(sum(expenses.map((expense) => expense.amount)))} vinculados` },
    { label: "Código", value: auth.profile.ambassador_id ?? "N/A", detail: auth.profile.email },
    { label: "Estado", value: auth.profile.is_active ? "Activo" : "Inactivo", detail: auth.profile.full_name ?? "Sin nombre" }
  ];

  return (
    <main className="app-shell">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Embajador dashboard</p>
          <h1>Panel personal con datos limitados por RLS.</h1>
          <p className="hero-copy">
            Esta vista solo consulta lo que pertenece a tu perfil. El servidor valida la sesión y Supabase bloquea
            cualquier lectura ajena.
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
              <h2>Registrar tu venta</h2>
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
              <p className="eyebrow">Resumen personal</p>
              <h2>Perfil y accesos</h2>
            </div>
          </header>
          <div className="profile-card">
            <div>
              <strong>{auth.profile.full_name ?? auth.email}</strong>
              <p>{auth.profile.email}</p>
            </div>
            <div>
              <span className="chip">{auth.profile.role}</span>
              <span className="chip">{auth.profile.is_active ? "activo" : "inactivo"}</span>
            </div>
          </div>
        </section>
      </section>

      <section className="panel-grid panel-grid-wide">
        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Tus ventas</p>
              <h2>Últimos registros</h2>
            </div>
          </header>
          <div className="table-list">
            {sales.map((sale) => (
              <div className="table-row" key={sale.id}>
                <strong>{formatCurrency(sale.amount)}</strong>
                <span className="table-meta">{sale.quantity} uds</span>
                <span className="table-meta">{sale.note ?? "Sin nota"}</span>
                <span className="table-meta">{formatDate(sale.created_at)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Tus gastos</p>
              <h2>Gastos asociados</h2>
            </div>
          </header>
          <div className="table-list">
            {expenses.map((expense) => (
              <div className="table-row" key={expense.id}>
                <strong>{expense.category}</strong>
                <span className="table-meta">{formatCurrency(expense.amount)}</span>
                <span className="table-meta">{expense.description}</span>
                <span className="table-meta">{formatDate(expense.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
