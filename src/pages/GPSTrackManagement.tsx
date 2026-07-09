import React, { useState, useEffect } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, Clock, MapPin, Navigation, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CurrentLocationMap } from '@/components/CurrentLocationMap';
import { JourneyMap } from '@/components/JourneyMap';
import { cn } from '@/lib/utils';
import { UserSelector } from '@/components/UserSelector';
import { useSubordinates } from '@/hooks/useSubordinates';

interface GPSData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

interface AttendanceData {
  check_in_time: string;
  check_out_time: string | null;
}

const GPSTrackManagement = () => {
  const { hasAdminAccess, loading, user } = useAdminAccess();
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>(new Date());
  const [gpsData, setGpsData] = useState<GPSData[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [timeRange, setTimeRange] = useState<'full' | 'custom'>('full');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('19:00');

  // Use hierarchy-based subordinates
  const { subordinates, isManager, isLoading: subordinatesLoading } = useSubordinates();
  
  // State for user selection - 'self' means current user
  const [selectedUserId, setSelectedUserId] = useState<string>('self');

  // Get the actual user ID for data fetching
  const getActualUserId = (selectorValue: string): string => {
    if (selectorValue === 'self' || !selectorValue) {
      return user?.id || '';
    }
    return selectorValue;
  };

  const selectedMember = getActualUserId(selectedUserId);

  // Load GPS data based on selected member, date, and time range
  useEffect(() => {
    if (!selectedMember) return;

    const loadGPSData = async () => {
      setLoadingData(true);
      try {
        const dateStr = date.toISOString().split('T')[0];

        // First, get attendance data to determine actual login/logout times
        const { data: attendanceInfo, error: attendanceError } = await supabase
          .from('attendance')
          .select('check_in_time, check_out_time')
          .eq('user_id', selectedMember)
          .eq('date', dateStr)
          .single();

        if (attendanceError && attendanceError.code !== 'PGRST116') {
          console.error('Error loading attendance:', attendanceError);
        }

        setAttendanceData(attendanceInfo || null);

        // Build query based on time range selection
        let query = supabase
          .from('gps_tracking')
          .select('latitude, longitude, accuracy, timestamp')
          .eq('user_id', selectedMember)
          .eq('date', dateStr)
          .order('timestamp', { ascending: true });

        // Apply time filtering based on selection
        if (timeRange === 'full' && attendanceInfo) {
          // Filter by actual login/logout time
          if (attendanceInfo.check_in_time) {
            query = query.gte('timestamp', attendanceInfo.check_in_time);
          }
          if (attendanceInfo.check_out_time) {
            query = query.lte('timestamp', attendanceInfo.check_out_time);
          }
        } else if (timeRange === 'custom') {
          // Filter by custom time range
          const startDateTime = `${dateStr}T${startTime}:00`;
          const endDateTime = `${dateStr}T${endTime}:00`;
          query = query.gte('timestamp', startDateTime).lte('timestamp', endDateTime);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data) {
          setGpsData(
            data.map((d) => ({
              latitude: parseFloat(d.latitude as unknown as string),
              longitude: parseFloat(d.longitude as unknown as string),
              accuracy: d.accuracy ? parseFloat(d.accuracy as unknown as string) : 0,
              timestamp: new Date(d.timestamp),
            }))
          );
        }
      } catch (error) {
        console.error('Error loading GPS data:', error);
        toast.error('Failed to load GPS tracking data');
      } finally {
        setLoadingData(false);
      }
    };

    loadGPSData();
  }, [selectedMember, date, timeRange, startTime, endTime]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Navigation className="h-8 w-8" />
              GPS Track Management
            </h1>
            <p className="text-muted-foreground">
              Monitor team member locations and tracking history
            </p>
          </div>
        </div>

        <Tabs defaultValue="live" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="live">Live Tracking</TabsTrigger>
            <TabsTrigger value="history">Historical Tracking</TabsTrigger>
          </TabsList>

          {/* Live Tracking Tab */}
          <TabsContent value="live" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Live Location Monitoring</CardTitle>
                <CardDescription>
                  View real-time location of team members based on your hierarchy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">
                      Select Team Member
                    </label>
                    <UserSelector
                      selectedUserId={selectedUserId}
                      onUserChange={setSelectedUserId}
                      showAllOption={false}
                      className="w-full max-w-full h-10"
                    />
                    {!isManager && !subordinatesLoading && (
                      <p className="text-sm text-muted-foreground mt-2">
                        You can only view your own location data.
                      </p>
                    )}
                  </div>
                </div>

                {selectedMember && (
                  <CurrentLocationMap userId={selectedMember} height="500px" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Historical Tracking Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Historical GPS Tracking</CardTitle>
                <CardDescription>
                  View past location tracking data based on your hierarchy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* User and Date Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Select Team Member
                    </label>
                    <UserSelector
                      selectedUserId={selectedUserId}
                      onUserChange={setSelectedUserId}
                      showAllOption={false}
                      className="w-full max-w-full h-10"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Select Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !date && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Time Range Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium block">Tracking Duration</label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                      variant={timeRange === 'full' ? 'default' : 'outline'}
                      onClick={() => setTimeRange('full')}
                      className="flex-1"
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Full Day (Login to Logout)
                    </Button>
                    <Button
                      variant={timeRange === 'custom' ? 'default' : 'outline'}
                      onClick={() => setTimeRange('custom')}
                      className="flex-1"
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Custom Time Range
                    </Button>
                  </div>

                  {timeRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Attendance Info */}
                {attendanceData && timeRange === 'full' && (
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Attendance Information
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Check-in:</span>
                        <span className="ml-2 font-medium">
                          {attendanceData.check_in_time
                            ? format(new Date(attendanceData.check_in_time), 'p')
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Check-out:</span>
                        <span className="ml-2 font-medium">
                          {attendanceData.check_out_time
                            ? format(new Date(attendanceData.check_out_time), 'p')
                            : 'Not yet'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Journey Map */}
                {selectedMember && (
                  <>
                    {loadingData ? (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : (
                      <>
                        <JourneyMap positions={gpsData} height="500px" />

                        {/* Statistics */}
                        {gpsData.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-2xl font-bold">{gpsData.length}</div>
                                <p className="text-xs text-muted-foreground">Total Points</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-2xl font-bold">
                                  {format(gpsData[0].timestamp, 'p')}
                                </div>
                                <p className="text-xs text-muted-foreground">Start Time</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-2xl font-bold">
                                  {format(gpsData[gpsData.length - 1].timestamp, 'p')}
                                </div>
                                <p className="text-xs text-muted-foreground">End Time</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-6">
                                <div className="text-2xl font-bold">
                                  {(
                                    gpsData.reduce((sum, d) => sum + d.accuracy, 0) /
                                    gpsData.length
                                  ).toFixed(0)}
                                  m
                                </div>
                                <p className="text-xs text-muted-foreground">Avg Accuracy</p>
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default GPSTrackManagement;
