// Shared PDF theme palettes for report subscriptions.
// Mirrored (intentionally duplicated) in supabase/functions/generate-report/pdf-renderer.ts
// because edge functions cannot import from src/.

export type PdfThemeId = 'default' | 'amber' | 'blue_black' | 'light_pink';

export interface PdfTheme {
  id: PdfThemeId;
  label: string;
  /** Swatch/accent colour shown in the picker and used for rules & separators. */
  accent: string;
  /** Dark masthead background for the "Band" header style. */
  band: string;
  /** Table header background. */
  headFill: string;
  /** Table header text. */
  headText: string;
}

export const PDF_THEMES: PdfTheme[] = [
  { id: 'default', label: 'Company brand', accent: '#534ab7', band: '#111111', headFill: '#f6f6f4', headText: '#464646' },
  { id: 'amber', label: 'Amber', accent: '#f59e0b', band: '#78350f', headFill: '#fef3c7', headText: '#78350f' },
  { id: 'blue_black', label: 'Blue & Black', accent: '#2563eb', band: '#0f172a', headFill: '#dbeafe', headText: '#1e3a8a' },
  { id: 'light_pink', label: 'Light Pink', accent: '#ec4899', band: '#831843', headFill: '#fce7f3', headText: '#831843' },
];

export function getPdfTheme(id?: string): PdfTheme {
  return PDF_THEMES.find(t => t.id === id) ?? PDF_THEMES[0];
}
