import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InvoiceStatusInfo = {
  status?: string | null;
  superseded_by_invoice_id?: string | null;
  revises_invoice_id?: string | null;
};

interface Props {
  /** Optional: pass invoice record fields directly to skip lookup. */
  invoice?: InvoiceStatusInfo | null;
  /** Optional: invoice id to fetch status for. */
  invoiceId?: string | null;
  /** Optional: invoice number used to look up in `invoices` table when only that is known. */
  invoiceNumber?: string | null;
  variant?: "banner" | "row";
  className?: string;
}

interface ResolvedNames {
  supersedingNumber?: string;
  revisedNumber?: string;
}

async function fetchInvoiceStatusById(id: string): Promise<InvoiceStatusInfo | null> {
  const { data } = await supabase
    .from("invoices")
    .select("status, superseded_by_invoice_id, revises_invoice_id")
    .eq("id", id)
    .maybeSingle();
  return (data as any) || null;
}

async function fetchInvoiceStatusByNumber(num: string): Promise<InvoiceStatusInfo | null> {
  const { data } = await supabase
    .from("invoices")
    .select("status, superseded_by_invoice_id, revises_invoice_id")
    .eq("invoice_number", num)
    .maybeSingle();
  return (data as any) || null;
}

async function resolveInvoiceNumbers(info: InvoiceStatusInfo): Promise<ResolvedNames> {
  const ids = [info.superseded_by_invoice_id, info.revises_invoice_id].filter(Boolean) as string[];
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .in("id", ids);
  const map = new Map<string, string>((data || []).map((r: any) => [r.id, r.invoice_number]));
  return {
    supersedingNumber: info.superseded_by_invoice_id ? map.get(info.superseded_by_invoice_id) : undefined,
    revisedNumber: info.revises_invoice_id ? map.get(info.revises_invoice_id) : undefined,
  };
}

export default function InvoiceStatusBadge({
  invoice,
  invoiceId,
  invoiceNumber,
  variant = "row",
  className = "",
}: Props) {
  const [info, setInfo] = useState<InvoiceStatusInfo | null>(invoice ?? null);
  const [names, setNames] = useState<ResolvedNames>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next = invoice ?? null;
      if (!next && invoiceId) next = await fetchInvoiceStatusById(invoiceId);
      if (!next && invoiceNumber) next = await fetchInvoiceStatusByNumber(invoiceNumber);
      if (cancelled) return;
      setInfo(next);
      if (next && (next.superseded_by_invoice_id || next.revises_invoice_id)) {
        const resolved = await resolveInvoiceNumbers(next);
        if (!cancelled) setNames(resolved);
      } else {
        setNames({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoice, invoiceId, invoiceNumber]);

  if (!info) return null;
  const status = (info.status || "").toLowerCase();
  const isCancelled = status === "cancelled";
  const isSuperseded = status === "superseded";
  const hasRevises = !!info.revises_invoice_id;

  if (!isCancelled && !isSuperseded && !hasRevises) return null;

  const sizing =
    variant === "banner"
      ? "px-3 py-2 text-sm font-semibold rounded-md"
      : "px-2 py-0.5 text-[11px] font-semibold rounded";

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      {isCancelled && (
        <span className={`${sizing} bg-red-100 text-red-800 border border-red-300`}>
          CANCELLED
        </span>
      )}
      {isSuperseded && (
        <span className={`${sizing} bg-amber-100 text-amber-900 border border-amber-300`}>
          SUPERSEDED{names.supersedingNumber ? ` — replaced by #${names.supersedingNumber}` : ""}
        </span>
      )}
      {hasRevises && (
        <span className="text-[11px] text-muted-foreground">
          Revises #{names.revisedNumber || "—"}
        </span>
      )}
    </div>
  );
}
