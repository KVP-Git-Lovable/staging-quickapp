/**
 * Company-branded, print-quality "Event Performance Report" — the report
 * counterpart to InvoicePreview. Rendered off-screen and rasterised into a
 * PDF by renderEventReportPdf.tsx, the same way InvoicePreview feeds
 * renderInvoicePreviewPdf.tsx.
 */

const THEME = {
  ink: "#201E1A",
  inkSoft: "#5B564C",
  paper: "#FFFFFF",
  paperRaised: "#FBFAF7",
  line: "#E6E1D6",
  accent: "#2B5F55",
  accentSoft: "#E7EFEC",
  warn: "#A6501F",
  warnSoft: "#F5E9E1",
  good: "#3C6E3A",
  goodSoft: "#E8F0E4",
};

const serif = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
const sans = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

const inr = (n: number) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export interface EventReportCompany {
  logo_url?: string | null;
  name?: string | null;
  address?: string | null;
  state?: string | null;
  contact_phone?: string | null;
  email?: string | null;
}

export interface EventReportEvent {
  name: string;
  type?: string | null;
  place?: string | null;
  dateLabel: string;
  status: "Completed" | "Active";
}

export interface EventReportKpis {
  totalRevenue: number;
  totalOrders: number;
  customers: number;
  itemsSold: number;
  margin: number;
}

export interface EventReportDayRow {
  date: string;
  orders: number;
  items: number;
  revenue: number;
}

export interface EventReportProductRow {
  name: string;
  qty: number;
  revenue: number;
}

export interface EventReportCustomerRow {
  name: string;
  orders: number;
  revenue: number;
}

export interface EventReportAiInsights {
  narrative: string;
  highlights: string[];
  watchouts: string[];
}

interface EventReportPreviewProps {
  company: EventReportCompany;
  event: EventReportEvent;
  kpis: EventReportKpis;
  dayWise: EventReportDayRow[];
  topProducts: EventReportProductRow[];
  topCustomers: EventReportCustomerRow[];
  aiInsights?: EventReportAiInsights | null;
  generatedAt: string;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString([], {
    day: "2-digit",
    month: "short",
  });
}

export default function EventReportPreview({
  company,
  event,
  kpis,
  dayWise,
  topProducts,
  topCustomers,
  aiInsights,
  generatedAt,
}: EventReportPreviewProps) {
  return (
    <div
      style={{
        fontFamily: sans,
        color: THEME.ink,
        background: THEME.paper,
        width: "100%",
      }}
    >
      {/* Header band */}
      <div
        style={{
          background: THEME.accent,
          color: "#FFFFFF",
          padding: "28px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          {company.logo_url && (
            <img
              src={company.logo_url}
              alt="Company Logo"
              style={{ width: 56, height: 56, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 4 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              {company.name || "Company"}
            </div>
            {company.address && (
              <div style={{ fontSize: 11, opacity: 0.85, maxWidth: 340, lineHeight: 1.4 }}>{company.address}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.8 }}>
            Event Performance Report
          </div>
          <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, marginTop: 2 }}>{event.name}</div>
        </div>
      </div>

      {/* Fact strip */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: "16px 36px",
          borderBottom: `1px solid ${THEME.line}`,
          background: THEME.paperRaised,
        }}
      >
        <Chip label={event.status} tone={event.status === "Completed" ? "neutral" : "good"} />
        {event.type && <Chip label={event.type} />}
        {event.place && <Chip label={event.place} />}
        <Chip label={event.dateLabel} />
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 10, padding: "18px 36px 0 36px" }}>
        <Kpi label="Total Revenue" value={inr(kpis.totalRevenue)} />
        <Kpi label="Total Orders" value={String(kpis.totalOrders)} />
        <Kpi label="Total Customers" value={String(kpis.customers)} />
        <Kpi label="Items Sold" value={String(kpis.itemsSold)} />
        <Kpi label="Gross Margin" value={`${kpis.margin.toFixed(1)}%`} />
      </div>

      {/* AI summary */}
      {aiInsights?.narrative && (
        <div style={{ padding: "20px 36px 0 36px" }}>
          <Section title="Summary" eyebrow="AI-generated">
            <p style={{ fontSize: 13, lineHeight: 1.6, color: THEME.ink, margin: 0 }}>{aiInsights.narrative}</p>
            {(aiInsights.highlights?.length > 0 || aiInsights.watchouts?.length > 0) && (
              <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
                {aiInsights.highlights?.length > 0 && (
                  <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: THEME.good, fontWeight: 700, marginBottom: 6 }}>
                      Highlights
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: THEME.ink, listStyleType: "disc" }}>
                      {aiInsights.highlights.map((h, i) => (
                        <li key={i} style={{ display: "list-item" }}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiInsights.watchouts?.length > 0 && (
                  <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: THEME.warn, fontWeight: 700, marginBottom: 6 }}>
                      Watch-outs
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: THEME.ink, listStyleType: "disc" }}>
                      {aiInsights.watchouts.map((w, i) => (
                        <li key={i} style={{ display: "list-item" }}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* Day-wise summary */}
      {dayWise.length > 0 && (
        <div style={{ padding: "20px 36px 0 36px" }}>
          <Section title="Day-wise Summary">
            <Table
              head={["Date", "Orders", "Items", "Revenue"]}
              align={["left", "right", "right", "right"]}
              rows={dayWise.map((d) => [fmtDate(d.date), String(d.orders), String(d.items), inr(d.revenue)])}
            />
          </Section>
        </div>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <div style={{ padding: "20px 36px 0 36px" }}>
          <Section title="Top Selling Products">
            <Table
              head={["Product", "Qty", "Revenue"]}
              align={["left", "right", "right"]}
              rows={topProducts.slice(0, 10).map((p) => [p.name, String(p.qty), inr(p.revenue)])}
            />
          </Section>
        </div>
      )}

      {/* Top customers */}
      {topCustomers.length > 0 && (
        <div style={{ padding: "20px 36px 0 36px" }}>
          <Section title="Top Customers">
            <Table
              head={["Customer", "Orders", "Revenue"]}
              align={["left", "right", "right"]}
              rows={topCustomers.slice(0, 10).map((c) => [c.name, String(c.orders), inr(c.revenue)])}
            />
          </Section>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          padding: "14px 36px",
          borderTop: `1px solid ${THEME.line}`,
          fontSize: 10.5,
          color: THEME.inkSoft,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Generated {generatedAt}</span>
        <span>{company.name || "Company"} · Event Performance Report</span>
      </div>
    </div>
  );
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" }) {
  const bg = tone === "good" ? THEME.goodSoft : THEME.accentSoft;
  const fg = tone === "good" ? THEME.good : THEME.accent;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: `1px solid ${THEME.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        background: THEME.paperRaised,
      }}
    >
      <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: THEME.inkSoft }}>
        {label}
      </div>
      <div style={{ fontFamily: serif, fontSize: 17, fontWeight: 700, marginTop: 2, color: THEME.ink }}>{value}</div>
    </div>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <h3 style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, margin: 0, color: THEME.ink }}>{title}</h3>
        {eyebrow && (
          <span style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: THEME.accent, fontWeight: 700 }}>
            {eyebrow}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Table({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: string[][];
  align: ("left" | "right")[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={i}
              style={{
                textAlign: align[i],
                fontSize: 9.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: THEME.inkSoft,
                padding: "0 0 6px 0",
                borderBottom: `1px solid ${THEME.line}`,
                fontWeight: 600,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td
                key={ci}
                style={{
                  textAlign: align[ci],
                  padding: "7px 0",
                  borderBottom: `1px solid ${THEME.line}`,
                  color: THEME.ink,
                }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
