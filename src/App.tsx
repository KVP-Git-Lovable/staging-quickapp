import { Suspense, useEffect, useState } from "react";
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { PricingPage } from "@/pages/website/PricingPage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleBasedAuthPage } from "@/components/auth/RoleBasedAuthPage";
import { useMasterDataCache } from "@/hooks/useMasterDataCache";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { visitStatusCache } from "@/lib/visitStatusCache";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { SlowConnectionBanner } from "@/components/SlowConnectionBanner";
// PWA install prompt removed per user request
import ForcedPasswordChangeDialog from "@/components/auth/ForcedPasswordChangeDialog";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useModuleUsageTracker } from "@/hooks/useModuleUsageTracker";

// Initialize visit status cache early to avoid flicker
visitStatusCache.init();

// All pages imported directly for instant loading in APK (no lazy loading)
import { LandingPage } from "./pages/LandingPage";
import FeatureListPage from "./pages/website/FeatureListPage";
import TechnologyPage from "./pages/website/TechnologyPage";
import FieldSalesSolution from "./pages/website/solutions/FieldSalesSolution";
import DistributorPortalSolution from "./pages/website/solutions/DistributorPortalSolution";

import VanSalesSolution from "./pages/website/solutions/VanSalesSolution";
import { ProfessionalServicesSolution } from "./pages/website/solutions/ProfessionalServicesSolution";
import ROICalculator from "./pages/website/ROICalculator";
import InsightsPage from "./pages/website/InsightsPage";
import MigrationPlanPage from "./pages/website/MigrationPlanPage";
import MigrationChecklistPage from "./pages/website/MigrationChecklistPage";
import ImplementationToolkitPage from "./pages/website/ImplementationToolkitPage";
import { ProfessionalServicesROIBlog } from "./pages/website/blogs/ProfessionalServicesROIBlog";
import { ProfessionalServicesChecklistBlog } from "./pages/website/blogs/ProfessionalServicesChecklistBlog";
import { ContactPage } from "./pages/website/ContactPage";
import PrivacyPolicyPage from "./pages/website/PrivacyPolicyPage";
import DemoRequestPage from "./pages/website/DemoRequestPage";
import Index from "./pages/Index";
import { MyVisits } from "./pages/MyVisits";
import { OrderEntry } from "./pages/OrderEntry";
import CounterSales from "./pages/CounterSales";
import EventCreate from "./pages/EventCreate";
import EventOrders from "./pages/EventOrders";
import EventStockTracker from "./pages/EventStockTracker";
import EventSummary from "./pages/EventSummary";
import { Cart } from "./pages/Cart";
import { MyRetailers } from "./pages/MyRetailers";
import { MyBeats } from "./pages/MyBeats";
import { AddRetailer } from "./pages/AddRetailer";
import Attendance from "./pages/Attendance";
import { TodaySummary } from "./pages/TodaySummary";
import { BeatPlanningFeature } from "./pages/features/BeatPlanningFeature";
import { RetailerManagementFeature } from "./pages/features/RetailerManagementFeature";
import { VisitSchedulingFeature } from "./pages/features/VisitSchedulingFeature";
import { SalesAnalyticsFeature } from "./pages/features/SalesAnalyticsFeature";
import { PerformanceTrackingFeature } from "./pages/features/PerformanceTrackingFeature";
import { GrowthAnalyticsFeature } from "./pages/features/GrowthAnalyticsFeature";
import { VisitPlanner } from "./pages/VisitPlanner";
import { BeatPlanning } from "./pages/BeatPlanning";
import { VisitDetail } from "./pages/VisitDetail";
import { CreateBeat } from "./pages/CreateBeat";
import { BeatAnalytics } from "./pages/BeatAnalytics";
import { AddBeat } from "./pages/AddBeat";
import AddRecords from "./pages/AddRecords";
import Leaderboard from "./pages/Leaderboard";
import Performance from "./pages/Performance";

import CompetencyDashboard from "./pages/CompetencyDashboard";
import TeamCompetency from "./pages/TeamCompetency";
import CompetencyAdmin from "./pages/CompetencyAdmin";
import CompetencyDetail from "./pages/CompetencyDetail";
import Analytics from "./pages/Analytics";
import { Schemes } from "./pages/Schemes";
import { AdminDashboard } from "./pages/AdminDashboard";
import AdminControls from "./pages/AdminControls";
import FeatureManagement from "./pages/FeatureManagement";
import ProductManagementPage from "./pages/ProductManagementPage";
import SchemeMasterPage from "./pages/SchemeMasterPage";
import AttendanceManagement from "./pages/AttendanceManagement";
import ActivitiesInfo from "./pages/ActivitiesInfo";
import BadgesInfo from "./pages/BadgesInfo";
import FeedbackManagement from "./pages/FeedbackManagement";
import CompetitionMaster from "./pages/CompetitionMaster";
import CompetitorDetail from "./pages/CompetitorDetail";
import NotFound from "./pages/NotFound";
import UserRoles from "./pages/UserRoles";
import BrandingRequests from "./pages/BrandingRequests";
import { BeatDetail } from "./pages/BeatDetail";
import EmployeeOnboarding from "./pages/EmployeeOnboarding";
import Employee360 from "./pages/Employee360";
import Vendors from "./pages/Vendors";
import { RetailerDetail } from "./pages/RetailerDetail";
import TerritoriesAndDistributors from "./pages/TerritoriesAndDistributors";
import TerritoryDetail from "./pages/TerritoryDetail";
import Operations from "./pages/Operations";
import GPSTrack from "./pages/GPSTrack";
import GPSTrackManagement from "./pages/GPSTrackManagement";
import RetailManagement from "./pages/RetailManagement";
import VanSalesManagement from "./pages/VanSalesManagement";
import AdminExpenseManagement from "./pages/AdminExpenseManagement";
import MyExpenses from "./pages/MyExpenses";
import ExpenseApprovals from "./pages/ExpenseApprovals";
import UserProfile from "./pages/UserProfile";
import CompleteProfile from "./pages/CompleteProfile";
import GamificationAdmin from "./pages/GamificationAdmin";
import InvoiceManagement from "./pages/InvoiceManagement";
import CreditNoteCreate from "./pages/CreditNoteCreate";
import CompanyProfile from "./pages/CompanyProfile";
import GamePolicy from "./pages/GamePolicy";
import CreditManagement from "./pages/CreditManagement";
import RetailerLoyaltyAdmin from "./pages/RetailerLoyaltyAdmin";
import RetailerLoyalty from "./pages/RetailerLoyalty";
import SecurityManagement from "./pages/SecurityManagement";

import PerformanceModuleAdmin from "./pages/admin/PerformanceModuleAdmin";
import PriceBookAdmin from "./pages/admin/PriceBookAdmin";
import PriceBookDetail from "./pages/admin/PriceBookDetail";
import RecycleBin from "./pages/RecycleBin";
import RecycleBinAdmin from "./pages/admin/RecycleBinAdmin";
import DistributorPortalAdmin from "./pages/admin/DistributorPortalAdmin";
import TargetVsActual from "./pages/admin/TargetVsActual";
import PincodeMasterPage from "./pages/admin/PincodeMasterPage";
import PincodeDetailPage from "./pages/admin/PincodeDetailPage";
import HierarchyTargets from "./pages/admin/HierarchyTargets";
import TaxMaster from "./pages/admin/TaxMaster";
import RetailerExternalDBPage from "./pages/admin/RetailerExternalDBPage";
import RetailerUnsortedPage from "./pages/admin/RetailerUnsortedPage";
import NotificationRulesAdmin from "./pages/admin/NotificationRulesAdmin";
import MyTargets from "./pages/MyTargets";
import MyTarget from "./pages/MyTarget";
import TeamTargets from "./pages/TeamTargets";
import PerformanceDashboard from "./pages/PerformanceDashboard";
import TargetAchievementAdvisor from "./pages/TargetAchievementAdvisor";
import AutoPlanRationale from "./pages/AutoPlanRationale";
import PendingPaymentsAll from "./pages/PendingPaymentsAll";
import JointSalesAnalytics from "./pages/JointSalesAnalytics";
import DistributorMaster from "./pages/DistributorMaster";
import AddDistributor from "./pages/AddDistributor";
import DistributorDetail from "./pages/DistributorDetail";
import EditDistributor from "./pages/EditDistributor";
import PrimaryOrders from "./pages/PrimaryOrders";
import ResetPassword from "./pages/ResetPassword";
import HelpCenter from "./pages/HelpCenter";
import HelpArticle from "./pages/HelpArticle";
import ChangePassword from "./pages/ChangePassword";
import StatusDashboard from "./pages/StatusDashboard";
import MapRedirect from "./pages/MapRedirect";
import AIFeaturesExport from "./pages/AIFeaturesExport";
import { TeamApprovals } from "./pages/TeamApprovals";
import { UsageReport } from "./pages/UsageReport";

// Distributor Portal Pages
import DistributorLogin from "./pages/distributor-portal/DistributorLogin";
import DistributorDashboard from "./pages/distributor-portal/DistributorDashboard";
import DMSLayout from "./pages/distributor-portal/DMSLayout";
import DMSHomePage from "./pages/distributor-portal/DMSHomePage";
import PrimaryOrdersList from "./pages/distributor-portal/PrimaryOrdersList";
import CreatePrimaryOrder from "./pages/distributor-portal/CreatePrimaryOrder";
import PrimaryOrderDetail from "./pages/distributor-portal/PrimaryOrderDetail";
import DistributorInventory from "./pages/distributor-portal/DistributorInventory";
import SecondarySales from "./pages/distributor-portal/SecondarySales";
import PackingList from "./pages/distributor-portal/PackingList";
import PackingListManagement from "./pages/distributor-portal/PackingListManagement";
import PackingListDetail from "./pages/distributor-portal/PackingListDetail";
import GoodsReceipt from "./pages/distributor-portal/GoodsReceipt";
import GoodsReceiptList from "./pages/distributor-portal/GoodsReceiptList";
import DistributorClaims from "./pages/distributor-portal/DistributorClaims";
import DistributorSupport from "./pages/distributor-portal/DistributorSupport";
import DistributorIdeas from "./pages/distributor-portal/DistributorIdeas";
import DistributorProfile from "./pages/distributor-portal/DistributorProfile";
import DistributorContactsPortal from "./pages/distributor-portal/DistributorContacts";
import DistributorFYPlanPage from "./pages/distributor-portal/DistributorFYPlan";
import RetailerReturns from "./pages/distributor-portal/RetailerReturns";
import CompanyReturns from "./pages/distributor-portal/CompanyReturns";
import InventoryLedger from "./pages/distributor-portal/InventoryLedger";
import StockAdjustments from "./pages/distributor-portal/StockAdjustments";
import RetailerLedger from "./pages/distributor-portal/RetailerLedger";
import RetailerLedgerDetail from "./pages/distributor-portal/RetailerLedgerDetail";
import CollectPayment from "./pages/distributor-portal/CollectPayment";
import SecondaryInvoiceList from "./pages/distributor-portal/SecondaryInvoiceList";
import SecondaryInvoiceCreate from "./pages/distributor-portal/SecondaryInvoiceCreate";
import RetailerFeedback from "./pages/distributor-portal/RetailerFeedback";
import StockHealthDashboard from "./pages/distributor-portal/StockHealthDashboard";
import GoodsReceiptNew from "./pages/distributor-portal/GoodsReceiptNew";
import PriceBookView from "./pages/distributor-portal/PriceBookView";
import PrimarySchemesView from "./pages/distributor-portal/PrimarySchemesView";
import PrimaryReturnCreate from "./pages/distributor-portal/PrimaryReturnCreate";
import DeliveryRun from "./pages/DeliveryRun";
import PackingListManagementPage from "./pages/PackingListManagement";
import MyDeliveriesPage from "./pages/MyDeliveries";
import PackingListDetailPage from "./pages/PackingListDetail";

// ARCHIVED: Projects module hidden
// import ProjectsPage from "./pages/pm/ProjectsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (!navigator.onLine) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// Master data cache initializer - delayed to let UI render first
const MasterDataCacheInitializer = () => {
  const { cacheAllMasterData, isOnline } = useMasterDataCache();
  
  useEffect(() => {
    if (isOnline) {
      // Delay background sync by 1.5s to let UI render first for faster perceived startup
      const timeoutId = setTimeout(() => {
        cacheAllMasterData();
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, cacheAllMasterData]);
  
  return null;
};

const App = () => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      console.error("Global error:", event.error ?? event.message);
      setHasError(true);
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || event.reason?.toString() || '';
      
      const ignoredErrors = [
        'ServiceWorker',
        'service-worker',
        'Failed to fetch',
        'Network request failed',
        'NetworkError',
        'Load failed',
        'AbortError',
        'chunk',
      ];
      
      const isIgnored = ignoredErrors.some(err => message.includes(err));
      
      if (isIgnored) {
        console.warn("Non-critical rejection suppressed:", message);
        event.preventDefault();
        return;
      }
      
      console.error("Unhandled rejection:", event.reason);
      setHasError(true);
    };

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <AuthProvider>
            <TooltipProvider>
              <BrowserRouter>
                <SlowConnectionBanner />
                <AppContent hasError={hasError} />
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
};

const AppContent = ({ hasError }: { hasError: boolean }) => {
  useAndroidBackButton();
  useActivityTracker();
  useModuleUsageTracker();
  const { user, mustChangePassword, onPasswordChanged, dismissPasswordChange } = useAuth();

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">Please refresh the page to try again</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <MasterDataCacheInitializer />
      <Toaster />
      <Sonner />
      
      {/* Forced password change dialog - shows as modal overlay */}
      {user && mustChangePassword && (
        <ForcedPasswordChangeDialog 
          open={mustChangePassword} 
          userId={user.id}
          onPasswordChanged={onPasswordChanged}
          onDismiss={dismissPasswordChange}
        />
      )}
      
      <Routes>
        {/* All routes - direct imports, no lazy loading for instant APK page loads */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeatureListPage />} />
        <Route path="/technology" element={<TechnologyPage />} />
        <Route path="/solutions/field-sales" element={<FieldSalesSolution />} />
        <Route path="/solutions/distributor-portal" element={<DistributorPortalSolution />} />
        
        <Route path="/solutions/van-sales" element={<VanSalesSolution />} />
        <Route path="/solutions/professional-services" element={<ProfessionalServicesSolution />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/roi-calculator" element={<ROICalculator />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/insights/migration-plan" element={<MigrationPlanPage />} />
        <Route path="/insights/migration-checklist" element={<MigrationChecklistPage />} />
        <Route path="/insights/implementation-toolkit" element={<ImplementationToolkitPage />} />
        <Route path="/insights/professional-services-roi" element={<ProfessionalServicesROIBlog />} />
        <Route path="/insights/professional-services-checklist" element={<ProfessionalServicesChecklistBlog />} />
        <Route path="/request-demo" element={<DemoRequestPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/auth" element={<RoleBasedAuthPage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/map-redirect" element={<MapRedirect />} />
        <Route path="/status" element={<StatusDashboard />} />
        <Route path="/ai-features-export" element={<AIFeaturesExport />} />
        <Route path="/auth/complete-profile" element={<CompleteProfile />} />
        <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        
        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/admin-controls" element={<ProtectedRoute><AdminControls /></ProtectedRoute>} />
        <Route path="/feature-management" element={<ProtectedRoute><FeatureManagement /></ProtectedRoute>} />
        
        <Route path="/user_roles" element={<ProtectedRoute><UserRoles /></ProtectedRoute>} />
        <Route path="/security-management" element={<ProtectedRoute><SecurityManagement /></ProtectedRoute>} />
        <Route path="/product-management" element={<ProtectedRoute><ProductManagementPage /></ProtectedRoute>} />
        <Route path="/scheme-management" element={<ProtectedRoute><SchemeMasterPage /></ProtectedRoute>} />
        <Route path="/attendance-management" element={<ProtectedRoute><AttendanceManagement /></ProtectedRoute>} />
        <Route path="/feedback-management" element={<ProtectedRoute><FeedbackManagement /></ProtectedRoute>} />
        <Route path="/competition-master" element={<ProtectedRoute><CompetitionMaster /></ProtectedRoute>} />
        <Route path="/competition-master/:competitorId" element={<ProtectedRoute><CompetitorDetail /></ProtectedRoute>} />
        <Route path="/retailer/:id" element={<RetailerDetail />} />
<Route path="/territories-and-distributors" element={<ProtectedRoute><TerritoriesAndDistributors /></ProtectedRoute>} />
        <Route path="/territory/:id" element={<ProtectedRoute><TerritoryDetail /></ProtectedRoute>} />
        <Route path="/admin-expense-management" element={<ProtectedRoute><AdminExpenseManagement /></ProtectedRoute>} />
        <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
        <Route path="/visit-planner" element={<ProtectedRoute><VisitPlanner /></ProtectedRoute>} />
        <Route path="/visits" element={<ProtectedRoute><BeatPlanning /></ProtectedRoute>} />
        <Route path="/beat-planning" element={<ProtectedRoute><BeatPlanning /></ProtectedRoute>} />
        <Route path="/visits/retailers" element={<ProtectedRoute><MyVisits /></ProtectedRoute>} />
        <Route path="/order-entry" element={<ProtectedRoute><OrderEntry /></ProtectedRoute>} />
        <Route path="/counter-sales" element={<ProtectedRoute><CounterSales /></ProtectedRoute>} />
        <Route path="/event-create" element={<ProtectedRoute><EventCreate /></ProtectedRoute>} />
        <Route path="/event/:id/orders" element={<ProtectedRoute><EventOrders /></ProtectedRoute>} />
        <Route path="/event/:id/stock" element={<ProtectedRoute><EventStockTracker /></ProtectedRoute>} />
        <Route path="/event/:id/summary" element={<ProtectedRoute><EventSummary /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
        <Route path="/my-beats" element={<ProtectedRoute><MyBeats /></ProtectedRoute>} />
        <Route path="/today-summary" element={<ProtectedRoute><TodaySummary /></ProtectedRoute>} />
        <Route path="/add-retailer" element={<ProtectedRoute><AddRetailer /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="/team-approvals" element={<ProtectedRoute><TeamApprovals /></ProtectedRoute>} />
        <Route path="/my-retailers" element={<ProtectedRoute><MyRetailers /></ProtectedRoute>} />
        <Route path="/my-target" element={<ProtectedRoute><MyTarget /></ProtectedRoute>} />
        <Route path="/performance-dashboard" element={<ProtectedRoute><PerformanceDashboard /></ProtectedRoute>} />
        <Route path="/target-advisor" element={<ProtectedRoute><TargetAchievementAdvisor /></ProtectedRoute>} />
        <Route path="/auto-plan-rationale" element={<ProtectedRoute><AutoPlanRationale /></ProtectedRoute>} />
        <Route path="/admin/target-vs-actual" element={<ProtectedRoute><TargetVsActual /></ProtectedRoute>} />
        
        <Route path="/create-beat" element={<ProtectedRoute><CreateBeat /></ProtectedRoute>} />
        <Route path="/beat/:id" element={<ProtectedRoute><BeatDetail /></ProtectedRoute>} />
        <Route path="/visit/:id" element={<ProtectedRoute><VisitDetail /></ProtectedRoute>} />
        <Route path="/beat-analytics" element={<ProtectedRoute><BeatAnalytics /></ProtectedRoute>} />
        <Route path="/add-records" element={<ProtectedRoute><AddRecords /></ProtectedRoute>} />
        <Route path="/add-beat" element={<ProtectedRoute><AddBeat /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute><MyExpenses /></ProtectedRoute>} />
        <Route path="/expenses/approvals" element={<ProtectedRoute><ExpenseApprovals /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/game-policy" element={<ProtectedRoute><GamePolicy /></ProtectedRoute>} />
        <Route path="/activities-info" element={<ProtectedRoute><ActivitiesInfo /></ProtectedRoute>} />
        <Route path="/badges-info" element={<ProtectedRoute><BadgesInfo /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
        
        <Route path="/competency-dashboard" element={<ProtectedRoute><CompetencyDashboard /></ProtectedRoute>} />
        <Route path="/competency/:competencyId" element={<ProtectedRoute><CompetencyDetail /></ProtectedRoute>} />
        <Route path="/team-competency" element={<ProtectedRoute><TeamCompetency /></ProtectedRoute>} />
        <Route path="/competency-admin" element={<ProtectedRoute><CompetencyAdmin /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/schemes" element={<ProtectedRoute><Schemes /></ProtectedRoute>} />
        
        <Route path="/branding-requests" element={<ProtectedRoute><BrandingRequests /></ProtectedRoute>} />
        <Route path="/admin/hierarchy-targets" element={<Navigate to="/admin/target-vs-actual?mode=hierarchy" replace />} />
        <Route path="/vendors" element={<ProtectedRoute><Vendors /></ProtectedRoute>} />
        <Route path="/gps-track" element={<ProtectedRoute><GPSTrack /></ProtectedRoute>} />
        <Route path="/gps-track-management" element={<ProtectedRoute><GPSTrackManagement /></ProtectedRoute>} />
        <Route path="/retail-management" element={<ProtectedRoute><RetailManagement /></ProtectedRoute>} />
        <Route path="/van-sales-management" element={<ProtectedRoute><VanSalesManagement /></ProtectedRoute>} />
        <Route path="/gamification-admin" element={<ProtectedRoute><GamificationAdmin /></ProtectedRoute>} />
        <Route path="/credit-management" element={<ProtectedRoute><CreditManagement /></ProtectedRoute>} />
        <Route path="/retailer-loyalty-admin" element={<ProtectedRoute><RetailerLoyaltyAdmin /></ProtectedRoute>} />
        <Route path="/retailer-loyalty" element={<ProtectedRoute><RetailerLoyalty /></ProtectedRoute>} />
        <Route path="/invoice-management" element={<ProtectedRoute><InvoiceManagement /></ProtectedRoute>} />
        <Route path="/credit-note/create" element={<ProtectedRoute><CreditNoteCreate /></ProtectedRoute>} />
        <Route path="/company-profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
        <Route path="/pending-payments-all" element={<ProtectedRoute><PendingPaymentsAll /></ProtectedRoute>} />
        <Route path="/admin/performance-module" element={<ProtectedRoute><PerformanceModuleAdmin /></ProtectedRoute>} />
        <Route path="/admin/price-books" element={<ProtectedRoute><PriceBookAdmin /></ProtectedRoute>} />
        <Route path="/admin/price-books/:id" element={<ProtectedRoute><PriceBookDetail /></ProtectedRoute>} />
        <Route path="/my-targets" element={<ProtectedRoute><MyTargets /></ProtectedRoute>} />
        <Route path="/team-targets" element={<ProtectedRoute><TeamTargets /></ProtectedRoute>} />
        <Route path="/joint-sales-analytics" element={<ProtectedRoute><JointSalesAnalytics /></ProtectedRoute>} />
        <Route path="/usage-report" element={<ProtectedRoute><UsageReport /></ProtectedRoute>} />
        <Route path="/features/beat-planning" element={<BeatPlanningFeature />} />
        <Route path="/features/retailer-management" element={<RetailerManagementFeature />} />
        <Route path="/features/visit-scheduling" element={<VisitSchedulingFeature />} />
        <Route path="/features/sales-analytics" element={<SalesAnalyticsFeature />} />
        <Route path="/features/performance-tracking" element={<PerformanceTrackingFeature />} />
        <Route path="/features/growth-analytics" element={<GrowthAnalyticsFeature />} />
        <Route path="/onboarding" element={<ProtectedRoute><EmployeeOnboarding /></ProtectedRoute>} />
        <Route path="/employee-360" element={<ProtectedRoute><Employee360 /></ProtectedRoute>} />
        <Route path="/recycle-bin" element={<ProtectedRoute><RecycleBin /></ProtectedRoute>} />
        <Route path="/admin/recycle-bin" element={<ProtectedRoute><RecycleBinAdmin /></ProtectedRoute>} />
        <Route path="/admin/distributor-portal" element={<ProtectedRoute><DistributorPortalAdmin /></ProtectedRoute>} />
        <Route path="/admin/pincode-master" element={<ProtectedRoute><PincodeMasterPage /></ProtectedRoute>} />
        <Route path="/admin/pincode-master/:pincode" element={<ProtectedRoute><PincodeDetailPage /></ProtectedRoute>} />
        <Route path="/admin/tax-master" element={<ProtectedRoute><TaxMaster /></ProtectedRoute>} />
        <Route path="/admin/retailer-external-db" element={<ProtectedRoute><RetailerExternalDBPage /></ProtectedRoute>} />
        <Route path="/admin/retailer-unsorted" element={<ProtectedRoute><RetailerUnsortedPage /></ProtectedRoute>} />
        <Route path="/admin/notification-rules" element={<ProtectedRoute><NotificationRulesAdmin /></ProtectedRoute>} />
        <Route path="/distributor-master" element={<ProtectedRoute><DistributorMaster /></ProtectedRoute>} />
        <Route path="/add-distributor" element={<ProtectedRoute><AddDistributor /></ProtectedRoute>} />
        <Route path="/distributor/:id" element={<ProtectedRoute><DistributorDetail /></ProtectedRoute>} />
        <Route path="/edit-distributor/:id" element={<ProtectedRoute><EditDistributor /></ProtectedRoute>} />
        <Route path="/primary-orders" element={<ProtectedRoute><PrimaryOrders /></ProtectedRoute>} />
        <Route path="/my-deliveries" element={<ProtectedRoute><MyDeliveriesPage /></ProtectedRoute>} />
        <Route path="/help-center" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
        <Route path="/help-center/:articleId" element={<ProtectedRoute><HelpArticle /></ProtectedRoute>} />

        {/* Distributor Portal Routes */}
        <Route path="/distributor-portal" element={<Navigate to="/distributor-portal/login" replace />} />
        <Route path="/distributor-portal/login" element={<DistributorLogin />} />
        
        {/* DMS Layout with persistent sidebar */}
        <Route path="/distributor-portal" element={<DMSLayout />}>
          <Route path="dashboard" element={<DMSHomePage />} />
          <Route path="primary-orders" element={<PrimaryOrdersList />} />
          <Route path="create-primary-order" element={<CreatePrimaryOrder />} />
          <Route path="primary-order/:id" element={<PrimaryOrderDetail />} />
          <Route path="inventory" element={<DistributorInventory />} />
          <Route path="secondary-sales" element={<SecondarySales />} />
          <Route path="packing-list" element={<PackingList />} />
          <Route path="packing-list-management" element={<PackingListManagement />} />
          <Route path="packing-list/:id" element={<PackingListDetail />} />
          <Route path="goods-receipt/:orderId" element={<GoodsReceiptNew />} />
          <Route path="goods-receipt" element={<GoodsReceiptList />} />
          <Route path="claims" element={<DistributorClaims />} />
          <Route path="support" element={<DistributorSupport />} />
          <Route path="ideas" element={<DistributorIdeas />} />
          <Route path="profile" element={<DistributorProfile />} />
          <Route path="contacts" element={<DistributorContactsPortal />} />
          <Route path="fy-plan" element={<DistributorFYPlanPage />} />
          <Route path="returns" element={<RetailerReturns />} />
          <Route path="company-returns" element={<CompanyReturns />} />
          <Route path="inventory-ledger" element={<InventoryLedger />} />
          <Route path="stock-adjustments" element={<StockAdjustments />} />
          <Route path="retailer-ledger" element={<RetailerLedger />} />
          <Route path="retailer-ledger/:retailerId" element={<RetailerLedgerDetail />} />
          <Route path="collect-payment" element={<CollectPayment />} />
          <Route path="secondary-invoices" element={<SecondaryInvoiceList />} />
          <Route path="secondary-invoices/create" element={<SecondaryInvoiceCreate />} />
          <Route path="retailer-feedback" element={<RetailerFeedback />} />
          <Route path="stock-health" element={<StockHealthDashboard />} />
          <Route path="price-book" element={<PriceBookView />} />
          <Route path="schemes" element={<PrimarySchemesView />} />
          <Route path="create-return" element={<PrimaryReturnCreate />} />
        </Route>

        {/* D-1 Delivery Module Routes - Main App */}
        <Route path="/packing-list-management" element={<ProtectedRoute><PackingListManagementPage /></ProtectedRoute>} />
        <Route path="/packing-list/:id" element={<ProtectedRoute><PackingListDetailPage /></ProtectedRoute>} />
        <Route path="/delivery-run" element={<ProtectedRoute><DeliveryRun /></ProtectedRoute>} />


        {/* ARCHIVED: Projects module hidden
        <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
        <Route path="/projects/:id/resources/:resourceId" element={<ProtectedRoute><ResourceDetailPage /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
        <Route path="/templates/:id" element={<ProtectedRoute><TemplateBuilderPage /></ProtectedRoute>} />
        */}

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

export default App;
