"use client";

import { useState } from "react";
import { BalancesCard } from "@/components/BalancesCard";
import { Header } from "@/components/Header";
import { PriceCard } from "@/components/PriceCard";
import { QuoteReview } from "@/components/QuoteReview";
import { Receipt } from "@/components/Receipt";
import { ReviewerTools } from "@/components/ReviewerTools";
import { Stepper, type Step } from "@/components/Stepper";
import { TradeForm } from "@/components/TradeForm";
import { TradeHistory } from "@/components/TradeHistory";
import { TrustBanner } from "@/components/TrustBanner";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import {
  ApiError,
  confirmQuote,
  getIntegrity,
  getTrade,
  issueQuote,
} from "@/lib/api";
import { balancesEqual } from "@/lib/balances";
import { formatAge } from "@/lib/time";
import type {
  Balances,
  Quote,
  QuoteRequest,
  Receipt as ReceiptData,
} from "@/lib/types";
import { useAppState } from "@/lib/useAppState";
import { useServerClock } from "@/lib/useServerClock";

interface TrackedBalances {
  current?: Balances;
  previous?: Balances;
}

/** The trade panel's state machine: form → locked quote → receipt. */
type Flow =
  | { kind: "form"; initial?: QuoteRequest }
  | { kind: "quote"; quote: Quote; previousUnitPrice?: number; confirming: boolean }
  | { kind: "receipt"; receipt: ReceiptData };

type HistoryView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "receipt"; receipt: ReceiptData };

export default function Home() {
  const { state, error, loading, refresh, tick } = useAppState();

  const [flow, setFlow] = useState<Flow>({ kind: "form" });
  const [typing, setTyping] = useState(false);
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null);
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  // The clock is re-aligned once per quote from that quote's server_now (spec §7).
  const serverClock = useServerClock(
    flow.kind === "quote" ? flow.quote.server_now : state?.server_now,
  );

  const [tracked, setTracked] = useState<TrackedBalances>({});
  if (state && !balancesEqual(state.balances, tracked.current)) {
    setTracked({ current: state.balances, previous: tracked.current });
  }

  const step: Step =
    flow.kind === "receipt"
      ? 5
      : flow.kind === "quote"
        ? flow.confirming
          ? 4
          : 3
        : typing
          ? 2
          : 1;

  function checkBooks() {
    setIntegrityOk(null);
    getIntegrity().then(
      (report) => setIntegrityOk(report.ok),
      () => setIntegrityOk(false),
    );
  }

  async function handleQuote(request: QuoteRequest) {
    try {
      const quote = await issueQuote(request);
      setFlow({ kind: "quote", quote, confirming: false });
    } catch (err) {
      // The server knows something newer than our last poll: show it.
      void refresh();
      throw err;
    }
  }

  async function handleRequote(previous: Quote) {
    const quote = await issueQuote({
      side: previous.side,
      input_mode: previous.input_mode,
      amount: previous.input_amount,
    });
    setFlow({
      kind: "quote",
      quote,
      previousUnitPrice: previous.unit_price_paisa_per_gram,
      confirming: false,
    });
  }

  async function handleConfirm(quote: Quote) {
    setFlow((current) =>
      current.kind === "quote" ? { ...current, confirming: true } : current,
    );
    try {
      const receipt = await confirmQuote(quote.id);
      setFlow({ kind: "receipt", receipt });
      setTyping(false);
      checkBooks();
      void refresh();
    } catch (err) {
      setFlow((current) =>
        current.kind === "quote" ? { ...current, confirming: false } : current,
      );
      if (ApiError.from(err).code.startsWith("INSUFFICIENT_")) void refresh();
      throw err;
    }
  }

  function handleCancel() {
    if (flow.kind !== "quote") return;
    const { quote } = flow;
    setFlow({
      kind: "form",
      initial: {
        side: quote.side,
        input_mode: quote.input_mode,
        amount: quote.input_amount,
      },
    });
    setTyping(true);
  }

  function handleNewTrade() {
    setFlow({ kind: "form" });
    setTyping(false);
    setHistory(null);
  }

  function handleOpenTrade(id: string) {
    setHistory({ kind: "loading" });
    checkBooks();
    getTrade(id).then(
      (receipt) => setHistory({ kind: "receipt", receipt }),
      (err: unknown) =>
        setHistory({ kind: "error", message: ApiError.from(err).message }),
    );
  }

  function handleQuoteExpired(expired: Quote) {
    setFlow((current) =>
      current.kind === "quote" && current.quote.id === expired.id
        ? { ...current, quote: expired }
        : current,
    );
  }

  const activeQuote = flow.kind === "quote" ? flow.quote : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="print:hidden">
        <Header onOpenTools={() => setToolsOpen(true)} />
      </div>
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4">
          <div className="print:hidden">
            <Stepper step={step} />
          </div>

          {error && (
            <ConnectionNotice error={error} staleFor={state ? tick : null} onRetry={refresh} />
          )}

          {loading && !state && <LoadingSkeleton />}

          {state && (
            <>
              <div className="print:hidden">
                <TrustBanner price={state.price} />
              </div>
              <div
                // `[&>*]:min-w-0` matters: grid items default to
                // `min-width: auto`, so a non-wrapping child (the odometer)
                // would otherwise blow the track wider than the viewport.
                className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_420px] lg:items-start"
              >
                <div className="flex flex-col gap-4 print:hidden lg:col-start-1">
                  <PriceCard price={state.price} elapsed={tick} />
                  <BalancesCard
                    balances={state.balances}
                    previous={tracked.previous}
                  />
                </div>

                <div
                  // Keyed on the flow stage so each panel rises in as it
                  // replaces the last. It marks the step change without
                  // moving anything the reader is mid-way through reading.
                  key={flow.kind}
                  className="animate-rise lg:col-start-2 lg:row-start-1 lg:row-span-2"
                >
                  {flow.kind === "form" && (
                    <TradeForm
                      key={flow.initial ? "prefilled" : "empty"}
                      price={state.price}
                      balances={state.balances}
                      disabledReason={
                        state.price.trading.enabled
                          ? null
                          : (state.price.trading.reason ?? "Trading is paused")
                      }
                      initial={flow.initial}
                      onQuote={handleQuote}
                      onTyping={setTyping}
                    />
                  )}
                  {flow.kind === "quote" && (
                    <QuoteReview
                      key={flow.quote.id}
                      quote={flow.quote}
                      serverClock={serverClock}
                      previousUnitPrice={flow.previousUnitPrice}
                      onConfirm={handleConfirm}
                      onCancel={handleCancel}
                      onRequote={handleRequote}
                    />
                  )}
                  {flow.kind === "receipt" && (
                    <Receipt
                      receipt={flow.receipt}
                      integrityOk={integrityOk}
                      onNewTrade={handleNewTrade}
                    />
                  )}
                </div>

                <div className="print:hidden lg:col-start-1">
                  <TradeHistory
                    trades={state.recent_trades}
                    onOpen={handleOpenTrade}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <footer className="mx-auto w-full max-w-[1120px] px-4 pb-6 text-xs text-ink-muted print:hidden sm:px-6">
        Demo — no real money moves. Prices cross-checked between the PakGold
        method and GoldPrice.org.
      </footer>

      <Drawer
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Receipt"
        subtitle="A settled trade, as recorded in the ledger."
      >
        {history?.kind === "loading" && (
          <p className="text-sm text-ink-muted" aria-busy="true">
            Loading receipt…
          </p>
        )}
        {history?.kind === "error" && (
          <p role="alert" className="text-sm text-coral">
            {history.message}
          </p>
        )}
        {history?.kind === "receipt" && (
          <Receipt
            receipt={history.receipt}
            integrityOk={integrityOk}
            onNewTrade={handleNewTrade}
          />
        )}
      </Drawer>

      <ReviewerTools
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        price={state?.price ?? null}
        activeQuote={activeQuote}
        onRefresh={refresh}
        onQuoteExpired={handleQuoteExpired}
        onReset={handleNewTrade}
      />
    </div>
  );
}

function ConnectionNotice({
  error,
  staleFor,
  onRetry,
}: {
  error: ApiError;
  staleFor: number | null;
  onRetry: () => Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-coral/50 bg-coral/12 px-4 py-3 text-sm text-ink"
    >
      <p className="min-w-0">
        <span className="font-semibold">Can&rsquo;t reach the API.</span>{" "}
        {error.message}
        {staleFor !== null && ` Showing data from ${formatAge(staleFor)} ago.`}
      </p>
      <Button variant="secondary" size="sm" onClick={() => void onRetry()}>
        Retry
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading price and balances"
      className="grid gap-4 lg:grid-cols-[1fr_420px]"
    >
      <div className="flex flex-col gap-4">
        <div className="h-64 animate-pulse rounded-card bg-white" />
        <div className="h-40 animate-pulse rounded-card bg-white" />
      </div>
      <div className="h-80 animate-pulse rounded-card bg-white" />
    </div>
  );
}
