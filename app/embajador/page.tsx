import { LogOut } from "lucide-react";
import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import type { ProfileRow, SaleRow } from "@/src/lib/supabase/types";

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

function boostIsActive(profile: Pick<ProfileRow, "boost_active" | "boost_expires_at">) {
  if (!profile.boost_active) return false;
  if (!profile.boost_expires_at) return true;
  return new Date(profile.boost_expires_at).getTime() > Date.now();
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
  const commissionAverage = netSold > 0 ? `${((commissions / netSold) * 100).toFixed(1)}%` : "0%";
  const code = auth.profile.ambassador_id ?? auth.profile.username;
  const displayName = auth.profile.full_name ?? auth.profile.username;
  const activeBoost = boostIsActive(auth.profile);

  const stats = [
    { label: "Comisión acumulada", value: formatCurrency(commissions), detail: `${commissionAverage} sobre ventas reales`, featured: true },
    { label: "Ventas asignadas", value: String(sales.length), detail: `${unitsSold} unidades mayoristas` },
    { label: "Total vendido", value: formatCurrency(grossSold), detail: `${formatCurrency(netSold)} después de descuentos` },
    { label: "Ahorro clientes", value: formatCurrency(clientSavings), detail: "Descuentos generados por tu código" }
  ];

  return (
    <main className="embajador-shell">
      <section className="embajador-hero">
        <form action="/api/auth/logout" method="post" className="embajador-logout-form">
          <button className="embajador-logout" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={20} />
          </button>
        </form>
        <div className="embajador-name-badge">
          <span>Embajador</span>
          <strong>{displayName}</strong>
        </div>
        <div className="embajador-hero-main">
          <div className="embajador-hero-copy">
            <img className="embajador-logo" src="/site-assets/brand/logo-trabix.png" alt="TRABIX Granizados" />
            <p className="eyebrow">Panel embajador</p>
            <p className="hero-copy">
              Tus ventas mayoristas asignadas, comisiones acumuladas y ahorro generado por tu código.
            </p>
            <div className="embajador-code">
              <span>Código</span>
              <strong>{code}</strong>
            </div>
          </div>
        </div>

        <div className="embajador-profile-line">
          <span className="chip">{levelLabel(auth.profile.level)}</span>
          <span className="chip">{auth.profile.phone ?? "Sin teléfono"}</span>
        </div>
      </section>

      <section className={`embajador-boost ${activeBoost ? "embajador-boost-active" : ""}`}>
        <div>
          <p className="eyebrow">Boost de comisión</p>
          <strong>{activeBoost ? "Boost activo" : "Boost inactivo"}</strong>
        </div>
        <p>
          {activeBoost
            ? `Activo${auth.profile.boost_expires_at ? ` hasta ${formatDate(auth.profile.boost_expires_at)}` : ""}. Tus ventas mayoristas suman un extra temporal en tus comisiones.`
            : "Cuando esté activo, verás un extra temporal en tus comisiones mayoristas."}
        </p>
      </section>

      <section className="embajador-stats" aria-label="Resumen de rendimiento">
        {stats.map((stat) => (
          <article className={`embajador-stat ${stat.featured ? "embajador-stat-featured" : ""}`} key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.detail}</span>
          </article>
        ))}
      </section>

      <section className="panel embajador-panel">
        <header className="section-head embajador-section-head">
          <div>
            <p className="eyebrow">Ventas asignadas</p>
            <h2>Detalle mayorista</h2>
            <p className="section-description">
              Cada venta muestra el total real, la base antes de descuento, tu comisión y el ahorro del cliente.
            </p>
          </div>
          <span className="chip">{unitsSold} unidades</span>
        </header>

        <div className="embajador-sales-list">
          {sales.length > 0 ? (
            sales.map((sale) => (
              <article className="embajador-sale-card" key={sale.id}>
                <div className="embajador-sale-top">
                  <div>
                    <strong>{formatCurrency(sale.price_total ?? sale.amount)}</strong>
                    <span>{formatDate(sale.created_at)}</span>
                  </div>
                  <span className="chip">{sale.quantity} uds</span>
                </div>
                <p>
                  Después de descuentos: {formatCurrency(sale.amount)} · {variantLabel(sale.wholesale_variant)}
                </p>
                <div className="embajador-sale-pills">
                  <span>Comisión {formatCurrency(sale.commission_value)}</span>
                  <span>Ahorro {formatCurrency(sale.wholesale_discount_value)}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="embajador-empty">
              <strong>Sin ventas asignadas</strong>
              <p>Cuando haya ventas mayoristas asignadas a tu código aparecerán aquí.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
