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
import { Search, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, Camera, Image as ImageIcon, MapPin, User, MapPinned, ExternalLink, MessageCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { CameraCapture } from "@/components/CameraCapture";
import { format, subMonths, isAfter, isBefore, startOfMonth } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { ApprovalChecklistDialog } from "@/components/retailer/ApprovalChecklistDialog";
import { VerifiedTick } from "@/components/retailer/VerifiedTick";

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
}

type VerificationStatusFilter = 'all' | 'verified' | 'pending' | 'needs_attention' | 'dropped';
type LastVisitedFilter = 'all' | 'this_month' | 'last_month' | '3_months' | '6_months';

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
  
  // Dialogs
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  
  // Verification checkboxes
  const [verifyAddress, setVerifyAddress] = useState(false);
  const [verifyContact, setVerifyContact] = useState(false);
  const [verifyTerritory, setVerifyTerritory] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");

  useEffect(() => {
    document.title = "Retail Management | Admin Panel";
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Fetch all data in parallel
    const [retailersRes, territoriesRes, profilesRes] = await Promise.all([
      supabase.from("retailers").select("*").order("created_at", { ascending: false }),
      supabase.from("territories").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, username")
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
        // At least one but not all verified
        verificationStatus = 'needs_attention';
      }
      
      return {
        ...r,
        beat_name: displayBeatName,
        territory_name: territoryName,
        verification_status: verificationStatus,
        profiles: r.user_id ? { full_name: displayName } : null
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
    
    return matchesSearch && matchesTerritory && matchesCategory && 
           matchesSalesMember && matchesVerified && matchesLastVisited;
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

  const stats = {
    total: retailers.length,
    verified: retailers.filter(r => r.verification_status === 'verified').length,
    needsAttention: retailers.filter(r => r.verification_status === 'needs_attention').length,
    dropped: retailers.filter(r => r.verification_status === 'dropped').length,
  };

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

  const getActionButton = (retailer: Retailer) => {
    // If inactive or dropped, no action needed
    if (retailer.status === 'inactive' || retailer.verification_status === 'dropped') {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          No Action
        </Badge>
      );
    }
    
    if (retailer.verification_status === 'verified') {
      return (
        <Button variant="outline" size="sm" onClick={() => openVerifyDialog(retailer)}>
          <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
          Verified
        </Button>
      );
    }
    
    return (
      <Button size="sm" onClick={() => openVerifyDialog(retailer)}>
        <CheckCircle2 className="h-4 w-4 mr-1" />
        Verify
      </Button>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => navigate('/admin-controls')} 
            variant="ghost" 
            size="sm"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Retail Management</h1>
            <p className="text-muted-foreground">Verify and manage all retailers across the system</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Retailers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Verified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-600">Needs Attention</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.needsAttention}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Dropped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.dropped}</div>
            </CardContent>
          </Card>
        </div>

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

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Photo</TableHead>
                      <TableHead>Retailer Name</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Territory</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Visited</TableHead>
                      <TableHead>Added By</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRetailers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          No retailers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRetailers.map((retailer) => (
                        <TableRow key={retailer.id}>
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
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/retailer/${retailer.id}`)}
                              className="flex items-center gap-2 hover:text-primary hover:underline text-left"
                            >
                              {retailer.name}
                              {retailer.verification_status === 'verified' && (
                                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell>{retailer.contact_person || '-'}</TableCell>
                          <TableCell>{retailer.phone || 'N/A'}</TableCell>
                          <TableCell>
                            <div className="max-w-[220px]">
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
                          <TableCell>
                            {retailer.territory_name ? (
                              <Badge variant="outline">{retailer.territory_name}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={retailer.status === 'active' ? 'default' : 'secondary'}>
                              {retailer.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {retailer.last_visit_date 
                              ? format(new Date(retailer.last_visit_date), 'dd MMM yyyy')
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{retailer.profiles?.full_name || 'Unknown'}</TableCell>
                          <TableCell>{getStatusBadge(retailer.verification_status)}</TableCell>
                          <TableCell className="text-right">
                            {getActionButton(retailer)}
                          </TableCell>
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
    </Layout>
  );
}
