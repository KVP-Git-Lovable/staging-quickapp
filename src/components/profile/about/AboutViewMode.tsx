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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user && (
              <ProfilePictureUpload
                userId={user.id}
                currentPhotoUrl={userProfile?.profile_picture_url}
                fullName={userProfile?.full_name || 'User'}
                onPhotoUpdate={handlePhotoUpdate}
                size="lg"
              />
            )}
            <div>
              <CardTitle className="text-xl">{userProfile?.full_name || 'User'}</CardTitle>
              {formData.designation && (
                <p className="text-sm text-muted-foreground">{formData.designation}</p>
              )}
              <p className="text-sm text-muted-foreground">{formData.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Essentials — always visible */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoItem icon={<Mail className="h-4 w-4" />} label="Email" value={formData.email} />
          <InfoItem icon={<Phone className="h-4 w-4" />} label="Phone" value={formData.phone_number || "-"} />
          <InfoItem icon={<Briefcase className="h-4 w-4" />} label="Designation" value={formData.designation || "-"} />
        </div>

        {/* Everything else — hidden behind the arrow */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
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

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
