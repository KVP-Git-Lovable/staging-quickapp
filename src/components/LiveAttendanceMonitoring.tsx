
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Download, Users, Clock, MapPin, UserCheck, User, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { downloadCSV } from '@/utils/fileDownloader';
import { AttendanceDetailsDialog } from './attendance/AttendanceDetailsDialog';

interface User {
  id: string;
  full_name: string;
  username: string;
}

interface AttendanceData {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
  status: string;
  check_in_location: any;
  check_out_location: any;
  check_in_address: string | null;
  check_out_address: string | null;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  face_match_confidence?: number | null;
  face_match_confidence_out?: number | null;
  face_verification_status?: string | null;
  face_verification_status_out?: string | null;
  profiles?: {
    full_name: string;
    username: string;
  } | null;
  first_visit_check_in?: string | null;
  last_visit_check_in?: string | null;
  first_visit_location?: any;
  last_visit_location?: any;
  active_market_hours?: number | null;
}

interface SummaryStats {
  totalPresent: number;
  totalAbsent: number;
  totalHalfDay: number;
  totalOnLeave: number;
  averageHours: number;
  totalEmployees: number;
}

interface DailySummary {
  date: string;
  total_employees: number;
  total_present: number;
  total_absent: number;
  total_on_leave: number;
  total_half_day: number;
  avg_hours: number;
  total_hours_sum: number;
}

const LiveAttendanceMonitoring = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
  const [filteredData, setFilteredData] = useState<AttendanceData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    totalPresent: 0,
    totalAbsent: 0,
    totalHalfDay: 0,
    totalOnLeave: 0,
    averageHours: 0,
    totalEmployees: 0,
  });
  // Tracks whether summary came from pre-computed table or client fallback
  const [summaryFromCache, setSummaryFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLocationId, setShowLocationId] = useState<string | null>(null);
  const [detailsDialog, setDetailsDialog] = useState<{
    open: boolean;
    type: 'present' | 'absent' | 'half-day';
    title: string;
  }>({ open: false, type: 'present', title: '' });

  // Fetch pre-computed daily summary (O(1) — single row read)
  const fetchDailySummary = useCallback(async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('attendance_daily_admin_summary')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (!error && data) {
        setSummaryStats({
          totalPresent: data.total_present,
          totalAbsent: data.total_absent,
          totalHalfDay: data.total_half_day,
          totalOnLeave: data.total_on_leave,
          averageHours: Number(data.avg_hours) || 0,
          totalEmployees: data.total_employees,
        });
        setSummaryFromCache(true);
        return true;
      }
    } catch {
      // Fall through to client-side calculation
    }
    return false;
  }, []);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    // Fetch summary O(1) first, then load detail rows
    fetchDailySummary(today);
    fetchUsers();
    fetchAttendanceData();
    
    // Real-time subscription: refresh summary + detail rows on any attendance change
    const channel = supabase
      .channel('attendance-monitoring')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          fetchDailySummary(format(new Date(), 'yyyy-MM-dd'));
          fetchAttendanceData();
        }
      )
      // Also listen for summary table updates
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_daily_admin_summary' },
        () => {
          fetchDailySummary(format(new Date(), 'yyyy-MM-dd'));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDailySummary]);

  useEffect(() => {
    applyFilters();
  }, [attendanceData, selectedUsers, searchQuery, dateFilter, startDateFilter, endDateFilter]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    }
  };

  const fetchAttendanceData = async () => {
    try {
      setIsLoading(true);

      // Fetch all attendance records
      const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
        .order('date', { ascending: false });

      if (attendanceError) throw attendanceError;

      // Get all users and their profiles
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('id, full_name, username');

      // Fetch visits for all users in this period
      const { data: visits } = await supabase
        .from('visits')
        .select('user_id, planned_date, check_in_time, check_in_location')
        .gte('planned_date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
        .not('check_in_time', 'is', null)
        .order('check_in_time', { ascending: true });

      if (allUsers) {
        const attendanceDataWithAbsent: AttendanceData[] = [];
        
        // Add existing attendance records with profile data and visit data
        attendance?.forEach(record => {
          const profile = allUsers.find(user => user.id === record.user_id);
          
          // Find visits for this user on this date
          const userVisitsToday = visits?.filter(v => 
            v.user_id === record.user_id && v.planned_date === record.date
          ) || [];
          
          // Calculate first/last check-in and active market hours
          let firstVisitCheckIn = null;
          let lastVisitCheckIn = null;
          let firstVisitLocation = null;
          let lastVisitLocation = null;
          let activeMarketHours = null;
          
          if (userVisitsToday.length > 0) {
            firstVisitCheckIn = userVisitsToday[0].check_in_time;
            lastVisitCheckIn = userVisitsToday[userVisitsToday.length - 1].check_in_time;
            firstVisitLocation = userVisitsToday[0].check_in_location;
            lastVisitLocation = userVisitsToday[userVisitsToday.length - 1].check_in_location;
          }
          
          // Active Market Hours. Prefer the stored total_hours (computed by the
          // trg_attendance_compute_hours DB trigger, so it is consistent with every
          // other attendance screen); fall back to deriving it from the timestamps.
          // A check-out at or before check-in is a data error, not zero hours — leave
          // it null so it renders as "--" instead of a misleading 0.0h.
          if (record.total_hours !== null && record.total_hours !== undefined) {
            activeMarketHours = Number(record.total_hours);
          } else if (record.check_in_time && record.check_out_time) {
            const checkInTime = new Date(record.check_in_time).getTime();
            const checkOutTime = new Date(record.check_out_time).getTime();
            const diff = (checkOutTime - checkInTime) / (1000 * 60 * 60);
            activeMarketHours = diff > 0 ? diff : null;
          }
          
          attendanceDataWithAbsent.push({
            ...record,
            profiles: profile ? {
              full_name: profile.full_name,
              username: profile.username
            } : null,
            first_visit_check_in: firstVisitCheckIn,
            last_visit_check_in: lastVisitCheckIn,
            first_visit_location: firstVisitLocation,
            last_visit_location: lastVisitLocation,
            active_market_hours: activeMarketHours
          });
        });

        // Check for users without attendance today and mark them as absent
        const today = format(new Date(), 'yyyy-MM-dd');
        const todaysAttendance = attendance?.filter(a => a.date === today) || [];
        const usersWithAttendanceToday = todaysAttendance.map(a => a.user_id);
        
        allUsers.forEach(user => {
          if (!usersWithAttendanceToday.includes(user.id)) {
            // Create absent record for today
            attendanceDataWithAbsent.push({
              id: `absent-${user.id}-${today}`,
              user_id: user.id,
              date: today,
              check_in_time: null,
              check_out_time: null,
              total_hours: null,
              status: 'absent',
              check_in_location: null,
              check_out_location: null,
              check_in_address: null,
              check_out_address: null,
              check_in_photo_url: null,
              check_out_photo_url: null,
              face_match_confidence: null,
              face_match_confidence_out: null,
              face_verification_status: null,
              face_verification_status_out: null,
              profiles: {
                full_name: user.full_name,
                username: user.username
              },
              first_visit_check_in: null,
              last_visit_check_in: null,
              first_visit_location: null,
              last_visit_location: null,
              active_market_hours: null
            });
          }
        });
        
        setAttendanceData(attendanceDataWithAbsent);
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      toast.error('Failed to fetch attendance data');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...attendanceData];

    // Filter by selected users
    if (selectedUsers.length > 0) {
      filtered = filtered.filter(record => selectedUsers.includes(record.user_id));
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(record =>
        record.profiles?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by date period
    const today = new Date();
    if (dateFilter === 'day') {
      const todayStr = format(today, 'yyyy-MM-dd');
      filtered = filtered.filter(record => record.date === todayStr);
    } else if (dateFilter === 'week') {
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      filtered = filtered.filter(record => record.date >= weekStartStr);
    } else if (dateFilter === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');
      filtered = filtered.filter(record => record.date >= monthStartStr);
    } else if (dateFilter === 'range' && startDateFilter && endDateFilter) {
      filtered = filtered.filter(record => 
        record.date >= startDateFilter && record.date <= endDateFilter
      );
    }

    setFilteredData(filtered);
    calculateSummaryStats(filtered);
  };

  // Client-side fallback: only used if pre-computed summary isn't available yet
  const calculateSummaryStats = (data: AttendanceData[]) => {
    // Skip client-side calculation if we already have data from the summary table
    if (summaryFromCache) return;

    const todaysData = data.filter(record => record.date === format(new Date(), 'yyyy-MM-dd'));
    
    const totalPresent = todaysData.filter(record => record.status === 'present' || record.status === 'regularized').length;
    const totalAbsent = todaysData.filter(record => record.status === 'absent').length;
    const totalHalfDay = todaysData.filter(record => record.status === 'half_day_leave' || record.status === 'half-day').length;
    const totalOnLeave = todaysData.filter(record => record.status === 'leave').length;
    
    // `!= null` rather than a truthy test: a genuine 0-hour day must still count
    // towards the average, otherwise it silently inflates the figure.
    const presentData = todaysData.filter(r => (r.status === 'present' || r.status === 'regularized') && r.total_hours != null);
    const totalHours = presentData.reduce((sum, record) => sum + (record.total_hours || 0), 0);
    const averageHours = presentData.length > 0 ? totalHours / presentData.length : 0;

    setSummaryStats({
      totalPresent,
      totalAbsent,
      totalHalfDay,
      totalOnLeave,
      averageHours,
      totalEmployees: todaysData.length,
    });
  };

  const handleUserSelection = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId));
    }
  };

  const handleSelectAll = () => {
    const filteredUsers = users.filter(user =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSelectedUsers(filteredUsers.map(user => user.id));
  };

  const handleClearSelection = () => {
    setSelectedUsers([]);
  };

  const getStatusIcon = (record: AttendanceData) => {
    const isToday = record.date === format(new Date(), 'yyyy-MM-dd');
    if (isToday) {
      if (record.first_visit_check_in && !record.last_visit_check_in) {
        return <span className="text-green-500" aria-label="Online">🟢</span>;
      } else if (record.last_visit_check_in) {
        return <span className="text-destructive" aria-label="Offline">🔴</span>;
      }
    }
    return null;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      present:        { color: 'bg-green-100 text-green-800', label: 'Present' },
      regularized:    { color: 'bg-blue-100 text-blue-800', label: 'Regularized' },
      absent:         { color: 'bg-red-100 text-red-800', label: 'Absent' },
      'half-day':     { color: 'bg-amber-100 text-amber-800', label: 'Half Day' },
      half_day_leave: { color: 'bg-amber-100 text-amber-800', label: 'Half Day Leave' },
      leave:          { color: 'bg-purple-100 text-purple-800', label: 'On Leave' },
      auto_closed:    { color: 'bg-orange-100 text-orange-800', label: 'Auto-Closed' },
    };

    const statusConfig = config[status] || { color: 'bg-muted text-muted-foreground', label: status };
    
    return (
      <Badge className={statusConfig.color}>
        {statusConfig.label}
      </Badge>
    );
  };

  const getFaceMatchBadge = (confidence: number | null | undefined) => {
    if (!confidence) return <span className="text-muted-foreground">--</span>;

    const percentage = Math.round(confidence);
    let colorClass = '';
    let icon = '';

    if (confidence >= 70) {
      colorClass = 'bg-green-100 text-green-800 border-green-300';
      icon = '✓';
    } else if (confidence >= 40) {
      colorClass = 'bg-amber-100 text-amber-800 border-amber-300';
      icon = '⚠';
    } else {
      colorClass = 'bg-red-100 text-red-800 border-red-300';
      icon = '✗';
    }

    return (
      <Badge className={`${colorClass} border`}>
        {icon} {percentage}%
      </Badge>
    );
  };

  const formatLocation = (location: any, address: string | null) => {
    if (!location) return '--';
    
    const placeName = address || 'Unknown Location';
    const lat = location.latitude?.toFixed(4) || '0.0000';
    const lng = location.longitude?.toFixed(4) || '0.0000';
    
    return `${placeName} (${lat}, ${lng})`;
  };

  const exportData = async () => {
    // Create CSV content
    const headers = ['Employee', 'Date', 'First Check In', 'Last Check Out', 'Active Market Hours', 'Check In Location', 'Check Out Location'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(record => [
        record.profiles?.full_name || 'Unknown',
        record.date,
        record.check_in_time ? format(new Date(record.check_in_time), 'HH:mm') : '--',
        record.check_out_time ? format(new Date(record.check_out_time), 'HH:mm') : '--',
        record.active_market_hours != null ? `${record.active_market_hours.toFixed(2)}h` : '--',
        formatLocation(record.check_in_location, record.check_in_address),
        formatLocation(record.check_out_location, record.check_out_address)
      ].join(','))
    ].join('\n');

    // Download using cross-platform utility
    await downloadCSV(csvContent, `attendance-report-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Summary Dashboard — reads from pre-computed attendance_daily_admin_summary (O(1)) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalEmployees}</div>
            {summaryFromCache && <p className="text-xs text-muted-foreground mt-1">Pre-computed</p>}
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setDetailsDialog({ open: true, type: 'present', title: 'Present Today' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{summaryStats.totalPresent}</div>
            {summaryStats.totalEmployees > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((summaryStats.totalPresent / summaryStats.totalEmployees) * 100)}% attendance
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setDetailsDialog({ open: true, type: 'absent', title: 'Absent Today' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summaryStats.totalAbsent}</div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setDetailsDialog({ open: true, type: 'half-day', title: 'Half Day / On Leave' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summaryStats.totalOnLeave + summaryStats.totalHalfDay}</div>
            {summaryStats.totalHalfDay > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{summaryStats.totalHalfDay} half-day</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Hours</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{summaryStats.averageHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground mt-1">per present employee</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search users by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>View Period</Label>
              <Select value={dateFilter} onValueChange={(value) => {
                setDateFilter(value);
                if (value !== 'range') {
                  setStartDateFilter('');
                  setEndDateFilter('');
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="range">Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateFilter === 'range' && (
              <>
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* User Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Select Users ({selectedUsers.length} selected)</Label>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearSelection}>
                  Clear
                </Button>
              </div>
            </div>
            
            <Select onValueChange={(value) => handleUserSelection(value, true)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select users to monitor..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id} className="flex items-center space-x-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>{user.full_name} ({user.username})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Show selected users */}
            {selectedUsers.length > 0 && (
              <div className="mt-2 p-2 bg-gray-50 rounded">
                <div className="text-xs text-gray-600 mb-1">Selected users:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedUsers.map(userId => {
                    const user = users.find(u => u.id === userId);
                    return user ? (
                      <div key={userId} className="flex items-center gap-1 bg-white px-2 py-1 rounded text-xs">
                        <span>{user.full_name}</span>
                        <button 
                          onClick={() => handleUserSelection(userId, false)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <Button onClick={exportData} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Live Attendance Data</CardTitle>
          <CardDescription>
            Real-time attendance monitoring with status indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>First Check In</TableHead>
                    <TableHead>Last Check Out</TableHead>
                    <TableHead>Active Market Hours</TableHead>
                    <TableHead>Face Match Check In</TableHead>
                    <TableHead>Face Match Check Out</TableHead>
                    <TableHead>Check In Location</TableHead>
                    <TableHead>Check Out Location</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredData.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {record.profiles?.full_name || 'Unknown User'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(record.date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      {record.check_in_photo_url ? (
                        <img
                          src={supabase.storage.from('attendance-photos').getPublicUrl(record.check_in_photo_url).data.publicUrl}
                          alt="Check-in photo"
                          className="w-16 h-16 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => window.open(supabase.storage.from('attendance-photos').getPublicUrl(record.check_in_photo_url).data.publicUrl, '_blank')}
                        />
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {record.check_in_time 
                          ? format(new Date(record.check_in_time), 'HH:mm')
                          : '--'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {record.check_out_time 
                          ? format(new Date(record.check_out_time), 'HH:mm')
                          : '--'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      {record.active_market_hours != null
                        ? `${Math.floor(record.active_market_hours)}h ${Math.round((record.active_market_hours % 1) * 60)}m`
                        : '--'}
                    </TableCell>
                    <TableCell>
                      {getFaceMatchBadge(record.face_match_confidence)}
                    </TableCell>
                    <TableCell>
                      {getFaceMatchBadge(record.face_match_confidence_out)}
                    </TableCell>
                    <TableCell>
                      {record.check_in_location ? (
                        <div className="relative">
                          <button
                            onClick={() => setShowLocationId(showLocationId === `${record.id}-checkin` ? null : `${record.id}-checkin`)}
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <MapPin className="h-5 w-5" />
                          </button>
                          {showLocationId === `${record.id}-checkin` && (
                            <div className="absolute z-10 mt-1 p-2 bg-popover border rounded-md shadow-lg text-xs whitespace-nowrap">
                              <div className="font-medium">{record.check_in_address || 'Unknown Location'}</div>
                              <div className="text-muted-foreground">
                                Lat: {record.check_in_location.latitude?.toFixed(4)}, 
                                Lng: {record.check_in_location.longitude?.toFixed(4)}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.check_out_location ? (
                        <div className="relative">
                          <button
                            onClick={() => setShowLocationId(showLocationId === `${record.id}-checkout` ? null : `${record.id}-checkout`)}
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <MapPin className="h-5 w-5" />
                          </button>
                          {showLocationId === `${record.id}-checkout` && (
                            <div className="absolute z-10 mt-1 p-2 bg-popover border rounded-md shadow-lg text-xs whitespace-nowrap">
                              <div className="font-medium">{record.check_out_address || 'Unknown Location'}</div>
                              <div className="text-muted-foreground">
                                Lat: {record.check_out_location.latitude?.toFixed(4)}, 
                                Lng: {record.check_out_location.longitude?.toFixed(4)}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {!isLoading && filteredData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No attendance data found for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>
      {/* Attendance Details Dialog */}
      <AttendanceDetailsDialog
        open={detailsDialog.open}
        onOpenChange={(open) => setDetailsDialog((prev) => ({ ...prev, open }))}
        title={detailsDialog.title}
        type={detailsDialog.type}
        records={filteredData.filter((record) => {
          const today = format(new Date(), 'yyyy-MM-dd');
          if (record.date !== today) return false;
          return record.status === detailsDialog.type;
        })}
      />
    </div>
  );
};

export default LiveAttendanceMonitoring;
