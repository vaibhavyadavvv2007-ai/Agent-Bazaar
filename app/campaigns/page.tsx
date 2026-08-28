"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Campaign Management — the merchant's promotion control room.
 *
 * Lists all campaigns (active, expired, disabled) with stats. Create new
 * campaigns via a form. Toggle enable/disable. Delete. All in gazette style.
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

const KIND_LABELS: Record<CampaignKind, string> = {
  bundle: "Bundle Deal",
  flash_sale: "Flash Sale",
  cross_sell: "Cross-Sell",
};

const KIND_ICONS: Record<CampaignKind, string> = {
  bundle: "B",
  flash_sale: "F",
  cross_sell: "X",
};

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

const nowISO = () => new Date().toISOString();
const inDays = (d: number) =>
  new Date(Date.now() + d * 86400000).toISOString();
const inMinutes = (m: number) =>
  new Date(Date.now() + m * 60000).toISOString();

function campaignStatus(c: Campaign): "active" | "expired" | "upcoming" | "disabled" {
  if (!c.enabled) return "disabled";
  const now = new Date().toISOString();
  if (now < c.starts_at) return "upcoming";
  if (now > c.ends_at) return "expired";
  return "active";
}

const STATUS_STYLES: Record<string, string> = {
  active: "seal seal-green",
  expired: "seal seal-red",
  upcoming: "seal seal-gold",
  disabled: "seal",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 min-h-screen">
      {/* Header */}
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b-2 border-double border-(--ink) pb-4">
        <div>
          <h1 className="font-masthead text-2xl font-bold tracking-tight uppercase">
            Campaign Manager
          </h1>
          <p className="fig mt-1">
            <span className="pointer" aria-hidden="true" />
            create and manage promotions for the bazaar
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/"
            className="press border border-(--paper-edge) px-3 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--ink-soft) hover:border-(--ink)"
          >
            ← Floor
          </a>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditing(null);
            }}
            className="press bg-(--seal) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--seal)/90"
          >
            {showForm ? "Close" : "+ New Campaign"}
          </button>
        </div>
      </header>

      <div className="security-thread-band mt-3" aria-hidden="true" />

      {/* Create/Edit Form */}
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

      {/* Campaign List */}
      <section className="mt-6">
        <h2 className="font-masthead text-sm font-bold uppercase tracking-[0.08em]">
          All Campaigns
        </h2>
        <div className="security-thread-band mt-2" aria-hidden="true" />

        {loading ? (
          <p className="mt-4 font-clause text-xs text-(--ink-soft)">
            Loading campaigns...
          </p>
        ) : campaigns.length === 0 ? (
          <div className="mt-4 border border-dashed border-(--paper-edge) p-6 text-center">
            <p className="font-clause text-sm text-(--ink-soft)">
              No campaigns yet. Create one to offer bundle discounts, flash sales,
              or cross-sell deals to AI shoppers.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {campaigns.map((c) => {
              const status = campaignStatus(c);
              return (
                <div
                  key={c.id}
                  className={`border bg-(--paper) p-4 ${
                    status === "active"
                      ? "border-(--ink)"
                      : "border-(--paper-edge) opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="seal text-[10px]">{KIND_ICONS[c.kind]}</span>
                        <h3 className="font-masthead text-sm font-bold uppercase tracking-[0.06em]">
                          {c.name}
                        </h3>
                        <span className={STATUS_STYLES[status]}>
                          {status}
                        </span>
                        <span className="font-clause text-[10px] uppercase tracking-wider text-(--ink-soft)">
                          {KIND_LABELS[c.kind]}
                        </span>
                      </div>
                      <p className="mt-1 font-clause text-xs text-(--ink-soft)">
                        {c.description}
                      </p>

                      {/* Config summary */}
                      <div className="mt-2 flex flex-wrap gap-3 font-clause text-[11px]">
                        {c.kind === "bundle" && (
                          <>
                            <span>
                              Categories:{" "}
                              <strong>
                                {(c.config as any).categories?.join(", ")}
                              </strong>
                            </span>
                            <span>
                              Min items: <strong>{(c.config as any).min_items}</strong>
                            </span>
                            <span>
                              Discount:{" "}
                              <strong>{(c.config as any).discount_percent}%</strong>
                            </span>
                          </>
                        )}
                        {c.kind === "flash_sale" && (
                          <>
                            <span>
                              SKUs:{" "}
                              <strong>{(c.config as any).skus?.join(", ")}</strong>
                            </span>
                            <span>
                              Sale price:{" "}
                              <strong>
                                {rupees((c.config as any).sale_price_paise)}
                              </strong>
                            </span>
                          </>
                        )}
                        {c.kind === "cross_sell" && (
                          <>
                            <span>
                              Min categories:{" "}
                              <strong>{(c.config as any).min_categories}</strong>
                            </span>
                            <span>
                              Discount:{" "}
                              <strong>{(c.config as any).discount_percent}%</strong>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Time window */}
                      <div className="mt-2 flex gap-4 font-clause text-[11px] text-(--ink-soft)">
                        <span>
                          From: {new Date(c.starts_at).toLocaleString("en-IN")}
                        </span>
                        <span>
                          To: {new Date(c.ends_at).toLocaleString("en-IN")}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="mt-2 flex gap-4 font-clause text-[11px]">
                        <span>
                          Applied: <strong>{c.stats.times_applied}</strong> times
                        </span>
                        <span>
                          Total discount:{" "}
                          <strong>{rupees(c.stats.total_discount)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => toggleEnabled(c.id, c.enabled)}
                        className={`press border px-2 py-1 font-clause text-[10px] font-bold uppercase tracking-wider ${
                          c.enabled
                            ? "border-(--henna) text-(--henna) hover:bg-(--henna)/10"
                            : "border-(--paper-edge) text-(--ink-soft) hover:border-(--ink)"
                        }`}
                      >
                        {c.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(c.id);
                          setShowForm(true);
                        }}
                        className="press border border-(--paper-edge) px-2 py-1 font-clause text-[10px] font-bold uppercase tracking-wider text-(--ink-soft) hover:border-(--ink)"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteCampaign(c.id)}
                        className="press border border-(--seal)/40 px-2 py-1 font-clause text-[10px] font-bold uppercase tracking-wider text-(--seal)/60 hover:border-(--seal) hover:text-(--seal)"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Campaign discounts are auto-applied at checkout and recorded in the
          audit trail.
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

  return (
    <div className="mt-4 border-2 border-(--ink) bg-(--paper) p-4 shadow-[4px_4px_0_var(--ink)]">
      <h3 className="font-masthead text-sm font-bold uppercase tracking-[0.08em]">
        {editing ? "Edit Campaign" : "New Campaign"}
      </h3>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        {/* Name + Kind */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
              Campaign Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              placeholder="e.g. Diwali Bundle Deal"
            />
          </label>
          <label className="block">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
              Type
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CampaignKind)}
              className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
            >
              <option value="bundle">Bundle Deal</option>
              <option value="flash_sale">Flash Sale</option>
              <option value="cross_sell">Cross-Sell</option>
            </select>
          </label>
        </div>

        {/* Description */}
        <label className="block">
          <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
            Description
          </span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
            placeholder="e.g. Buy 2+ mithai items, get 15% off"
          />
        </label>

        <div className="double-rule" aria-hidden="true" />

        {/* Kind-specific config */}
        {kind === "bundle" && (
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Categories
              </span>
              <input
                type="text"
                value={bundleCategories}
                onChange={(e) => setBundleCategories(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
                placeholder="mithai, chai"
              />
            </label>
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Min Items
              </span>
              <input
                type="number"
                min={1}
                value={bundleMinItems}
                onChange={(e) => setBundleMinItems(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Discount %
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={bundleDiscount}
                onChange={(e) => setBundleDiscount(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              />
            </label>
          </div>
        )}

        {kind === "flash_sale" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                SKUs (comma-separated)
              </span>
              <input
                type="text"
                value={flashSkus}
                onChange={(e) => setFlashSkus(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
                placeholder="CHAI-MSL-001, MITH-KAJU-004"
              />
            </label>
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Sale Price (paise)
              </span>
              <input
                type="number"
                min={100}
                value={flashPrice}
                onChange={(e) => setFlashPrice(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              />
            </label>
          </div>
        )}

        {kind === "cross_sell" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Min Categories
              </span>
              <input
                type="number"
                min={2}
                value={crossMinCategories}
                onChange={(e) => setCrossMinCategories(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                Discount %
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={crossDiscount}
                onChange={(e) => setCrossDiscount(e.target.value)}
                className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
              />
            </label>
          </div>
        )}

        <div className="double-rule" aria-hidden="true" />

        {/* Time window */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
              Starts At
            </span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
              Ends At
            </span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full border border-(--paper-edge) bg-(--paper) px-2 py-1.5 font-clause text-xs focus:border-(--ink) focus:outline-none"
            />
          </label>
        </div>

        {/* Quick time presets */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEndsAt(inMinutes(5).slice(0, 16))}
            className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[10px] text-(--ink-soft) hover:border-(--ink)"
          >
            5 min
          </button>
          <button
            type="button"
            onClick={() => setEndsAt(inMinutes(30).slice(0, 16))}
            className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[10px] text-(--ink-soft) hover:border-(--ink)"
          >
            30 min
          </button>
          <button
            type="button"
            onClick={() => setEndsAt(inDays(1).slice(0, 16))}
            className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[10px] text-(--ink-soft) hover:border-(--ink)"
          >
            1 day
          </button>
          <button
            type="button"
            onClick={() => setEndsAt(inDays(7).slice(0, 16))}
            className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[10px] text-(--ink-soft) hover:border-(--ink)"
          >
            7 days
          </button>
          <button
            type="button"
            onClick={() => setEndsAt(inDays(30).slice(0, 16))}
            className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[10px] text-(--ink-soft) hover:border-(--ink)"
          >
            30 days
          </button>
        </div>

        {error && (
          <p className="border border-(--seal) bg-(--seal)/8 px-3 py-2 font-clause text-xs text-(--seal)">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="press bg-(--seal) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--seal)/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Update Campaign" : "Create Campaign"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="press border border-(--paper-edge) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--ink-soft) hover:border-(--ink)"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
