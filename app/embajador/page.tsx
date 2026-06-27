import type { CSSProperties } from "react";
import { LogOut } from "lucide-react";
import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { requireAuthContext } from "@/src/lib/auth";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import {
  currentCycleUnits,
  cycleHistory,
  cycleInfo,
  levelProgress
} from "@/src/lib/levels";
import type { ProfileRow, SaleRow } from "@/src/lib/supabase/types";

function sum(values: Array<number | string | null>) {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

function variantLabel(variant?: string | null) {
  return variant === "withoutAlcohol" ? "Sin licor" : "Con licor";
}

function formatPct(value: number | string | null) {
  const raw = Number(value ?? 0);
  const pct = raw <= 1 ? raw * 100 : raw;
  return `${Math.round(pct * 10) / 10}%`;
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

  const payoutsResult = await supabase
    .from("ambassador_payouts")
    .select("cycle_index, base_salary, free_units, level")
    .eq("ambassador_profile_id", auth.userId);
  const payoutRows = payoutsResult.data ?? [];
  const paidByIndex = new Map<number, { baseSalary: number }>();
  for (const row of payoutRows) {
    paidByIndex.set(Number(row.cycle_index), { baseSalary: Number(row.base_salary) });
  }
  const lifetimeBaseSalary = sum(payoutRows.map((row) => row.base_salary));
  const lifetimeFreeUnits = sum(payoutRows.map((row) => row.free_units));

  const unitsSold = sum(sales.map((sale) => sale.quantity));
  const grossSold = sum(sales.map((sale) => sale.price_total ?? sale.amount));
  const netSold = sum(sales.map((sale) => sale.amount));
  const commissions = sum(sales.map((sale) => sale.commission_value));
  const clientSavings = sum(sales.map((sale) => sale.wholesale_discount_value));
  const commissionAverage = netSold > 0 ? `${((commissions / netSold) * 100).toFixed(1)}%` : "0%";
  const code = auth.profile.ambassador_id ?? auth.profile.username;
  const displayName = auth.profile.full_name ?? auth.profile.username;
  const activeBoost = boostIsActive(auth.profile);

  const now = new Date();
  const anchor = new Date(auth.profile.created_at);
  const cycle = cycleInfo(anchor, now);
  const cycleUnits = currentCycleUnits(sales, anchor, now);
  const progress = levelProgress(cycleUnits);
  const badge = progress.current.badge;

  const cycleSales = sales.filter((sale) => {
    const ts = new Date(sale.created_at).getTime();
    return ts >= cycle.start.getTime() && ts < cycle.end.getTime();
  });
  const monthCommissions = sum(cycleSales.map((sale) => sale.commission_value));
  const monthUnits = sum(cycleSales.map((sale) => sale.quantity));
  const recap = cycleHistory(sales, anchor);

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
            <div className="embajador-meta-row">
              <div className="embajador-code">
                <span>Código</span>
                <strong>{code}</strong>
              </div>
              <div className="embajador-code embajador-since">
                <span>Embajador desde</span>
                <strong>{formatDate(auth.profile.created_at)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="embajador-profile-line">
          <span className="chip">{progress.current.badge.emoji} {progress.current.label}</span>
          <span className="chip">{auth.profile.phone ?? "Sin teléfono"}</span>
        </div>
      </section>

      <section
        className="embajador-level"
        style={{ "--level-accent": badge.accent, "--level-glow": badge.glow } as CSSProperties}
      >
        <div className="embajador-level-head">
          <div className="embajador-level-badge" aria-hidden="true">
            <span>{badge.emoji}</span>
          </div>
          <div className="embajador-level-title">
            <p className="eyebrow">Tu nivel · ciclo {cycle.label}</p>
            <strong>{progress.current.label}</strong>
            <span>{cycleUnits} unidades este ciclo</span>
          </div>
          {progress.current.baseSalary > 0 ? (
            <div className="embajador-level-perk">
              <span>Sueldo base</span>
              <strong>{formatCurrency(progress.current.baseSalary)}</strong>
            </div>
          ) : null}
        </div>

        <div className="embajador-progress">
          <div className="embajador-progress-bar">
            <div className="embajador-progress-fill" style={{ width: `${Math.round(progress.pct * 100)}%` }} />
          </div>
          <p className="embajador-progress-copy">
            {progress.next
              ? `Te faltan ${progress.unitsToNext} unidades para ${progress.next.label} ${progress.next.badge.emoji}`
              : "¡Nivel máximo del ciclo alcanzado! 🚀"}
          </p>
        </div>

        <div className="embajador-cycle-meta">
          <span className="chip embajador-cycle-days">
            ⏳ {cycle.daysRemaining > 0
              ? `${cycle.daysRemaining} días para cerrar el ciclo`
              : "Último día del ciclo"}
          </span>
        </div>

        <div className="embajador-level-perks">
          {progress.current.freeUnits > 0 ? (
            <span className="chip">🎁 {progress.current.freeUnits} granizados gratis al cierre</span>
          ) : null}
          {progress.current.storiesQuota > 0 ? (
            <span className="chip">📲 {progress.current.storiesQuota} stories/mes</span>
          ) : null}
          {progress.next ? (
            <span className="chip">
              ➡️ {progress.next.label}: {progress.next.minUnits} uds · {formatCurrency(progress.next.baseSalary)} base
            </span>
          ) : null}
        </div>
      </section>

      {cycle.payoutWindow && progress.current.baseSalary > 0 ? (
        <section className="embajador-payout">
          <div className="embajador-payout-glow" aria-hidden="true" />
          <header className="embajador-payout-head">
            <span className="embajador-payout-badge">🎉 Recta final</span>
            <span className="embajador-payout-countdown">
              {cycle.daysRemaining > 0 ? `${cycle.daysRemaining} días restantes` : "¡Último día!"}
            </span>
          </header>
          <strong className="embajador-payout-title">Ya puedes reclamar tus recompensas</strong>
          <div className="embajador-payout-rewards">
            <div className="embajador-payout-reward">
              <span>🎁 Granizados</span>
              <strong>{progress.current.freeUnits}</strong>
            </div>
            <div className="embajador-payout-reward">
              <span>💵 Sueldo base</span>
              <strong>{formatCurrency(progress.current.baseSalary)}</strong>
            </div>
            <div className="embajador-payout-reward">
              <span>📈 Comisiones</span>
              <strong>{formatCurrency(monthCommissions)}</strong>
            </div>
          </div>
          <p className="embajador-payout-cta">Escríbele al admin para reclamarlas antes de que cierre tu ciclo.</p>
        </section>
      ) : null}

      <section className="embajador-recap">
        <header className="section-head embajador-section-head">
          <div>
            <p className="eyebrow">Este ciclo · {cycle.label}</p>
            <h2>Tu recap actual</h2>
          </div>
        </header>
        <div className="embajador-recap-grid">
          <div className="embajador-recap-card embajador-recap-featured">
            <span>Ganancia del mes</span>
            <strong>{formatCurrency(monthCommissions + progress.current.baseSalary)}</strong>
            <small>Comisiones + sueldo base estimado</small>
          </div>
          <div className="embajador-recap-card">
            <span>Comisiones</span>
            <strong>{formatCurrency(monthCommissions)}</strong>
            <small>{monthUnits} unidades vendidas</small>
          </div>
          <div className="embajador-recap-card">
            <span>Sueldo base</span>
            <strong>{formatCurrency(progress.current.baseSalary)}</strong>
            <small>Nivel {progress.current.label}</small>
          </div>
        </div>
      </section>

      <section className="embajador-lifetime">
        <div className="embajador-lifetime-glow" aria-hidden="true" />
        <div className="embajador-lifetime-head">
          <p className="eyebrow">Desde que ingresaste · {formatDate(auth.profile.created_at)}</p>
          <strong className="embajador-lifetime-total">{formatCurrency(commissions + lifetimeBaseSalary)}</strong>
          <span>Total que has generado con Trabix</span>
        </div>
        <div className="embajador-lifetime-stats">
          <div>
            <span>📈 Comisiones</span>
            <strong>{formatCurrency(commissions)}</strong>
          </div>
          <div>
            <span>💵 Sueldos base</span>
            <strong>{formatCurrency(lifetimeBaseSalary)}</strong>
          </div>
          <div>
            <span>🥤 Unidades vendidas</span>
            <strong>{unitsSold}</strong>
          </div>
          <div>
            <span>🎁 Granizados gratis</span>
            <strong>{lifetimeFreeUnits}</strong>
          </div>
        </div>
      </section>

      {recap.length > 0 ? (
        <section className="panel embajador-panel">
          <header className="section-head embajador-section-head">
            <div>
              <p className="eyebrow">Historial</p>
              <h2>Lo que has generado ciclo a ciclo</h2>
              <p className="section-description">
                Comisiones reales más el sueldo base de cada ciclo. "Liquidado" significa que el admin ya
                te pagó ese sueldo base.
              </p>
            </div>
          </header>
          <div className="embajador-history-list">
            {recap.map((row) => {
              const paid = paidByIndex.get(row.index);
              return (
                <article className="embajador-history-row" key={row.index}>
                  <div className="embajador-history-month">
                    <strong>{row.label}</strong>
                    <span>
                      {row.level.badge.emoji} {row.level.label} · {row.units} uds
                    </span>
                  </div>
                  <div className="embajador-history-amounts">
                    <span>Comisión {formatCurrency(row.commissions)}</span>
                    {row.baseSalary > 0 ? <span>Base {formatCurrency(row.baseSalary)}</span> : null}
                    {row.freeUnits > 0 ? <span>🎁 {row.freeUnits}</span> : null}
                    {row.baseSalary > 0 ? (
                      <span className={paid ? "embajador-paid-tag" : "embajador-pending-tag"}>
                        {paid ? "✓ Liquidado" : "Pendiente"}
                      </span>
                    ) : null}
                    <strong>{formatCurrency(row.total)}</strong>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

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
            sales.map((sale) => {
              const baseRate = Number(sale.wholesale_base_commission_pct ?? 0);
              const boostRate = Number(sale.wholesale_boost_bonus_pct ?? 0);
              const totalRate = Number(sale.commission_rate ?? baseRate + boostRate);
              const hasBoost = boostRate > 0;
              return (
                <article className={`embajador-sale-card ${hasBoost ? "embajador-sale-boost" : ""}`} key={sale.id}>
                  <div className="embajador-sale-top">
                    <div>
                      <strong>{formatCurrency(sale.price_total ?? sale.amount)}</strong>
                      <span>{formatDate(sale.created_at)}</span>
                    </div>
                    <div className="embajador-sale-tags">
                      {hasBoost ? <span className="embajador-boost-tag">⚡ Boost</span> : null}
                      <span className="chip">{sale.quantity} uds</span>
                    </div>
                  </div>
                  <p>
                    Después de descuentos: {formatCurrency(sale.amount)} · {variantLabel(sale.wholesale_variant)}
                  </p>
                  <div className="embajador-sale-pills">
                    <span className="embajador-rate-pill">
                      {formatPct(totalRate)} comisión
                      {hasBoost ? ` · ${formatPct(baseRate)} + ${formatPct(boostRate)} boost` : ""}
                    </span>
                    <span>Comisión {formatCurrency(sale.commission_value)}</span>
                    <span>Ahorro {formatCurrency(sale.wholesale_discount_value)}</span>
                  </div>
                </article>
              );
            })
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
