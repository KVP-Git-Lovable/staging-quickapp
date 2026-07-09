import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare, Trophy, Image, Users, Calendar, Filter, RefreshCw, Eye, Settings, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RetailerFeedbackDetailModal } from "@/components/admin/RetailerFeedbackDetailModal";
import { CompetitionDetailModal } from "@/components/admin/CompetitionDetailModal";
import { BrandingRequestDetailModal } from "@/components/admin/BrandingRequestDetailModal";
import { JointSalesDetailModal } from "@/components/admin/JointSalesDetailModal";
import FeedbackQuestionConfig from "@/components/admin/FeedbackQuestionConfig";
import FeedbackPolicyConfig from "@/components/admin/FeedbackPolicyConfig";

type DetailModalType = 'retailer' | 'branding' | 'competition' | 'jointsales' | null;

export default function FeedbackManagement() {
  const navigate = useNavigate();
  const { hasAdminAccess } = useAdminAccess();
  const [topTab, setTopTab] = useState("overview");
  
  const [retailerFeedback, setRetailerFeedback] = useState<any[]>([]);
  const [competitionData, setCompetitionData] = useState<any[]>([]);
  const [brandingRequests, setBrandingRequests] = useState<any[]>([]);
  const [jointSalesFeedback, setJointSalesFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date filter state
  const [dateRange, setDateRange] = useState<string>("30days");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  // Detail modal state
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [detailModalType, setDetailModalType] = useState<DetailModalType>(null);

  const handleOpenDetail = (type: DetailModalType, data: any) => {
    setDetailModalType(type);
    setSelectedDetail(data);
  };

  const handleCloseDetail = () => {
    setDetailModalType(null);
    setSelectedDetail(null);
  };

  useEffect(() => {
    if (!hasAdminAccess) {
      navigate('/');
      return;
    }
    fetchAllFeedback();
  }, [hasAdminAccess, navigate]);

  useEffect(() => {
    if (hasAdminAccess) {
      fetchAllFeedback();
    }
  }, [startDate, endDate, hasAdminAccess]);

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    const now = new Date();
    switch (value) {
      case "30days":
        setStartDate(subDays(now, 30));
        setEndDate(now);
        break;
      case "90days":
        setStartDate(subDays(now, 90));
        setEndDate(now);
        break;
      case "all":
        setStartDate(undefined);
        setEndDate(undefined);
        break;
      case "custom":
        // Keep current dates for custom selection
        break;
    }
  };

  const fetchAllFeedback = async () => {
    try {
      setLoading(true);

      const dateFilter = startDate && endDate 
        ? { 
            gte: startOfDay(startDate).toISOString(),
            lte: endOfDay(endDate).toISOString()
          }
        : null;

      // Fetch all data in parallel
      const [feedbackResult, competitionResult, brandingResult, jointSalesResult] = await Promise.all([
        fetchRetailerFeedback(dateFilter),
        fetchCompetitionData(dateFilter),
        fetchBrandingRequests(dateFilter),
        fetchJointSalesFeedback(dateFilter)
      ]);

      setRetailerFeedback(feedbackResult);
      setCompetitionData(competitionResult);
      setBrandingRequests(brandingResult);
      setJointSalesFeedback(jointSalesResult);

    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: "Error",
        description: "Failed to load feedback data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRetailerFeedback = async (dateFilter: { gte: string; lte: string } | null): Promise<any[]> => {
    let query = supabase
      .from('retailer_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter) {
      query = query.gte('created_at', dateFilter.gte).lte('created_at', dateFilter.lte);
    }

    const { data: feedbackData, error } = await query;
    if (error) throw error;
    if (!feedbackData || feedbackData.length === 0) return [];

    const retailerIds = [...new Set(feedbackData.map(f => f.retailer_id).filter(Boolean))];
    const userIds = [...new Set(feedbackData.map(f => f.user_id).filter(Boolean))];

    const [retailersResult, profilesResult] = await Promise.all([
      retailerIds.length > 0 ? supabase.from('retailers').select('id, name, address').in('id', retailerIds) : Promise.resolve({ data: [] }),
      userIds.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] })
    ]);

    const retailerMap = new Map((retailersResult.data || []).map((r: any) => [r.id, r]));
    const profileMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p.full_name]));

    return feedbackData.map(f => ({
      ...f,
      retailer_name: (retailerMap.get(f.retailer_id) as any)?.name || 'Unknown',
      retailer_address: (retailerMap.get(f.retailer_id) as any)?.address || null,
      submitted_by: profileMap.get(f.user_id) || 'Unknown'
    }));
  };

  const fetchCompetitionData = async (dateFilter: { gte: string; lte: string } | null): Promise<any[]> => {
    let query = supabase
      .from('competition_data')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter) {
      query = query.gte('created_at', dateFilter.gte).lte('created_at', dateFilter.lte);
    }

    const { data: compData, error } = await query;
    if (error) throw error;

    if (!compData || compData.length === 0) return [];

    // Get unique IDs
    const retailerIds = [...new Set(compData.map(c => c.retailer_id).filter(Boolean))];
    const userIds = [...new Set(compData.map(c => c.user_id).filter(Boolean))];
    const competitorIds = [...new Set(compData.map(c => c.competitor_id).filter(Boolean))];
    const skuIds = [...new Set(compData.map(c => c.sku_id).filter(Boolean))] as string[];

    // Fetch related data in parallel
    const [retailersResult, profilesResult, competitorsResult, skusResult] = await Promise.all([
      retailerIds.length > 0 
        ? supabase.from('retailers').select('id, name').in('id', retailerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      userIds.length > 0 
        ? supabase.from('profiles').select('id, full_name').in('id', userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      competitorIds.length > 0 
        ? supabase.from('competition_master').select('id, competitor_name').in('id', competitorIds)
        : Promise.resolve({ data: [] as { id: string; competitor_name: string }[] }),
      skuIds.length > 0 
        ? supabase.from('competition_skus').select('id, sku_name').in('id', skuIds)
        : Promise.resolve({ data: [] as { id: string; sku_name: string }[] })
    ]);

    const retailerMap = new Map<string, string>(
      (retailersResult.data || []).map(r => [r.id, r.name])
    );
    const profileMap = new Map<string, string>(
      (profilesResult.data || []).map(p => [p.id, p.full_name])
    );
    const competitorMap = new Map<string, string>(
      (competitorsResult.data || []).map(c => [c.id, c.competitor_name])
    );
    const skuMap = new Map<string, string>(
      (skusResult.data || []).map(s => [s.id, s.sku_name])
    );

    return compData.map(c => ({
      ...c,
      competitor_name: competitorMap.get(c.competitor_id) || 'Unknown',
      sku_name: c.sku_id ? (skuMap.get(c.sku_id) || 'N/A') : 'N/A',
      retailer_name: retailerMap.get(c.retailer_id) || 'Unknown',
      submitted_by: profileMap.get(c.user_id) || 'Unknown'
    }));
  };

  const fetchBrandingRequests = async (dateFilter: { gte: string; lte: string } | null): Promise<any[]> => {
    let query = supabase
      .from('branding_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter) {
      query = query.gte('created_at', dateFilter.gte).lte('created_at', dateFilter.lte);
    }

    const { data: brandingData, error } = await query;
    if (error) throw error;
    if (!brandingData || brandingData.length === 0) return [];

    const retailerIds = [...new Set(brandingData.map(b => b.retailer_id).filter(Boolean))];
    const userIds = [...new Set(brandingData.map(b => b.user_id).filter(Boolean))];

    const [retailersResult, profilesResult] = await Promise.all([
      retailerIds.length > 0 ? supabase.from('retailers').select('id, name, address').in('id', retailerIds) : Promise.resolve({ data: [] }),
      userIds.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] })
    ]);

    const retailerMap = new Map((retailersResult.data || []).map((r: any) => [r.id, r]));
    const profileMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p.full_name]));

    return brandingData.map(b => ({
      ...b,
      retailer_name: (retailerMap.get(b.retailer_id) as any)?.name || 'Unknown',
      retailer_address: (retailerMap.get(b.retailer_id) as any)?.address || null,
      submitted_by: profileMap.get(b.user_id) || 'Unknown'
    }));
  };

  const fetchJointSalesFeedback = async (dateFilter: { gte: string; lte: string } | null): Promise<any[]> => {
    let query = supabase
      .from('joint_sales_feedback')
      .select('*')
      .order('feedback_date', { ascending: false });

    if (dateFilter) {
      query = query.gte('feedback_date', dateFilter.gte.split('T')[0]).lte('feedback_date', dateFilter.lte.split('T')[0]);
    }

    const { data: jsData, error } = await query;
    if (error) throw error;

    if (!jsData || jsData.length === 0) return [];

    // Get unique IDs
    const retailerIds = [...new Set(jsData.map(j => j.retailer_id).filter(Boolean))];
    const fseIds = [...new Set(jsData.map(j => j.fse_user_id).filter(Boolean))];
    const managerIds = [...new Set(jsData.map(j => j.manager_id).filter(Boolean))];
    const allUserIds = [...new Set([...fseIds, ...managerIds])];

    // Fetch related data in parallel
    const [retailersResult, profilesResult] = await Promise.all([
      retailerIds.length > 0 
        ? supabase.from('retailers').select('id, name').in('id', retailerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      allUserIds.length > 0 
        ? supabase.from('profiles').select('id, full_name').in('id', allUserIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] })
    ]);

    const retailerMap = new Map<string, string>(
      (retailersResult.data || []).map(r => [r.id, r.name])
    );
    const profileMap = new Map<string, string>(
      (profilesResult.data || []).map(p => [p.id, p.full_name])
    );

    return jsData.map(j => ({
      ...j,
      retailer_name: retailerMap.get(j.retailer_id) || 'Unknown',
      fse_name: profileMap.get(j.fse_user_id) || 'Unknown',
      manager_name: profileMap.get(j.manager_id) || 'Unknown',
    }));
  };

  const getImpactBadge = (level: string | null) => {
    if (!level) return "bg-muted text-muted-foreground";
    const colors: Record<string, string> = {
      high: "bg-destructive text-destructive-foreground",
      medium: "bg-warning text-warning-foreground",
      low: "bg-muted text-muted-foreground"
    };
    return colors[level.toLowerCase()] || colors.low;
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      submitted: "bg-blue-500 text-white",
      approved: "bg-green-500 text-white",
      rejected: "bg-red-500 text-white",
      in_progress: "bg-yellow-500 text-white",
      completed: "bg-green-600 text-white"
    };
    return colors[status] || "bg-gray-500 text-white";
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 4) return "text-green-600";
    if (score >= 3) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold">Feedback Management</h1>
              <p className="text-muted-foreground">View and manage all feedback from field teams</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={fetchAllFeedback}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Top-level Tabs: Overview | Configuration */}
        <Tabs value={topTab} onValueChange={setTopTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="configuration" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Feedback Configuration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
        {/* Date Filter */}
        <Card className="p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter by Date:</span>
            </div>
            
            <Select value={dateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {dateRange === "custom" && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Calendar className="h-4 w-4 mr-2" />
                      {startDate ? format(startDate, "MMM dd, yyyy") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Calendar className="h-4 w-4 mr-2" />
                      {endDate ? format(endDate, "MMM dd, yyyy") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </Card>
        {/* Tabs */}
        <Tabs defaultValue="retailer" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="retailer" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Retailer</span>
              <Badge variant="secondary" className="ml-1">{retailerFeedback.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="competition" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Competition</span>
              <Badge variant="secondary" className="ml-1">{competitionData.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
              <Badge variant="secondary" className="ml-1">{brandingRequests.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="jointsales" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Joint Sales</span>
              <Badge variant="secondary" className="ml-1">{jointSalesFeedback.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Retailer Feedback Tab */}
          <TabsContent value="retailer">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Retailer Feedback</h2>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : retailerFeedback.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No feedback records found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Comments</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retailerFeedback.map((feedback) => (
                        <TableRow 
                          key={feedback.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOpenDetail('retailer', feedback)}
                        >
                          <TableCell className="font-medium">
                            {feedback.retailer_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{feedback.submitted_by}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{feedback.feedback_type || 'N/A'}</Badge>
                          </TableCell>
                          <TableCell>
                            {feedback.rating ? (
                              <span className={getScoreColor(feedback.rating)}>
                                {feedback.rating}/5
                              </span>
                            ) : 'N/A'}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {feedback.comments || 'No comments'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(feedback.created_at), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Competition Data Tab */}
          <TabsContent value="competition">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Competition Data</h2>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : competitionData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No competition data found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Competitor</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Impact</TableHead>
                        <TableHead>Insight</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitionData.map((data) => (
                        <TableRow 
                          key={data.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOpenDetail('competition', data)}
                        >
                          <TableCell className="font-medium">
                            {data.retailer_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{data.submitted_by}</Badge>
                          </TableCell>
                          <TableCell>{data.competitor_name}</TableCell>
                          <TableCell>{data.sku_name}</TableCell>
                          <TableCell>
                            {data.selling_price ? `₹${data.selling_price}` : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {data.stock_quantity ?? 'N/A'}
                          </TableCell>
                          <TableCell>
                            {data.impact_level && (
                              <Badge className={getImpactBadge(data.impact_level)}>
                                {data.impact_level}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {data.insight || 'N/A'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(data.created_at), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Branding Requests Tab */}
          <TabsContent value="branding">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Branding Requests</h2>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : brandingRequests.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No branding requests found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Assets</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brandingRequests.map((request) => (
                        <TableRow 
                          key={request.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOpenDetail('branding', request)}
                        >
                          <TableCell className="font-medium">
                            {request.retailer_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.submitted_by}</Badge>
                          </TableCell>
                          <TableCell>{request.title || 'Untitled'}</TableCell>
                          <TableCell>{request.requested_assets || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadge(request.status)}>
                              {request.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.description || 'No description'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(request.created_at), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Joint Sales Feedback Tab */}
          <TabsContent value="jointsales">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Joint Sales Feedback</h2>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : jointSalesFeedback.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No joint sales feedback found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead>FSE Name</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Branding</TableHead>
                        <TableHead>Competition</TableHead>
                        <TableHead>Schemes</TableHead>
                        <TableHead>Growth</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jointSalesFeedback.map((feedback) => (
                        <TableRow 
                          key={feedback.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOpenDetail('jointsales', feedback)}
                        >
                          <TableCell className="font-medium">
                            {feedback.retailer_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{feedback.fse_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{feedback.manager_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={getScoreColor(feedback.product_feedback_rating)}>
                              {feedback.product_feedback_rating ?? 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={getScoreColor(feedback.branding_rating)}>
                              {feedback.branding_rating ?? 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={getScoreColor(feedback.competition_rating)}>
                              {feedback.competition_rating ?? 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={getScoreColor(feedback.schemes_rating)}>
                              {feedback.schemes_rating ?? 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={getScoreColor(feedback.future_growth_rating)}>
                              {feedback.future_growth_rating ?? 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(feedback.feedback_date), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="configuration">
            <div className="space-y-8">
              <FeedbackQuestionConfig />
              <FeedbackPolicyConfig />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Modals */}
      <RetailerFeedbackDetailModal
        open={detailModalType === 'retailer'}
        onClose={handleCloseDetail}
        data={detailModalType === 'retailer' ? selectedDetail : null}
      />
      <CompetitionDetailModal
        open={detailModalType === 'competition'}
        onClose={handleCloseDetail}
        data={detailModalType === 'competition' ? selectedDetail : null}
      />
      <BrandingRequestDetailModal
        open={detailModalType === 'branding'}
        onClose={handleCloseDetail}
        data={detailModalType === 'branding' ? selectedDetail : null}
        onUpdate={fetchAllFeedback}
      />
      <JointSalesDetailModal
        open={detailModalType === 'jointsales'}
        onClose={handleCloseDetail}
        data={detailModalType === 'jointsales' ? selectedDetail : null}
      />
    </div>
  );
}
