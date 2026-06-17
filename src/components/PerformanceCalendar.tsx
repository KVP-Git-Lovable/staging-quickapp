import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, startOfDay, addDays, addWeeks, subWeeks, subDays, startOfYear, endOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { UserSelector } from "@/components/UserSelector";
import { useSubordinates } from "@/hooks/useSubordinates";
import { debounce } from "@/utils/intervalManager";

interface DayData {
  date: Date;
  beatName: string;
  plannedVisits: number;
  completedVisits: number;
  productiveVisits: number;
  revenue: number;
  productivity: number;
  isHoliday: boolean;
  isLeave: boolean;
  hasJointSales: boolean;
  jointSalesMemberName?: string;
}

type ViewMode = "day" | "week" | "month";

export const PerformanceCalendar = () => {
  const navigate = useNavigate();
  const { userRole, userProfile, user } = useAuth();
  const { isManager, subordinateIds } = useSubordinates();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("self");
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [filters, setFilters] = useState({
    productive: true,
    unproductive: true,
    storeClosed: true,
    planned: true,
    holidays: true,
    leaves: true
  });

  // Calculate effective user ID for data filtering using useSubordinates
  const effectiveUserId = useMemo(() => {
    if (!user?.id) return null;
    if (selectedUserId === 'self') return user.id;
    if (selectedUserId === 'all' && isManager) return null; // null means all subordinates
    return selectedUserId;
  }, [selectedUserId, user?.id, isManager]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      if (!user?.id) return;

      let rangeStart: Date;
      let rangeEnd: Date;

      if (viewMode === "day") {
        rangeStart = startOfDay(currentDate);
        rangeEnd = startOfDay(currentDate);
      } else if (viewMode === "week") {
        rangeStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        rangeEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        rangeStart = startOfMonth(currentDate);
        rangeEnd = endOfMonth(currentDate);
      }

      // Determine which user IDs to use for data fetching based on hierarchy
      let userIds: string[] = [user.id];

      if (selectedUserId === "all" && isManager) {
        // For managers viewing all subordinates
        userIds = [user.id, ...subordinateIds];
      } else if (selectedUserId !== "self" && selectedUserId !== "all") {
        // Viewing specific user
        userIds = [selectedUserId];
      }

      // Fetch beat plans for the range
      const { data: beatPlans, error: beatPlansError } = await supabase
        .from('beat_plans')
        .select('plan_date, beat_name, joint_sales_manager_id')
        .in('user_id', userIds)
        .gte('plan_date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('plan_date', format(rangeEnd, 'yyyy-MM-dd'));

      if (beatPlansError) throw beatPlansError;

      // Get joint sales member names
      const jointSalesManagerIds = beatPlans?.filter(bp => bp.joint_sales_manager_id).map(bp => bp.joint_sales_manager_id as string) || [];
      const jointSalesMemberMap = new Map<string, string>();
      
      if (jointSalesManagerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', jointSalesManagerIds);
        
        profiles?.forEach(p => {
          jointSalesMemberMap.set(p.id, p.full_name);
        });
      }

      // Fetch visits for the range
      const { data: visits, error: visitsError } = await supabase
        .from('visits')
        .select('*')
        .in('user_id', userIds)
        .gte('planned_date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('planned_date', format(rangeEnd, 'yyyy-MM-dd'));

      if (visitsError) throw visitsError;

      // Fetch orders for the date range - use created_at date, not visit_id
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, visit_id')
        .in('user_id', userIds)
        .gte('created_at', format(rangeStart, 'yyyy-MM-dd'))
        .lt('created_at', format(addDays(rangeEnd, 1), 'yyyy-MM-dd'));

      if (ordersError) throw ordersError;
      const orders = ordersData || [];

      // Fetch holidays
      const { data: holidays, error: holidaysError } = await supabase
        .from('holidays')
        .select('date')
        .gte('date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('date', format(rangeEnd, 'yyyy-MM-dd'));

      if (holidaysError) throw holidaysError;

      // Fetch leave applications for selected users
      const { data: leaves, error: leavesError } = await supabase
        .from('leave_applications')
        .select('start_date, end_date, user_id')
        .in('user_id', userIds)
        .eq('status', 'approved')
        .or(`start_date.lte.${format(rangeEnd, 'yyyy-MM-dd')},end_date.gte.${format(rangeStart, 'yyyy-MM-dd')}`);

      if (leavesError) throw leavesError;

      // Group data by date
      const dataByDate = new Map<string, DayData>();
      const holidayDates = new Set(holidays?.map(h => h.date) || []);
      const leaveDates = new Set<string>();
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // Process leave dates
      leaves?.forEach(leave => {
        const leaveStart = new Date(leave.start_date);
        const leaveEnd = new Date(leave.end_date);
        const leaveDays = eachDayOfInterval({ start: leaveStart, end: leaveEnd });
        leaveDays.forEach(day => {
          leaveDates.add(format(day, 'yyyy-MM-dd'));
        });
      });

      // Create beat plan map with joint sales info
      const beatPlanMap = new Map<string, { beatNames: string[]; hasJointSales: boolean; jointSalesMemberName?: string }>();
      beatPlans?.forEach(plan => {
        if (!beatPlanMap.has(plan.plan_date)) {
          beatPlanMap.set(plan.plan_date, { 
            beatNames: [], 
            hasJointSales: false,
            jointSalesMemberName: undefined
          });
        }
        const dayData = beatPlanMap.get(plan.plan_date)!;
        dayData.beatNames.push(plan.beat_name);
        if (plan.joint_sales_manager_id) {
          dayData.hasJointSales = true;
          dayData.jointSalesMemberName = jointSalesMemberMap.get(plan.joint_sales_manager_id);
        }
      });

      // Initialize all beat plan dates first (to show future planned beats)
      beatPlanMap.forEach((beatPlanInfo, dateKey) => {
        if (!dataByDate.has(dateKey)) {
          dataByDate.set(dateKey, {
            date: new Date(dateKey),
            beatName: beatPlanInfo.beatNames.join(', '),
            plannedVisits: 0,
            completedVisits: 0,
            productiveVisits: 0,
            revenue: 0,
            productivity: 0,
            isHoliday: holidayDates.has(dateKey),
            isLeave: leaveDates.has(dateKey),
            hasJointSales: beatPlanInfo.hasJointSales,
            jointSalesMemberName: beatPlanInfo.jointSalesMemberName
          });
        }
      });

      // Create order map by date (from created_at)
      const orderByDateMap = new Map<string, number>();
      orders?.forEach(order => {
        const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
        const existing = orderByDateMap.get(orderDate) || 0;
        orderByDateMap.set(orderDate, existing + Number(order.total_amount || 0));
      });

      // Group visits by date
      visits?.forEach(visit => {
        const dateKey = visit.planned_date;
        if (!dataByDate.has(dateKey)) {
          const beatPlanInfo = beatPlanMap.get(dateKey);
          dataByDate.set(dateKey, {
            date: new Date(dateKey),
            beatName: beatPlanInfo?.beatNames.join(', ') || '',
            plannedVisits: 0,
            completedVisits: 0,
            productiveVisits: 0,
            revenue: 0,
            productivity: 0,
            isHoliday: holidayDates.has(dateKey),
            isLeave: leaveDates.has(dateKey),
            hasJointSales: beatPlanInfo?.hasJointSales || false,
            jointSalesMemberName: beatPlanInfo?.jointSalesMemberName
          });
        }

        const dayData = dataByDate.get(dateKey)!;
        dayData.plannedVisits++;

        if (visit.status === 'productive' || visit.status === 'unproductive' || visit.status === 'store_closed') {
          dayData.completedVisits++;
        }

        if (visit.status === 'productive') {
          dayData.productiveVisits++;
        }
      });

      // Add revenue from orders by date (not by visit_id)
      orderByDateMap.forEach((revenue, dateKey) => {
        if (dataByDate.has(dateKey)) {
          dataByDate.get(dateKey)!.revenue = revenue;
        } else {
          // Create entry for days with orders but no visits
          dataByDate.set(dateKey, {
            date: new Date(dateKey),
            beatName: beatPlanMap.get(dateKey)?.beatNames.join(', ') || '',
            plannedVisits: 0,
            completedVisits: 0,
            productiveVisits: 0,
            revenue: revenue,
            productivity: 0,
            isHoliday: holidayDates.has(dateKey),
            isLeave: leaveDates.has(dateKey),
            hasJointSales: beatPlanMap.get(dateKey)?.hasJointSales || false,
            jointSalesMemberName: beatPlanMap.get(dateKey)?.jointSalesMemberName
          });
        }
      });

      // Calculate productivity percentage
      dataByDate.forEach(dayData => {
        if (dayData.completedVisits > 0) {
          dayData.productivity = (dayData.productiveVisits / dayData.completedVisits) * 100;
        }
      });

      setCalendarData(dataByDate);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced fetch to prevent rapid re-fetching
  const debouncedFetch = useMemo(
    () => debounce(() => fetchCalendarData(), 300),
    [currentDate, selectedUserId, viewMode, filters, subordinateIds]
  );

  // Track if dependencies changed
  const prevDepsRef = useRef<string>('');
  
  useEffect(() => {
    // Create a stable dependency key
    const depsKey = JSON.stringify({
      currentDate: currentDate.toISOString(),
      selectedUserId,
      viewMode,
      filters,
      subordinateIdsLength: subordinateIds.length
    });
    
    // Only fetch if dependencies actually changed
    if (depsKey !== prevDepsRef.current) {
      prevDepsRef.current = depsKey;
      debouncedFetch();
    }
  }, [currentDate, selectedUserId, viewMode, filters, subordinateIds, debouncedFetch]);


  useEffect(() => {
    // Sync currentDate with selectedYear and selectedMonth
    setCurrentDate(new Date(selectedYear, selectedMonth, 1));
  }, [selectedYear, selectedMonth]);

  const handlePrevious = () => {
    if (viewMode === "day") {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      const newDate = subMonths(currentDate, 1);
      setCurrentDate(newDate);
      setSelectedMonth(newDate.getMonth());
      setSelectedYear(newDate.getFullYear());
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      const newDate = addMonths(currentDate, 1);
      setCurrentDate(newDate);
      setSelectedMonth(newDate.getMonth());
      setSelectedYear(newDate.getFullYear());
    }
  };

  const handleDateClick = (date: Date) => {
    navigate(`/today-summary?date=${format(date, 'yyyy-MM-dd')}`);
  };

  const getColorClass = (dayData: DayData | undefined, dateKey: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isFutureDate = dateKey > todayStr;
    
    if (!dayData) return 'bg-background';
    if (dayData.isHoliday && filters.holidays) return 'bg-muted';
    if (dayData.isLeave && filters.leaves) return 'bg-muted';
    
    // Future planned beats - show in blue/info color
    if (isFutureDate && dayData.beatName && dayData.completedVisits === 0) {
      return 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
    }
    
    if (dayData.completedVisits === 0 && filters.planned) return 'bg-background';
    
    if (dayData.productivity >= 50) return 'bg-success/20 border-success/40';
    if (dayData.productivity >= 30) return 'bg-warning/20 border-warning/40';
    if (dayData.productivity >= 20) return 'bg-destructive/20 border-destructive/40';
    return 'bg-muted';
  };

  const shouldShowDay = (dayData: DayData | undefined) => {
    if (!dayData) return true;
    if (dayData.isHoliday && !filters.holidays) return false;
    if (dayData.isLeave && !filters.leaves) return false;
    return true;
  };

  const getDateRange = () => {
    if (viewMode === "day") {
      return format(currentDate, 'MMMM d, yyyy');
    } else if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else {
      return format(currentDate, 'MMMM yyyy');
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="min-w-[560px] md:min-w-0">
          <div className="grid grid-cols-7 gap-0.5 md:gap-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[10px] md:text-xs font-semibold text-muted-foreground py-1">
                {day}
              </div>
            ))}
            
            {calendarDays.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayData = calendarData.get(dateKey);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              if (!shouldShowDay(dayData)) return null;

              return (
                <button
                  key={dateKey}
                  onClick={() => handleDateClick(day)}
                  disabled={!isCurrentMonth}
                  className={cn(
                    "min-h-[68px] md:min-h-[78px] p-1 md:p-1.5 border rounded transition-all",
                    "hover:shadow active:scale-95 md:hover:scale-[1.02]",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100",
                    getColorClass(dayData, dateKey),
                    isToday && "ring-1.5 ring-primary"
                  )}
                >
                  <div className="text-left space-y-px">
                    <div className={cn(
                      "text-xs md:text-sm font-bold leading-none",
                      isToday && "text-primary"
                    )}>
                      {format(day, 'd')}
                    </div>
                    
                    {/* Show completed visits data */}
                    {isCurrentMonth && dayData && dayData.completedVisits > 0 && (
                      <div className="text-[9px] md:text-[10px] space-y-px leading-tight">
                        {dayData.beatName && (
                          <div className="font-semibold text-foreground truncate" title={dayData.beatName}>
                            {dayData.beatName.length > 10 ? dayData.beatName.substring(0, 10) + '..' : dayData.beatName}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">
                            P:{dayData.plannedVisits} C:{dayData.completedVisits}
                          </span>
                          {dayData.hasJointSales && (
                            <span 
                              className="text-blue-600 cursor-help" 
                              title={dayData.jointSalesMemberName ? `Joint Sales with ${dayData.jointSalesMemberName}` : "Joint Sales Visit"}
                            >
                              🔵
                            </span>
                          )}
                        </div>
                        <div className="text-success font-semibold">
                          ✓{dayData.productiveVisits}
                        </div>
                        {dayData.revenue > 0 && (
                          <div className="text-primary font-bold">
                            ₹{dayData.revenue >= 1000 ? (dayData.revenue / 1000).toFixed(1) + 'k' : dayData.revenue}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show planned beats when no visits have been logged yet (today, future, or missed past dates) */}
                    {isCurrentMonth && dayData && dayData.completedVisits === 0 && dayData.beatName && (
                      <div className="text-[9px] md:text-[10px] space-y-px leading-tight">
                        <div className="font-semibold text-blue-600 dark:text-blue-400 truncate" title={dayData.beatName}>
                          📅 {dayData.beatName.length > 8 ? dayData.beatName.substring(0, 8) + '..' : dayData.beatName}
                        </div>
                        <div className="text-muted-foreground text-[8px]">
                          {dateKey < format(new Date(), 'yyyy-MM-dd') ? 'Missed' : 'Planned'}
                        </div>
                        {dayData.hasJointSales && (
                          <span 
                            className="text-blue-600 cursor-help" 
                            title={dayData.jointSalesMemberName ? `Joint Sales with ${dayData.jointSalesMemberName}` : "Joint Sales Visit"}
                          >
                            🔵
                          </span>
                        )}
                      </div>
                    )}

                    {isCurrentMonth && dayData && (dayData.isHoliday || dayData.isLeave) && (
                      <div className="text-[9px] text-muted-foreground">
                        {dayData.isHoliday ? '🏖' : '🏠'}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-8 gap-1 border-b">
            <div className="p-2 text-xs font-semibold">Time</div>
            {weekDays.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayData = calendarData.get(dateKey);
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              
              return (
                <div 
                  key={dateKey} 
                  className={cn(
                    "p-2 text-center border-l",
                    isToday && "bg-primary/10"
                  )}
                >
                  <div className="text-xs font-semibold">{format(day, 'EEE')}</div>
                  <div className={cn("text-lg font-bold", isToday && "text-primary")}>
                    {format(day, 'd')}
                  </div>
                  {dayData && dayData.completedVisits > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {dayData.completedVisits} visits
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-8 gap-1">
            {hours.map(hour => (
              <>
                <div key={`hour-${hour}`} className="p-2 text-xs text-muted-foreground border-b">
                  {format(new Date().setHours(hour, 0), 'h a')}
                </div>
                {weekDays.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayData = calendarData.get(dateKey);
                  
                  return (
                    <button
                      key={`${dateKey}-${hour}`}
                      onClick={() => handleDateClick(day)}
                      className={cn(
                        "min-h-[60px] p-1 border-b border-l hover:bg-accent transition-colors text-left",
                        hour >= 9 && hour <= 17 && dayData && "cursor-pointer"
                      )}
                    >
                      {hour === 9 && dayData && dayData.beatName && (
                        <div className="text-[10px] font-medium truncate bg-primary/10 p-1 rounded">
                          {dayData.beatName}
                        </div>
                      )}
                      {hour === 10 && dayData && dayData.completedVisits > 0 && (
                        <div className="text-[10px] space-y-0.5">
                          <div>✓ {dayData.completedVisits} visits</div>
                          <div className="text-success">Prod: {dayData.productiveVisits}</div>
                          {dayData.revenue > 0 && (
                            <div className="text-primary font-semibold">
                              ₹{(dayData.revenue / 1000).toFixed(1)}k
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const dayData = calendarData.get(dateKey);

    return (
      <div className="space-y-1">
        <div className="bg-accent/50 p-4 rounded-lg mb-4">
          <h3 className="text-lg font-semibold mb-2">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h3>
          {dayData ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Beat</div>
                <div className="font-semibold">{dayData.beatName || 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Planned Visits</div>
                <div className="font-semibold">{dayData.plannedVisits}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Completed</div>
                <div className="font-semibold text-success">{dayData.completedVisits}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Revenue</div>
                <div className="font-semibold text-primary">
                  ₹{(dayData.revenue / 1000).toFixed(1)}k
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No activities recorded for this day</div>
          )}
        </div>

        <div className="border rounded-lg overflow-hidden">
          {hours.map(hour => (
            <div 
              key={hour}
              className={cn(
                "flex items-start border-b last:border-b-0 min-h-[80px] hover:bg-accent/50 transition-colors",
                hour >= 9 && hour <= 17 && "bg-accent/10"
              )}
            >
              <div className="w-24 p-3 text-sm font-medium text-muted-foreground border-r">
                {format(new Date().setHours(hour, 0), 'h:mm a')}
              </div>
              <div className="flex-1 p-3">
                {hour === 9 && dayData?.beatName && (
                  <div className="bg-primary/10 p-2 rounded mb-2">
                    <div className="font-medium text-sm">📍 Beat: {dayData.beatName}</div>
                  </div>
                )}
                {hour === 10 && dayData && dayData.completedVisits > 0 && (
                  <div className="space-y-2">
                    <div className="bg-success/10 p-2 rounded">
                      <div className="font-medium text-sm">
                        ✓ {dayData.completedVisits} visits completed ({dayData.productiveVisits} productive)
                      </div>
                    </div>
                    {dayData.revenue > 0 && (
                      <div className="bg-primary/10 p-2 rounded">
                        <div className="font-medium text-sm">
                          💰 Revenue: ₹{(dayData.revenue / 1000).toFixed(1)}k
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3 md:px-4 md:py-3">
        <div className="flex flex-col gap-1.5 md:gap-2">
          {/* Title Row with View & Filter */}
          <div className="flex items-center justify-between gap-1.5">
            <CardTitle className="text-sm md:text-base">Performance Calendar</CardTitle>
            
            <div className="flex items-center gap-1.5 md:gap-2">
              {/* View Mode Selector */}
              <Select value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
                <SelectTrigger className="w-[80px] md:w-[100px] h-8 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>

              {/* Filter Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2 md:px-3">
                    <Filter className="h-3.5 w-3.5 md:mr-1" />
                    <span className="hidden md:inline text-xs">Filter</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Filter Calendar</h4>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="productive" 
                          checked={filters.productive}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, productive: checked as boolean }))}
                        />
                        <Label htmlFor="productive" className="text-sm">Productive Visits</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="unproductive" 
                          checked={filters.unproductive}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, unproductive: checked as boolean }))}
                        />
                        <Label htmlFor="unproductive" className="text-sm">Unproductive Visits</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="storeClosed" 
                          checked={filters.storeClosed}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, storeClosed: checked as boolean }))}
                        />
                        <Label htmlFor="storeClosed" className="text-sm">Store Closed</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="planned" 
                          checked={filters.planned}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, planned: checked as boolean }))}
                        />
                        <Label htmlFor="planned" className="text-sm">Planned Visits</Label>
                      </div>
                      <Separator />
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="holidays" 
                          checked={filters.holidays}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, holidays: checked as boolean }))}
                        />
                        <Label htmlFor="holidays" className="text-sm">Show Holidays</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="leaves" 
                          checked={filters.leaves}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, leaves: checked as boolean }))}
                        />
                        <Label htmlFor="leaves" className="text-sm">Show Leaves</Label>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Navigation Row - Stacked on mobile */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-1.5 md:gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Date/Month/Year Picker */}
              {viewMode === "month" ? (
                <div className="flex items-center gap-1.5">
                  <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                    <SelectTrigger className="w-[90px] md:w-[120px] h-8 text-xs md:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem key={month} value={index.toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                    <SelectTrigger className="w-[70px] md:w-[90px] h-8 text-xs md:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8 text-xs md:text-sm">
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {getDateRange()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={currentDate}
                      onSelect={(date) => date && setCurrentDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}

              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* User Selector - Following hierarchy */}
            <UserSelector
              selectedUserId={selectedUserId}
              onUserChange={setSelectedUserId}
              showAllOption={true}
              allOptionLabel="All Team"
              className="h-8 min-w-[100px] max-w-[140px] text-xs"
            />
          </div>

          {/* Legend - Compact on mobile, only in month view */}
          {viewMode === "month" && (
            <div className="flex flex-wrap gap-1.5 md:gap-2 text-[9px] md:text-[10px]">
              <div className="flex items-center gap-0.5">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-success/20 border border-success/40" />
                <span className="text-muted-foreground">&gt;50%</span>
              </div>
              <div className="flex items-center gap-0.5">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-warning/20 border border-warning/40" />
                <span className="text-muted-foreground">&gt;30%</span>
              </div>
              <div className="flex items-center gap-0.5">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-destructive/20 border border-destructive/40" />
                <span className="text-muted-foreground">&lt;20%</span>
              </div>
              <div className="flex items-center gap-0.5">
                <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm bg-muted border" />
                <span className="text-muted-foreground">Off</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : (
          <>
            {viewMode === "month" && renderMonthView()}
            {viewMode === "week" && renderWeekView()}
            {viewMode === "day" && renderDayView()}
          </>
        )}
      </CardContent>
    </Card>
  );
};
