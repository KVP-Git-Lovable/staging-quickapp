/** Master language + region catalogue used by the profile Language & Region panel. */

export interface LanguageDef {
  code: string;
  native: string;
  english: string;
  rtl: boolean;
}

export interface RegionDef {
  code: string;
  name: string;
  flag: string;
  languages: string[];
  currency: string;
  timezone: string;
  locale: string;
  dateFormat: string;
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'en', native: 'English', english: 'English', rtl: false },
  { code: 'hi', native: 'हिंदी', english: 'Hindi', rtl: false },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', rtl: false },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', rtl: false },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', rtl: false },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', rtl: false },
  { code: 'mr', native: 'मराठी', english: 'Marathi', rtl: false },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', rtl: false },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', rtl: false },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', rtl: false },
  { code: 'ar', native: 'العربية', english: 'Arabic', rtl: true },
  { code: 'fr', native: 'Français', english: 'French', rtl: false },
  { code: 'es', native: 'Español', english: 'Spanish', rtl: false },
  { code: 'nl', native: 'Nederlands', english: 'Dutch', rtl: false },
  { code: 'de', native: 'Deutsch', english: 'German', rtl: false },
];

export const REGIONS: RegionDef[] = [
  {
    code: 'IN', name: 'India', flag: '🇮🇳',
    languages: ['en', 'hi', 'kn', 'ta', 'te', 'gu', 'mr', 'bn', 'ml', 'pa'],
    currency: 'INR', timezone: 'Asia/Kolkata', locale: 'en-IN', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪',
    languages: ['ar', 'en'],
    currency: 'AED', timezone: 'Asia/Dubai', locale: 'ar-AE', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦',
    languages: ['ar', 'en'],
    currency: 'SAR', timezone: 'Asia/Riyadh', locale: 'ar-SA', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'FR', name: 'France', flag: '🇫🇷',
    languages: ['fr'],
    currency: 'EUR', timezone: 'Europe/Paris', locale: 'fr-FR', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'CA', name: 'Canada', flag: '🇨🇦',
    languages: ['en', 'fr'],
    currency: 'CAD', timezone: 'America/Toronto', locale: 'en-CA', dateFormat: 'yyyy-MM-dd',
  },
  {
    code: 'MX', name: 'Mexico', flag: '🇲🇽',
    languages: ['es'],
    currency: 'MXN', timezone: 'America/Mexico_City', locale: 'es-MX', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'NL', name: 'Netherlands', flag: '🇳🇱',
    languages: ['nl', 'en'],
    currency: 'EUR', timezone: 'Europe/Amsterdam', locale: 'nl-NL', dateFormat: 'dd-MM-yyyy',
  },
  {
    code: 'US', name: 'United States', flag: '🇺🇸',
    languages: ['en', 'es'],
    currency: 'USD', timezone: 'America/New_York', locale: 'en-US', dateFormat: 'MM/dd/yyyy',
  },
  {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧',
    languages: ['en'],
    currency: 'GBP', timezone: 'Europe/London', locale: 'en-GB', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'DE', name: 'Germany', flag: '🇩🇪',
    languages: ['de'],
    currency: 'EUR', timezone: 'Europe/Berlin', locale: 'de-DE', dateFormat: 'dd.MM.yyyy',
  },
  {
    code: 'SG', name: 'Singapore', flag: '🇸🇬',
    languages: ['en'],
    currency: 'SGD', timezone: 'Asia/Singapore', locale: 'en-SG', dateFormat: 'dd/MM/yyyy',
  },
  {
    code: 'BD', name: 'Bangladesh', flag: '🇧🇩',
    languages: ['bn', 'en'],
    currency: 'BDT', timezone: 'Asia/Dhaka', locale: 'bn-BD', dateFormat: 'dd/MM/yyyy',
  },
];

// English is the common/shared language — guarantee it is selectable everywhere.
REGIONS.forEach((r) => {
  if (!r.languages.includes('en')) r.languages.push('en');
});

/** Languages that ship a common.json today; others fall back to English. */
export const LANGS_WITH_TRANSLATIONS = ['en', 'hi', 'kn', 'ta', 'te', 'gu'];

export const getLanguage = (code: string) => LANGUAGES.find((l) => l.code === code);
export const getRegion = (code: string) => REGIONS.find((r) => r.code === code);

/** Applies text direction + lang attribute for the given language code. */
export const applyDocumentLanguage = (code: string) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = getLanguage(code)?.rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = code;
};
