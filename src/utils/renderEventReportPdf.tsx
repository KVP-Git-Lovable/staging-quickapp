/**
 * Mirrors renderInvoicePreviewPdf.tsx: mounts <EventReportPreview /> off-screen,
 * rasterises it and paginates into an A4 PDF, so the download is a pixel copy
 * of the same component the on-screen preview would use.
 */
import { createRoot } from "react-dom/client";
import EventReportPreview, {
  EventReportCompany,
  EventReportEvent,
  EventReportKpis,
  EventReportDayRow,
  EventReportProductRow,
  EventReportCustomerRow,
  EventReportAiInsights,
} from "@/components/invoice/EventReportPreview";

export interface EventReportPdfInput {
  company: EventReportCompany;
  event: EventReportEvent;
  kpis: EventReportKpis;
  dayWise: EventReportDayRow[];
  topProducts: EventReportProductRow[];
  topCustomers: EventReportCustomerRow[];
  aiInsights?: EventReportAiInsights | null;
  generatedAt: string;
}

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

export async function renderEventReportToPdfBlob(input: EventReportPdfInput): Promise<Blob> {
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
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }}
        >
          <EventReportPreview
            company={input.company || {}}
            event={input.event}
            kpis={input.kpis}
            dayWise={input.dayWise || []}
            topProducts={input.topProducts || []}
            topCustomers={input.topCustomers || []}
            aiInsights={input.aiInsights}
            generatedAt={input.generatedAt}
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
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_WIDTH_MM, imgHeightMm);
    } else {
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
        ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
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
