import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Users } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { InstagramSocialFeed } from '@/components/profile/InstagramSocialFeed';
import { ProfileAttachments } from '@/components/profile/ProfileAttachments';
import { Layout } from '@/components/Layout';
import { UserFeaturesSection } from '@/components/features/UserFeaturesSection';
import { FollowersFollowingCard } from '@/components/profile/FollowersFollowingCard';
import { WorkExperienceSection } from '@/components/profile/about/WorkExperienceSection';
import { EducationHistorySection } from '@/components/profile/about/EducationHistorySection';
import { EmergencyContactsSection } from '@/components/profile/about/EmergencyContactsSection';
import { AspirationsSection } from '@/components/profile/about/AspirationsSection';
import { OnboardingChecklistSection } from '@/components/profile/about/OnboardingChecklistSection';
import { AboutViewMode } from '@/components/profile/about/AboutViewMode';
import { AboutEditMode } from '@/components/profile/about/AboutEditMode';
import { ProfilePointsBadge } from '@/components/profile/ProfilePointsBadge';
import { PasswordChangeSection } from '@/components/profile/PasswordChangeSection';
import { LanguageSettings } from '@/components/profile/LanguageSettings';


interface Territory {
  id: string;
  name: string;
}

interface Manager {
  id: string;
  full_name: string;
}

const UserProfile = () => {
  const { user, userProfile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    phone_number: '',
    recovery_email: '',
    email: '',
    monthly_salary: '',
    daily_da_allowance: '',
    manager_id: '',
    hq: '',
    hq_territory_id: '',
    date_of_joining: '',
    date_of_exit: '',
    address: '',
    band: '',
    designation: '',
    linkedin_url: '',
    twitter_url: '',
    instagram_url: '',
    facebook_url: ''
  });

  useEffect(() => {
    if (userProfile && user) {
      fetchManagers();
      fetchTerritories();
      fetchEmployeeData();
    }
  }, [userProfile, user]);

  const fetchTerritories = async () => {
    const { data } = await supabase
      .from('territories')
      .select('id, name')
      .order('name');

    if (data) {
      setTerritories(data);
    }
  };

  const fetchManagers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name');

    if (data) {
      setManagers(data);
    }
  };

  const fetchEmployeeData = async () => {
    if (!user) return;

    const { data: employeeData } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Also fetch profile social links
    const { data: profileData } = await supabase
      .from('profiles')
      .select('designation, linkedin_url, twitter_url, instagram_url, facebook_url')
      .eq('id', user.id)
      .single();

    setFormData({
      username: userProfile?.username || '',
      full_name: userProfile?.full_name || '',
      phone_number: userProfile?.phone_number || '',
      recovery_email: userProfile?.recovery_email || '',
      email: user.email || '',
      monthly_salary: employeeData?.monthly_salary?.toString() || '',
      daily_da_allowance: employeeData?.daily_da_allowance?.toString() || '',
      manager_id: employeeData?.manager_id || '',
      hq: employeeData?.hq || '',
      hq_territory_id: employeeData?.hq_territory_id || '',
      date_of_joining: employeeData?.date_of_joining || '',
      date_of_exit: employeeData?.date_of_exit || '',
      address: employeeData?.address || '',
      band: employeeData?.band?.toString() || '',
      designation: profileData?.designation || '',
      linkedin_url: profileData?.linkedin_url || '',
      twitter_url: profileData?.twitter_url || '',
      instagram_url: profileData?.instagram_url || '',
      facebook_url: profileData?.facebook_url || ''
    });
  };

  const handleProfileUpdate = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Update profile table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username: formData.username,
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          recovery_email: formData.recovery_email
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Update employees table
      const { error: employeeError } = await supabase
        .from('employees')
        .upsert({
          user_id: user.id,
          monthly_salary: parseFloat(formData.monthly_salary) || 0,
          daily_da_allowance: parseFloat(formData.daily_da_allowance) || 0,
          manager_id: formData.manager_id || null,
          hq: formData.hq,
          hq_territory_id: formData.hq_territory_id || null,
          date_of_joining: formData.date_of_joining || null,
          date_of_exit: formData.date_of_exit || null,
          address: formData.address
        });

      // Update profile with designation and social links
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          designation: formData.designation || null,
          linkedin_url: formData.linkedin_url || null,
          twitter_url: formData.twitter_url || null,
          instagram_url: formData.instagram_url || null,
          facebook_url: formData.facebook_url || null
        })
        .eq('id', user.id);

      if (profileUpdateError) throw profileUpdateError;

      if (employeeError) throw employeeError;

      toast({
        title: "Success",
        description: "Profile updated successfully!"
      });
      
      setIsEditMode(false);
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <Layout>
      <div className="p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header with Points */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <User className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
                <p className="text-muted-foreground">Manage your information and track performance</p>
              </div>
            </div>
            {/* Points Badge - Clickable to Leaderboard */}
            <ProfilePointsBadge userId={user.id} />
          </div>

        <Tabs defaultValue="about" className="space-y-4">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="about" className="flex-1 min-w-[80px] text-xs sm:text-sm py-2">
              <User className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">About</span>
            </TabsTrigger>
            <TabsTrigger value="social" className="flex-1 min-w-[80px] text-xs sm:text-sm py-2">
              <Users className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Social</span>
            </TabsTrigger>
          </TabsList>

          {/* About Tab */}
          <TabsContent value="about" className="space-y-6">
            {/* View/Edit Mode Toggle */}
            {isEditMode ? (
              <AboutEditMode
                formData={formData}
                setFormData={setFormData}
                managers={managers}
                territories={territories}
                loading={loading}
                onSave={handleProfileUpdate}
                onCancel={() => setIsEditMode(false)}
              />
            ) : (
              <AboutViewMode
                userProfile={userProfile}
                formData={formData}
                territories={territories}
                managers={managers}
                onEdit={() => setIsEditMode(true)}
              />
            )}

            {/* Password & Security */}
            <PasswordChangeSection />

            {/* Language Settings */}
            <LanguageSettings />

            {/* Additional Sections - Always in view/edit with their own controls */}
            <WorkExperienceSection />
            <EducationHistorySection />
            <EmergencyContactsSection />
            <AspirationsSection />
            <OnboardingChecklistSection />
            <ProfileAttachments />
            <FollowersFollowingCard />
          </TabsContent>

          {/* Social/Collaboration Tab */}
          <TabsContent value="social">
            <InstagramSocialFeed />
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </Layout>
  );
};

export default UserProfile;
