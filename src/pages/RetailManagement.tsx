import { useEffect, useState } from "react";
import { compressImageFile, compressToTargetSize } from "@/utils/imageCompression";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Layout } from "@/components/Layout";
import { Search, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, Camera, Image as ImageIcon, MapPin, User, MapPinned, ExternalLink, MessageCircle, Columns3, Download, MoreVertical, Phone as PhoneIcon, Pencil, Users, ShieldCheck, ShieldAlert, Ban, UserX, Clock, Sparkles, Copy as CopyIcon, Hourglass, TrendingUp, Activity, Gauge } from "lucide-react";
import { QualityBadge, ScoreBar, DuplicateRiskBadge } from "@/components/retailer/QualityBadge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { CameraCapture } from "@/components/CameraCapture";
import { format, subMonths, isAfter, isBefore, startOfMonth } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { ApprovalChecklistDialog } from "@/components/retailer/ApprovalChecklistDialog";
import { VerifiedTick } from "@/components/retailer/VerifiedTick";
import { VerificationPolicyCard } from "@/components/retailer/VerificationPolicyCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RetailerExportDialog } from "@/components/RetailerExportDialog";

type RetailerColKey = 'photo' | 'name' | 'contact_person' | 'phone' | 'address' | 'territory' | 'status' | 'quality' | 'last_visited' | 'added_by' | 'verification' | 'verified_by' | 'actions';

const RETAILER_COLUMNS: { key: RetailerColKey; label: string; alwaysVisible?: boolean }[] = [
  { key: 'photo', label: 'Photo' },
  { key: 'name', label: 'Retailer Name', alwaysVisible: true },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'territory', label: 'Territory' },
  { key: 'status', label: 'Status' },
  { key: 'quality', label: 'Quality Score' },
  { key: 'last_visited', label: 'Last Visited' },
  { key: 'added_by', label: 'Added By' },
  { key: 'verification', label: 'Verification' },
  { key: 'verified_by', label: 'Verified By' },
  { key: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_VISIBLE_COLS: RetailerColKey[] = ['photo','name','phone','address','territory','status','quality','last_visited','verification','verified_by','actions'];
const COL_STORAGE_KEY = 'retail-management:visible-columns:v2';

interface Territory {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string;
  username: string;
}

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  category: string | null;
  beat_id: string;
  beat_name: string | null;
  photo_url: string | null;
  verified: boolean;
  verification_status: string | null;
  verification_address: boolean;
  verification_contact: boolean;
  verification_territory: boolean;
  status: string | null;
  last_visit_date: string | null;
  territory_id: string | null;
  territory_name: string | null;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string;
  } | null;
  contact_person?: string | null;
  owner_name?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  verification_method?: string | null;
  verification_score?: number | null;
  quality_status?: string | null;
  duplicate_risk_score?: number | null;
  approval_status?: string | null;
  order_count?: number;
  last_order_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  whatsapp_verified?: boolean | null;
  gst_number?: string | null;
}

type VerificationStatusFilter = 'all' | 'verified' | 'pending' | 'needs_attention' | 'dropped';
type LastVisitedFilter = 'all' | 'this_month' | 'last_month' | '3_months' | '6_months';
type KpiFilter =
  | 'none'
  | 'total'
  | 'verified'
  | 'unverified'
  | 'needs_attention'
  | 'dropped'
  | 'orphan'
  | 'dormant'
  | 'new_month'
  | 'duplicate'
  | 'whatsapp_verified'
  | 'visited_not_ordered';

export default function RetailManagement() {
  const { hasAdminAccess, loading: authLoading } = useAdminAccess();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [salesTeam, setSalesTeam] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Filters
  const [search, setSearch] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [salesMemberFilter, setSalesMemberFilter] = useState<string>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<VerificationStatusFilter>('all');
  const [lastVisitedFilter, setLastVisitedFilter] = useState<LastVisitedFilter>('all');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('none');
  
  // Dialogs
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  
  // Verification checkboxes (legacy partial-verification dialog)
  const [verifyAddress, setVerifyAddress] = useState(false);
  const [verifyContact, setVerifyContact] = useState(false);
  const [verifyTerritory, setVerifyTerritory] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");

  // New approval-checklist dialog
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);

  // Column visibility + export
  const [visibleColumns, setVisibleColumns] = useState<Set<RetailerColKey>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(COL_STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as RetailerColKey[];
        const set = new Set<RetailerColKey>(parsed);
        RETAILER_COLUMNS.forEach(c => { if (c.alwaysVisible) set.add(c.key); });
        return set;
      }
    } catch {}
    return new Set<RetailerColKey>(DEFAULT_VISIBLE_COLS);
  });
  const [exportOpen, setExportOpen] = useState(false);

  const toggleColumn = (key: RetailerColKey) => {
    const def = RETAILER_COLUMNS.find(c => c.key === key);
    if (def?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const resetColumns = () => {
    const next = new Set<RetailerColKey>(DEFAULT_VISIBLE_COLS);
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(Array.from(next))); } catch {}
    setVisibleColumns(next);
  };
  const showAllColumns = () => {
    const next = new Set<RetailerColKey>(RETAILER_COLUMNS.map(c => c.key));
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(Array.from(next))); } catch {}
    setVisibleColumns(next);
  };
  const isCol = (k: RetailerColKey) => visibleColumns.has(k);

  useEffect(() => {
    document.title = "Retail Management | Admin Panel";
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Fetch all data in parallel
    const [retailersRes, territoriesRes, profilesRes, ordersRes] = await Promise.all([
      supabase.from("retailers").select("*").order("created_at", { ascending: false }),
      supabase.from("territories").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, username"),
      supabase.from("orders").select("retailer_id, created_at").order("created_at", { ascending: false }).limit(20000),
    ]);

    if (retailersRes.error) {
      toast({ 
        title: "Failed to load retailers", 
        description: retailersRes.error.message, 
        variant: "destructive" 
      });
      setLoading(false);
      return;
    }

    const data = retailersRes.data || [];
    const territoriesData = territoriesRes.data || [];
    const profilesData = profilesRes.data || [];
    
    setTerritories(territoriesData);
    setSalesTeam(profilesData);

    // Extract unique categories
    const uniqueCategories = [...new Set(data.map(r => r.category).filter(Boolean))] as string[];
    setCategories(uniqueCategories);

    // Build maps
    const profileMap = new Map(profilesData.map((p: any) => [p.id, { full_name: p.full_name, username: p.username }]));
    const territoryMap = new Map(territoriesData.map((t: any) => [t.id, t.name]));

    // Fetch beats for beat names
    const beatsRes = await supabase.from("beats").select("beat_id, beat_name");
    const beatMap = new Map((beatsRes.data || []).map((b: any) => [b.beat_id, b.beat_name]));
    
    // Build order aggregation per retailer
    const orderAgg = new Map<string, { count: number; last: string | null }>();
    (ordersRes.data || []).forEach((o: any) => {
      if (!o.retailer_id) return;
      const cur = orderAgg.get(o.retailer_id) || { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || (o.created_at && o.created_at > cur.last)) cur.last = o.created_at;
      orderAgg.set(o.retailer_id, cur);
    });

    // Calculate 6 months ago for auto-drop
    const sixMonthsAgo = subMonths(new Date(), 6);

    const retailersWithDetails = data.map((r: any) => {
      const prof = r.user_id ? profileMap.get(r.user_id) : null;
      const displayName = prof?.full_name || prof?.username || 'Unknown';
      const displayBeatName = r.beat_name || (r.beat_id ? beatMap.get(r.beat_id) : null) || r.beat_id;
      const territoryName = r.territory_id ? territoryMap.get(r.territory_id) : null;

      // Calculate verification status
      let verificationStatus = r.verification_status || 'pending';

      // Auto-drop logic: if inactive OR last visit > 6 months
      const isInactive = r.status === 'inactive';
      const lastVisit = r.last_visit_date ? new Date(r.last_visit_date) : null;
      const isStale = lastVisit ? isBefore(lastVisit, sixMonthsAgo) : false;

      if (isInactive || isStale) {
        verificationStatus = 'dropped';
      } else if (r.verification_address && r.verification_contact && r.verification_territory) {
        verificationStatus = 'verified';
      } else if (r.verification_address || r.verification_contact || r.verification_territory) {
        verificationStatus = 'needs_attention';
      }

      const verifierProf = r.verified_by ? profileMap.get(r.verified_by) : null;
      const verifiedByName = verifierProf?.full_name || verifierProf?.username || null;

      const agg = orderAgg.get(r.id);

      return {
        ...r,
        beat_name: displayBeatName,
        territory_name: territoryName,
        verification_status: verificationStatus,
        verified_by_name: verifiedByName,
        profiles: r.user_id ? { full_name: displayName } : null,
        order_count: agg?.count ?? 0,
        last_order_date: agg?.last ?? null,
      };
    });
    
    setRetailers(retailersWithDetails as Retailer[]);
    setLoading(false);
  };

  useEffect(() => {
    if (hasAdminAccess) {
      loadData();
    }
  }, [hasAdminAccess]);

  const openVerifyDialog = (retailer: Retailer) => {
    setSelectedRetailer(retailer);
    setVerifyAddress(retailer.verification_address || false);
    setVerifyContact(retailer.verification_contact || false);
    setVerifyTerritory(retailer.verification_territory || false);
    setVerificationNote("");
    setVerifyDialogOpen(true);
  };

  const handleVerification = async () => {
    if (!selectedRetailer) return;
    
    const allVerified = verifyAddress && verifyContact && verifyTerritory;
    const someVerified = verifyAddress || verifyContact || verifyTerritory;
    
    let newStatus = 'pending';
    if (allVerified) {
      newStatus = 'verified';
    } else if (someVerified) {
      newStatus = 'needs_attention';
    }
    
    const { error } = await supabase
      .from("retailers")
      .update({ 
        verification_address: verifyAddress,
        verification_contact: verifyContact,
        verification_territory: verifyTerritory,
        verification_status: newStatus,
        verified: allVerified
      })
      .eq("id", selectedRetailer.id);

    if (error) {
      toast({ 
        title: "Failed to update verification", 
        description: error.message, 
        variant: "destructive" 
      });
    } else {
      // Send notification to retailer owner if needs attention
      if (newStatus === 'needs_attention' && selectedRetailer.user_id) {
        const gaps: string[] = [];
        if (!verifyAddress) gaps.push("Address & Geo Stamp");
        if (!verifyContact) gaps.push("Retailer Name & Owner Contact");
        if (!verifyTerritory) gaps.push("Territory Assignment");
        
        const notificationMessage = `Retailer "${selectedRetailer.name}" needs attention. Verification gaps: ${gaps.join(", ")}. ${verificationNote ? `Note: ${verificationNote}` : ""}`;
        
        await supabase.from("notifications").insert({
          user_id: selectedRetailer.user_id,
          title: "Retailer Verification: Needs Attention",
          message: notificationMessage,
          type: "verification",
          related_table: "retailers",
          related_id: selectedRetailer.id
        });
      }
      
      toast({ 
        title: allVerified ? "Retailer Verified" : "Verification Updated",
        description: allVerified 
          ? `${selectedRetailer.name} has been fully verified.`
          : `${selectedRetailer.name} verification status updated.`
      });
      setVerifyDialogOpen(false);
      loadData();
    }
  };
  
  const openGoogleMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const handlePhotoCapture = async (blob: Blob) => {
    if (!selectedRetailer) return;
    
    setUploadingPhoto(true);
    try {
      const compressedBlob = await compressToTargetSize(blob, 0.25, 1200);
      const fileName = `${selectedRetailer.id}/store_${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('retailer-photos')
        .upload(fileName, compressedBlob, {
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('retailer-photos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('retailers')
        .update({ photo_url: urlData.publicUrl })
        .eq('id', selectedRetailer.id);

      if (updateError) throw updateError;

      toast({ 
        title: "Photo Uploaded",
        description: "Retailer photo has been uploaded successfully."
      });
      
      setCameraOpen(false);
      setPhotoDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ 
        title: "Upload Failed",
        description: error.message || "Failed to upload photo.",
        variant: "destructive"
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhotoDialog = (retailer: Retailer) => {
    setSelectedRetailer(retailer);
    setPhotoDialogOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  // Apply filters
  const filteredRetailers = retailers.filter(r => {
    // Search filter
    const matchesSearch = !search || 
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.phone || '').includes(search) ||
      r.address.toLowerCase().includes(search.toLowerCase()) ||
      (r.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase());
    
    // Territory filter
    const matchesTerritory = territoryFilter === 'all' || r.territory_id === territoryFilter;
    
    // Category filter
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
    
    // Sales member filter
    const matchesSalesMember = salesMemberFilter === 'all' || r.user_id === salesMemberFilter;
    
    // Verification status filter
    const matchesVerified = verifiedFilter === 'all' || r.verification_status === verifiedFilter;
    
    // Last visited filter
    let matchesLastVisited = true;
    if (lastVisitedFilter !== 'all' && r.last_visit_date) {
      const visitDate = new Date(r.last_visit_date);
      const now = new Date();
      
      switch (lastVisitedFilter) {
        case 'this_month':
          matchesLastVisited = isAfter(visitDate, startOfMonth(now));
          break;
        case 'last_month':
          matchesLastVisited = isAfter(visitDate, startOfMonth(subMonths(now, 1))) && 
                               isBefore(visitDate, startOfMonth(now));
          break;
        case '3_months':
          matchesLastVisited = isAfter(visitDate, subMonths(now, 3));
          break;
        case '6_months':
          matchesLastVisited = isAfter(visitDate, subMonths(now, 6));
          break;
      }
    } else if (lastVisitedFilter !== 'all' && !r.last_visit_date) {
      matchesLastVisited = false;
    }

    // KPI smart filter
    const now = new Date();
    const monthStart = startOfMonth(now);
    const sixtyAgo = subMonths(now, 2);
    let matchesKpi = true;
    const score = r.verification_score ?? 0;
    const dupRisk = r.duplicate_risk_score ?? 0;
    const orders = r.order_count ?? 0;
    const lastOrder = r.last_order_date ? new Date(r.last_order_date) : null;
    switch (kpiFilter) {
      case 'verified': matchesKpi = r.verification_status === 'verified' || score >= 70; break;
      case 'unverified': matchesKpi = r.verification_status === 'pending' || (score > 0 && score < 40) || (!r.verification_status); break;
      case 'needs_attention': matchesKpi = r.verification_status === 'needs_attention'; break;
      case 'dropped': matchesKpi = r.verification_status === 'dropped'; break;
      case 'orphan': matchesKpi = orders === 0; break;
      case 'dormant': matchesKpi = orders > 0 && (!lastOrder || isBefore(lastOrder, sixtyAgo)); break;
      case 'new_month': matchesKpi = r.created_at ? isAfter(new Date(r.created_at), monthStart) : false; break;
      case 'duplicate': matchesKpi = dupRisk >= 70; break;
      case 'awaiting_approval': matchesKpi = (r.approval_status ?? '').toLowerCase() === 'pending' || r.verification_status === 'pending'; break;
      case 'visited_not_ordered': matchesKpi = !!r.last_visit_date && orders === 0; break;
      case 'total':
      case 'none':
      default: matchesKpi = true;
    }

    return matchesSearch && matchesTerritory && matchesCategory &&
           matchesSalesMember && matchesVerified && matchesLastVisited && matchesKpi;
  });

  // Pagination - 10 items per page
  const {
    currentPage,
    totalPages,
    paginatedItems: paginatedRetailers,
    goToPage,
    nextPage,
    prevPage,
    startIndex,
    endIndex,
    totalItems,
    hasNextPage,
    hasPrevPage,
  } = usePagination(filteredRetailers, { pageSize: 10 });

  // Compute extended stats
  const _now = new Date();
  const _monthStart = startOfMonth(_now);
  const _sixtyAgo = subMonths(_now, 2);
  const stats = {
    total: retailers.length,
    verified: retailers.filter(r => r.verification_status === 'verified' || (r.verification_score ?? 0) >= 70).length,
    unverified: retailers.filter(r => r.verification_status === 'pending' || ((r.verification_score ?? 0) < 40 && (r.verification_score ?? 0) > 0) || !r.verification_status).length,
    needsAttention: retailers.filter(r => r.verification_status === 'needs_attention').length,
    dropped: retailers.filter(r => r.verification_status === 'dropped').length,
    orphan: retailers.filter(r => (r.order_count ?? 0) === 0).length,
    dormant: retailers.filter(r => (r.order_count ?? 0) > 0 && (!r.last_order_date || isBefore(new Date(r.last_order_date), _sixtyAgo))).length,
    newThisMonth: retailers.filter(r => r.created_at && isAfter(new Date(r.created_at), _monthStart)).length,
    duplicate: retailers.filter(r => (r.duplicate_risk_score ?? 0) >= 70).length,
    awaitingApproval: retailers.filter(r => ((r.approval_status ?? '').toLowerCase() === 'pending') || r.verification_status === 'pending').length,
    visitedNotOrdered: retailers.filter(r => !!r.last_visit_date && (r.order_count ?? 0) === 0).length,
    ordered: retailers.filter(r => (r.order_count ?? 0) > 0).length,
    visited: retailers.filter(r => !!r.last_visit_date).length,
    avgScore: retailers.length
      ? Math.round(retailers.reduce((s, r) => s + (r.verification_score ?? 0), 0) / retailers.length)
      : 0,
  };
  const activationRate = stats.total ? Math.round((stats.ordered / stats.total) * 100) : 0;
  const verificationRate = stats.total ? Math.round((stats.verified / stats.total) * 100) : 0;
  const conversionRate = stats.visited ? Math.round((stats.ordered / stats.visited) * 100) : 0;

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Verified</Badge>;
      case 'needs_attention':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Needs Attention</Badge>;
      case 'dropped':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Dropped</Badge>;
      default:
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pending</Badge>;
    }
  };

  const openApprovalDialog = (retailer: Retailer) => {
    setSelectedRetailer(retailer);
    setApprovalDialogOpen(true);
  };

  const sendWhatsAppVerification = async (retailer: Retailer) => {
    if (!retailer.phone) {
      toast({ title: "No phone number", description: "Add a phone number first.", variant: "destructive" });
      return;
    }
    setSendingWhatsAppId(retailer.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-retailer-verification-whatsapp', {
        body: { retailer_id: retailer.id },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Send failed');
      toast({ title: "WhatsApp sent", description: `Verification request sent to ${retailer.phone}` });
    } catch (e: any) {
      toast({ title: "Failed to send WhatsApp", description: e.message, variant: "destructive" });
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  const getActionButton = (retailer: Retailer) => {
    const isDropped = retailer.status === 'inactive' || retailer.verification_status === 'dropped';
    const isVerified = retailer.verification_status === 'verified';
    return (
      <div className="flex items-center justify-end gap-1">
        {!isDropped && !isVerified && (
          <Button
            size="icon"
            variant="default"
            className="h-8 w-8"
            title="Approve retailer"
            onClick={() => openApprovalDialog(retailer)}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {isVerified && (
          <span title="Verified" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
            {!isDropped && !isVerified && (
              <DropdownMenuItem onClick={() => openApprovalDialog(retailer)}>
                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Approve
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!retailer.phone || sendingWhatsAppId === retailer.id}
              onClick={() => sendWhatsAppVerification(retailer)}
            >
              <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
              {sendingWhatsAppId === retailer.id ? 'Sending…' : 'WhatsApp verify'}
            </DropdownMenuItem>
            {retailer.phone && (
              <DropdownMenuItem onClick={() => { window.location.href = `tel:${retailer.phone}`; }}>
                <PhoneIcon className="h-4 w-4 mr-2 text-sky-600" /> Call
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate(`/retailer/${retailer.id}`)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit / Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openPhotoDialog(retailer)}>
              <Camera className="h-4 w-4 mr-2" /> Photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };


  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Retail Management</h1>
            <p className="text-muted-foreground">Verify and manage all retailers across the system</p>
          </div>
        </div>

        <Tabs defaultValue="retailers" className="w-full">
          <TabsList>
            <TabsTrigger value="retailers">All Retailers</TabsTrigger>
            <TabsTrigger value="policy">Verification Policy</TabsTrigger>
          </TabsList>

          <TabsContent value="retailers" className="space-y-4 mt-4">
            {/* KPI Dashboard */}
            {(() => {
              const KpiCard = ({
                label, value, icon: Icon, tone, filterKey, hint,
              }: {
                label: string; value: number | string; icon: any;
                tone: 'slate'|'emerald'|'amber'|'rose'|'violet'|'sky'|'indigo'|'orange';
                filterKey: KpiFilter; hint?: string;
              }) => {
                const tones: Record<string, { bg: string; text: string; ring: string; soft: string }> = {
                  slate:   { bg: 'bg-slate-500',   text: 'text-slate-600 dark:text-slate-300',   ring: 'ring-slate-500/30',   soft: 'bg-slate-500/10' },
                  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30', soft: 'bg-emerald-500/10' },
                  amber:   { bg: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-500/30',   soft: 'bg-amber-500/10' },
                  rose:    { bg: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400',     ring: 'ring-rose-500/30',    soft: 'bg-rose-500/10' },
                  violet:  { bg: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/30',  soft: 'bg-violet-500/10' },
                  sky:     { bg: 'bg-sky-500',     text: 'text-sky-600 dark:text-sky-400',       ring: 'ring-sky-500/30',     soft: 'bg-sky-500/10' },
                  indigo:  { bg: 'bg-indigo-500',  text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500/30',  soft: 'bg-indigo-500/10' },
                  orange:  { bg: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/30',  soft: 'bg-orange-500/10' },
                };
                const t = tones[tone];
                const active = kpiFilter === filterKey;
                return (
                  <button
                    onClick={() => setKpiFilter(active ? 'none' : filterKey)}
                    className={`group text-left rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${active ? `ring-2 ${t.ring} border-transparent` : 'hover:border-foreground/20'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`h-8 w-8 rounded-lg ${t.soft} ${t.text} flex items-center justify-center`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {active && <span className={`h-1.5 w-1.5 rounded-full ${t.bg}`} />}
                    </div>
                    <p className="text-[11px] font-medium text-muted-foreground mt-2 uppercase tracking-wide">{label}</p>
                    <p className={`text-2xl font-bold leading-tight ${t.text}`}>{value}</p>
                    {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
                  </button>
                );
              };

              const RateCard = ({
                label, value, icon: Icon, tone, hint,
              }: { label: string; value: number; icon: any; tone: 'emerald'|'sky'|'violet'|'amber'; hint?: string }) => {
                const tones: Record<string, string> = {
                  emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
                  sky:     'from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400',
                  violet:  'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400',
                  amber:   'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400',
                };
                return (
                  <div className={`rounded-xl border bg-gradient-to-br ${tones[tone]} p-3`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
                      <Icon className="h-4 w-4 opacity-80" />
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <p className="text-2xl font-bold leading-none">{value}%</p>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
                      <div className="h-full bg-current rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                    </div>
                    {hint && <p className="text-[10px] text-muted-foreground mt-1.5">{hint}</p>}
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {/* Row 1 - Verification Health */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="Total Retailers" value={stats.total} icon={Users}        tone="slate"   filterKey="total" />
                    <KpiCard label="Verified"        value={stats.verified} icon={ShieldCheck} tone="emerald" filterKey="verified" hint="Score ≥ 70%" />
                    <KpiCard label="Unverified"      value={stats.unverified} icon={ShieldAlert} tone="orange" filterKey="unverified" hint="Score < 40%" />
                    <KpiCard label="Needs Attention" value={stats.needsAttention} icon={AlertTriangle} tone="amber" filterKey="needs_attention" hint="Missing data" />
                    <KpiCard label="Dropped"         value={stats.dropped} icon={Ban}         tone="rose"    filterKey="dropped" hint="Inactive / rejected" />
                  </div>

                  {/* Row 2 - Business Health */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="Orphan Retailers"   value={stats.orphan}            icon={UserX}      tone="rose"   filterKey="orphan"            hint="No orders ever" />
                    <KpiCard label="Dormant"            value={stats.dormant}           icon={Clock}      tone="amber"  filterKey="dormant"           hint="No order 60d+" />
                    <KpiCard label="New This Month"     value={stats.newThisMonth}      icon={Sparkles}   tone="violet" filterKey="new_month"         hint="Added MTD" />
                    <KpiCard label="Duplicate Suspects" value={stats.duplicate}         icon={CopyIcon}   tone="rose"   filterKey="duplicate"         hint="Risk ≥ 70" />
                    <KpiCard label="Awaiting Approval"  value={stats.awaitingApproval}  icon={Hourglass}  tone="indigo" filterKey="awaiting_approval" hint="Pending review" />
                  </div>

                  {/* Row 3 - Rates */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <RateCard label="Activation Rate"   value={activationRate}   icon={TrendingUp} tone="emerald" hint={`${stats.ordered} of ${stats.total} ordered`} />
                    <RateCard label="Verification Rate" value={verificationRate} icon={ShieldCheck} tone="sky"    hint={`${stats.verified} of ${stats.total} verified`} />
                    <RateCard label="Avg Quality Score" value={stats.avgScore}   icon={Gauge}      tone="violet"  hint="Across all retailers" />
                    <RateCard label="Visit→Order Conv." value={conversionRate}   icon={Activity}   tone="amber"   hint={`${stats.ordered} of ${stats.visited} visited`} />
                  </div>

                  {kpiFilter !== 'none' && (
                    <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        Filtered by <span className="font-semibold text-foreground capitalize">{kpiFilter.replace(/_/g, ' ')}</span> — {filteredRetailers.length} retailer{filteredRetailers.length === 1 ? '' : 's'}
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setKpiFilter('none')}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}

        <Card>
          <CardHeader>
            <CardTitle>All Retailers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input 
                  placeholder="Search..." 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  className="pl-9" 
                />
              </div>
              
              <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Territory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  {territories.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={salesMemberFilter} onValueChange={setSalesMemberFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Sales Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sales Team</SelectItem>
                  {salesTeam.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={verifiedFilter} onValueChange={(v) => setVerifiedFilter(v as VerificationStatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Verification Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="needs_attention">Needs Attention</SelectItem>
                  <SelectItem value="dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={lastVisitedFilter} onValueChange={(v) => setLastVisitedFilter(v as LastVisitedFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Last Visited" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="3_months">Last 3 Months</SelectItem>
                  <SelectItem value="6_months">Last 6 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table actions: column visibility + export */}
            <div className="flex items-center justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 className="h-4 w-4 mr-2" /> Columns ({visibleColumns.size}/{RETAILER_COLUMNS.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                  avoidCollisions={false}
                  className="w-56 bg-popover z-50 max-h-[60vh] overflow-y-auto"
                >
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {RETAILER_COLUMNS.map(col => {
                    const checked = visibleColumns.has(col.key);
                    const locked = !!col.alwaysVisible;
                    return (
                      <DropdownMenuItem
                        key={col.key}
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => { if (!locked) toggleColumn(col.key); }}
                        className={`flex items-center gap-2 ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span
                          className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${checked ? 'border-primary' : 'border-muted-foreground/40'}`}
                        >
                          {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </span>
                        <span className="flex-1">{col.label}{locked ? ' (locked)' : ''}</span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={showAllColumns}>Show all</DropdownMenuItem>
                  <DropdownMenuItem onClick={resetColumns}>Reset to default</DropdownMenuItem>
                </DropdownMenuContent>

              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isCol('photo') && <TableHead className="w-[72px]">Photo</TableHead>}
                      {isCol('name') && <TableHead className="min-w-[220px] whitespace-nowrap">Retailer Name</TableHead>}
                      {isCol('contact_person') && <TableHead className="min-w-[140px] whitespace-nowrap">Contact Person</TableHead>}
                      {isCol('phone') && <TableHead className="min-w-[130px] whitespace-nowrap">Phone</TableHead>}
                      {isCol('address') && <TableHead className="min-w-[240px]">Address</TableHead>}
                      {isCol('territory') && <TableHead className="min-w-[120px] whitespace-nowrap">Territory</TableHead>}
                      {isCol('status') && <TableHead className="min-w-[100px] whitespace-nowrap">Status</TableHead>}
                      {isCol('quality') && <TableHead className="min-w-[160px] whitespace-nowrap">Quality Score</TableHead>}
                      {isCol('last_visited') && <TableHead className="min-w-[140px] whitespace-nowrap">Last Visited</TableHead>}
                      {isCol('added_by') && <TableHead className="min-w-[160px] whitespace-nowrap">Added By</TableHead>}
                      {isCol('verification') && <TableHead className="min-w-[140px] whitespace-nowrap">Verification</TableHead>}
                      {isCol('verified_by') && <TableHead className="min-w-[180px] whitespace-nowrap">Verified By</TableHead>}
                      {isCol('actions') && <TableHead className="w-[96px] text-right whitespace-nowrap">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRetailers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.size} className="text-center text-muted-foreground py-8">
                          No retailers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRetailers.map((retailer) => (
                        <TableRow key={retailer.id}>
                          {isCol('photo') && (
                            <TableCell>
                              <Avatar
                                className="w-10 h-10 cursor-pointer"
                                onClick={() => openPhotoDialog(retailer)}
                              >
                                <AvatarImage src={retailer.photo_url || undefined} />
                                <AvatarFallback>
                                  <ImageIcon className="w-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                            </TableCell>
                          )}
                          {isCol('name') && (
                            <TableCell className="font-medium">
                              <button
                                onClick={() => navigate(`/retailer/${retailer.id}`)}
                                className="flex items-center gap-2 hover:text-primary hover:underline text-left"
                              >
                                <span className="truncate max-w-[220px]">{retailer.name}</span>
                                <VerifiedTick
                                  verified={retailer.verification_status === 'verified'}
                                  method={retailer.verification_method}
                                  verifiedBy={retailer.verified_by_name}
                                  verifiedAt={retailer.verified_at}
                                  score={retailer.verification_score ?? 0}
                                />
                              </button>
                            </TableCell>
                          )}
                          {isCol('contact_person') && <TableCell className="whitespace-nowrap">{retailer.contact_person || '-'}</TableCell>}
                          {isCol('phone') && <TableCell className="whitespace-nowrap">{retailer.phone || 'N/A'}</TableCell>}
                          {isCol('address') && (
                            <TableCell>
                              <div className="max-w-[260px]">
                                <button
                                  onClick={() => openGoogleMaps(retailer.address)}
                                  className="flex items-center gap-1 hover:text-primary hover:underline text-left text-sm group w-full min-w-0"
                                  title={retailer.address || 'Open in Google Maps'}
                                >
                                  <span className="truncate block min-w-0 flex-1">{retailer.address}</span>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              </div>
                            </TableCell>
                          )}
                          {isCol('territory') && (
                            <TableCell className="whitespace-nowrap">
                              {retailer.territory_name ? (
                                <Badge variant="outline">{retailer.territory_name}</Badge>
                              ) : '-'}
                            </TableCell>
                          )}
                          {isCol('status') && (
                            <TableCell className="whitespace-nowrap">
                              <Badge variant={retailer.status === 'active' ? 'default' : 'secondary'}>
                                {retailer.status === 'active' ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                          )}
                          {isCol('quality') && (
                            <TableCell className="whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <QualityBadge status={retailer.quality_status} score={retailer.verification_score ?? 0} />
                                <ScoreBar score={retailer.verification_score ?? 0} />
                                <DuplicateRiskBadge risk={retailer.duplicate_risk_score ?? 0} />
                              </div>
                            </TableCell>
                          )}
                          {isCol('last_visited') && (
                            <TableCell className="whitespace-nowrap">
                              {retailer.last_visit_date
                                ? format(new Date(retailer.last_visit_date), 'dd MMM yyyy')
                                : '-'
                              }
                            </TableCell>
                          )}
                          {isCol('added_by') && <TableCell className="whitespace-nowrap">{retailer.profiles?.full_name || 'Unknown'}</TableCell>}
                          {isCol('verification') && <TableCell className="whitespace-nowrap">{getStatusBadge(retailer.verification_status)}</TableCell>}
                          {isCol('verified_by') && (
                            <TableCell>
                              {retailer.verification_status === 'verified' ? (
                                retailer.verification_method === 'whatsapp' ? (
                                  <div className="flex flex-col text-xs">
                                    <span className="inline-flex items-center gap-1 font-medium text-green-700">
                                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                                    </span>
                                    <span className="text-muted-foreground">via retailer reply{retailer.phone ? ` (${retailer.phone})` : ''}</span>
                                    {retailer.verified_at && (
                                      <span className="text-muted-foreground">{format(new Date(retailer.verified_at), 'dd MMM yyyy')}</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col text-xs">
                                    <span className="font-medium truncate max-w-[180px]">{retailer.verified_by_name || 'Admin'}</span>
                                    <span className="text-muted-foreground capitalize">{retailer.verification_method || 'manual'}</span>
                                    {retailer.verified_at && (
                                      <span className="text-muted-foreground">{format(new Date(retailer.verified_at), 'dd MMM yyyy')}</span>
                                    )}
                                  </div>
                                )
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {isCol('actions') && (
                            <TableCell className="text-right">
                              {getActionButton(retailer)}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  totalItems={totalItems}
                  hasNextPage={hasNextPage}
                  hasPrevPage={hasPrevPage}
                  onNextPage={nextPage}
                  onPrevPage={prevPage}
                  onGoToPage={goToPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="policy" className="mt-4">
            <VerificationPolicyCard />
          </TabsContent>
        </Tabs>
      </div>

      {/* Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Retailer</DialogTitle>
            <DialogDescription>
              {selectedRetailer?.name} - Please verify the following details
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <Checkbox 
                id="verify-address" 
                checked={verifyAddress}
                onCheckedChange={(checked) => setVerifyAddress(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="verify-address" className="flex items-center gap-2 cursor-pointer">
                  <MapPin className="h-4 w-4 text-primary" />
                  Address & Geo Stamp
                </Label>
                <p className="text-sm text-muted-foreground">
                  Verify the retailer's physical address and location coordinates
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <Checkbox 
                id="verify-contact" 
                checked={verifyContact}
                onCheckedChange={(checked) => setVerifyContact(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="verify-contact" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4 text-primary" />
                  Retailer Name & Owner Contact
                </Label>
                <p className="text-sm text-muted-foreground">
                  Verify the retailer name and owner contact information
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <Checkbox 
                id="verify-territory" 
                checked={verifyTerritory}
                onCheckedChange={(checked) => setVerifyTerritory(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="verify-territory" className="flex items-center gap-2 cursor-pointer">
                  <MapPinned className="h-4 w-4 text-primary" />
                  Territory Assignment
                </Label>
                <p className="text-sm text-muted-foreground">
                  Verify the retailer is assigned to the correct territory
                </p>
              </div>
            </div>
            
            {(verifyAddress || verifyContact || verifyTerritory) && 
             !(verifyAddress && verifyContact && verifyTerritory) && (
              <>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Partial verification will mark as "Needs Attention"</span>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="verification-note">Note for Sales Team Member</Label>
                  <Textarea
                    id="verification-note"
                    placeholder="Add a note explaining what needs attention..."
                    value={verificationNote}
                    onChange={(e) => setVerificationNote(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    This note will be sent to the retailer owner in the Collaboration Center
                  </p>
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVerification}>
              {verifyAddress && verifyContact && verifyTerritory ? 'Verify' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retailer Photo</DialogTitle>
            <DialogDescription>
              {selectedRetailer?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedRetailer?.photo_url ? (
              <div className="space-y-4">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden border">
                  <img 
                    src={selectedRetailer.photo_url} 
                    alt={selectedRetailer.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button 
                  onClick={() => setCameraOpen(true)}
                  className="w-full"
                  disabled={uploadingPhoto}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {uploadingPhoto ? 'Uploading...' : 'Update Photo'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-full aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                    <p>No photo available</p>
                  </div>
                </div>
                <Button 
                  onClick={() => setCameraOpen(true)}
                  className="w-full"
                  disabled={uploadingPhoto}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {uploadingPhoto ? 'Uploading...' : 'Capture Photo'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Capture */}
      <CameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCapture}
        title="Capture Retailer Photo"
        description="Take a clear photo of the retailer's store front"
      />

      {/* New approval checklist dialog */}
      <ApprovalChecklistDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        retailer={selectedRetailer}
        onCompleted={loadData}
      />

      <RetailerExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        retailers={filteredRetailers as any}
        filteredCount={filteredRetailers.length}
      />
    </Layout>
  );
}
