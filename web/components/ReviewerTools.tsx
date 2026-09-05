"use client";

import { useEffect, useState } from "react";
import { selectedSourceName } from "@/components/TrustBanner";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ApiError, demo } from "@/lib/api";
import { formatGold, formatPKR, parseGold, parsePKR, toPKRInput } from "@/lib/money";
import { mulDivCeil } from "@/lib/quoteMath";
import type {
  DemoBalancesRequest,
  DemoSettings,
  DemoSettingsPatch,
  PriceView,
  Quote,
} from "@/lib/types";

const DEFAULT_GUARDRAIL_PAISA = 3_500_000;
/** "Set above market" puts the floor 25 % over the market reference. */
const ABOVE_MARKET_BPS = 12_500;

type OutageFlag = "fail_primary" | "fail_fallback" | "force_stale";

const OUTAGES: ReadonlyArray<{ key: OutageFlag; label: string; description: string }> = [
  {
    key: "fail_primary",
    label: "Kill PakGold",
    description: "Primary source returns an outage",
  },
  {
    key: "fail_fallback",
    label: "Kill GoldPrice.org",
    description: "Fallback source returns an outage",
  },
  {
    key: "force_stale",
    label: "Force stale",
    description: "Treat the price as too old to trade on",
  },
];

const PRESETS: ReadonlyArray<{ label: string; targets: DemoBalancesRequest }> = [
  { label: "Wallet → PKR 5,000", targets: { customer_cash_paisa: 500_000 } },
  { label: "Gold → 0.100 g", targets: { customer_gold_mg: 100 } },
  { label: "Inventory → 0.500 g", targets: { platform_gold_mg: 500 } },
];

interface CustomBalances {
  wallet: string;
  gold: string;
  inventory: string;
}

function describePrice(view: PriceView): string {
  return `price ${view.status} via ${selectedSourceName(view) ?? "no source"}`;
}

function describeBalances(targets: DemoBalancesRequest): string {
  const parts: string[] = [];
  if (targets.customer_cash_paisa !== undefined) {
    parts.push(`wallet ${formatPKR(targets.customer_cash_paisa)}`);
  }
  if (targets.customer_gold_mg !== undefined) {
    parts.push(`gold ${formatGold(targets.customer_gold_mg)}`);
  }
  if (targets.platform_gold_mg !== undefined) {
    parts.push(`inventory ${formatGold(targets.platform_gold_mg)}`);
  }
  return parts.join(", ");
}

/**
 * ReviewerTools
 *
 * The demo-controls drawer: source outages, the guardrail floor, balance
 * setters, quote expiry and a full reset — every stress case in spec §11,
 * reachable without touching code. Each action reports its result as a
 * toast and re-fetches the app state so the page reflects it immediately.
 *
 * Props
 * - `open` / `onClose` — drawer visibility, owned by the page.
 * - `price` — the current `PriceView` (guardrail shortcut and "binds" line).
 * - `activeQuote` — the quote under review, if any, for "Expire current quote".
 * - `onRefresh` — re-fetches `/api/state`.
 * - `onQuoteExpired` — receives the expired quote so the review updates at once.
 * - `onReset` — the demo was reset; the page should return to the empty form.
 */
export interface ReviewerToolsProps {
  open: boolean;
  onClose: () => void;
  price: PriceView | null;
  activeQuote: Quote | null;
  onRefresh: () => Promise<void>;
  onQuoteExpired: (quote: Quote) => void;
  onReset: () => void;
}

export function ReviewerTools({
  open,
  onClose,
  price,
  activeQuote,
  onRefresh,
  onQuoteExpired,
  onReset,
}: ReviewerToolsProps) {
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [guardrailRaw, setGuardrailRaw] = useState("");
  const [custom, setCustom] = useState<CustomBalances>({
    wallet: "",
    gold: "",
    inventory: "",
  });
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    demo.getSettings().then(
      (loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setGuardrailRaw(toPKRInput(loaded.guardrail_paisa_per_gram));
      },
      (err: unknown) => {
        if (!cancelled) push("error", ApiError.from(err).message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, push]);

  async function run(label: string, action: () => Promise<string>) {
    if (busy !== null) return;
    setBusy(label);
    try {
      push("success", await action());
    } catch (err) {
      push("error", ApiError.from(err).message);
    } finally {
      setBusy(null);
    }
  }

  function setOutage(key: OutageFlag, label: string, checked: boolean) {
    void run(key, async () => {
      const patch: DemoSettingsPatch = {};
      patch[key] = checked;
      const result = await demo.updateSettings(patch);
      setSettings(result.settings);
      const view = await demo.refresh();
      await onRefresh();
      return `${label} ${checked ? "on" : "off"} · ${describePrice(view)}`;
    });
  }

  function forceRefresh() {
    void run("refresh", async () => {
      const view = await demo.refresh();
      await onRefresh();
      return `Refreshed · ${describePrice(view)}`;
    });
  }

  function setGuardrail(paisa: number) {
    void run("guardrail", async () => {
      const result = await demo.updateSettings({ guardrail_paisa_per_gram: paisa });
      setSettings(result.settings);
      setGuardrailRaw(toPKRInput(result.settings.guardrail_paisa_per_gram));
      await onRefresh();
      return `Guardrail floor ${formatPKR(paisa)} / g · ${
        result.price.guardrail_applied ? "now binds the buy price" : "does not bind"
      }`;
    });
  }

  function applyGuardrailInput() {
    const paisa = parsePKR(guardrailRaw);
    if (paisa === null) {
      push("error", "Enter the guardrail in PKR per gram");
      return;
    }
    setGuardrail(paisa);
  }

  function setAboveMarket() {
    const market = price?.market_paisa_per_gram ?? price?.last_known_market_paisa_per_gram ?? null;
    if (market === null) {
      push("error", "No market price to set the guardrail above");
      return;
    }
    setGuardrail(mulDivCeil(market, ABOVE_MARKET_BPS, 10_000));
  }

  function setBalances(targets: DemoBalancesRequest) {
    void run("balances", async () => {
      const result = await demo.setBalances(targets);
      await onRefresh();
      return `Set ${describeBalances(targets)} · ${
        result.integrity.ok ? "books balanced ✓" : "books check failed"
      }`;
    });
  }

  function applyCustomBalances() {
    const targets: DemoBalancesRequest = {};
    if (custom.wallet.trim() !== "") {
      const paisa = parsePKR(custom.wallet);
      if (paisa === null) return push("error", "Wallet must be a PKR amount");
      targets.customer_cash_paisa = paisa;
    }
    if (custom.gold.trim() !== "") {
      const mg = parseGold(custom.gold);
      if (mg === null) return push("error", "Gold must be grams with up to 3 decimals");
      targets.customer_gold_mg = mg;
    }
    if (custom.inventory.trim() !== "") {
      const mg = parseGold(custom.inventory);
      if (mg === null) return push("error", "Inventory must be grams with up to 3 decimals");
      targets.platform_gold_mg = mg;
    }
    if (Object.keys(targets).length === 0) {
      return push("error", "Enter at least one balance to set");
    }
    setBalances(targets);
  }

  function expireQuote() {
    if (!activeQuote) return;
    void run("expire", async () => {
      const expired = await demo.expireQuote(activeQuote.id);
      onQuoteExpired(expired);
      return "Current quote expired — confirm will now be refused";
    });
  }

  function resetDemo() {
    if (
      !window.confirm(
        "Reset the demo? This wipes trades, quotes, price history and settings, then re-seeds the balances.",
      )
    ) {
      return;
    }
    void run("reset", async () => {
      await demo.reset();
      onReset();
      const [loaded] = await Promise.all([demo.getSettings(), onRefresh()]);
      setSettings(loaded);
      setGuardrailRaw(toPKRInput(loaded.guardrail_paisa_per_gram));
      setCustom({ wallet: "", gold: "", inventory: "" });
      return "Demo reset · seed balances restored";
    });
  }

  const disabled = busy !== null || settings === null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Reviewer tools"
      subtitle="Demo controls — not part of the product. Use these to try the stress cases."
      footer={
        toasts.length > 0 ? (
          <ToastStack toasts={toasts} onDismiss={dismiss} />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-7">
        <Section title="Price sources">
          <div className="flex flex-col gap-4">
            {OUTAGES.map((outage) => (
              <Switch
                key={outage.key}
                id={`tools-${outage.key}`}
                label={outage.label}
                description={outage.description}
                checked={settings?.[outage.key] ?? false}
                disabled={disabled}
                onChange={(checked) => setOutage(outage.key, outage.label, checked)}
              />
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            Force refresh bypasses the 5-minute cache (demo only).
          </p>
          <Button
            variant="secondary"
            block
            loading={busy === "refresh"}
            disabled={disabled}
            onClick={forceRefresh}
          >
            Force refresh now
          </Button>
        </Section>

        <Section title="Guardrail">
          <Field
            id="tools-guardrail"
            label="Buy-price floor, PKR per gram"
            value={guardrailRaw}
            onChange={(event) => setGuardrailRaw(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            prefix="PKR"
            disabled={disabled}
            hint={
              price === null
                ? undefined
                : price.guardrail_applied
                  ? `Binding — the buy price is held at ${formatPKR(price.guardrail_paisa_per_gram)}`
                  : price.buy_paisa_per_gram === null
                    ? "Not binding — no trusted price right now"
                    : `Not binding — market × 1.10 is ${formatPKR(price.buy_paisa_per_gram)}`
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={applyGuardrailInput}
            >
              Apply
            </Button>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={setAboveMarket}>
              Set above market
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setGuardrail(DEFAULT_GUARDRAIL_PAISA)}
            >
              Reset (35,000)
            </Button>
          </div>
        </Section>

        <Section title="Balances">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="chip"
                disabled={disabled}
                onClick={() => setBalances(preset.targets)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3">
            <Field
              id="tools-wallet"
              label="Wallet"
              value={custom.wallet}
              onChange={(event) => setCustom({ ...custom, wallet: event.target.value })}
              inputMode="decimal"
              autoComplete="off"
              placeholder="250,000.00"
              prefix="PKR"
              disabled={disabled}
            />
            <Field
              id="tools-gold"
              label="Your gold"
              value={custom.gold}
              onChange={(event) => setCustom({ ...custom, gold: event.target.value })}
              inputMode="decimal"
              autoComplete="off"
              placeholder="2.500"
              suffix={<span className="text-sm text-ink-muted">g</span>}
              disabled={disabled}
            />
            <Field
              id="tools-inventory"
              label="Platform inventory"
              value={custom.inventory}
              onChange={(event) => setCustom({ ...custom, inventory: event.target.value })}
              inputMode="decimal"
              autoComplete="off"
              placeholder="50.000"
              suffix={<span className="text-sm text-ink-muted">g</span>}
              disabled={disabled}
            />
          </div>
          <Button
            variant="secondary"
            block
            loading={busy === "balances"}
            disabled={disabled}
            onClick={applyCustomBalances}
          >
            Apply balances
          </Button>
        </Section>

        <Section title="Quote">
          <Button
            variant="secondary"
            block
            loading={busy === "expire"}
            disabled={disabled || activeQuote === null}
            onClick={expireQuote}
          >
            Expire current quote
          </Button>
          <p className="text-xs text-ink-muted">
            {activeQuote
              ? "Marks the quote under review as expired on the server."
              : "Lock a price first to enable this."}
          </p>
        </Section>

        <Section title="Reset">
          <Button
            variant="danger"
            block
            loading={busy === "reset"}
            disabled={disabled}
            onClick={resetDemo}
          >
            Reset demo
          </Button>
          <p className="text-xs text-ink-muted">
            Wipes the ledger, quotes, trades and price history, then re-seeds.
          </p>
        </Section>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}
