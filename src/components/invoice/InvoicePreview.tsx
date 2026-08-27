import { DisplaySettingsMap } from "@/hooks/useInvoiceDisplaySettings";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import { resolveLineTax } from "@/utils/taxCalc";


// Number to words helper
const numberToWords = (num: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToWords(Math.abs(num));
  
  let words = '';
  
  if (Math.floor(num / 10000000) > 0) {
    words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  
  if (Math.floor(num / 100000) > 0) {
    words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }
  
  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }
  
  if (Math.floor(num / 100) > 0) {
    words += numberToWords(Math.floor(num / 100)) + ' Hundred ';
    num %= 100;
  }
  
  if (num > 0) {
    if (words !== '') words += 'and ';
    if (num < 20) {
      words += ones[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10 > 0) words += ' ' + ones[num % 10];
    }
  }
  
  return words.trim();
};

// `orderId` doubles as "real invoice number" (e.g. INV2026-24478) when one
// exists, or a raw order UUID as a fallback display id when it doesn't —
// callers pass displayInvoiceNumber || orderId into the same prop. Only the
// UUID case should ever be shortened; slicing every value to 8 chars cut
// every real invoice number off right after "INV2026-", regardless of its
// length (this was never digit-count-dependent — it did this to the old
// 3-digit numbers too, just silently, since nobody had looked closely).
const isRawUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

interface InvoicePreviewProps {
  company: any;
  retailer: any;
  cartItems: any[];
  orderId?: string;
  templateStyle: "template1" | "template2" | "template3" | "template4";
  beatName?: string;
  salesmanName?: string;
  // Pre-formatted (e.g. "24/08/2026") display date — the order's actual
  // business date, which for a backdated order differs from "today". Falls
  // back to today's date only when a caller doesn't supply one.
  invoiceDate?: string;
  invoiceTime?: string;
  schemeDetails?: string;
  displaySettings?: DisplaySettingsMap;
  // Payment status — read straight from the order (or the rep's current
  // in-progress selection on a not-yet-submitted cart); never derived here.
  paymentMode?: string;
  amountPaid?: number;
  balanceDue?: number;
  // The real, final charged amount — Cart's own Math.round(getFinalTotal())
  // pre-submit, or orders.total_amount post-submit. When given, this (not a
  // fresh Math.round of the line items) is the Total shown here, so the
  // invoice is never the one deciding what the rounded total is.
  orderTotal?: number;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
  neft: "NEFT",
  credit: "Credit",
  collect_on_delivery: "Collect on Delivery",
};

export default function InvoicePreview({
  company,
  retailer,
  cartItems,
  orderId = "INV001",
  templateStyle,
  beatName = "",
  salesmanName = "",
  invoiceDate = "",
  invoiceTime = "",
  schemeDetails = "",
  displaySettings = {},
  paymentMode,
  amountPaid,
  balanceDue,
  orderTotal
}: InvoicePreviewProps) {
  // Unit conversion helper
  const normalizeUnit = (u?: string) => (u || "").toLowerCase().replace(/\./g, "").trim();
  
  const getDisplayRate = (item: any) => {
    const baseRate = Number(item.rate || item.price) || 0;
    const baseUnit = normalizeUnit(item.base_unit || item.unit);
    const targetUnit = normalizeUnit(item.unit);
    if (!baseUnit || !item.base_unit) return baseRate;

    // KG ↔ Gram conversions
    if (baseUnit === "kg" || baseUnit === "kilogram" || baseUnit === "kilograms") {
      if (["gram", "grams", "g", "gm"].includes(targetUnit)) return baseRate / 1000;
      if (targetUnit === "kg") return baseRate;
    } else if (["g", "gm", "gram", "grams"].includes(baseUnit)) {
      if (targetUnit === "kg") return baseRate * 1000;
      if (["g", "gm", "gram", "grams"].includes(targetUnit)) return baseRate;
    }
    return baseRate;
  };

  // Line total: read the stored, already-finalized value directly — never
  // recompute qty × rate when a stored total exists (that's a live
  // recalculation, and the invoice should show exactly what was persisted
  // at order time). Only falls back to qty × rate for legacy rows that
  // genuinely have no stored total/taxable_amount.
  const getLineTotal = (item: any, qty: number, rate: number) => {
    const stored = item.total ?? item.taxable_amount;
    if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
    return qty * rate;
  };

  // Get display name - show only variant name if it's a variant, or base product name
  const getDisplayName = (item: any) => {
    const fullName = item.product_name || item.name || "";
    // Check if this is a variant (contains " - ")
    if (fullName.includes(" - ")) {
      const parts = fullName.split(" - ");
      const variantPart = parts[1];
      // If variant is "Base variant", show only the base product name
      if (variantPart.toLowerCase() === "base variant") {
        return parts[0];
      }
      // Otherwise show only the variant name
      return variantPart;
    }
    // If no variant, return the full name
    return fullName;
  };

  const subtotal = cartItems.reduce((sum, item) => {
    // Use display_quantity if available (already in correct unit), otherwise use quantity
    const qty = item.display_quantity !== undefined ? item.display_quantity : (item.quantity || 0);
    // If display_quantity is used, we need the rate for the display unit
    const displayUnit = item.display_unit?.toLowerCase() || '';
    const baseUnit = normalizeUnit(item.base_unit || item.unit);
    let rate = Number(item.rate || item.price) || 0;
    
    // If we have display_quantity, the rate should match the display unit
    // If rate is per gram but display is KG, multiply rate by 1000
    if (item.display_quantity !== undefined && (displayUnit === 'kg' || displayUnit === 'kilogram')) {
      if (['g', 'gm', 'gram', 'grams'].includes(baseUnit)) {
        rate = rate * 1000;
      }
    } else {
      rate = getDisplayRate(item);
    }

    return sum + getLineTotal(item, qty, rate);
  }, 0);
  // Phase 4: read per-line stored tax from order_items; fall back to helper for legacy lines.
  const lineTaxes = cartItems.map((it: any) => resolveLineTax(it));
  const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
  const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
  const igst = lineTaxes.reduce((s, l) => s + l.igst, 0);
  const cess = lineTaxes.reduce((s, l) => s + l.cess, 0);
  const total = subtotal + cgst + sgst + igst + cess;
  // The real, final charged amount — Cart's own rounded total pre-submit, or
  // orders.total_amount post-submit. Falls back to rounding the line-item sum
  // only when the caller genuinely has no authoritative total to hand over.
  const displayTotal = orderTotal != null ? orderTotal : Math.round(total);


  // Amount in words
  const totalInWords = numberToWords(displayTotal) + ' Rupees Only';

  const getStyleClasses = () => {
    switch (templateStyle) {
      case "template1":
        return {
          container: "border-2 border-blue-200 bg-gradient-to-br from-blue-50/30 to-white text-black",
          header: "bg-gradient-to-r from-blue-400 to-cyan-400 text-white",
          tableHeader: "bg-gradient-to-r from-blue-400 to-cyan-400 text-white",
          totalBox: "bg-gradient-to-r from-blue-400 to-cyan-400 text-white"
        };
      case "template2":
        return {
          container: "border-2 border-purple-200 bg-gradient-to-br from-purple-50/30 to-white text-black",
          header: "bg-gradient-to-r from-purple-400 to-pink-400 text-white",
          tableHeader: "bg-gradient-to-r from-purple-400 to-pink-400 text-white",
          totalBox: "bg-gradient-to-r from-purple-400 to-pink-400 text-white"
        };
      case "template3":
        return {
          container: "bg-white text-black",
          header: "bg-gray-800 text-white",
          tableHeader: "bg-gray-800 text-white",
          totalBox: "bg-gray-800 text-white"
        };
      case "template4":
        return {
          container: "bg-white text-black",
          header: "bg-gray-800 text-white",
          tableHeader: "bg-green-600 text-white",
          totalBox: "bg-green-600 text-white"
        };
      default:
        return {
          container: "border border-gray-300 bg-white text-black",
          header: "bg-gray-800 text-white",
          tableHeader: "bg-gray-600 text-white",
          totalBox: "bg-gray-600 text-white"
        };
    }
  };
  const styles = getStyleClasses();

  // GST display - always show, use XXXXXXXX if missing
  const companyGstin = company.gstin || "XXXXXXXX";
  const retailerGstin = retailer.gst_number || "XXXXXXXX";

  // Helper function to check if a setting is enabled (defaults to true if not set)
  const isEnabled = (key: string) => displaySettings[key] !== false;

  return (
    <div className={`p-6 rounded-lg ${styles.container} max-w-4xl mx-auto text-sm`}>
      <div className="mb-3">
        <InvoiceStatusBadge invoiceNumber={orderId} variant="banner" />
      </div>
      {/* Header */}
      <div className={`${styles.header} p-4 rounded-t-lg flex justify-between items-center mb-4`}>
        <div className="flex items-center gap-4">
          {isEnabled('header_company_logo') && company.logo_url && (
            <img src={company.logo_url} alt="Company Logo" className="w-28 h-28 object-contain" />
          )}
          <div>
            {isEnabled('header_company_name') && (
              <h1 className="text-lg font-bold">{company.name || "COMPANY NAME"}</h1>
            )}
            {isEnabled('header_company_address') && company.address && (
              <p className="text-xs opacity-90 max-w-md leading-tight">{company.address}</p>
            )}
            {isEnabled('header_company_state') && company.state && (
              <p className="text-xs">State: {company.state}</p>
            )}
            {isEnabled('header_company_phone') && company.contact_phone && (
              <p className="text-xs">Tel: {company.contact_phone}</p>
            )}
            {isEnabled('header_company_email') && company.email && (
              <p className="text-xs">Email: {company.email}</p>
            )}
            {isEnabled('header_company_gstin') && (
              <p className="text-xs">GSTIN: {companyGstin}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold">INVOICE</h2>
        </div>
      </div>

      {/* Bill To & Invoice Details */}
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <h3 className="font-bold text-xs mb-2">BILL TO</h3>
          {isEnabled('billto_retailer_name') && (
            <p className="text-blue-600 font-semibold">{retailer.name || "Customer Name"}</p>
          )}
          {isEnabled('billto_retailer_address') && retailer.address && (
            <p className="text-xs">{retailer.address}</p>
          )}
          {isEnabled('billto_retailer_state') && retailer.state && (
            <p className="text-xs">State: {retailer.state}</p>
          )}
          {isEnabled('billto_retailer_phone') && retailer.phone && (
            <p className="text-xs">Phone: {retailer.phone}</p>
          )}
          {isEnabled('billto_retailer_gstin') && (
            <p className="text-xs">GSTIN: {retailerGstin}</p>
          )}
        </div>
        <div className="text-right">
          {isEnabled('details_invoice_number') && (
            <div className="mb-2">
              <span className="font-bold text-xs">INVOICE #:</span>{" "}
              <span className="text-xs">{isRawUuid(orderId) ? orderId.slice(0, 8).toUpperCase() : orderId}</span>
            </div>
          )}
          {isEnabled('details_invoice_date') && (
            <div className="mb-2">
              <span className="font-bold text-xs">DATE:</span>{" "}
              <span className="text-xs">{invoiceDate || new Date().toLocaleDateString("en-GB")}</span>
            </div>
          )}
          {isEnabled('details_invoice_time') && invoiceTime && (
            <div className="mb-2">
              <span className="font-bold text-xs">TIME:</span>{" "}
              <span className="text-xs">{invoiceTime}</span>
            </div>
          )}
          {isEnabled('details_salesman_name') && salesmanName && (
            <div className="mb-2">
              <span className="font-bold text-xs">SALESMAN:</span>{" "}
              <span className="text-xs">{salesmanName}</span>
            </div>
          )}
          {isEnabled('details_beat_name') && beatName && (
            <div className="mb-2">
              <span className="font-bold text-xs">BEAT:</span>{" "}
              <span className="text-xs">{beatName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      {(() => {
        // Only show a separate MRP/Offer split when at least one line actually
        // has a discount — reads the stored discount_amount, never derives one.
        const hasAnyItemDiscount = cartItems.some(item => (Number(item.discount_amount) || 0) > 0);
        return (
      <div className="mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className={styles.tableHeader}>
              <th className="border border-gray-300 p-2 text-center text-xs">NO</th>
              <th className="border border-gray-300 p-2 text-left text-xs">PRODUCT</th>
              {isEnabled('table_hsn_code') && (
                <th className="border border-gray-300 p-2 text-center text-xs">HSN/SAC</th>
              )}
              <th className="border border-gray-300 p-2 text-center text-xs">QTY</th>
              {isEnabled('table_unit_column') && (
                <th className="border border-gray-300 p-2 text-center text-xs">UNIT</th>
              )}
              {hasAnyItemDiscount ? (
                <>
                  <th className="border border-gray-300 p-2 text-right text-xs">MRP</th>
                  <th className="border border-gray-300 p-2 text-right text-xs">OFFER PRICE</th>
                </>
              ) : (
                <th className="border border-gray-300 p-2 text-right text-xs">PRICE/UNIT</th>
              )}
              <th className="border border-gray-300 p-2 text-center text-xs">GST</th>
              <th className="border border-gray-300 p-2 text-right text-xs">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {cartItems.map((item, index) => {
              // Use display values if available for proper unit representation
              const qty = item.display_quantity !== undefined ? item.display_quantity : (item.quantity || 0);
              const unit = item.display_unit || item.unit || "Piece";
              const displayUnit = unit.toLowerCase();
              const baseUnit = normalizeUnit(item.base_unit || item.unit);
              
              // Calculate rate for the display unit
              let rate = Number(item.rate || item.price) || 0;
              if (item.display_quantity !== undefined && (displayUnit === 'kg' || displayUnit === 'kilogram')) {
                if (['g', 'gm', 'gram', 'grams'].includes(baseUnit)) {
                  rate = rate * 1000;
                }
              } else {
                rate = getDisplayRate(item);
              }
              
              const itemTotal = getLineTotal(item, qty, rate);
              const itemDiscount = Number(item.discount_amount) || 0;
              const originalRate = Number(item.original_rate) || rate;
              const fallbackRate = Number(
                (item as any).tax_rate_snapshot ??
                (item as any).gst_percentage ??
                0
              ) || 0;
              const igstRate = Number((item as any).igst_rate ?? 0) || 0;
              return (
                <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                  <td className="border border-gray-300 p-2 text-center text-xs">{index + 1}</td>
                  <td className="border border-gray-300 p-2 text-xs">{getDisplayName(item)}</td>
                  {isEnabled('table_hsn_code') && (
                    <td className="border border-gray-300 p-2 text-center text-xs">{item.hsn_code || "-"}</td>
                  )}
                  <td className="border border-gray-300 p-2 text-center text-xs">{qty}</td>
                  {isEnabled('table_unit_column') && (
                    <td className="border border-gray-300 p-2 text-center text-xs">{unit}</td>
                  )}
                  {hasAnyItemDiscount ? (
                    <>
                      <td className="border border-gray-300 p-2 text-right text-xs">
                        ₹{originalRate.toFixed(2)}
                      </td>
                      <td className="border border-gray-300 p-2 text-right text-xs">
                        {itemDiscount > 0 ? `₹${rate.toFixed(2)}` : "-"}
                      </td>
                    </>
                  ) : (
                    <td className="border border-gray-300 p-2 text-right text-xs">
                      ₹{rate.toFixed(2)}
                    </td>
                  )}
                  <td className="border border-gray-300 p-2 text-center text-xs">
                    {igstRate > 0 ? `${igstRate}%` : (fallbackRate > 0 ? `${fallbackRate}%` : '-')}
                  </td>
                  <td className="border border-gray-300 p-2 text-right text-xs">
                    ₹{itemTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        );
      })()}

      {/* Scheme Details */}
      {schemeDetails && schemeDetails.trim() && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-bold text-xs mb-2 text-yellow-800">SCHEME DETAILS</h3>
          <p className="text-xs text-yellow-700">{schemeDetails}</p>
        </div>
      )}

      {/* Totals Section */}
      {(() => {
        // Read the stored per-line discount, never derive it — SUB-TOTAL shows
        // list price so SUB-TOTAL - DISCOUNT lines up with the taxable net below,
        // matching the same convention the actual invoice PDF uses.
        const totalDiscount = cartItems.reduce((s: number, i: any) => s + (Number(i.discount_amount) || 0), 0);
        const subtotalGross = subtotal + totalDiscount;
        return (
      <div className="flex justify-end mb-4">
        <div className="w-64">
          {isEnabled('totals_subtotal') && (
            <div className="flex justify-between mb-2">
              <span className="font-bold text-xs">SUB-TOTAL</span>
              <span className="text-xs">₹{subtotalGross.toFixed(2)}</span>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex justify-between mb-2 text-green-700">
              <span className="font-bold text-xs">DISCOUNT</span>
              <span className="text-xs">-₹{totalDiscount.toFixed(2)}</span>
            </div>
          )}
          {isEnabled('totals_tax_breakdown') && (() => {
            // Same rate-suffix convention as Cart's own summary: show the
            // % only when every line shares one rate, so it's never a
            // misleading label on a mixed-rate order.
            const rates = Array.from(new Set(
              lineTaxes.filter((l: any) => l && l.taxRate > 0).map((l: any) => l.taxRate)
            ));
            const uniformRate = rates.length === 1 ? rates[0] : null;
            const half = uniformRate != null ? +(uniformRate / 2).toFixed(2) : null;
            return (
            <>
              <div className="flex justify-between mb-2">
                <span className="font-bold text-xs">SGST{half != null ? ` @ ${half}%` : ''}</span>
                <span className="text-xs">₹{sgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="font-bold text-xs">CGST{half != null ? ` @ ${half}%` : ''}</span>
                <span className="text-xs">₹{cgst.toFixed(2)}</span>
              </div>
              {rates.length > 1 && (
                <div className="text-[10px] text-gray-500 italic mb-2">
                  Mixed GST rates: {rates.sort((a: number, b: number) => a - b).map((r: number) => `${r}%`).join(', ')}
                </div>
              )}
              {igst > 0 && (
                <div className="flex justify-between mb-2">
                  <span className="font-bold text-xs">IGST</span>
                  <span className="text-xs">₹{igst.toFixed(2)}</span>
                </div>
              )}
              {cess > 0 && (
                <div className="flex justify-between mb-3">
                  <span className="font-bold text-xs">CESS</span>
                  <span className="text-xs">₹{cess.toFixed(2)}</span>
                </div>
              )}
            </>
            );
          })()}
          {(() => {
            // displayTotal is the real final amount handed in by the caller
            // (Cart or the order); every line above is exact-to-the-paisa —
            // show that gap explicitly instead of letting the two silently
            // disagree.
            const roundOffAmount = displayTotal - total;
            if (Math.abs(roundOffAmount) < 0.005) return null;
            const sign = roundOffAmount >= 0 ? '+' : '-';
            return (
              <div className="flex justify-between mb-2">
                <span className="font-bold text-xs">ROUND OFF</span>
                <span className="text-xs">{sign}₹{Math.abs(roundOffAmount).toFixed(2)}</span>
              </div>
            );
          })()}
          <div className={`${styles.totalBox} p-2 rounded flex justify-center items-center`}>
            <span className="font-bold text-sm">Total amount: ₹{displayTotal}</span>
          </div>

          {/* Payment status — read straight from the order, never derived here */}
          <div className="mt-2 pt-2 border-t border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-600">Balance</span>
              <span className="text-xs font-semibold">
                {balanceDue != null ? `₹${balanceDue.toFixed(2)}` : `₹0.00`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Payment mode</span>
              <span className="text-xs font-semibold">
                {paymentMode ? (PAYMENT_MODE_LABELS[paymentMode] || paymentMode) : "Not yet selected"}
              </span>
            </div>
          </div>

        </div>
      </div>
        );
      })()}

      {/* Amount in Words */}
      {isEnabled('totals_amount_in_words') && (
        <div className="mb-3 p-2 bg-gray-100 rounded">
          <p className="text-xs">
            <span className="font-bold">Amount in Words:</span> {totalInWords}
          </p>
        </div>
      )}

      {/* CGST Rule 46(o): every tax invoice must state whether tax is payable
          on reverse charge. Always "No" for a normal forward-charge retail sale. */}
      <p className="text-[11px] text-gray-500 mb-3">
        Tax is payable on reverse charge: No
      </p>

      {/* Bank Details and QR Code */}
      {(isEnabled('payment_bank_details') || isEnabled('payment_qr_code')) && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bank Details */}
          {isEnabled('payment_bank_details') && (
            <div>
              <h3 className="font-bold text-xs mb-2">BANK DETAILS</h3>
              <div className="text-xs space-y-1">
                {company.bank_name && <p>Bank: {company.bank_name}</p>}
                {company.account_holder_name && <p>Account Holder: {company.account_holder_name}</p>}
                {company.bank_account && <p>Account Number: {company.bank_account}</p>}
                {company.ifsc && <p>IFSC: {company.ifsc}</p>}
                {isEnabled('payment_upi_id') && company.qr_upi && <p>UPI ID: {company.qr_upi}</p>}
              </div>
            </div>
          )}
          
          {/* QR Code for Payment */}
          {isEnabled('payment_qr_code') && company.qr_code_url && (
            <div className="flex flex-col items-center justify-center border-2 border-primary/20 rounded-lg p-4 bg-primary/5">
              <p className="text-sm font-bold mb-3 text-primary">Scan QR for Payment</p>
              <img 
                src={company.qr_code_url} 
                alt="Payment QR Code" 
                className="w-32 h-32 object-contain border-2 border-primary rounded-lg shadow-md" 
              />
              {isEnabled('payment_upi_id') && company.qr_upi && (
                <p className="text-xs text-muted-foreground mt-2">UPI: {company.qr_upi}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Signature */}
      {isEnabled('footer_signature_area') && (
        <div className="flex justify-end mb-4">
          <div className="text-right">
            <p className="text-xs font-bold mb-1">For {company.name || "Company"}</p>
            <div className="mt-5 pt-2 border-t border-gray-400">
              <p className="text-xs italic">Authorized Signatory</p>
            </div>
          </div>
        </div>
      )}

      {/* Terms */}
      {isEnabled('footer_terms_conditions') && company.terms_conditions && company.terms_conditions.trim() && (
        <div className="mb-4">
          <h3 className="font-bold text-xs mb-2">TERMS AND CONDITIONS</h3>
          <p className="text-xs text-blue-600">
            {company.terms_conditions}
          </p>
        </div>
      )}

      {/* Footer */}
      {isEnabled('footer_thank_you') && (
        <div className={`${styles.header} p-3 rounded-b-lg text-center mt-6`}>
          <p className="text-xl font-bold mb-2">THANK YOU FOR YOUR BUSINESS</p>
        </div>
      )}
    </div>
  );
}
