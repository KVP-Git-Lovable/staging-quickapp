export interface AddressParts {
  address_line1?: string | null;
  address_line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
}

export function formatAddress(p: AddressParts): string {
  return [
    p.address_line1,
    p.address_line2,
    p.landmark,
    [p.city, p.state, p.pincode].filter(Boolean).join(', '),
    p.country,
  ]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function hasMinimumAddress(p: AddressParts): boolean {
  return !!(p.address_line1?.trim() && p.city?.trim() && p.pincode?.trim());
}
