import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

export type InvoiceWatermarkInfo = {
  status?: string | null;
  superseded_by_invoice_id?: string | null;
  revises_invoice_id?: string | null;
  supersedingNumber?: string | null;
  revisedNumber?: string | null;
};

async function loadInvoiceMeta(opts: {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}): Promise<InvoiceWatermarkInfo | null> {
  let row: any = null;
  if (opts.invoiceId) {
    const { data } = await supabase
      .from("invoices")
      .select("status, superseded_by_invoice_id, revises_invoice_id")
      .eq("id", opts.invoiceId)
      .maybeSingle();
    row = data;
  }
  if (!row && opts.invoiceNumber) {
    const { data } = await supabase
      .from("invoices")
      .select("status, superseded_by_invoice_id, revises_invoice_id")
      .eq("invoice_number", opts.invoiceNumber)
      .maybeSingle();
    row = data;
  }
  if (!row) return null;
  const ids = [row.superseded_by_invoice_id, row.revises_invoice_id].filter(Boolean);
  let supersedingNumber: string | null = null;
  let revisedNumber: string | null = null;
  if (ids.length) {
    const { data: linked } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .in("id", ids);
    const map = new Map<string, string>((linked || []).map((r: any) => [r.id, r.invoice_number]));
    supersedingNumber = row.superseded_by_invoice_id ? map.get(row.superseded_by_invoice_id) ?? null : null;
    revisedNumber = row.revises_invoice_id ? map.get(row.revises_invoice_id) ?? null : null;
  }
  return { ...row, supersedingNumber, revisedNumber };
}

/**
 * Overlay a CANCELLED/SUPERSEDED watermark + a small "Revises #..." footnote
 * on every page of a PDF if the invoice status calls for it. Returns a new Blob;
 * returns the original blob unchanged when no watermark applies or on failure.
 */
export async function applyInvoiceWatermark(
  blob: Blob,
  opts: { invoiceId?: string | null; invoiceNumber?: string | null }
): Promise<Blob> {
  try {
    const info = await loadInvoiceMeta(opts);
    if (!info) return blob;
    const status = (info.status || "").toLowerCase();
    const isCancelled = status === "cancelled";
    const isSuperseded = status === "superseded";
    const hasRevises = !!info.revises_invoice_id;
    if (!isCancelled && !isSuperseded && !hasRevises) return blob;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const small = await pdf.embedFont(StandardFonts.Helvetica);

    const stampText = isCancelled
      ? "CANCELLED"
      : isSuperseded
      ? `SUPERSEDED${info.supersedingNumber ? ` — replaced by #${info.supersedingNumber}` : ""}`
      : null;
    const stampColor = isCancelled ? rgb(0.78, 0.12, 0.12) : rgb(0.78, 0.55, 0.05);

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      if (stampText) {
        const size = isCancelled ? 90 : 56;
        const textWidth = font.widthOfTextAtSize(stampText, size);
        page.drawText(stampText, {
          x: (width - textWidth * 0.7) / 2,
          y: height / 2,
          size,
          font,
          color: stampColor,
          opacity: 0.22,
          rotate: degrees(-30),
        });
      }
      if (hasRevises) {
        const line = `Revises #${info.revisedNumber || "—"}`;
        page.drawText(line, {
          x: 24,
          y: 16,
          size: 9,
          font: small,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }

    const out = await pdf.save();
    return new Blob([out], { type: "application/pdf" });
  } catch (e) {
    console.warn("[applyInvoiceWatermark] skipped:", e);
    return blob;
  }
}
