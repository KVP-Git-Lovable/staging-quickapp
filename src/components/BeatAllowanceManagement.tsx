import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, CalendarIcon, ExternalLink, Download, Car, Utensils, Receipt, BarChart3, Send, ChevronDown, ChevronUp, Pencil, Trash2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subWeeks, subMonths, subQuarters, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import AdditionalExpenses from '@/components/AdditionalExpenses';
import ProductivityTracking from '@/components/ProductivityTracking';
// xlsx loaded dynamically in handler
import { CompactMultiUserSelector } from '@/components/CompactMultiUserSelector';
import { useSubordinates } from '@/hooks/useSubordinates';
import { useAuth } from '@/hooks/useAuth';

interface ExpenseRow {
  id: string;
  date: string;
  beat_name: string;
  beat_id: string;
  ta: number;
  da: number;
  additional_expenses: number;
  order_value: number;
  productive_visits: number;
  isOnLeave: boolean;
}

interface DARecord {
  date: string;
  da_amount: number;
  day_start_time: string;
  day_end_time: string;
  market_hours: string;
  isOnLeave: boolean;
}

interface AdditionalExpenseData {
  id: string;
  date: string;
  expense_type: string;
  details: string;
  value: number;
  bill_attached: boolean;
  bill_url: string | null;
  status: string;
}

type FilterType = 'today' | 'yesterday' | 'current_week' | 'last_week' | 'current_month' | 'last_month' | 'current_quarter' | 'previous_quarter' | 'custom';

// ─── TA Table ────────────────────────────────────────────────────────────────

const TACardList: React.FC<{ rows: ExpenseRow[]; totalTA: number; navigate: any }> = ({ rows, totalTA, navigate }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const [showMore, setShowMore] = useState(false);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No TA records found</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end sm:hidden">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowMore(v => !v)}>
          {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showMore ? 'Less' : 'More'}
        </Button>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table className="table-fixed sm:table-auto w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] px-2 w-[60px] sm:w-auto">Date</TableHead>
              <TableHead className="text-[11px] px-2">Beat</TableHead>
              <TableHead className="text-right text-[11px] px-2 w-[62px] sm:w-auto">TA Amt</TableHead>
              <TableHead className="text-center text-[11px] px-1 w-[38px] sm:w-auto"></TableHead>
              <TableHead className={`text-right text-[11px] px-2 w-[40px] sm:w-auto ${showMore ? '' : 'hidden sm:table-cell'}`}>Visits</TableHead>
              <TableHead className={`text-right text-[11px] px-2 w-[68px] sm:w-auto ${showMore ? '' : 'hidden sm:table-cell'}`}>Orders</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.isOnLeave ? 'bg-muted/50' : ''}>
                <TableCell className="text-[11px] py-1.5 px-2 whitespace-nowrap">
                  {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {row.isOnLeave && <span className="ml-0.5 text-[9px] text-orange-500">L</span>}
                </TableCell>
                <TableCell className="text-[11px] py-1.5 px-2 truncate">{row.beat_name}</TableCell>
                <TableCell className="text-right text-[11px] py-1.5 px-2 font-medium">{fmtMoney(row.ta)}</TableCell>
                <TableCell className="text-center py-1.5 px-1">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => navigate(`/today-summary?date=${row.date}`)}>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </TableCell>
                <TableCell className={`text-right text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{row.productive_visits}</TableCell>
                <TableCell className={`text-right text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{fmtMoney(row.order_value)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 bg-muted/30">
              <TableCell className="font-bold text-[11px] py-1.5 px-2">Total</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-bold text-[11px] py-1.5 px-2">{fmtMoney(totalTA)}</TableCell>
              <TableCell></TableCell>
              <TableCell className={`text-right font-bold text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{rows.reduce((s, r) => s + r.productive_visits, 0)}</TableCell>
              <TableCell className={`text-right font-bold text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{fmtMoney(rows.reduce((s, r) => s + r.order_value, 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ─── DA Table ────────────────────────────────────────────────────────────────

const DACardList: React.FC<{ records: DARecord[]; totalDA: number }> = ({ records, totalDA }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const [showMore, setShowMore] = useState(false);

  if (records.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No DA records found</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end sm:hidden">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowMore(v => !v)}>
          {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showMore ? 'Less' : 'More'}
        </Button>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table className="table-fixed sm:table-auto w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] px-2 w-[60px] sm:w-auto">Date</TableHead>
              <TableHead className="text-right text-[11px] px-2 w-[62px] sm:w-auto">DA Amt</TableHead>
              <TableHead className="text-[11px] px-2">Mkt Hours</TableHead>
              <TableHead className={`text-[11px] px-2 w-[55px] sm:w-auto ${showMore ? '' : 'hidden sm:table-cell'}`}>Start</TableHead>
              <TableHead className={`text-[11px] px-2 w-[55px] sm:w-auto ${showMore ? '' : 'hidden sm:table-cell'}`}>End</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, idx) => (
              <TableRow key={idx} className={record.isOnLeave ? 'bg-muted/50' : ''}>
                <TableCell className="text-[11px] py-1.5 px-2 whitespace-nowrap">
                  {new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {record.isOnLeave && <span className="ml-0.5 text-[9px] text-orange-500">L</span>}
                </TableCell>
                <TableCell className="text-right text-[11px] py-1.5 px-2 font-medium">{fmtMoney(record.da_amount)}</TableCell>
                <TableCell className="text-[11px] py-1.5 px-2">{record.market_hours}</TableCell>
                <TableCell className={`text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{record.day_start_time}</TableCell>
                <TableCell className={`text-[11px] py-1.5 px-2 ${showMore ? '' : 'hidden sm:table-cell'}`}>{record.day_end_time}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 bg-muted/30">
              <TableCell className="font-bold text-[11px] py-1.5 px-2">Total</TableCell>
              <TableCell className="text-right font-bold text-[11px] py-1.5 px-2">{fmtMoney(totalDA)}</TableCell>
              <TableCell></TableCell>
              <TableCell className={`${showMore ? '' : 'hidden sm:table-cell'}`}></TableCell>
              <TableCell className={`${showMore ? '' : 'hidden sm:table-cell'}`}></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ─── Bill Link (tiny clickable link to view bill) ────────────────────────────

const BillLink: React.FC<{ billUrl: string }> = ({ billUrl }) => {
  const handleView = async () => {
    const { data } = await supabase.storage.from('expense-bills').createSignedUrl(billUrl, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };
  return (
    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-primary" onClick={handleView}>
      <ExternalLink className="h-2.5 w-2.5" />
    </Button>
  );
};

// ─── Additional Expenses Table ───────────────────────────────────────────────

const AdditionalCardList: React.FC<{ 
  items: AdditionalExpenseData[]; 
  totalAdditional: number;
  onDelete?: (id: string) => void;
  onEdit?: (item: AdditionalExpenseData) => void;
}> = ({ items, totalAdditional, onDelete, onEdit }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const [viewItem, setViewItem] = useState<AdditionalExpenseData | null>(null);
  const [signedBillUrl, setSignedBillUrl] = useState<string | null>(null);

  const statusLabel = (s: string) => s === 'manager_approved' ? 'Approved' : s === 'draft' ? 'Draft' : s === 'submitted' ? 'Pending' : s === 'rejected' ? 'Rejected' : s === 'paid' ? 'Paid' : s;
  const statusVariant = (s: string): 'default' | 'destructive' | 'outline' | 'secondary' =>
    s === 'manager_approved' ? 'default' : s === 'rejected' ? 'destructive' : s === 'submitted' ? 'outline' : 'secondary';

  const handleViewDetail = async (item: AdditionalExpenseData) => {
    setViewItem(item);
    setSignedBillUrl(null);
    if (item.bill_url) {
      const { data } = await supabase.storage.from('expense-bills').createSignedUrl(item.bill_url, 300);
      if (data?.signedUrl) setSignedBillUrl(data.signedUrl);
    }
  };

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No additional expenses found</p>;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-hidden">
        <Table className="table-fixed sm:table-auto w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] px-2 w-[60px] sm:w-auto">Date</TableHead>
              <TableHead className="text-[11px] px-2">Type</TableHead>
              <TableHead className="text-right text-[11px] px-2 w-[62px] sm:w-auto">Amt</TableHead>
              <TableHead className="text-center text-[11px] px-1 w-[58px] sm:w-auto">Status</TableHead>
              <TableHead className="text-center text-[11px] px-1 w-[40px] sm:w-auto">Details</TableHead>
              <TableHead className="text-center text-[11px] px-1 w-[56px] sm:w-auto">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-[11px] py-1.5 px-2 whitespace-nowrap">
                  {new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </TableCell>
                <TableCell className="text-[11px] py-1.5 px-2 truncate">{item.expense_type}</TableCell>
                <TableCell className="text-right text-[11px] py-1.5 px-2 font-medium">{fmtMoney(item.value)}</TableCell>
                <TableCell className="text-center py-1.5 px-1">
                  <Badge variant={statusVariant(item.status)} className="text-[8px] px-1 py-0">{statusLabel(item.status)}</Badge>
                </TableCell>
                <TableCell className="text-center py-1.5 px-1">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleViewDetail(item)} title="View details">
                    <Eye className="h-2.5 w-2.5" />
                  </Button>
                </TableCell>
                <TableCell className="text-center py-1.5 px-1">
                  {(item.status === 'draft' || item.status === 'submitted') ? (
                    <div className="flex items-center justify-center gap-0">
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onEdit?.(item)} title="Edit">
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" title="Delete">
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this {item.expense_type} expense of {fmtMoney(item.value)}?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete?.(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 bg-muted/30">
              <TableCell className="font-bold text-[11px] py-1.5 px-2">Total</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-bold text-[11px] py-1.5 px-2">{fmtMoney(totalAdditional)}</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* View Detail Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Expense Details</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground text-xs">Date</span><p className="font-medium">{new Date(viewItem.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                <div><span className="text-muted-foreground text-xs">Type</span><p className="font-medium">{viewItem.expense_type}</p></div>
                <div><span className="text-muted-foreground text-xs">Amount</span><p className="font-medium">{fmtMoney(viewItem.value)}</p></div>
                <div><span className="text-muted-foreground text-xs">Status</span><p><Badge variant={statusVariant(viewItem.status)} className="text-[9px] px-1.5 py-0">{statusLabel(viewItem.status)}</Badge></p></div>
              </div>
              {viewItem.details && (
                <div><span className="text-muted-foreground text-xs">Details</span><p className="text-xs">{viewItem.details}</p></div>
              )}
              {viewItem.bill_url && (
                <div>
                  <span className="text-muted-foreground text-xs">Attachment</span>
                  {signedBillUrl ? (
                    <div className="mt-1 rounded-md border overflow-hidden">
                      <img src={signedBillUrl} alt="Bill" className="w-full max-h-64 object-contain bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="p-2 border-t">
                        <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => window.open(signedBillUrl, '_blank')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Open Full Size
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  )}
                </div>
              )}
              {!viewItem.bill_url && (
                <div><span className="text-muted-foreground text-xs">Attachment</span><p className="text-xs text-muted-foreground">No bill attached</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};


const BeatAllowanceManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subordinateIds, isManager } = useSubordinates();
  
  // Multi-user selector state (like MyBeats)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [dateRangeStart, setDateRangeStart] = useState<Date>();
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>();
  const [filterType, setFilterType] = useState<FilterType>('current_week');
  const [loading, setLoading] = useState(true);
  const [isAdditionalExpensesOpen, setIsAdditionalExpensesOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | undefined>();
  const [isProductivityReportOpen, setIsProductivityReportOpen] = useState(false);
  const [daRecords, setDARecords] = useState<DARecord[]>([]);
  const [additionalExpenseData, setAdditionalExpenseData] = useState<AdditionalExpenseData[]>([]);
  const [activeTab, setActiveTab] = useState<'expenses' | 'da' | 'additional'>('expenses');
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const [submittingExpenses, setSubmittingExpenses] = useState(false);
  const { toast } = useToast();
  
  // Track current fetch version to ignore stale responses
  const fetchVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  // Initialize with self when user is available
  useEffect(() => {
    if (user?.id && selectedUserIds.length === 0) {
      setSelectedUserIds([user.id]);
    }
  }, [user?.id]);

  // Calculate effective user IDs for data filtering (like MyBeats)
  const effectiveUserIds = useMemo(() => {
    if (selectedUserIds.length === 0 && user?.id) {
      return [user.id];
    }
    return selectedUserIds;
  }, [selectedUserIds, user?.id]);

  // Calculate date range based on filter type
  const getDateRange = (): { start: Date; end: Date } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (filterType) {
      case 'today':
        return { start: today, end: today };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: yesterday };
      case 'current_week':
        return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case 'last_week':
        const lastWeek = subWeeks(today, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
      case 'current_month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'last_month':
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'current_quarter':
        return { start: startOfQuarter(today), end: endOfQuarter(today) };
      case 'previous_quarter':
        const lastQuarter = subQuarters(today, 1);
        return { start: startOfQuarter(lastQuarter), end: endOfQuarter(lastQuarter) };
      case 'custom':
        if (dateRangeStart && dateRangeEnd) {
          return { start: dateRangeStart, end: dateRangeEnd };
        }
        return { start: startOfMonth(today), end: endOfMonth(today) };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const fetchLeaveDates = async () => {
    try {
      if (!user?.id || effectiveUserIds.length === 0) return;

      // Build query based on effective users
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('date, status')
        .in('status', ['leave', 'on_leave', 'absent'])
        .in('user_id', effectiveUserIds);

      const leaveSet = new Set<string>();
      attendanceData?.forEach((record: any) => {
        leaveSet.add(record.date);
      });
      if (isMountedRef.current) {
        setLeaveDates(leaveSet);
      }
    } catch (error) {
      console.error('Error fetching leave dates:', error);
    }
  };

  const fetchExpenseData = async () => {
    try {
      if (!user?.id || effectiveUserIds.length === 0) return;

      // Fetch expense configs with hierarchy
      const { fetchExpenseConfigs, resolveExpenseConfig, fetchUserManagerIds } = await import('@/hooks/useResolvedExpenseConfig');
      const { globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap } = await fetchExpenseConfigs();
      
      // Get manager IDs for effective users
      const managerMap = await fetchUserManagerIds(effectiveUserIds);
      
      // Resolve config for first effective user (primary user context)
      const primaryUserId = effectiveUserIds[0];
      const primaryConfig = resolveExpenseConfig(primaryUserId, managerMap.get(primaryUserId), globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap);
      const taType = primaryConfig.ta_type;
      const fixedTaAmount = primaryConfig.fixed_ta_amount;
      const taPerKmRate = primaryConfig.ta_per_km_rate;

      // Fetch beat plans (journey plans) to get dates and beats
      const { data: beatPlans, error: beatPlansError } = await supabase
        .from('beat_plans')
        .select('plan_date, beat_id, beat_name')
        .in('user_id', effectiveUserIds)
        .order('plan_date', { ascending: true });

      if (beatPlansError) throw beatPlansError;

      // Fetch beats to get travel_allowance and average_km from My Beat
      const { data: beatsData, error: beatsError } = await supabase
        .from('beats')
        .select('beat_id, beat_name, travel_allowance, average_km');

      if (beatsError) throw beatsError;

      // Create beat travel allowance map - uses per-km rate if configured, else fixed TA from beat
      const beatTAMap = new Map();
      beatsData?.forEach((beat: any) => {
        const km = beat.average_km || 0;
        const beatFixedTA = beat.travel_allowance || 0;
        // If per-km rate is set and > 0, calculate TA from km; otherwise use beat's fixed TA
        const ta = (taPerKmRate > 0 && km > 0) ? (km * taPerKmRate) : beatFixedTA;
        beatTAMap.set(beat.beat_id, ta);
      });

      // Fetch additional expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('additional_expenses')
        .select('*')
        .in('user_id', effectiveUserIds);

      if (expensesError) throw expensesError;

      // Fetch orders with visit data to get order values
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('total_amount, visit_id, created_at')
        .in('user_id', effectiveUserIds);

      if (ordersError) throw ordersError;

      // Fetch visits to link orders to beats and count productive visits
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select('id, planned_date, retailer_id, status')
        .in('user_id', effectiveUserIds);

      if (visitsError) throw visitsError;

      // Fetch retailers to get beat info
      const { data: retailersData, error: retailersError } = await supabase
        .from('retailers')
        .select('id, beat_id, beat_name')
        .in('user_id', effectiveUserIds);

      if (retailersError) throw retailersError;

      const expensesMap = new Map();
      expensesData?.forEach((expense: any) => {
        const key = `${expense.expense_date}`;
        const current = expensesMap.get(key) || 0;
        expensesMap.set(key, current + parseFloat(expense.amount));
      });

      // Create retailer to beat map
      const retailerToBeatMap = new Map();
      retailersData?.forEach((retailer: any) => {
        retailerToBeatMap.set(retailer.id, { beat_id: retailer.beat_id, beat_name: retailer.beat_name });
      });

      // Count productive visits per date (visits with status='productive')
      const productiveVisitsMap = new Map();
      const orderValueByDateMap = new Map();
      
      // Map visits by id for lookup
      const visitsById = new Map();
      visitsData?.forEach((visit: any) => {
        visitsById.set(visit.id, visit);
        // Count visits with status='productive' as productive visits
        if (visit.status === 'productive') {
          const date = visit.planned_date;
          productiveVisitsMap.set(date, (productiveVisitsMap.get(date) || 0) + 1);
        }
      });
      
      // Calculate order values from orders table by date
      // Use visit's planned_date if linked, otherwise use order's created_at date
      ordersData?.forEach((order: any) => {
        const orderAmount = parseFloat(order.total_amount || 0);
        let date: string;
        
        if (order.visit_id) {
          const visit = visitsById.get(order.visit_id);
          if (visit) {
            date = visit.planned_date;
          } else {
            // Fallback to created_at date if visit not found
            date = format(new Date(order.created_at), 'yyyy-MM-dd');
          }
        } else {
          // For orders without visit_id, use created_at date
          date = format(new Date(order.created_at), 'yyyy-MM-dd');
        }
        
        orderValueByDateMap.set(date, (orderValueByDateMap.get(date) || 0) + orderAmount);
      });

      // Create expense rows from beat plans
      const rows: ExpenseRow[] = [];
      beatPlans?.forEach((plan: any) => {
        const additionalExpenses = expensesMap.get(plan.plan_date) || 0;
        // Get order value from visits directly for that date
        const orderValue = orderValueByDateMap.get(plan.plan_date) || 0;
        const isOnLeave = leaveDates.has(plan.plan_date);
        
        // Get TA based on expense master config - Fixed TA, from Beat, or from GPS
        // If on leave, TA is 0; GPS-based TA is handled separately below
        const ta = isOnLeave ? 0 : (taType === 'fixed' ? fixedTaAmount : (taType === 'from_gps' ? 0 : (beatTAMap.get(plan.beat_id) || 0)));
        const productiveVisits = productiveVisitsMap.get(plan.plan_date) || 0;
        
        rows.push({
          id: plan.plan_date + '-' + plan.beat_id,
          date: plan.plan_date,
          beat_name: plan.beat_name,
          beat_id: plan.beat_id,
          ta: ta,
          da: 0,
          additional_expenses: additionalExpenses,
          order_value: orderValue,
          productive_visits: productiveVisits,
          isOnLeave
        });
      });

      // If GPS-based TA, fetch GPS distances and update rows
      if (taType === 'from_gps') {
        const { fetchMonthlyGPSDistances } = await import('@/hooks/useGPSDistance');
        const { start, end } = getDateRange();
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        
        // Fetch GPS distances for all effective users
        for (const uid of effectiveUserIds) {
          const gpsDistances = await fetchMonthlyGPSDistances(uid, startStr, endStr);
          rows.forEach(row => {
            if (!row.isOnLeave) {
              const km = gpsDistances.get(row.date) || 0;
              row.ta = Math.round(km * taPerKmRate * 100) / 100;
              // Store km in beat_name for display when GPS mode
              if (km > 0) {
                row.beat_name = `${row.beat_name} (${km.toFixed(1)} km)`;
              }
            }
          });
        }
      }

      if (isMountedRef.current) {
        setExpenseRows(rows);
      }
    } catch (error) {
      console.error('Error fetching expense data:', error);
    }
  };


  const fetchDAData = async () => {
    try {
      if (!user?.id) return;

      // Fetch DA amount using config hierarchy
      const { fetchExpenseConfigs, resolveExpenseConfig, fetchUserManagerId } = await import('@/hooks/useResolvedExpenseConfig');
      const { globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap } = await fetchExpenseConfigs();
      const managerId = await fetchUserManagerId(user.id);
      const config = resolveExpenseConfig(user.id, managerId, globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap);

      const daPerDay = config.da_amount;

      // Fetch attendance data with check-in/check-out times
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('date, check_in_time, check_out_time, status')
        .in('user_id', effectiveUserIds)
        .order('date', { ascending: true });

      if (attendanceError) throw attendanceError;

      // Create DA records
      const records: DARecord[] = attendanceData?.map((record: any) => {
        const isOnLeave = ['leave', 'on_leave', 'absent'].includes(record.status);
        const daAmount = isOnLeave ? 0 : (record.status === 'present' ? daPerDay : 0);
        
        let dayStartTime = '-';
        let dayEndTime = '-';
        let marketHours = '0h 0m';
        
        if (record.check_in_time) {
          const checkIn = new Date(record.check_in_time);
          dayStartTime = `${checkIn.getHours().toString().padStart(2, '0')}:${checkIn.getMinutes().toString().padStart(2, '0')}`;
        }
        
        if (record.check_out_time) {
          const checkOut = new Date(record.check_out_time);
          dayEndTime = `${checkOut.getHours().toString().padStart(2, '0')}:${checkOut.getMinutes().toString().padStart(2, '0')}`;
        }
        
        if (record.check_in_time && record.check_out_time) {
          const checkIn = new Date(record.check_in_time);
          const checkOut = new Date(record.check_out_time);
          const durationMs = checkOut.getTime() - checkIn.getTime();
          const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
          const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          marketHours = `${durationHours}h ${durationMinutes}m`;
        } else if (record.check_in_time && !record.check_out_time) {
          // No check out yet - show dash instead of "Ongoing"
          marketHours = '-';
        }

        return {
          date: record.date,
          da_amount: daAmount,
          day_start_time: dayStartTime,
          day_end_time: dayEndTime,
          market_hours: marketHours,
          isOnLeave
        };
      }) || [];

      if (isMountedRef.current) {
        setDARecords(records);
      }
    } catch (error) {
      console.error('Error fetching DA data:', error);
    }
  };

  const fetchAdditionalExpenseData = async () => {
    try {
      if (!user?.id || effectiveUserIds.length === 0) return;

      const { data: expensesData, error } = await (supabase as any)
        .from('additional_expenses')
        .select('id, expense_date, category, custom_category, description, amount, bill_url, status')
        .in('user_id', effectiveUserIds)
        .order('expense_date', { ascending: true });

      if (error) throw error;

      const additionalExpenses: AdditionalExpenseData[] = expensesData?.map((item: any) => ({
        id: item.id,
        date: item.expense_date,
        expense_type: item.category === 'Other' ? item.custom_category : item.category,
        details: item.description || '',
        value: item.amount,
        bill_attached: !!item.bill_url,
        bill_url: item.bill_url,
        status: item.status || 'draft'
      })) || [];

      if (isMountedRef.current) {
        setAdditionalExpenseData(additionalExpenses);
      }
    } catch (error) {
      console.error('Error fetching additional expense data:', error);
    }
  };

  // Single unified effect for all data fetching with abort handling
  useEffect(() => {
    isMountedRef.current = true;
    
    const fetchAllData = async () => {
      if (!user?.id) return;
      
      // Increment version to invalidate any in-flight requests
      const currentVersion = ++fetchVersionRef.current;
      
      setLoading(true);
      
      try {
        // First fetch leave dates (needed for expense data)
        await fetchLeaveDates();
        
        // Check if this request is still current
        if (currentVersion !== fetchVersionRef.current || !isMountedRef.current) return;
        
        // Fetch all data in parallel
        await Promise.all([
          fetchExpenseData(),
          fetchDAData(),
          fetchAdditionalExpenseData()
        ]);
        
        // Check again before updating loading state
        if (currentVersion !== fetchVersionRef.current || !isMountedRef.current) return;
        
      } catch (error) {
        console.error('Error fetching data:', error);
        if (currentVersion === fetchVersionRef.current && isMountedRef.current) {
          toast({
            title: "Error",
            description: "Failed to fetch expense data. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (currentVersion === fetchVersionRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchAllData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [user?.id, effectiveUserIds, filterType, dateRangeStart, dateRangeEnd]);

  const handleAdditionalExpensesClick = () => {
    // Check if any selected date is a leave date
    const { start, end } = getDateRange();
    const startStr = format(start, 'yyyy-MM-dd');
    if (leaveDates.has(startStr) && filterType === 'today') {
      toast({
        title: "Cannot Add Expense",
        description: "You cannot add additional expenses on leave dates",
        variant: "destructive",
      });
      return;
    }
    setIsAdditionalExpensesOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('additional_expenses')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Expense deleted successfully" });
      fetchAdditionalExpenseData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({ title: "Error", description: "Failed to delete expense", variant: "destructive" });
    }
  };

  const handleEditExpense = (item: AdditionalExpenseData) => {
    setEditingExpenseId(item.id);
    setIsAdditionalExpensesOpen(true);
  };

  const handleSubmitExpenses = async () => {
    if (!user?.id) return;
    setSubmittingExpenses(true);
    try {
      const { start, end } = getDateRange();
      const { error } = await (supabase as any)
        .from('additional_expenses')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .gte('expense_date', format(start, 'yyyy-MM-dd'))
        .lte('expense_date', format(end, 'yyyy-MM-dd'));

      if (error) throw error;
      toast({ title: "Submitted", description: "Expenses submitted for approval" });
      fetchAdditionalExpenseData();
    } catch (error) {
      console.error('Error submitting expenses:', error);
      toast({ title: "Error", description: "Failed to submit expenses", variant: "destructive" });
    } finally {
      setSubmittingExpenses(false);
    }
  };

  const filterByDate = (dateString: string) => {
    const rowDate = new Date(dateString);
    rowDate.setHours(0, 0, 0, 0);
    const { start, end } = getDateRange();
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    
    return rowDate >= startDate && rowDate <= endDate;
  };

  const filteredExpenseRows = expenseRows.filter(row => filterByDate(row.date));
  const filteredDARecords = daRecords.filter(record => filterByDate(record.date));
  const filteredAdditionalExpenses = additionalExpenseData.filter(item => filterByDate(item.date));

  // Calculate totals for highlight panel
  const totalTA = useMemo(() => filteredExpenseRows.reduce((sum, row) => sum + row.ta, 0), [filteredExpenseRows]);
  const totalDA = useMemo(() => filteredDARecords.reduce((sum, record) => sum + record.da_amount, 0), [filteredDARecords]);
  const totalAdditionalExpenses = useMemo(() => filteredAdditionalExpenses.reduce((sum, item) => sum + item.value, 0), [filteredAdditionalExpenses]);

  const downloadXLS = async () => {
    const XLSX = await import('xlsx');
    const { start, end } = getDateRange();
    const dateStr = `${format(start, 'dd-MMM-yyyy')}_to_${format(end, 'dd-MMM-yyyy')}`;
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // My Expenses sheet
    const expenseSheetData = filteredExpenseRows.map(row => ({
      'Date': format(new Date(row.date), 'dd-MMM-yyyy'),
      'Beat': row.beat_name,
      'TA Amount (₹)': row.ta,
      'Productive Visits': row.productive_visits,
      'Order Value (₹)': row.order_value,
      'On Leave': row.isOnLeave ? 'Yes' : 'No'
    }));
    expenseSheetData.push({
      'Date': 'TOTAL',
      'Beat': '',
      'TA Amount (₹)': totalTA,
      'Productive Visits': filteredExpenseRows.reduce((sum, row) => sum + row.productive_visits, 0),
      'Order Value (₹)': filteredExpenseRows.reduce((sum, row) => sum + row.order_value, 0),
      'On Leave': ''
    });
    const wsExpenses = XLSX.utils.json_to_sheet(expenseSheetData);
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'My Expenses');
    
    // DA sheet
    const daSheetData = filteredDARecords.map(record => ({
      'Date': format(new Date(record.date), 'dd-MMM-yyyy'),
      'DA Amount (₹)': record.da_amount,
      'Day Start Time': record.day_start_time,
      'Day End Time': record.day_end_time,
      'Market Hours': record.market_hours,
      'On Leave': record.isOnLeave ? 'Yes' : 'No'
    }));
    daSheetData.push({
      'Date': 'TOTAL',
      'DA Amount (₹)': totalDA,
      'Day Start Time': '',
      'Day End Time': '',
      'Market Hours': '',
      'On Leave': ''
    });
    const wsDA = XLSX.utils.json_to_sheet(daSheetData);
    XLSX.utils.book_append_sheet(wb, wsDA, 'DA');
    
    // Additional Expenses sheet
    const additionalSheetData = filteredAdditionalExpenses.map(item => ({
      'Date': format(new Date(item.date), 'dd-MMM-yyyy'),
      'Type': item.expense_type,
      'Details': item.details,
      'Amount (₹)': item.value,
      'Bill Attached': item.bill_attached ? 'Yes' : 'No'
    }));
    additionalSheetData.push({
      'Date': 'TOTAL',
      'Type': '',
      'Details': '',
      'Amount (₹)': totalAdditionalExpenses,
      'Bill Attached': ''
    });
    const wsAdditional = XLSX.utils.json_to_sheet(additionalSheetData);
    XLSX.utils.book_append_sheet(wb, wsAdditional, 'Additional Expenses');
    
    // Download file
    XLSX.writeFile(wb, `Expenses_${dateStr}.xlsx`);
    
    toast({
      title: "Downloaded",
      description: "Expense report downloaded successfully",
    });
  };

  const getFilterLabel = () => {
    const { start, end } = getDateRange();
    if (filterType === 'today') return 'Today';
    if (filterType === 'yesterday') return 'Yesterday';
    return `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main Content */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6 px-3 sm:px-6">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 xs:gap-3">
            <CardTitle className="text-lg sm:text-xl">Expense Details</CardTitle>
            <div className="flex items-center gap-1.5">
              <Button 
                onClick={() => setIsProductivityReportOpen(true)} 
                variant="outline" 
                size="sm" 
                className="h-8 px-2 text-xs"
              >
                <BarChart3 className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Report</span>
              </Button>
              <Button 
                onClick={downloadXLS} 
                variant="outline" 
                size="sm" 
                className="h-8 px-2 text-xs"
              >
                <Download className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">XLS</span>
              </Button>
              <Button
                onClick={handleAdditionalExpensesClick}
                variant="default"
                size="sm"
                className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Add </span>Expense
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{getFilterLabel()}</p>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-4">
            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(value: 'expenses' | 'da' | 'additional') => setActiveTab(value)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8 sm:h-10">
                <TabsTrigger value="expenses" className="text-xs sm:text-sm">TA</TabsTrigger>
                <TabsTrigger value="da" className="text-xs sm:text-sm">DA</TabsTrigger>
                <TabsTrigger value="additional" className="text-xs sm:text-sm">Additional Expenses</TabsTrigger>
              </TabsList>

              <TabsContent value="expenses" className="space-y-2 mt-3">
                <TACardList rows={filteredExpenseRows} totalTA={totalTA} navigate={navigate} />
              </TabsContent>

              <TabsContent value="da" className="space-y-2 mt-3">
                <DACardList records={filteredDARecords} totalDA={totalDA} />
              </TabsContent>

              <TabsContent value="additional" className="space-y-2 mt-3">
                <AdditionalCardList 
                  items={filteredAdditionalExpenses} 
                  totalAdditional={totalAdditionalExpenses}
                  onDelete={handleDeleteExpense}
                  onEdit={handleEditExpense}
                />
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Additional Expenses Dialog */}
      <Dialog open={isAdditionalExpensesOpen} onOpenChange={(open) => { setIsAdditionalExpensesOpen(open); if (!open) setEditingExpenseId(undefined); }}>
        <DialogContent className="max-w-[100vw] sm:max-w-[90vw] h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-0 sm:p-6 rounded-none sm:rounded-lg">
          <DialogHeader className="p-3 sm:p-0 pb-0">
            <DialogTitle className="text-sm sm:text-lg">{editingExpenseId ? 'Edit Expense' : 'Additional Expenses'}</DialogTitle>
          </DialogHeader>
          <AdditionalExpenses
            editExpenseId={editingExpenseId}
            onExpensesUpdated={() => {
              fetchExpenseData();
              fetchAdditionalExpenseData();
              setIsAdditionalExpensesOpen(false);
              setEditingExpenseId(undefined);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Productivity Report Dialog */}
      <Dialog open={isProductivityReportOpen} onOpenChange={setIsProductivityReportOpen}>
        <DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Productivity Report</DialogTitle>
          </DialogHeader>
          <ProductivityTracking />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeatAllowanceManagement;
