"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FilterBar, PageHeader, SectionHeader, StatusStamp, type FilterOption } from "../_components/gazette";

/**
 * CAMPAIGN MANAGER — "what offers are active, what are they doing, and how
 * are they performing?" Cards lead with status, then the agent-readable
 * rule, then performance evidence; delete is destructive and asks twice.
 */

type CampaignKind = "bundle" | "flash_sale" | "cross_sell";

type Campaign = {
  id: string;
  name: string;
  description: string;
  kind: CampaignKind;
  config: Record<string, unknown>;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  stats: { times_applied: number; total_discount: number };
};

type NewCampaign = {
  name: string;
  description: string;
  kind: CampaignKind;
  config: Record<string, unknown>;
  starts_at: string;
  ends_at: string;
};

type Filter = "all" | "active" | "upcoming" | "expired" | "disabled";

const KIND_LABELS: Record<CampaignKind, string> = {
  bundle: "Bundle Deal",
  flash_sale: "Flash Sale",
  cross_sell: "Cross-Sell",
};

/** Money always carries its paise: ₹300 or ₹3,161.70 — never ₹3,161.7. */
const rupees = (paise: number) => {
  const v = paise / 100;
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const inDays = (d: number) =>
  new Date(Date.now() + d * 86400000).toISOString();
const inMinutes = (m: number) =>
  new Date(Date.now() + m * 60000).toISOString();

type Status = "active" | "expired" | "upcoming" | "disabled";

function campaignStatus(c: Campaign): Status {
  if (!c.enabled) return "disabled";
  const now = new Date().toISOString();
  if (now < c.starts_at) return "upcoming";
  if (now > c.ends_at) return "expired";
  return "active";
}

/** The agent-readable rule — the same sentence the agent reasons over. */
function agentRule(c: Campaign): string {
  const cfg = c.config as Record<string, unknown>;
  const n = (k: string) => Number(cfg[k] ?? 0);
  const arr = (k: string) => (Array.isArray(cfg[k]) ? (cfg[k] as string[]).join(", ") : "—");
  switch (c.kind) {
    case "bundle":
      return `IF the cart contains ${n("min_items") || 2}+ items from ${arr("categories")}, THEN ${n("discount_percent")}% comes off those items.`;
    case "flash_sale":
      return `IF a cart line is ${arr("skus")}, THEN its price drops to ${rupees(n("sale_price_paise"))}.`;
    case "cross_sell":
      return `IF the cart spans ${n("min_categories") || 2}+ categories, THEN ${n("discount_percent")}% comes off the cheapest eligible item.`;
  }
}

const STATUS_STAMP: Record<Status, { state: "ok" | "info" | "neutral"; label: string }> = {
  active: { state: "ok", label: "active" },
  upcoming: { state: "info", label: "scheduled" },
  expired: { state: "neutral", label: "expired" },
  disabled: { state: "neutral", label: "disabled" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns?all=1");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function toggleEnabled(id: string, current: boolean) {
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !current }),
    });
    load();
  }

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Its recorded applications stay in the audit trail, but the campaign itself cannot be recovered.`)) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  const counts = { all: campaigns.length, active: 0, upcoming: 0, expired: 0, disabled: 0 };
  for (const c of campaigns) counts[campaignStatus(c)]++;

  const visible = campaigns.filter((c) => filter === "all" || campaignStatus(c) === filter);

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "active", label: "Active", count: counts.active },
    { value: "upcoming", label: "Scheduled", count: counts.upcoming },
    { value: "expired", label: "Expired", count: counts.expired },
    { value: "disabled", label: "Disabled", count: counts.disabled },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 min-h-screen">
      <PageHeader title="Campaign Manager" kicker="what offers are active, and what they do" />

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <FilterBar options={options} value={filter} onChange={setFilter} ariaLabel="Filter campaigns" />
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
          }}
          className="press border-[1.5px] border-(--ink) bg-(--ink) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--ink-soft)"
        >
          {showForm ? "Close form" : "+ New campaign"}
        </button>
      </div>

      {/* ── Create/Edit Form ───────────────────────────────────── */}
      {showForm && (
        <CampaignForm
          editing={editing ? (campaigns.find((c) => c.id === editing) ?? null) : null}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {/* ── Campaign List ──────────────────────────────────────── */}
      <section className="mt-6" aria-label="Campaigns">
        <SectionHeader title="The Ledger of Offers" kicker={`${visible.length} shown`} />
        <div className="security-thread-band mt-2" aria-hidden="true" />

        {loading ? (
          <p className="mt-4 font-clause text-xs text-(--ink-soft)">Loading campaigns…</p>
        ) : visible.length === 0 ? (
          <div className="mt-3 border-[1.5px] border-dashed border-(--ink-soft) bg-(--paper-deep) p-8 text-center">
            <div className="flex justify-center"><StatusStamp state="neutral">none here</StatusStamp></div>
            <p className="mt-3 font-body text-[13px] text-(--ink-soft)">
              No campaigns in this drawer. Create one to offer bundle discounts, flash sales,
              or cross-sell deals to AI shoppers.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {visible.map((c) => {
              const status = campaignStatus(c);
              const stamp = STATUS_STAMP[status];
              const used = c.stats.times_applied > 0;
              return (
                <article
                  key={c.id}
                  className={`border-[1.5px] bg-(--paper-deep) p-4 ${
                    status === "active"
                      ? "border-l-[3px] border-l-(--ok) border-(--ink)"
                      : "border-(--paper-edge) opacity-90"
                  }`}
                >
                  {/* Status + name + type */}
                  <div className="flex flex-wrap items-baseline gap-2">
                    <StatusStamp state={stamp.state}>{stamp.label}</StatusStamp>
                    <h3 className="font-masthead text-[15px] font-bold uppercase tracking-[0.06em] text-(--ink)">
                      {c.name}
                    </h3>
                    <span className="font-clause text-[11px] uppercase tracking-wider text-(--ink-soft)">
                      {KIND_LABELS[c.kind]}
                    </span>
                  </div>

                  {/* The agent-readable rule */}
                  <div className="mt-2 border border-(--paper-edge) bg-(--paper) px-3 py-2">
                    <p className="font-clause text-[11px] font-bold uppercase tracking-[0.14em] text-(--ink-soft)">
                      Agent rule
                    </p>
                    <p className="font-body mt-0.5 text-[13px] text-(--ink)">
                      {agentRule(c)}
                    </p>
                  </div>

                  {/* Performance — the evidence */}
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    {used ? (
                      <>
                        <div>
                          <div className="digits text-xl text-(--ink)">{c.stats.times_applied}</div>
                          <div className="fig">applications</div>
                        </div>
                        <div>
                          <div className="digits text-xl text-(--ok-ink)">{rupees(c.stats.total_discount)}</div>
                          <div className="fig">discount given</div>
                        </div>
                        <Link
                          href={`/receipts?campaign=${c.id}`}
                          className="press min-h-6 self-center border-b border-(--rule-blue) font-clause text-[11px] font-bold uppercase tracking-wider text-(--rule-blue) hover:text-(--ink)"
                        >
                          view the receipts →
                        </Link>
                      </>
                    ) : (
                      <p className="fig">
                        <span className="pointer" aria-hidden="true" />
                        not yet applied — the first qualifying cart will record here
                      </p>
                    )}
                    <p className="fig ml-auto">
                      <span className="pointer" aria-hidden="true" />
                      {new Date(c.starts_at).toLocaleDateString("en-IN")} → {new Date(c.ends_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>

                  {/* Actions — edit and toggle first; delete is destructive and last */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--paper-edge) pt-3">
                    <button
                      onClick={() => {
                        setEditing(c.id);
                        setShowForm(true);
                      }}
                      className="press border-[1.5px] border-(--ink) bg-transparent px-3 py-1.5 font-clause text-[11px] font-bold uppercase tracking-wider text-(--ink) hover:bg-(--ink) hover:text-(--paper)"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleEnabled(c.id, c.enabled)}
                      className={`press border-[1.5px] px-3 py-1.5 font-clause text-[11px] font-bold uppercase tracking-wider ${
                        c.enabled
                          ? "border-(--paper-edge) bg-transparent text-(--ink-soft) hover:border-(--ink) hover:text-(--ink)"
                          : "border-(--ok) bg-transparent text-(--ok-ink) hover:bg-(--ok-bg)"
                      }`}
                    >
                      {c.enabled ? "Disable" : "Restore"}
                    </button>
                    <button
                      onClick={() => deleteCampaign(c.id, c.name)}
                      className="press ml-auto border border-(--bad)/40 bg-transparent px-3 py-1.5 font-clause text-[11px] font-bold uppercase tracking-wider text-(--bad-ink)/70 hover:border-(--bad) hover:text-(--bad-ink)"
                    >
                      Delete…
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Campaign discounts are auto-applied at checkout and recorded in the audit trail.
        </p>
      </footer>
    </main>
  );
}

/* ── Campaign Form ──────────────────────────────────────────────────── */

function CampaignForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: Campaign | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [kind, setKind] = useState<CampaignKind>(editing?.kind ?? "bundle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bundle fields
  const [bundleCategories, setBundleCategories] = useState(
    editing?.kind === "bundle" ? ((editing.config as any).categories ?? []).join(", ") : "mithai"
  );
  const [bundleMinItems, setBundleMinItems] = useState(
    editing?.kind === "bundle" ? String((editing.config as any).min_items ?? 2) : "2"
  );
  const [bundleDiscount, setBundleDiscount] = useState(
    editing?.kind === "bundle" ? String((editing.config as any).discount_percent ?? 15) : "15"
  );

  // Flash sale fields
  const [flashSkus, setFlashSkus] = useState(
    editing?.kind === "flash_sale" ? ((editing.config as any).skus ?? []).join(", ") : ""
  );
  const [flashPrice, setFlashPrice] = useState(
    editing?.kind === "flash_sale" ? String((editing.config as any).sale_price_paise ?? 0) : "29900"
  );

  // Cross-sell fields
  const [crossMinCategories, setCrossMinCategories] = useState(
    editing?.kind === "cross_sell" ? String((editing.config as any).min_categories ?? 2) : "2"
  );
  const [crossDiscount, setCrossDiscount] = useState(
    editing?.kind === "cross_sell" ? String((editing.config as any).discount_percent ?? 10) : "10"
  );

  // Time fields
  const [startsAt, setStartsAt] = useState(
    editing?.starts_at
      ? new Date(editing.starts_at).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [endsAt, setEndsAt] = useState(
    editing?.ends_at
      ? new Date(editing.ends_at).toISOString().slice(0, 16)
      : inDays(7).slice(0, 16)
  );

  const buildConfig = useCallback((): Record<string, unknown> => {
    switch (kind) {
      case "bundle":
        return {
          categories: bundleCategories.split(",").map((s: string) => s.trim()).filter(Boolean),
          min_items: Number(bundleMinItems) || 2,
          discount_percent: Number(bundleDiscount) || 15,
        };
      case "flash_sale":
        return {
          skus: flashSkus.split(",").map((s: string) => s.trim()).filter(Boolean),
          sale_price_paise: Number(flashPrice) || 29900,
        };
      case "cross_sell":
        return {
          min_categories: Number(crossMinCategories) || 2,
          discount_percent: Number(crossDiscount) || 10,
          exclude_categories: ["cricket"],
        };
    }
  }, [kind, bundleCategories, bundleMinItems, bundleDiscount, flashSkus, flashPrice, crossMinCategories, crossDiscount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      name,
      description,
      kind,
      config: buildConfig(),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    };

    try {
      if (editing) {
        await fetch(`/api/campaigns/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to create campaign");
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  const inputCls =
    "mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2.5 py-1.5 font-clause text-xs text-(--ink) placeholder:text-(--ink-faint) focus:border-(--ink) focus:shadow-[0_0_0_1.5px_var(--seal)] focus:outline-none";
  const labelCls = "font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)";

  return (
    <div className="mt-5 border-2 border-(--ink) bg-(--paper) p-4 shadow-[4px_4px_0_var(--ink)]">
      <h3 className="font-masthead text-sm font-bold uppercase tracking-[0.08em]">
        {editing ? "Edit Campaign" : "New Campaign"}
      </h3>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        {/* Name + Kind */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Campaign Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputCls}
              placeholder="e.g. Diwali Bundle Deal"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Type</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CampaignKind)}
              className={inputCls}
            >
              <option value="bundle">Bundle Deal</option>
              <option value="flash_sale">Flash Sale</option>
              <option value="cross_sell">Cross-Sell</option>
            </select>
          </label>
        </div>

        {/* Description */}
        <label className="block">
          <span className={labelCls}>Description</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            placeholder="e.g. Buy 2+ mithai items, get 15% off"
          />
        </label>

        <div className="double-rule" aria-hidden="true" />

        {/* Kind-specific config */}
        {kind === "bundle" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className={labelCls}>Categories</span>
              <input
                type="text"
                value={bundleCategories}
                onChange={(e) => setBundleCategories(e.target.value)}
                className={inputCls}
                placeholder="mithai, chai"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Min Items</span>
              <input
                type="number"
                min={1}
                value={bundleMinItems}
                onChange={(e) => setBundleMinItems(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Discount %</span>
              <input
                type="number"
                min={1}
                max={90}
                value={bundleDiscount}
                onChange={(e) => setBundleDiscount(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        )}

        {kind === "flash_sale" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>SKUs (comma-separated)</span>
              <input
                type="text"
                value={flashSkus}
                onChange={(e) => setFlashSkus(e.target.value)}
                className={inputCls}
                placeholder="CHAI-MSL-001, MITH-KAJU-004"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Sale Price (paise)</span>
              <input
                type="number"
                min={100}
                value={flashPrice}
                onChange={(e) => setFlashPrice(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        )}

        {kind === "cross_sell" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Min Categories</span>
              <input
                type="number"
                min={2}
                value={crossMinCategories}
                onChange={(e) => setCrossMinCategories(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Discount %</span>
              <input
                type="number"
                min={1}
                max={90}
                value={crossDiscount}
                onChange={(e) => setCrossDiscount(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        )}

        <div className="double-rule" aria-hidden="true" />

        {/* Time window */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Starts At</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Ends At</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        {/* Quick time presets */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ["5 min", inMinutes(5).slice(0, 16)],
            ["30 min", inMinutes(30).slice(0, 16)],
            ["1 day", inDays(1).slice(0, 16)],
            ["7 days", inDays(7).slice(0, 16)],
            ["30 days", inDays(30).slice(0, 16)],
          ] as const).map(([label, endStr]) => (
            <button
              key={label}
              type="button"
              onClick={() => setEndsAt(endStr)}
              className="press min-h-6 border border-(--paper-edge) px-2.5 py-1 font-clause text-[11px] text-(--ink-soft) hover:border-(--ink)"
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="border-[1.5px] border-(--bad) bg-(--bad-bg) px-3 py-2 font-clause text-xs text-(--bad-ink)" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="press border-[1.5px] border-(--ink) bg-(--ink) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--ink-soft) disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Update campaign" : "Create campaign"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="press border-[1.5px] border-(--paper-edge) bg-transparent px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--ink-soft) hover:border-(--ink)"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
