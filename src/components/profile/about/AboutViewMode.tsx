import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  User, Mail, Phone, MapPin, Building2, Calendar, Pencil, 
  Linkedin, Twitter, Instagram, Facebook, Globe, Briefcase, 
  GraduationCap, Heart, Target, ClipboardCheck, Users, Shield, ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { useAuth } from "@/hooks/useAuth";


interface AboutViewModeProps {
  userProfile: any;
  formData: any;
  territories: { id: string; name: string }[];
  managers: { id: string; full_name: string }[];
  onEdit: () => void;
}

export function AboutViewMode({ 
  userProfile, 
  formData, 
  territories, 
  managers, 
  onEdit 
}: AboutViewModeProps) {
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);


  const getManagerName = () => {
    const manager = managers.find(m => m.id === formData.manager_id);
    return manager?.full_name || "-";
  };

  const getHQName = () => {
    const territory = territories.find(t => t.id === formData.hq_territory_id);
    return territory?.name || formData.hq || "-";
  };

  const handlePhotoUpdate = (newUrl: string) => {
    // Photo update triggers a refetch through query invalidation in ProfilePictureUpload
    // Dispatch event to refresh profile data without full page reload
    window.dispatchEvent(new CustomEvent('globalDataRefresh', { detail: { source: 'profilePhoto' } }));
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="pb-4 bg-gradient-to-br from-indigo-50 via-violet-50 to-transparent dark:from-indigo-950/30 dark:via-violet-950/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {user && (
              <ProfilePictureUpload
                userId={user.id}
                currentPhotoUrl={userProfile?.profile_picture_url}
                fullName={userProfile?.full_name || 'User'}
                onPhotoUpdate={handlePhotoUpdate}
                size="lg"
              />
            )}
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl truncate">{userProfile?.full_name || 'User'}</CardTitle>
              {formData.designation && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{formData.designation}</p>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{formData.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="shrink-0 rounded-full border-violet-200 bg-white/80 text-violet-700 hover:bg-violet-50 dark:bg-transparent dark:text-violet-300 dark:border-violet-800"
          >
            <Pencil className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit Profile</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Essentials — always visible */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <InfoItem tone="sky" icon={<Mail className="h-4 w-4" />} label="Email" value={formData.email} />
          <InfoItem tone="emerald" icon={<Phone className="h-4 w-4" />} label="Phone" value={formData.phone_number || "-"} />
          <InfoItem tone="amber" icon={<Briefcase className="h-4 w-4" />} label="Designation" value={formData.designation || "-"} />
        </div>

        {/* Everything else — hidden behind the arrow */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between rounded-xl bg-muted/50 hover:bg-muted">
              <span>{showDetails ? "Hide full details" : "Show full details"}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-6 pt-4">
            {/* Personal Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoItem icon={<User className="h-4 w-4" />} label="Username" value={formData.username || "-"} />
                <InfoItem icon={<Mail className="h-4 w-4" />} label="Recovery Email" value={formData.recovery_email || "-"} />
              </div>
            </div>

            <Separator />

            {/* Employment Information Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Employment Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoItem icon={<Users className="h-4 w-4" />} label="Reports To" value={getManagerName()} />
                <InfoItem icon={<MapPin className="h-4 w-4" />} label="Headquarters (HQ)" value={getHQName()} />
                <InfoItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="Date of Joining"
                  value={formData.date_of_joining ? format(new Date(formData.date_of_joining), 'PP') : "-"}
                />
                <InfoItem icon={<Shield className="h-4 w-4" />} label="Band" value={formData.band || "-"} />
                {formData.date_of_exit && (
                  <InfoItem
                    icon={<Calendar className="h-4 w-4" />}
                    label="Date of Exit"
                    value={format(new Date(formData.date_of_exit), 'PP')}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Address Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Address
              </h3>
              <p className="text-sm">{formData.address || "No address provided"}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>


        {/* Social Links Section */}
        {(formData.linkedin_url || formData.twitter_url || formData.instagram_url || formData.facebook_url) && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Social Links
              </h3>
              <div className="flex flex-wrap gap-2">
                {formData.linkedin_url && (
                  <a href={formData.linkedin_url} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                      <Linkedin className="h-3 w-3 mr-1" /> LinkedIn
                    </Badge>
                  </a>
                )}
                {formData.twitter_url && (
                  <a href={formData.twitter_url} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                      <Twitter className="h-3 w-3 mr-1" /> Twitter
                    </Badge>
                  </a>
                )}
                {formData.instagram_url && (
                  <a href={formData.instagram_url} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                      <Instagram className="h-3 w-3 mr-1" /> Instagram
                    </Badge>
                  </a>
                )}
                {formData.facebook_url && (
                  <a href={formData.facebook_url} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                      <Facebook className="h-3 w-3 mr-1" /> Facebook
                    </Badge>
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const infoTones = {
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
  neutral: 'bg-muted text-muted-foreground',
} as const;

function InfoItem({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: keyof typeof infoTones;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
      <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${infoTones[tone]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
