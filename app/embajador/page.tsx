import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import type { SaleRow } from "@/src/lib/supabase/types";

function sum(values: Array<number | string | null>) {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

function levelLabel(level: string) {
  const labels: Record<string, string> = {
    nivel0: "Nivel 0",
    plata: "Plata",
    oro: "Oro",
    diamante: "Diamante"
  };

  return labels[level] ?? "Nivel 0";
}

function variantLabel(variant?: string | null) {
  return variant === "withoutAlcohol" ? "Sin licor" : "Con licor";
}

export default async function EmbajadorPage() {
  const auth = await requireAuthContext("embajador");
  const supabase = createSupabaseAdminClient();

  const salesResult = await supabase
    .from("sales")
    .select("*")
    .eq("ambassador_profile_id", auth.userId)
    .eq("sale_type", "wholesale")
    .order("created_at", { ascending: false });

  const sales = (salesResult.data ?? []) as SaleRow[];
  const unitsSold = sum(sales.map((sale) => sale.quantity));
  const grossSold = sum(sales.map((sale) => sale.price_total ?? sale.amount));
  const netSold = sum(sales.map((sale) => sale.amount));
  const commissions = sum(sales.map((sale) => sale.commission_value));
  const clientSavings = sum(sales.map((sale) => sale.wholesale_discount_value));

  const stats = [
    { label: "Ventas asignadas", value: String(sales.length), detail: `${unitsSold} unidades mayoristas` },
    { label: "Total vendido", value: formatCurrency(netSold), detail: `${formatCurrency(grossSold)} antes de descuentos` },
    { label: "Comisiones", value: formatCurrency(commissions), detail: "Acumuladas por ventas asignadas" },
    { label: "Ahorro clientes", value: formatCurrency(clientSavings), detail: "Descuentos generados por tu código" }
  ];

  return (
    <main className="app-shell">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Embajador dashboard</p>
          <h1>{auth.profile.full_name ?? auth.profile.username}</h1>
          <p className="hero-copy">
            Resumen de ventas mayoristas asignadas, comisiones, ahorro para clientes e información de tu perfil.
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
              <p className="eyebrow">Perfil</p>
              <h2>Información básica</h2>
            </div>
          </header>
          <div className="profile-card">
            <div>
              <strong>{auth.profile.full_name ?? auth.profile.username}</strong>
              <p>{auth.profile.phone ?? "Sin teléfono"}</p>
            </div>
            <div>
              <span className="chip">Código {auth.profile.ambassador_id ?? auth.profile.username}</span>
              <span className="chip">{levelLabel(auth.profile.level)}</span>
              <span className="chip">{auth.profile.is_active ? "activo" : "inactivo"}</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Resumen</p>
              <h2>Rendimiento acumulado</h2>
            </div>
          </header>
          <div className="mini-grid">
            <div className="mini-box">
              <span>Ventas netas</span>
              <strong>{formatCurrency(netSold)}</strong>
            </div>
            <div className="mini-box">
              <span>Comisión promedio</span>
              <strong>{netSold > 0 ? `${((commissions / netSold) * 100).toFixed(1)}%` : "0%"}</strong>
            </div>
            <div className="mini-box">
              <span>Unidades</span>
              <strong>{unitsSold}</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="panel-grid panel-grid-wide">
        <section className="panel">
          <header className="section-head">
            <div>
              <p className="eyebrow">Ventas asignadas</p>
              <h2>Detalle mayorista</h2>
            </div>
          </header>
          <div className="table-list">
            {sales.length > 0 ? (
              sales.map((sale) => (
                <div className="table-row" key={sale.id}>
                  <strong>{formatCurrency(sale.amount)}</strong>
                  <span className="table-meta">{sale.quantity} uds · {variantLabel(sale.wholesale_variant)}</span>
                  <span className="table-meta">Comisión {formatCurrency(sale.commission_value)}</span>
                  <span className="table-meta">Ahorro {formatCurrency(sale.wholesale_discount_value)}</span>
                  <span className="table-meta">{formatDate(sale.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="table-row">
                <strong>Sin ventas asignadas</strong>
                <span className="table-meta">Cuando el admin asigne ventas mayoristas a tu código aparecerán aquí.</span>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
