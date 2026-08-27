/**
 * Single source of truth for invoice rendering.
 *
 * Both the on-screen Preview and the downloaded PDF render the SAME React
 * component (`InvoicePreview`). This module mounts that component off-screen,
 * rasterises it and paginates it into an A4 PDF, so the download is a pixel
 * copy of the preview.
 *
 * No business logic (totals, taxes, numbering) lives here — it all stays
 * inside InvoicePreview / the callers.
 */
import { createRoot } from "react-dom/client";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import type { DisplaySettingsMap } from "@/hooks/useInvoiceDisplaySettings";

export interface InvoicePreviewPdfInput {
  company: any;
  retailer: any;
  cartItems: any[];
  orderId?: string;
  beatName?: string;
  salesmanName?: string;
  invoiceDate?: string;
  invoiceTime?: string;
  schemeDetails?: string;
  displaySettings?: DisplaySettingsMap;
  paymentMode?: string;
  amountPaid?: number;
  balanceDue?: number;
  orderTotal?: number;
}

/** A4 portrait at ~96dpi */
const A4_WIDTH_PX = 794;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          // Never hang the download on a slow/broken asset
          setTimeout(resolve, 4000);
        })
    )
  );
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* noop */
  }
}

/**
 * Renders <InvoicePreview /> off-screen and returns it as an A4 PDF Blob.
 */
export async function renderInvoicePreviewToPdfBlob(
  input: InvoicePreviewPdfInput
): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${A4_WIDTH_PX}px`;
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    await new Promise<void>((resolve) => {
      root.render(
        <div
          style={{ width: `${A4_WIDTH_PX}px`, background: "#ffffff" }}
          ref={() => {
            // Give React a frame to commit layout before we measure
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }}
        >
          <InvoicePreview
            company={input.company || {}}
            retailer={input.retailer || {}}
            cartItems={input.cartItems || []}
            orderId={input.orderId}
            templateStyle="template4"
            beatName={input.beatName || ""}
            salesmanName={input.salesmanName || ""}
            invoiceDate={input.invoiceDate || ""}
            invoiceTime={input.invoiceTime || ""}
            schemeDetails={input.schemeDetails || ""}
            displaySettings={input.displaySettings || {}}
            paymentMode={input.paymentMode}
            amountPaid={input.amountPaid}
            balanceDue={input.balanceDue}
            orderTotal={input.orderTotal}
          />
        </div>
      );
    });

    await waitForImages(host);

    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: A4_WIDTH_PX,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const imgHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

    if (imgHeightMm <= A4_HEIGHT_MM) {
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        A4_WIDTH_MM,
        imgHeightMm
      );
    } else {
      // Slice the tall canvas into A4-height chunks so nothing is squashed
      const pxPerMm = canvas.width / A4_WIDTH_MM;
      const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm);
      let offset = 0;
      let page = 0;
      while (offset < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(
          canvas,
          0,
          offset,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );
        if (page > 0) pdf.addPage();
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          A4_WIDTH_MM,
          (sliceHeight * A4_WIDTH_MM) / canvas.width
        );
        offset += sliceHeight;
        page += 1;
      }
    }

    return pdf.output("blob");
  } finally {
    try {
      root.unmount();
    } catch {
      /* noop */
    }
    host.remove();
  }
}
