import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const languages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'fr', name: 'French', nativeName: 'Français' }
];

export const LanguageSettings = () => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === i18n.language) return;

    // Update i18n immediately for instant UI feedback
    await i18n.changeLanguage(langCode);
    
    // Save to localStorage
    localStorage.setItem('preferredLanguage', langCode);
    
    // Update user profile in Supabase if authenticated
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: langCode })
        .eq('id', user.id);
      
      if (error) {
        console.error('Error saving language preference:', error);
      }
    }

    // Show success toast
    const selectedLang = languages.find(l => l.code === langCode);
    toast({
      title: "Language Changed",
      description: `Display language set to ${selectedLang?.name || langCode}`,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Language Preferences</CardTitle>
        </div>
        <CardDescription>
          Choose your preferred language for the app interface (Menu bar, Visits page)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {languages.map((lang) => {
            const isSelected = i18n.language === lang.code || 
              (i18n.language?.startsWith(lang.code + '-'));
            
            return (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200
                  flex flex-col items-center justify-center gap-1 min-h-[80px]
                  hover:border-primary/50 hover:bg-accent/50
                  ${isSelected 
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                    : 'border-border bg-card'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <span className="text-lg font-medium text-foreground">
                  {lang.nativeName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lang.name}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
