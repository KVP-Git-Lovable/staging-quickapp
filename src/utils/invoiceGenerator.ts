// Static imports avoid "Failed to fetch dynamically imported module" errors
// that surface after deploys when stale chunk hashes are gone from CDN.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from "@/integrations/supabase/client";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { getInvoiceDisplaySettingsMap, DisplaySettingsMap } from "@/hooks/useInvoiceDisplaySettings";

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
  // Use stored total from order_items (this is qty × rate before item-level discount)
  const storedTotal = Number(item.total) || 0;
  // Item-level discount (may be 0 if discount was applied at order level)
  const discountAmt = Number(item.discount_amount) || 0;
  // Compute actual line total after any item-level discount
  const finalLineTotal = Math.max(0, storedTotal - discountAmt);
  
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
 * Generate Template 4 (Green Accent Professional) invoice PDF
 * This is the ONLY template used throughout the application
 */
export async function generateTemplate4Invoice(data: InvoiceData): Promise<Blob> {
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
  doc.setFont("helvetica", "normal");
  doc.text(invoiceNum, pageWidth - 15, invoiceY, { align: "right" });
  
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
  
  // Beat/Route Name
  if (beatName) {
    invoiceY += 6;
    doc.setFont("helvetica", "bold");
    doc.text("ROUTE:", pageWidth - 60, invoiceY);
    doc.setFont("helvetica", "normal");
    doc.text(beatName, pageWidth - 15, invoiceY, { align: "right" });
  }
  
  // Salesman Name
  if (salesmanName) {
    invoiceY += 6;
    doc.setFont("helvetica", "bold");
    doc.text("SALESMAN:", pageWidth - 60, invoiceY);
    doc.setFont("helvetica", "normal");
    doc.text(salesmanName, pageWidth - 15, invoiceY, { align: "right" });
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
        `Rs.${formatExact(rowTotal)}`, // Row total - use stored value
      ];
    }
  });

  // Table headers based on whether item-level discounts exist
  const tableHeaders = hasAnyItemDiscount 
    ? [["NO", "PRODUCT", "HSN", "UNIT", "QTY", "MRP", "OFFER", "TOTAL"]]
    : [["NO", "PRODUCT", "HSN/SAC", "UNIT", "QTY", "PRICE", "TOTAL"]];

  // Column styles based on whether item-level discounts exist
  const columnStyles = hasAnyItemDiscount
    ? {
        0: { cellWidth: 12, halign: "center" as const },
        1: { cellWidth: 'auto' as const, halign: "left" as const },
        2: { cellWidth: 16, halign: "center" as const },
        3: { cellWidth: 14, halign: "center" as const },
        4: { cellWidth: 12, halign: "center" as const },
        5: { cellWidth: 22, halign: "right" as const },
        6: { cellWidth: 22, halign: "right" as const },
        7: { cellWidth: 24, halign: "right" as const },
      }
    : {
        0: { cellWidth: 15, halign: "center" as const },
        1: { cellWidth: 'auto' as const, halign: "left" as const },
        2: { cellWidth: 20, halign: "center" as const },
        3: { cellWidth: 18, halign: "center" as const },
        4: { cellWidth: 15, halign: "center" as const },
        5: { cellWidth: 25, halign: "right" as const },
        6: { cellWidth: 28, halign: "right" as const },
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

  // Calculate totals - CRITICAL: Use order-level values when available
  // This ensures invoice totals match exactly what cart showed at order time
  const hasStoredTotals = normalizedItems.some(item => 
    item.taxable_amount != null && item.sgst_amount != null && item.cgst_amount != null
  );

  // Calculate item subtotal (sum of all line items before order-level discount)
  const itemSubtotal = normalizedItems.reduce((sum, item) => {
    if (hasStoredTotals && item.taxable_amount != null) {
      return sum + Number(item.taxable_amount);
    }
    // Use stored total from order_items
    return sum + (item._storedTotal || 0);
  }, 0);

  // Apply order-level discount if provided (from orders.discount_amount)
  const appliedOrderDiscount = orderDiscount || 0;
  const subtotal = Math.max(0, itemSubtotal - appliedOrderDiscount);

  // Calculate GST on discounted subtotal
  const sgst = hasStoredTotals
    ? cartItems.reduce((sum, item) => sum + (Number(item.sgst_amount) || 0), 0)
    : subtotal * 0.025;

  const cgst = hasStoredTotals
    ? cartItems.reduce((sum, item) => sum + (Number(item.cgst_amount) || 0), 0)
    : subtotal * 0.025;

  // CRITICAL: If orderTotal is provided, use it directly (this is the finalized amount)
  // This ensures invoice total matches exactly what was shown in cart
  const total = orderTotal 
    ? orderTotal 
    : (hasStoredTotals && cartItems.some(item => item.total_amount != null)
        ? cartItems.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0)
        : (subtotal + sgst + cgst));
  
  // Note: totalDiscount tracks item-level discounts, order-level discount is shown separately
  
  // Convert total to words (use rounded total for consistency)
  const roundedTotal = Math.round(total);
  const totalInWords = numberToWords(roundedTotal) + " Rupees Only";

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
  // Rows: SUB-TOTAL, (DISCOUNT if any), SGST, CGST, then TOTAL bar
  const numRows = 3 + (hasOrderLevelDiscount ? 1 : 0);
  const totalsBoxHeight = (numRows * rowHeight) + totalRowHeight + 4;
  
  // Draw border box
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(totalsBoxX, yPos - 1, totalsBoxWidth, totalsBoxHeight);
  
  let innerY = yPos + 3;
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  
  // SUB-TOTAL (sum of item totals, before order-level discount)
  doc.text("SUB-TOTAL", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(itemSubtotal)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  
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
  doc.text("SGST (2.5%)", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(sgst)}`, totalsBoxX + valueOffset, innerY, { align: "right" });
  
  innerY += rowHeight;
  doc.text("CGST (2.5%)", totalsBoxX + labelOffset, innerY);
  doc.text(`Rs.${formatExact(cgst)}`, totalsBoxX + valueOffset, innerY, { align: "right" });

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
      .select("retailer_id, user_id, created_at")
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
      retailer = { name: "Customer", address: "", phone: "", gst_number: "", state: "" };
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

    return { blob, invoiceNumber: editedInvoice.invoice_number };
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
    retailer = { name: "Customer", address: "", phone: "", gst_number: "", state: "" };
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
          
          // Also check if it's a variant (product_id might be variant_id in some cases)
          if (!enrichedItem.hsn_code) {
            const { data: variantData } = await supabase
              .from("product_variants")
              .select("hsn_code, price")
              .eq("id", item.product_id)
              .maybeSingle();
            
            if (variantData?.hsn_code) {
              enrichedItem.hsn_code = variantData.hsn_code;
            }
            if (variantData?.price && variantData.price > 1) {
              enrichedItem.precise_rate_per_kg = variantData.price;
            }
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
  const displayInvoiceDate = order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");
  const displayInvoiceTime = order.created_at ? new Date(order.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' });
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
        orderTotal: Number(order.total_amount) || undefined
      });
      break;
  }

  return { blob, invoiceNumber };
}
