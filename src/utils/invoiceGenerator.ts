// Static imports avoid "Failed to fetch dynamically imported module" errors
// that surface after deploys when stale chunk hashes are gone from CDN.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from "@/integrations/supabase/client";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { getInvoiceDisplaySettingsMap, DisplaySettingsMap } from "@/hooks/useInvoiceDisplaySettings";
import { applyInvoiceWatermark } from "@/utils/invoiceWatermark";
import { resolveProduct } from "@/utils/resolveProduct";

/**
 * Compress an image (URL string or Blob) for PDF embedding.
 * Returns a JPEG base64 data URL at reduced dimensions and quality.
 */
async function compressImageForPDF(
  input: string | Blob,
  maxDim: number = 150,
  quality: number = 0.3
): Promise<string> {
  // Get a blob from URL if needed
  let blob: Blob;
  if (typeof input === 'string') {
    const response = await fetch(input);
    blob = await response.blob();
  } else {
    blob = input;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for PDF compression'));
    };

    img.src = objectUrl;
  });
}

// Helper function to check if text contains non-English characters (Indian languages)
const containsNonEnglishChars = (text: string): boolean => {
  if (!text) return false;
  // Check for common Indian language Unicode ranges
  // Devanagari: \u0900-\u097F, Kannada: \u0C80-\u0CFF, Tamil: \u0B80-\u0BFF
  // Telugu: \u0C00-\u0C7F, Malayalam: \u0D00-\u0D7F, Bengali: \u0980-\u09FF
  // Gujarati: \u0A80-\u0AFF, Punjabi: \u0A00-\u0A7F, Odia: \u0B00-\u0B7F
  const indianLangPattern = /[\u0900-\u097F\u0C80-\u0CFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0980-\u09FF\u0A80-\u0AFF\u0A00-\u0A7F\u0B00-\u0B7F]/;
  return indianLangPattern.test(text);
};

// Translate address from regional language to English using AI
const translateAddressToEnglish = async (address: string): Promise<string> => {
  if (!address || !containsNonEnglishChars(address)) {
    return address; // Already in English or empty
  }
  
  try {
    console.log('🌐 Translating address from regional language to English:', address.substring(0, 50) + '...');
    
    const { data, error } = await supabase.functions.invoke('translate-address', {
      body: { addresses: [address] }
    });
    
    if (error) {
      console.error('Translation error:', error);
      return address; // Return original if translation fails
    }
    
    const translatedAddress = data?.translatedAddresses?.[0];
    if (translatedAddress) {
      console.log('✅ Address translated successfully');
      return translatedAddress;
    }
    
    return address;
  } catch (err) {
    console.error('Failed to translate address:', err);
    return address; // Return original on error
  }
};

interface InvoiceData {
  orderId: string;
  company: any;
  retailer: any;
  cartItems: any[];
  displayInvoiceNumber?: string;
  displayInvoiceDate?: string;
  displayInvoiceTime?: string;
  beatName?: string;
  salesmanName?: string;
  schemeDetails?: string;
  orderDiscount?: number; // Order-level discount from orders.discount_amount
  orderTotal?: number; // Final total from orders.total_amount (includes GST, discounts)
  displaySettings?: DisplaySettingsMap; // Display settings from Invoice Management
  paymentMode?: string; // orders.payment_method — read straight through, never derived
  amountPaid?: number;
  balanceDue?: number;
}

// Helper function to format amount with 2 decimal places (exact)
const formatExact = (amount: number): string => {
  return amount.toFixed(2);
};

// Helper function to format final total as rounded whole number
const formatRounded = (amount: number): string => {
  return Math.round(amount).toString();
};

// Helper function to convert number to words (Indian system)
const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const convertTwoDigit = (n: number): string => {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  };
  
  const convertThreeDigit = (n: number): string => {
    if (n === 0) return "";
    if (n < 100) return convertTwoDigit(n);
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertTwoDigit(n % 100) : "");
  };
  
  if (num < 100) return convertTwoDigit(num);
  if (num < 1000) return convertThreeDigit(num);
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    return convertThreeDigit(thousands) + " Thousand" + (remainder ? " " + convertThreeDigit(remainder) : "");
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    let remainder = num % 100000;
    let result = convertTwoDigit(lakhs) + " Lakh";
    if (remainder >= 1000) {
      result += " " + convertThreeDigit(Math.floor(remainder / 1000)) + " Thousand";
      remainder = remainder % 1000;
    }
    if (remainder > 0) {
      result += " " + convertThreeDigit(remainder);
    }
    return result;
  }
  return num.toString();
};

/**
 * Normalize item for display - ALWAYS convert grams to KG for display
 * CRITICAL: Uses stored order_items.total and discount_amount to compute final line total
 * This ensures invoice matches exactly what was shown in cart at order time
 */
const normalizeItemForDisplay = (item: any) => {
  const unit = (item.unit || '').toLowerCase();
  const qty = Number(item.quantity) || 0;
  // order_items.total is ALREADY NET of any discount: it is quantity x the
  // discounted rate that was written at order time. order_items.discount_amount
  // is the amount SAVED, recorded alongside it for display, not a further
  // deduction.
  //
  // This used to read `storedTotal - discountAmt`, which charged the discount a
  // second time. On a 50% scheme the two values are equal by definition, so
  // every line rendered as exactly 0.00 — see the 12 Aug 2026 orders for
  // Pushpagiri Store and ANEMAHAL SPICES & COFFEE, where a global 50% scheme was
  // briefly live. At any other percentage it produced a wrong-but-plausible
  // figure instead, which is why it went unnoticed for so long.
  //
  // The Math.max(0, ...) clamp is deliberately gone as well: it turned negative
  // arithmetic into a clean-looking zero and hid the fault. A future error here
  // should look obviously wrong.
  const storedTotal = Number(item.total) || 0;
  // Amount saved on this line — display only.
  const discountAmt = Number(item.discount_amount) || 0;
  const finalLineTotal = storedTotal;
  
  const originalRate = Number(item.original_rate) || Number(item.rate || item.price) || 0;
  
  const isGramsUnit = unit === 'grams' || unit === 'gram' || unit === 'g';
  
  // ALWAYS convert grams to KG for invoice display
  if (isGramsUnit) {
    // Convert quantity from grams to KG
    const displayQty = qty / 1000;
    
    // Calculate per-KG original rate for display
    const isPerGramOrigRate = originalRate > 0 && originalRate < 1;
    const displayOriginalRate = isPerGramOrigRate ? originalRate * 1000 : originalRate;
    
    // Calculate effective rate from final line total
    const displayRate = displayQty > 0 ? finalLineTotal / displayQty : displayOriginalRate;
    
    return {
      displayUnit: 'KG',
      displayQty: displayQty,
      displayRate: displayRate,
      displayOriginalRate: displayOriginalRate,
      displayDiscountAmount: discountAmt,
      storedTotal: finalLineTotal, // Use discounted line total
    };
  }
  
  // For items with explicit display_unit/display_quantity
  if (item.display_unit && item.display_quantity) {
    const displayQty = Number(item.display_quantity) || qty;
    const isDisplayKg = item.display_unit.toLowerCase() === 'kg';
    const isPerGramOrigRate = originalRate > 0 && originalRate < 1;
    const displayOrigRate = isDisplayKg && isPerGramOrigRate ? originalRate * 1000 : originalRate;
    
    // Calculate effective rate from final line total
    const displayRate = displayQty > 0 ? finalLineTotal / displayQty : displayOrigRate;
    
    return {
      displayUnit: item.display_unit,
      displayQty: displayQty,
      displayRate: displayRate,
      displayOriginalRate: displayOrigRate,
      displayDiscountAmount: discountAmt,
      storedTotal: finalLineTotal,
    };
  }
  
  // Default: use as-is for non-gram units
  const displayRate = qty > 0 ? finalLineTotal / qty : originalRate;
  return {
    displayUnit: item.unit || 'Piece',
    displayQty: qty,
    displayRate: displayRate,
    displayOriginalRate: originalRate,
    displayDiscountAmount: discountAmt,
    storedTotal: finalLineTotal,
  };
};

/**
 * Generate the invoice PDF.
 *
 * SINGLE SOURCE OF TRUTH: this renders the exact same <InvoicePreview />
 * component the on-screen preview uses, so preview and download are identical.
 * The legacy hand-drawn jsPDF layout below is kept only as a safety fallback.
 */
export async function generateTemplate4Invoice(data: InvoiceData): Promise<Blob> {
  try {
    const { renderInvoicePreviewToPdfBlob } = await import('./renderInvoicePreviewPdf');
    let displaySettings = data.displaySettings;
    if (!displaySettings) {
      try {
        displaySettings = await getInvoiceDisplaySettingsMap();
      } catch {
        displaySettings = undefined;
      }
    }
    return await renderInvoicePreviewToPdfBlob({
      company: data.company,
      retailer: data.retailer,
      cartItems: data.cartItems,
      orderId: data.displayInvoiceNumber || data.orderId,
      beatName: data.beatName,
      salesmanName: data.salesmanName,
      invoiceDate: data.displayInvoiceDate,
      invoiceTime: data.displayInvoiceTime,
      schemeDetails: data.schemeDetails,
      displaySettings,
      paymentMode: data.paymentMode,
      amountPaid: data.amountPaid,
      balanceDue: data.balanceDue,
      orderTotal: data.orderTotal,
    });
  } catch (err) {
    console.error('Preview-based invoice render failed, falling back to legacy layout', err);
    return generateTemplate4InvoiceLegacy(data);
  }
}

/** @deprecated Legacy hand-drawn jsPDF layout — fallback only. */
async function generateTemplate4InvoiceLegacy(data: InvoiceData): Promise<Blob> {

  const { orderId, company, retailer, cartItems, displayInvoiceNumber, displayInvoiceDate, displayInvoiceTime, beatName, salesmanName, schemeDetails, orderDiscount, orderTotal } = data;
  
  // Fetch display settings for customizable invoice fields
  let displaySettings: DisplaySettingsMap | null = null;
  try {
    displaySettings = await getInvoiceDisplaySettingsMap();
  } catch (e) {
    console.warn('Failed to fetch display settings, using defaults:', e);
  }
  
  const isEnabled = (key: string): boolean => {
    if (!displaySettings) return true; // Default: show everything
    return displaySettings[key] !== false;
  };

  // Translate retailer address if it contains regional language characters
  const retailerWithTranslatedAddress = { ...retailer };
  if (retailer.address) {
    retailerWithTranslatedAddress.address = await translateAddressToEnglish(retailer.address);
  }
  
  // Helper to get short display name (variant only, not "Product - Variant")
  const getShortDisplayName = (fullName: string): string => {
    if (!fullName) return '';
    // Check if format is "Product - Variant"
    const dashIndex = fullName.indexOf(' - ');
    if (dashIndex > 0) {
      const variantPart = fullName.substring(dashIndex + 3).trim();
      if (variantPart) return variantPart;
    }
    return fullName;
  };
  
  const getDisplayName = (item: any): string => {
    return getShortDisplayName(item.product_name || item.name || '');
  };

  const doc = new jsPDF({ compress: true });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Dark header background - matching template4 (bg-gray-800: rgb(31, 41, 55))
  doc.setFillColor(31, 41, 55);
  doc.rect(0, 0, pageWidth, 52, "F");

  // Logo image - maintain aspect ratio with max height
  let companyNameX = 15;
  if (isEnabled('header_company_logo') && company.logo_url) {
    try {
      // Compress logo to max 150px, JPEG quality 0.3 for small PDF size
      const base64 = await compressImageForPDF(company.logo_url, 150, 0.3);
      
      // Get compressed image dimensions to maintain aspect ratio
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = base64;
      });
      
      // Calculate proportional dimensions with max height of 22 points
      const maxHeight = 22;
      const maxWidth = 40;
      const aspectRatio = img.width / img.height;
      let logoWidth = maxHeight * aspectRatio;
      let logoHeight = maxHeight;
      
      // If width exceeds max, scale down based on width instead
      if (logoWidth > maxWidth) {
        logoWidth = maxWidth;
        logoHeight = maxWidth / aspectRatio;
      }
      
      doc.addImage(base64, 'JPEG', 15, 12, logoWidth, logoHeight);
      companyNameX = 18 + logoWidth;
    } catch (e) {
      console.warn("Failed to load logo image for invoice PDF:", e);
      companyNameX = 15;
    }
  }

  // Company name and details (left side)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  let headerY = 16;
  if (isEnabled('header_company_name')) {
    doc.text((company.name || "COMPANY NAME").toUpperCase(), companyNameX, headerY);
  }
  
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  headerY = 21;
  if (isEnabled('header_company_address') && company.address) {
    const addressLines = doc.splitTextToSize(company.address, 90);
    doc.text(addressLines.slice(0, 2), companyNameX, headerY);
    headerY += addressLines.slice(0, 2).length * 3.5;
  }
  if (isEnabled('header_company_phone') && company.contact_phone) {
    doc.text(`Tel: ${company.contact_phone}`, companyNameX, headerY);
    headerY += 3.5;
  }
  if (isEnabled('header_company_email') && company.email) {
    doc.text(`Email: ${company.email}`, companyNameX, headerY);
    headerY += 3.5;
  }
  if (isEnabled('header_company_gstin')) {
    doc.text(`GSTIN: ${company.gstin || "XXXXXXXX"}`, companyNameX, headerY);
    headerY += 3.5;
  }
  if (isEnabled('header_company_state') && company.state) {
    doc.text(`State: ${company.state}`, companyNameX, headerY);
  }

  // INVOICE title (right side)
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", pageWidth - 15, 28, { align: "right" });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Bill To section - add gap after header
  let yPos = 62;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("BILL TO", 15, yPos);
  
  yPos += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0); // Retailer name in black for professional look
  doc.text(retailerWithTranslatedAddress.name || "Customer Name", 15, yPos);
  
  doc.setTextColor(0, 0, 0);
  yPos += 5;
  if (retailerWithTranslatedAddress.address) {
    const addressLines = doc.splitTextToSize(retailerWithTranslatedAddress.address, 80);
    doc.text(addressLines, 15, yPos);
    yPos += addressLines.length * 4;
  }
  if (retailerWithTranslatedAddress.phone) {
    doc.text(`Phone: ${retailerWithTranslatedAddress.phone}`, 15, yPos);
    yPos += 4;
  }
  if (retailerWithTranslatedAddress.state) {
    doc.text(`State: ${retailerWithTranslatedAddress.state}`, 15, yPos);
    yPos += 4;
  }
  // GST must always be shown - use XXXXXXXX if not available
  doc.text(`GSTIN: ${retailerWithTranslatedAddress.gst_number || retailerWithTranslatedAddress.gstin || "XXXXXXXX"}`, 15, yPos);

  // Invoice details (right side) - add more space after header
  let invoiceY = 62;
  const invoiceNum = (displayInvoiceNumber && displayInvoiceNumber.trim()) || orderId?.slice(0, 8).toUpperCase() || "INV001";
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("INVOICE #:", pageWidth - 60, invoiceY);
  const invLabelWidth = doc.getTextWidth("INVOICE #:");
  doc.setFont("helvetica", "normal");
  // Same 45mm column as ROUTE/SALESMAN below. A wrapped invoice number would
  // look broken across two lines, so shrink to fit on one instead — this was
  // fine at the old 3-digit sequence width but silently overlapped the label
  // once the sequence passed 4 digits (visually reading as a cut-off number).
  const invAvailWidth = 45 - invLabelWidth - 2;
  let invFontSize = 9;
  while (invFontSize > 6 && doc.getTextWidth(invoiceNum) > invAvailWidth) {
    invFontSize -= 0.5;
    doc.setFontSize(invFontSize);
  }
  doc.text(invoiceNum, pageWidth - 15, invoiceY, { align: "right" });
  doc.setFontSize(9);

  invoiceY += 6;
  doc.setFont("helvetica", "bold");
  doc.text("DATE:", pageWidth - 60, invoiceY);
  doc.setFont("helvetica", "normal");
  doc.text((displayInvoiceDate || new Date().toLocaleDateString("en-GB")), pageWidth - 15, invoiceY, { align: "right" });
  
  invoiceY += 6;
  doc.setFont("helvetica", "bold");
  doc.text("TIME:", pageWidth - 60, invoiceY);
  doc.setFont("helvetica", "normal");
  doc.text((displayInvoiceTime || new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })), pageWidth - 15, invoiceY, { align: "right" });
  
  // Beat/Route Name — wrap long names so they don't overlap the label
  if (beatName) {
    invoiceY += 6;
    doc.setFont("helvetica", "bold");
    doc.text("ROUTE:", pageWidth - 60, invoiceY);
    const routeLabelWidth = doc.getTextWidth("ROUTE:");
    doc.setFont("helvetica", "normal");
    const routeMaxWidth = 45 - routeLabelWidth - 2; // 45mm column, 2mm gap
    const routeLines = doc.splitTextToSize(String(beatName), Math.max(routeMaxWidth, 20));
    routeLines.forEach((line: string, idx: number) => {
      doc.text(line, pageWidth - 15, invoiceY + idx * 4, { align: "right" });
    });
    invoiceY += (routeLines.length - 1) * 4;
  }

  // Salesman Name
  if (salesmanName) {
    invoiceY += 6;
    doc.setFont("helvetica", "bold");
    doc.text("SALESMAN:", pageWidth - 60, invoiceY);
    const smLabelWidth = doc.getTextWidth("SALESMAN:");
    doc.setFont("helvetica", "normal");
    const smMaxWidth = 45 - smLabelWidth - 2;
    const smLines = doc.splitTextToSize(String(salesmanName), Math.max(smMaxWidth, 20));
    smLines.forEach((line: string, idx: number) => {
      doc.text(line, pageWidth - 15, invoiceY + idx * 4, { align: "right" });
    });
    invoiceY += (smLines.length - 1) * 4;
  }

  // Calculate total discount for savings display
  let totalDiscount = 0;
  
  // DUPLICATE FIX: Collapse duplicate line items before processing
  // This handles cases where DB has accidental duplicate rows (same product, qty, rate, total)
  const deduplicatedItems = cartItems.reduce((acc: any[], item: any) => {
    const key = `${item.product_id || item.product_name}-${item.quantity}-${item.rate || item.price}-${item.unit}`;
    const existingIndex = acc.findIndex((existing: any) => {
      const existingKey = `${existing.product_id || existing.product_name}-${existing.quantity}-${existing.rate || existing.price}-${existing.unit}`;
      return existingKey === key;
    });
    if (existingIndex === -1) {
      acc.push(item);
    } else {
      console.log('[invoiceGenerator] Collapsing duplicate item:', item.product_name);
    }
    return acc;
  }, []);
  
  // Pre-process items with display normalization
  const normalizedItems = deduplicatedItems.map(item => {
    const normalized = normalizeItemForDisplay(item);
    return {
      ...item,
      _displayUnit: normalized.displayUnit,
      _displayQty: normalized.displayQty,
      _displayRate: normalized.displayRate,
      _displayOriginalRate: normalized.displayOriginalRate,
      _displayDiscountAmount: normalized.displayDiscountAmount,
      _storedTotal: normalized.storedTotal, // CRITICAL: Pass through stored total from order_items
    };
  });
  
  // Items table with green header - show MRP and Offer Price ONLY if item-level discounts exist
  // Order-level discount is shown in totals section, not in item rows
  const hasAnyItemDiscount = normalizedItems.some(item => {
    const discountAmt = Number(item.discount_amount) || 0;
    return discountAmt > 0;
  });
  
  const tableData = normalizedItems.map((item, index) => {
    const displayQty = item._displayQty;
    const displayUnit = item._displayUnit;
    const displayOriginalRate = item._displayOriginalRate;
    const itemDiscount = item._displayDiscountAmount;
    // CRITICAL: Use stored total directly from order_items - this is finalized cart data
    const storedTotal = item._storedTotal || 0;

    // If we have stored invoice values (from edited invoices), use them directly
    const hasStoredValues = item.taxable_amount != null && item.sgst_amount != null && item.cgst_amount != null;
    
    let originalRate: number;
    let rowTotal: number;
    let effectiveRate: number;
    
    if (hasStoredValues) {
      // Use stored values directly (edited invoice case)
      effectiveRate = Number(item.price || item.rate) || 0;
      originalRate = Number(item.original_rate) || effectiveRate;
      rowTotal = Number(item.taxable_amount) || 0;
    } else {
      // CRITICAL FIX: Use stored total from order_items directly
      // This ensures invoice shows exactly what cart showed at order time
      rowTotal = storedTotal;
      originalRate = displayOriginalRate;
      // Calculate effective rate from stored total for display consistency
      effectiveRate = displayQty > 0 ? storedTotal / displayQty : originalRate;
    }
    
    totalDiscount += itemDiscount;
    
    // Format quantity - show decimals only if needed
    const qtyStr = Number.isInteger(displayQty) ? displayQty.toString() : displayQty.toFixed(2);

    // GST rate per line: prefer persisted snapshot, then product gst_percentage (legacy)
    const lineGstRate = Number(
      (item as any).tax_rate_snapshot ??
      (item as any).gst_percentage ??
      0
    ) || 0;
    const cgstRate = Number((item as any).cgst_rate ?? (lineGstRate / 2)) || 0;
    const sgstRate = Number((item as any).sgst_rate ?? (lineGstRate / 2)) || 0;
    const igstRate = Number((item as any).igst_rate ?? 0) || 0;
    const cgstStr = igstRate > 0 ? `IGST ${igstRate}%` : (cgstRate > 0 ? `${cgstRate}%` : "-");
    const sgstStr = igstRate > 0 ? "-" : (sgstRate > 0 ? `${sgstRate}%` : "-");
    
    // If there are item-level discounts in the order, show MRP and Offer columns
    if (hasAnyItemDiscount) {
      // Only show offer price if THIS item has a discount
      const hasItemDiscount = itemDiscount > 0;
      return [
        (index + 1).toString(),
        getDisplayName(item),
        item.hsn_code || "-",
        displayUnit,
        qtyStr,
        `Rs.${formatExact(originalRate)}`, // MRP - exact
        hasItemDiscount ? `Rs.${formatExact(effectiveRate)}` : "-", // Offer Price (or "-" if no discount for this item)
        cgstStr,
        sgstStr,
        `Rs.${formatExact(rowTotal)}`, // Row total - use stored value
      ];
    } else {
      // No discounts - show simpler table without OFFER column
      return [
        (index + 1).toString(),
        getDisplayName(item),
        item.hsn_code || "-",
        displayUnit,
        qtyStr,
        `Rs.${formatExact(effectiveRate)}`, // Price (from stored total)
        cgstStr,
        sgstStr,
        `Rs.${formatExact(rowTotal)}`, // Row total - use stored value
      ];
    }
  });

  // Table headers based on whether item-level discounts exist
  const tableHeaders = hasAnyItemDiscount 
    ? [["NO", "PRODUCT", "HSN", "UNIT", "QTY", "MRP", "OFFER", "CGST%", "SGST%", "TOTAL"]]
    : [["NO", "PRODUCT", "HSN/SAC", "UNIT", "QTY", "PRICE", "CGST%", "SGST%", "TOTAL"]];

  // Column styles based on whether item-level discounts exist
  const columnStyles = hasAnyItemDiscount
    ? {
        0: { cellWidth: 10, halign: "center" as const },
        1: { cellWidth: 'auto' as const, halign: "left" as const },
        2: { cellWidth: 14, halign: "center" as const },
        3: { cellWidth: 12, halign: "center" as const },
        4: { cellWidth: 10, halign: "center" as const },
        5: { cellWidth: 18, halign: "right" as const },
        6: { cellWidth: 18, halign: "right" as const },
        7: { cellWidth: 14, halign: "center" as const },
        8: { cellWidth: 14, halign: "center" as const },
        9: { cellWidth: 22, halign: "right" as const },
      }
    : {
        0: { cellWidth: 12, halign: "center" as const },
        1: { cellWidth: 'auto' as const, halign: "left" as const },
        2: { cellWidth: 18, halign: "center" as const },
        3: { cellWidth: 14, halign: "center" as const },
        4: { cellWidth: 12, halign: "center" as const },
        5: { cellWidth: 20, halign: "right" as const },
        6: { cellWidth: 14, halign: "center" as const },
        7: { cellWidth: 14, halign: "center" as const },
        8: { cellWidth: 24, halign: "right" as const },
      };

  autoTable(doc, {
    startY: 102,
    head: tableHeaders,
    body: tableData,
    theme: "grid",
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.5,
      fontSize: 8,
      textColor: [0, 0, 0],
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [22, 163, 74], // Green header matching preview
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      lineWidth: 0.5,
      lineColor: [22, 163, 74],
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    alternateRowStyles: {
      fillColor: [247, 247, 247],
    },
    columnStyles: columnStyles,
    margin: { left: 15, right: 15 },
  });

  // Calculate totals - read stored per-line tax from order_items (Phase 4).
  // Falls back to computeLineTax only when a line has no stored tax (legacy orders).
  const { resolveLineTax: _resolveLineTax } = await import('@/utils/taxCalc');

  const hasStoredTotals = normalizedItems.some(item =>
    item.taxable_amount != null && item.sgst_amount != null && item.cgst_amount != null
  );

  // Calculate item subtotal (sum of all line items before order-level discount)
  const itemSubtotal = normalizedItems.reduce((sum, item) => {
    if (hasStoredTotals && item.taxable_amount != null) {
      return sum + Number(item.taxable_amount);
    }
    return sum + (item._storedTotal || 0);
  }, 0);

  // orders.discount_amount is the sum of the per-line discounts ALREADY reflected
  // in each line's net total, so it must not be subtracted from itemSubtotal
  // again — that was the second of the two deductions that drove the subtotal to
  // zero on a 50% scheme.
  const appliedOrderDiscount = orderDiscount || 0;

  // itemSubtotal is net of discount, and it is what tax and the grand total are
  // computed from. The totals box, though, reads as a normal invoice:
  //
  //     SUB-TOTAL   gross (what the goods cost at list price)
  //     DISCOUNT   -amount saved
  //     GST         on the net
  //     TOTAL
  //
  // so it needs the GROSS figure to show on the SUB-TOTAL line. Printing the net
  // there and then also printing a DISCOUNT deduction below it would imply the
  // discount comes off twice — the very thing this fix removes.
  const itemSubtotalGross = itemSubtotal + appliedOrderDiscount;
  const subtotal = itemSubtotal;

  // Sum per-line stored tax (CGST/SGST/IGST/CESS) — fallback per line via helper.
  const lineTaxes = cartItems.map((it: any) => _resolveLineTax(it));
  const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
  const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
  const igst = lineTaxes.reduce((s, l) => s + l.igst, 0);
  const cess = lineTaxes.reduce((s, l) => s + l.cess, 0);

  // CRITICAL: If orderTotal is provided, use it directly (this is the finalized amount)
  const total = orderTotal
    ? orderTotal
    : (hasStoredTotals && cartItems.some(item => item.total_amount != null)
        ? cartItems.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0)
        : (subtotal + cgst + sgst + igst + cess));

  
  // Note: totalDiscount tracks item-level discounts, order-level discount is shown separately
  
  // Convert total to words (use rounded total for consistency)
  const roundedTotal = Math.round(total);
  const totalInWords = numberToWords(roundedTotal) + " Rupees Only";

  // Rate-wise GST summary (GST compliant) — grouped by line gst rate
  {
    const groups = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
    cartItems.forEach((it: any, i: number) => {
      const lt = lineTaxes[i];
      if (!lt || lt.taxRate <= 0) return;
      const key = Number(lt.taxRate) || 0;
      const g = groups.get(key) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      g.taxable += Number((lt as any).taxableAmount ?? 0) || 0;
      g.cgst += lt.cgst; g.sgst += lt.sgst; g.igst += lt.igst; g.cess += lt.cess;
      groups.set(key, g);
    });
    if (groups.size > 0) {
      const anyIgst = Array.from(groups.values()).some(v => v.igst > 0);
      const head = anyIgst
        ? [["RATE", "TAXABLE", "CGST", "SGST", "IGST", "TOTAL TAX"]]
        : [["RATE", "TAXABLE", "CGST", "SGST", "TOTAL TAX"]];
      const body = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]).map(([rate, v]) => {
        const totalTax = v.cgst + v.sgst + v.igst + v.cess;
        const row = [
          `${rate}%`,
          `Rs.${formatExact(v.taxable)}`,
          `Rs.${formatExact(v.cgst)}`,
          `Rs.${formatExact(v.sgst)}`,
        ];
        if (anyIgst) row.push(`Rs.${formatExact(v.igst)}`);
        row.push(`Rs.${formatExact(totalTax)}`);
        return row;
      });
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 4,
        head,
        body,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.3 },
        headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center" },
        margin: { left: 15, right: 15 },
        tableWidth: 'auto',
      });
    }
  }

  // Totals section - compact box
  yPos = (doc as any).lastAutoTable.finalY + 6;
  
  // Calculate box dimensions - compact sizing
  const totalsBoxWidth = 65;
  const totalsBoxX = pageWidth - 15 - totalsBoxWidth;
  const labelOffset = 3;
  const valueOffset = totalsBoxWidth - 3;
  
  // Compact row heights - add extra row for discount if applicable
  const hasOrderLevelDiscount = appliedOrderDiscount > 0;
  const rowHeight = 5;
  const totalRowHeight = 7;
  const showIgst = igst > 0;
  const showCess = cess > 0;
  // The Total bar below shows a whole-rupee amount (formatRounded) while every
  // line above it is exact-to-the-paisa — that gap must be shown as its own
  // line, never silently absorbed, so the invoice always foots exactly.
  const roundOffAmount = Math.round(total) - total;
  const hasRoundOff = Math.abs(roundOffAmount) >= 0.005;
  // Rows: SUB-TOTAL, (DISCOUNT if any), SGST, CGST, (IGST?), (CESS?), (ROUND OFF?), then TOTAL bar
  const numRows = 3 + (hasOrderLevelDiscount ? 1 : 0) + (showIgst ? 1 : 0) + (showCess ? 1 : 0) + (hasRoundOff ? 1 : 0);
  const totalsBoxHeight = (numRows * rowHeight) + totalRowHeight + 4;
  
  // Draw border box
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(totalsBoxX, yPos - 1, totalsBoxWidth, totalsBoxHeight);
  
  let innerY = yPos + 3;
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  
  // SUB-TOTAL at list price, so SUB-TOTAL - DISCOUNT = the taxable net below.
  doc.text("SUB-TOTAL", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(itemSubtotalGross)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  
  // Show order-level discount if applicable
  if (hasOrderLevelDiscount) {
    innerY += rowHeight;
    doc.setTextColor(22, 163, 74);
    doc.setFont("helvetica", "bold");
    doc.text("DISCOUNT", totalsBoxX + labelOffset, innerY);
    doc.text(`-Rs.${formatExact(appliedOrderDiscount)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
  }
  
  innerY += rowHeight;
  doc.text("SGST", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(sgst)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  
  innerY += rowHeight;
  doc.text("CGST", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(cgst)}`, totalsBoxX + valueOffset, innerY, { align: "right" });

  if (showIgst) {
    innerY += rowHeight;
    doc.text("IGST", totalsBoxX + labelOffset, innerY);
    doc.text(`Rs.${formatExact(igst)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  }
  if (showCess) {
    innerY += rowHeight;
    doc.text("CESS", totalsBoxX + labelOffset, innerY);
    doc.text(`Rs.${formatExact(cess)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  }

  if (hasRoundOff) {
    innerY += rowHeight;
    const sign = roundOffAmount >= 0 ? "+" : "-";
    doc.text("ROUND OFF", totalsBoxX + labelOffset, innerY);
    doc.text(`${sign}Rs.${formatExact(Math.abs(roundOffAmount))}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  }


  // Total amount bar (green)
  innerY += rowHeight + 1;
  doc.setFillColor(22, 163, 74);
  doc.rect(totalsBoxX, innerY - 2, totalsBoxWidth, totalRowHeight, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const totalText = `Total: Rs.${formatRounded(total)}`;
  const textWidth = doc.getTextWidth(totalText);
  doc.text(totalText, totalsBoxX + totalsBoxWidth / 2 - textWidth / 2, innerY + 3);
  
  yPos = yPos + totalsBoxHeight + 2;
  doc.setTextColor(0, 0, 0);
  
  // Total in Words
  yPos += 10;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Amount in Words:", 15, yPos);
  doc.setFont("helvetica", "normal");
  yPos += 4;
  const wordsLines = doc.splitTextToSize(totalInWords, pageWidth - 30);
  doc.text(wordsLines, 15, yPos);

  // Scheme Details section (if available)
  if (schemeDetails) {
    yPos += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("SCHEME DETAILS", 15, yPos);
    
    yPos += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const schemeLines = doc.splitTextToSize(schemeDetails, pageWidth - 30);
    doc.text(schemeLines, 15, yPos);
    yPos += schemeLines.length * 4;
  }

  // Payment Method section
  yPos += 10;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BANK DETAILS", 15, yPos);
  
  yPos += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (company.bank_name) {
    doc.text(`Bank Name: ${company.bank_name}`, 15, yPos);
    yPos += 4;
  }
  if (company.account_holder_name) {
    doc.text(`Account Holder: ${company.account_holder_name}`, 15, yPos);
    yPos += 4;
  }
  if (company.bank_account) {
    doc.text(`Account Number: ${company.bank_account}`, 15, yPos);
    yPos += 4;
  }
  if (company.ifsc) {
    doc.text(`IFSC Code: ${company.ifsc}`, 15, yPos);
    yPos += 4;
  }
  if (company.qr_upi) {
    doc.text(`UPI ID: ${company.qr_upi}`, 15, yPos);
    yPos += 4;
  }
  
  // QR Code and Signature section with proper spacing
  const sectionStartY = yPos;
  
  // Signature (right aligned) - matching preview
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("For " + (company.name || "Company").toUpperCase(), pageWidth - 15, sectionStartY, { align: "right" });
  
  // Signature line
  const sigLineY = sectionStartY + 16;
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth - 55, sigLineY, pageWidth - 15, sigLineY);
  
  // Authorized Signatory text in italics
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text("Authorized Signatory", pageWidth - 35, sigLineY + 4, { align: "center" });
  
  // QR Code box (right side)
  if (company.qr_code_url) {
    try {
      // Compress QR code to max 100px, JPEG quality 0.3 for small PDF size
      const base64 = await compressImageForPDF(company.qr_code_url, 100, 0.3);
      
      const boxX = pageWidth - 95;
      const boxY = sectionStartY - 10;
      const boxW = 80;
      const boxH = 60;

      // Light gray rounded background box for QR, matching preview
      doc.setFillColor(248, 250, 252); // slate-50 style background
      doc.setDrawColor(203, 213, 225); // slate-300 border
      doc.setLineWidth(0.3);
      if ((doc as any).roundedRect) {
        (doc as any).roundedRect(boxX, boxY, boxW, boxH, 3, 3, "FD");
      } else {
        doc.rect(boxX, boxY, boxW, boxH, "FD");
      }

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(55, 65, 81);
      doc.text("Scan QR for Payment", boxX + boxW / 2, boxY + 8, { align: "center" });

      doc.addImage(base64, 'JPEG', boxX + (boxW - 34) / 2, boxY + 14, 34, 34);

      if (company.qr_upi) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
        doc.text(`UPI: ${company.qr_upi}`, boxX + boxW / 2, boxY + 50, { align: "center" });
      }
      // ensure yPos goes below the QR box
      yPos = Math.max(yPos, boxY + boxH);
    } catch (error) {
      console.error("Error loading QR code:", error);
    }
  }

  // Terms and Conditions
  yPos += 12;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TERMS AND CONDITIONS", 15, yPos);
  
  yPos += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(55, 65, 81); // Muted gray for terms
  const terms = company.terms_conditions || "Please pay within 15 days from the date of invoice. Late payment is subject to fees of 5% per month.";
  const termsLines = doc.splitTextToSize(terms, pageWidth - 30);
  doc.text(termsLines, 15, yPos);

  // Dark footer bar with only thank you message - matching preview
  const footerHeight = 18;
  const footerY = pageHeight - footerHeight;
  doc.setFillColor(31, 41, 55);
  doc.rect(0, footerY, pageWidth, footerHeight, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("THANK YOU FOR YOUR BUSINESS", pageWidth / 2, footerY + 12, { align: "center" });

  const pdfBlob = doc.output('blob');
  
  // Post-generation size guard
  const sizeKB = pdfBlob.size / 1024;
  if (sizeKB > 50) {
    console.warn(`⚠️ Invoice PDF size ${sizeKB.toFixed(1)} KB exceeds 50 KB target`);
  }
  
  return pdfBlob;
}

/**
 * Fetch order data and generate invoice using the selected template from Invoice Management
 * Checks for edited invoices first, falls back to generating from order data
 */
export async function fetchAndGenerateInvoice(orderId: string): Promise<{ blob: Blob; invoiceNumber: string }> {
  // First check if an edited invoice exists for this order
  const { data: editedInvoice } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("order_id", orderId)
    .eq("is_edited", true)
    .maybeSingle();

  if (editedInvoice) {
    // Use edited invoice data
    console.log("📝 Using edited invoice data");
    
    // Fetch company details
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!company) throw new Error("Company not found");

    // Fetch retailer details and order info from the original order
    const { data: order } = await supabase
      .from("orders")
      .select("retailer_id, retailer_name, user_id, created_at")
      .eq("id", orderId)
      .single();

    let retailer: any = null;
    let beatName = "";
    if (order?.retailer_id) {
      const { data: retailerData } = await supabase
        .from("retailers")
        .select("name, address, phone, gst_number, state, beat_id")
        .eq("id", order.retailer_id)
        .single();
      retailer = retailerData;
      
      // Fetch beat name
      if (retailerData?.beat_id) {
        const { data: beatData } = await supabase
          .from("beats")
          .select("beat_name")
          .eq("id", retailerData.beat_id)
          .single();
        beatName = beatData?.beat_name || "";
      }
    }

    if (!retailer) {
      // A counter/event sale has no retailer row — retailer_id is null by
      // design. The order still carries the walk-in's actual name in
      // retailer_name; falling back to a bare "Customer" printed the same
      // word on every stall invoice regardless of who bought.
      retailer = { name: order?.retailer_name || "Customer", address: "", phone: "", gst_number: "", state: "" };
    }

    // Fetch salesman name
    let salesmanName = "";
    if (order?.user_id) {
      const { data: userData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.user_id)
        .single();
      salesmanName = userData?.full_name || "";
    }

    const schemeDetails = "";
    const displayInvoiceTime = order?.created_at 
      ? new Date(order.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' }) 
      : new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' });

    // Transform invoice_items to cartItems format
    const cartItems = editedInvoice.invoice_items.map((item: any) => ({
      id: item.id,
      product_name: item.description,
      hsn_code: item.hsn_sac || "-",
      quantity: item.quantity,
      unit: item.unit,
      rate: item.price_per_unit,
      price: item.price_per_unit,
      total: item.total_amount,
      category: "",
      taxable_amount: item.taxable_amount,
      sgst_amount: item.sgst_amount,
      cgst_amount: item.cgst_amount,
      total_amount: item.total_amount,
    }));

    const displayInvoiceNumber = editedInvoice.invoice_number;
    const displayInvoiceDate = new Date(editedInvoice.invoice_date).toLocaleDateString("en-GB");

    const blob = await generateTemplate4Invoice({
      orderId,
      company,
      retailer,
      cartItems,
      displayInvoiceNumber,
      displayInvoiceDate,
      displayInvoiceTime,
      beatName,
      salesmanName,
      schemeDetails
    });

    const stamped = await applyInvoiceWatermark(blob, { invoiceNumber: editedInvoice.invoice_number });
    return { blob: stamped, invoiceNumber: editedInvoice.invoice_number };
  }

  // Fallback to generating from order data (original behavior)
  console.log("📦 Generating invoice from order data");
  
  // Fetch order (try online first, then fall back to offline cache)
  const { data: dbOrder, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items!order_items_order_id_fkey(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw orderError;

  let order: any = dbOrder;
  
  // Also fetch from offline cache to supplement missing items
  let offlineOrder = await offlineStorage.getById<any>(STORES.ORDERS, orderId);
  
  // If not found by ID, search by retailer+date (handles different IDs from sync)
  if (!offlineOrder || (!offlineOrder.items && !offlineOrder.order_items)) {
    const allCachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const matchingOrder = allCachedOrders.find((o: any) => {
      if (!o.retailer_id || !order?.retailer_id) return false;
      if (o.retailer_id !== order.retailer_id) return false;
      // Match orders from same day
      const cachedDate = new Date(o.created_at).toDateString();
      const orderDate = new Date(order.created_at || order.order_date).toDateString();
      return cachedDate === orderDate && (o.items?.length > 0 || o.order_items?.length > 0);
    });
    if (matchingOrder) {
      offlineOrder = matchingOrder;
    }
  }

  // If order is not in DB yet (not synced), use offline cached order
  if (!order) {
    if (offlineOrder) {
      console.log("💾 Using offline cached order for invoice generation");
      order = {
        ...offlineOrder,
        order_items: offlineOrder.order_items || offlineOrder.items || [],
      };
    }
  } else if (order && (!order.order_items || order.order_items.length === 0)) {
    // CRITICAL FIX: Order exists in DB but items didn't sync yet
    // Use items from offline cache
    if (offlineOrder && (offlineOrder.items || offlineOrder.order_items)) {
      console.log("💾 Order in DB but items missing - using offline cached items");
      order.order_items = offlineOrder.order_items || offlineOrder.items || [];
    }
  }

  if (!order) {
    throw new Error("Order not found in database or offline cache.");
  }

  // Fetch company with template selection - try online first, fallback to cache
  let company: any = null;
  try {
    const { data: companyData } = await supabase
      .from("companies")
      .select("*")
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    company = companyData;
    // Cache company for offline use
    if (company) {
      await offlineStorage.save(STORES.SYNC_METADATA, { id: 'company_cache', data: company });
    }
  } catch (e) {
    console.log('📴 Offline: fetching company from cache');
  }
  
  // Fallback to cached company if offline
  if (!company) {
    const cachedCompany = await offlineStorage.getById<any>(STORES.SYNC_METADATA, 'company_cache');
    company = cachedCompany?.data;
  }

  if (!company) {
    // Use minimal fallback for offline invoice generation
    company = { name: "Invoice", address: "", phone: "", gstin: "", state: "" };
  }

  // Fetch retailer with state and beat_name - try online first, fallback to cache
  let retailer: any = null;
  if (order.retailer_id) {
    try {
      const { data: retailerData } = await supabase
        .from("retailers")
        .select("name, address, phone, gst_number, state, beat_id, beat_name")
        .eq("id", order.retailer_id)
        .single();
      retailer = retailerData;
    } catch (e) {
      console.log('📴 Offline: fetching retailer from cache');
    }
    
    // Fallback to cached retailer
    if (!retailer) {
      const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS);
      retailer = cachedRetailers.find((r: any) => r.id === order.retailer_id);
    }
  }

  if (!retailer) {
    // Same reasoning as the edited-invoice branch above: order.retailer_name
    // is the walk-in's real name for a counter/event sale.
    retailer = { name: order.retailer_name || "Customer", address: "", phone: "", gst_number: "", state: "" };
  }

  // Fetch beat name - try retailer.beat_name first, then lookup from beats table
  let beatName = retailer?.beat_name || "";
  if (!beatName && retailer?.beat_id) {
    try {
      const { data: beatData } = await supabase
        .from("beats")
        .select("beat_name")
        .eq("id", retailer.beat_id)
        .single();
      beatName = beatData?.beat_name || "";
    } catch (e) {
      // Offline: try from beat_plans cache
      const cachedBeatPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
      const matchingBeat = cachedBeatPlans.find((bp: any) => bp.beat_id === retailer.beat_id);
      beatName = matchingBeat?.beat_name || "";
    }
  }

  // Fetch salesman name - try online first, fallback to cache
  let salesmanName = "";
  if (order.user_id) {
    try {
      const { data: userData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.user_id)
        .single();
      salesmanName = userData?.full_name || "";
      // Cache profile for offline use
      if (userData) {
        await offlineStorage.save(STORES.SYNC_METADATA, { id: `profile_${order.user_id}`, data: userData });
      }
    } catch (e) {
      // Offline: try from cache
      const cachedProfile = await offlineStorage.getById<any>(STORES.SYNC_METADATA, `profile_${order.user_id}`);
      salesmanName = cachedProfile?.data?.full_name || "";
    }
  }

  // Scheme details not stored in orders table currently
  let schemeDetails = "";

  // Enrich order items with HSN codes and precise rates from products if missing
  // This is optional enrichment - offline mode will work without it
  const orderItemsWithHsn = await Promise.all(
    (order.order_items || []).map(async (item: any) => {
      let enrichedItem = { ...item };
      
      // Try to fetch HSN code and precise rate from product or variant (skip if offline)
      if (item.product_id && navigator.onLine) {
        try {
          // First try to get from product
          const { data: productData } = await supabase
            .from("products")
            .select("hsn_code, rate, unit")
            .eq("id", item.product_id)
            .maybeSingle();
          
          if (productData) {
            // Set HSN code if missing
            if (!enrichedItem.hsn_code) {
              enrichedItem.hsn_code = productData.hsn_code;
            }
            
            // Use product's precise rate for better display accuracy
            // Product rate is stored in per-unit format (e.g., per KG for grams items)
            // Only override if unit matches and we can use precise rate
            if (productData.rate && productData.unit) {
              const itemUnit = (item.unit || '').toLowerCase();
              const isGramsUnit = itemUnit === 'grams' || itemUnit === 'gram' || itemUnit === 'g';
              
              // If product has precise rate stored (per KG), use it for display
              if (isGramsUnit && productData.rate > 1) {
                // Store the precise per-KG rate for display conversion
                enrichedItem.precise_rate_per_kg = productData.rate;
              }
            }
          }
          
          // Variant display name resolution (DISPLAY ONLY — tax/amounts are NEVER
          // recomputed; they always come from the stored order_items snapshot).
          // When the line carries a variant_id, fetch base + variant and route the
          // display label through resolveProduct so a variant with NULL overrides
          // inherits the base name — same rule used in order entry / portals.
          if (item.variant_id) {
            try {
              const { data: variantData } = await supabase
                .from("product_variants")
                .select("id, variant_name, sku, hsn_code, price, product_id")
                .eq("id", item.variant_id)
                .maybeSingle();
              if (variantData) {
                const { data: baseData } = await supabase
                  .from("products")
                  .select("id, name, sku, hsn_code, rate, image_url, sku_image_url")
                  .eq("id", variantData.product_id)
                  .maybeSingle();
                const resolved = resolveProduct(baseData || { id: variantData.product_id, name: enrichedItem.product_name }, variantData);
                // Display label only — tax/amount fields untouched.
                enrichedItem.product_name = resolved.display_name || enrichedItem.product_name;
                if (!enrichedItem.hsn_code) enrichedItem.hsn_code = resolved.hsn_code || enrichedItem.hsn_code;
              }
            } catch { /* offline / RLS — keep snapshot */ }
          } else if (!enrichedItem.hsn_code) {
            // Legacy fallback: product_id may itself be a variant id in old data.
            const { data: variantData } = await supabase
              .from("product_variants")
              .select("hsn_code, price")
              .eq("id", item.product_id)
              .maybeSingle();
            if (variantData?.hsn_code) enrichedItem.hsn_code = variantData.hsn_code;
            if (variantData?.price && variantData.price > 1) enrichedItem.precise_rate_per_kg = variantData.price;
          }
        } catch (e) {
          // Offline or error - continue with item as-is
          console.log('📴 Offline: skipping product enrichment for invoice');
        }
      }
      
      return enrichedItem;
    })
  );

  const displayInvoiceNumber = (order as any).invoice_number || `INV-${order.id.substring(0, 8).toUpperCase()}`;
  // The invoice shows the order's business date (order_date): for a
  // backdated order that is the day the sale happened, not the day it was
  // keyed in. The time line is only meaningful when the two fall on the same
  // day; a backdated invoice shows "—" instead of a misleading entry time.
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const orderDateStr: string | null =
    typeof (order as any).order_date === 'string' && (order as any).order_date
      ? String((order as any).order_date).slice(0, 10)
      : null;
  const localCreatedDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;
  const displayInvoiceDate = orderDateStr
    ? new Date(orderDateStr + 'T00:00:00').toLocaleDateString("en-GB")
    : createdAt.toLocaleDateString("en-GB");
  const displayInvoiceTime = (!orderDateStr || orderDateStr === localCreatedDate)
    ? createdAt.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })
    : "—";
  const invoiceNumber = displayInvoiceNumber;
  
  // Get the selected template from company settings (default to template4)
  const selectedTemplate = company.invoice_template || 'template4';
  
  console.log('Generating invoice with template:', selectedTemplate);
  console.log('Company data:', { name: company.name, template: company.invoice_template });
  
  // Currently, only template4 is implemented for PDF generation
  // When other templates are added, extend this switch statement
  let blob: Blob;
  
  switch (selectedTemplate) {
    case 'template1':
    case 'template2':
    case 'template3':
    case 'template4':
    default:
      // All templates currently use template4 PDF generation
      // The template4 design matches the preview in Invoice Management
      blob = await generateTemplate4Invoice({
        orderId: order.id,
        company,
        retailer,
        cartItems: orderItemsWithHsn,
        displayInvoiceNumber,
        displayInvoiceDate,
        displayInvoiceTime,
        beatName,
        salesmanName,
        schemeDetails,
        // CRITICAL: Pass order-level discount and total for accurate invoice
        orderDiscount: Number(order.discount_amount) || 0,
        orderTotal: Number(order.total_amount) || undefined,
        // Payment status is read straight off the order — never derived here.
        paymentMode: order.payment_method || undefined,
        amountPaid: order.is_credit_order
          ? Number(order.credit_paid_amount) || 0
          : Number(order.total_amount) || 0,
        balanceDue: order.is_credit_order ? Number(order.credit_pending_amount) || 0 : 0,
      });
      break;
  }

  const stamped = await applyInvoiceWatermark(blob, { invoiceNumber });
  return { blob: stamped, invoiceNumber };
}
