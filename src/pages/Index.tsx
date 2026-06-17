import { Store, Users, Trophy, BarChart, CreditCard, MapPin, Plus, ShoppingCart, TrendingUp, Tag, Award, HelpCircle, ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useHomeDashboard } from "@/hooks/useHomeDashboard";
import { DashboardSkeleton } from "@/components/home/DashboardSkeleton";
import { CheckInStatusBanner } from "@/components/home/CheckInStatusBanner";
import { TodaysBeatCard } from "@/components/home/TodaysBeatCard";
import { QuickNavGrid } from "@/components/home/QuickNavGrid";
import { ProfileSetupModal } from "@/components/ProfileSetupModal";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { PerformanceCalendar } from "@/components/PerformanceCalendar";
import { AIInsightsSection } from "@/components/home/AIInsightsSection";
import { PendingPayments } from "@/components/home/PendingPayments";
import { DeviceInfoCard } from "@/components/home/DeviceInfoCard";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useFeatureFlags, NAV_ITEM_FEATURE_MAP } from "@/hooks/useFeatureFlags";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const Index = () => {
  const { userProfile, user, userRole, securityProfileName } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dashboardUserId = user?.id;
  const activeUserProfile = userProfile?.id === user?.id ? userProfile : null;
  const { todayData, performance, urgentItems, isLoading, lastUpdated, refresh } = useHomeDashboard(dashboardUserId, selectedDate);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const isOnline = navigator.onLine;
  const signedProfilePicture = useSignedUrl(profilePictureUrl);
  const { isNavItemEnabled } = useFeatureFlags();
  const { permissions, hasModuleAccess, hasFieldPermission, hasActionPermission, hasWidgetPermission } = useProfilePermissions();
  // DB-driven permission checks — no bypass for missing profile
  const canShow = (prefix: string) => hasModuleAccess(prefix);

  const showCheckIn = canShow('attendance_') || hasWidgetPermission('widget_homepage_attendance');
  const showTodaysBeat = canShow('visit_') || hasWidgetPermission('widget_homepage_visit_plan');
  const showAIInsights = canShow('visit_ai_recommendations') || canShow('visit_') || hasWidgetPermission('widget_homepage_performance');
  const showPerfCalendar = canShow('performance_') || hasWidgetPermission('widget_homepage_target_achievement');
  const showPendingPay = canShow('analytics_pending_payments') || canShow('analytics_') || hasFieldPermission('field_homepage_quick_stats');
  const showTarget = canShow('target_') || hasFieldPermission('field_homepage_target_progress');
  const showGreeting = canShow('attendance_') || hasFieldPermission('field_homepage_greeting');
  const showQuickAdd = canShow('visit_') || hasActionPermission('action_homepage_quick_add');
  const showQuickNav = hasWidgetPermission('widget_homepage_quick_links');

  const hasAnyDashboardContent = showCheckIn || showTodaysBeat || showAIInsights || showPerfCalendar || showPendingPay || showQuickNav;

  const refreshProfilePicture = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('profiles')
        .select('profile_picture_url')
        .eq('id', user.id)
        .single();
      
      if (data?.profile_picture_url) {
        setProfilePictureUrl(data.profile_picture_url);
      }
    } catch (error) {
      console.error('Error fetching profile picture:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshProfilePicture();
    }
  }, [user?.id, userProfile]);

  // Pull-to-refresh removed - was causing constant refreshes when at top of page
  // Data now refreshes via useHomeDashboard's event listeners only

  const getEmailName = (email?: string | null) => {
    if (!email) return null;
    const base = email.split('@')[0] || '';
    if (!base) return null;
    return base.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const meta = (user?.user_metadata as any) || {};
  const metaName: string | null = meta.full_name || meta.name || meta.username || null;
  const displayName =
    (activeUserProfile?.full_name && activeUserProfile.full_name.trim()) ||
    (activeUserProfile?.username && activeUserProfile.username.trim()) ||
    (metaName && metaName.trim()) ||
    getEmailName(user?.email) ||
    'User';
  const roleDisplay =
    (activeUserProfile?.designation && activeUserProfile.designation.trim()) ||
    (securityProfileName && securityProfileName.trim()) ||
    (userRole === 'admin' ? 'Admin' : 'Field Executive');

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

  const quickNavItems = [
    { icon: Store, label: t('home.allRetailers'), href: "/my-retailers", color: "from-emerald-500 to-emerald-600", id: 'all-retailers' },
    { icon: Users, label: t('home.myBeats'), href: "/my-beats", color: "from-orange-500 to-orange-600", id: 'my-beats' },
    { icon: Trophy, label: t('home.leaderboard'), href: "/leaderboard", color: "from-yellow-500 to-yellow-600", id: 'leaderboard' },
    { icon: BarChart, label: t('home.analytics'), href: "/analytics", color: "from-violet-500 to-violet-600", id: 'analytics' },
    { icon: CreditCard, label: t('home.expenses'), href: "/expenses", color: "from-indigo-500 to-indigo-600", id: 'expenses' },
    { icon: MapPin, label: t('home.territories'), href: "/territories-and-distributors", color: "from-amber-500 to-amber-600", id: 'territories' },
    { icon: HelpCircle, label: "Help Center", href: "/help-center", color: "from-teal-500 to-teal-600", id: 'help-center' },
  ].filter(item => item.id === 'help-center' || isNavItemEnabled(item.id));

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Header with Quick Actions */}
        <div className="relative overflow-hidden bg-gradient-hero text-primary-foreground" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="relative p-4">
            <div className="flex items-center justify-between">
              {/* Profile Section - Clickable to My Profile */}
              <div 
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/profile')}
              >
                {signedProfilePicture ? (
                  <div className="h-10 w-10 rounded-full border-2 border-white/30 overflow-hidden">
                    <img 
                      src={signedProfilePicture} 
                      alt={displayName} 
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-full border-2 border-white/30 bg-white/20 flex items-center justify-center">
                    <span className="text-sm font-bold">{displayName?.charAt(0)?.toUpperCase()}</span>
                  </div>
                )}
                <div>
                  {showGreeting && (
                    <p className="text-[10px] opacity-80">
                      {getGreeting()}!
                    </p>
                  )}
                  <h1 className="text-base font-bold leading-tight">{displayName}</h1>
                  <p className="text-[10px] opacity-70">{roleDisplay}</p>
                </div>
              </div>

              {/* Quick Actions Dropdown */}
              {showQuickAdd && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      size="sm" 
                      className="bg-white/20 hover:bg-white/30 text-white border-0 h-9 px-3"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      <span className="text-xs">{t('home.quickAdd')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-[180px]">
                    {(canShow('visit_') || hasActionPermission('action_homepage_check_in')) && (
                      <DropdownMenuItem onClick={() => navigate('/visits/retailers')} className="cursor-pointer">
                        <ShoppingCart className="h-4 w-4 mr-2 text-blue-500" />
                        <span>{t('home.todaysVisit')}</span>
                      </DropdownMenuItem>
                    )}
                    {canShow('retailer_') && (
                      <DropdownMenuItem onClick={() => navigate('/retailers/add')} className="cursor-pointer">
                        <Plus className="h-4 w-4 mr-2 text-green-500" />
                        <span>{t('home.addRetailer')}</span>
                      </DropdownMenuItem>
                    )}
                    {canShow('competition_') && (
                      <DropdownMenuItem onClick={() => navigate('/competition')} className="cursor-pointer">
                        <TrendingUp className="h-4 w-4 mr-2 text-orange-500" />
                        <span>{t('home.addCompetition')}</span>
                      </DropdownMenuItem>
                    )}
                    {canShow('scheme_') && (
                      <DropdownMenuItem onClick={() => navigate('/schemes')} className="cursor-pointer">
                        <Tag className="h-4 w-4 mr-2 text-purple-500" />
                        <span>{t('home.checkSchemes')}</span>
                      </DropdownMenuItem>
                    )}
                    {canShow('gamification_') && (
                      <DropdownMenuItem onClick={() => navigate('/leaderboard')} className="cursor-pointer">
                        <Award className="h-4 w-4 mr-2 text-yellow-500" />
                        <span>{t('home.leaderboard')}</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-4 -mt-3 relative z-10 space-y-4">
          {/* Offline indicator with last updated time */}
          {!isOnline && lastUpdated && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-xs text-amber-700 dark:text-amber-400">
                {t('home.offline')} - {t('home.showingCachedData')} {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          )}
          
          {/* Always show content - never block on loading when we have any data or are offline */}
          {isLoading && !todayData.beatPlan && !todayData.attendance && isOnline ? (
            <DashboardSkeleton />
          ) : (
            <>
              {!hasAnyDashboardContent && (
                <Card className="border-dashed border-2 border-muted-foreground/20">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                    <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
                    <h3 className="text-lg font-semibold text-muted-foreground">No Permissions Assigned</h3>
                    <p className="text-sm text-muted-foreground/70 max-w-md">
                      Your security profile does not have any dashboard permissions enabled. 
                      Please contact your administrator to get access.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Check-in Status */}
              {showCheckIn && (
                <CheckInStatusBanner 
                  attendance={todayData.attendance}
                  onStartDay={() => navigate('/attendance')}
                  onEndDay={() => navigate('/attendance')}
                />
              )}

              {/* Today's Beat */}
              {showTodaysBeat && (
                <TodaysBeatCard 
                  beatPlan={todayData.beatPlan}
                  beatName={todayData.beatName}
                  beatProgress={todayData.beatProgress}
                  revenueTarget={todayData.revenueTarget}
                  revenueAchieved={todayData.revenueAchieved}
                  newRetailers={todayData.newRetailers}
                  potentialRevenue={todayData.potentialRevenue}
                  points={todayData.points}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  showTarget={showTarget}
                />
              )}

              {/* AI Insights Section - Tomorrow + Current Week + Next Week */}
              {showAIInsights && dashboardUserId && <AIInsightsSection userId={dashboardUserId} />}

              {/* Performance Calendar */}
              {showPerfCalendar && userProfile?.id && <PerformanceCalendar />}

              {/* Pending Payments - Moved below calendar */}
              {showPendingPay && dashboardUserId && <PendingPayments userId={dashboardUserId} />}

              {/* Quick Navigation */}
              {showQuickNav && <QuickNavGrid items={quickNavItems} />}

              {/* Device Info - hidden for now */}
              {/* <DeviceInfoCard /> */}
            </>
          )}
        </div>
      </div>

      {/* Profile Setup Modal */}
      {activeUserProfile && (
        <ProfileSetupModal
          userId={activeUserProfile.id}
          fullName={activeUserProfile.full_name || ''}
          onComplete={refreshProfilePicture}
        />
      )}

    </Layout>
  );
};

export default Index;
