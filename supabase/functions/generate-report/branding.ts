// Branding fetch for the PDF renderer. Company row is the default source.
// When the subscription is scoped to one distributor and pdf_template.branding
// is 'distributor', distributor branding overrides company branding for names
// and the logo. Everything is read from the DB — no hardcoded values.

export interface Branding {
  header_name: string;
  company_name: string;
  address: string;
  gstin: string;
  contact_phone: string;
  currency: string; // e.g. 'INR', 'USD'
  date_format: string; // e.g. 'DD/MM/YYYY'
  logo_data_url: string | null; // "data:image/png;base64,..." for jsPDF.addImage
  logo_format: 'PNG' | 'JPEG' | null;
  brand_color: string; // hex, best-effort default
}

const DEFAULT_BRAND: Branding = {
  header_name: '',
  company_name: '',
  address: '',
  gstin: '',
  contact_phone: '',
  currency: 'INR',
  date_format: 'DD/MM/YYYY',
  logo_data_url: null,
  logo_format: null,
  brand_color: '#4338ca',
};

async function fetchLogo(url: string | null): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const format: 'PNG' | 'JPEG' = ct.includes('jpeg') || ct.includes('jpg') ? 'JPEG' : 'PNG';
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    return { dataUrl: `data:${format === 'JPEG' ? 'image/jpeg' : 'image/png'};base64,${b64}`, format };
  } catch {
    return null;
  }
}

export async function resolveBranding(
  admin: any,
  opts: { mode: 'company' | 'distributor' | 'none'; distributor_id?: string | null },
): Promise<Branding> {
  const { data: comp } = await admin
    .from('companies')
    .select('header_logo_url, logo_url, header_name, name, address, gstin, contact_phone, currency, date_format')
    .limit(1)
    .maybeSingle();

  const brand: Branding = {
    ...DEFAULT_BRAND,
    header_name: comp?.header_name ?? '',
    company_name: comp?.name ?? '',
    address: comp?.address ?? '',
    gstin: comp?.gstin ?? '',
    contact_phone: comp?.contact_phone ?? '',
    currency: comp?.currency || 'INR',
    date_format: comp?.date_format || 'DD/MM/YYYY',
  };

  if (opts.mode === 'none') {
    return { ...brand, header_name: '', company_name: '', address: '', gstin: '', contact_phone: '', logo_data_url: null, logo_format: null };
  }

  let logoUrl: string | null = comp?.header_logo_url || comp?.logo_url || null;

  if (opts.mode === 'distributor' && opts.distributor_id) {
    const { data: dist } = await admin
      .from('distributors')
      .select('name, logo_url')
      .eq('id', opts.distributor_id)
      .maybeSingle();
    if (dist) {
      brand.company_name = dist.name ?? brand.company_name;
      if (dist.logo_url) logoUrl = dist.logo_url;
    }
  }

  const logo = await fetchLogo(logoUrl);
  if (logo) {
    brand.logo_data_url = logo.dataUrl;
    brand.logo_format = logo.format;
  }
  return brand;
}

export function formatCurrency(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatDateToken(d: Date, fmt: string): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return (fmt || 'DD/MM/YYYY')
    .replace('DD', dd)
    .replace('MM', mm)
    .replace('YYYY', yyyy)
    .replace('HH', hh)
    .replace('mm', mi);
}
