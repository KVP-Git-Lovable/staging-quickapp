import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { RetailerExternalDBLookup } from '@/components/admin/RetailerExternalDBLookup';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

const RetailerExternalDBPage: React.FC = () => {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  // Poll job progress
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('geocoding_jobs' as any)
        .select('*')
        .eq('id', jobId)
        .single();
      if (data) {
        setJobStatus(data);
        if ((data as any).status === 'completed' || (data as any).status === 'failed') {
          clearInterval(interval);
          if ((data as any).status === 'completed') {
            toast.success(`Geocoding complete! ${(data as any).geocoded_count} geocoded, ${(data as any).failed_count} failed.`);
          } else {
            toast.error(`Geocoding failed: ${(data as any).error_message || 'Unknown error'}`);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const handleGeocodeAll = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('geocode-retailer-ext', {
        body: { mode: 'geocode_all' },
      });
      if (error) throw error;
      if (data.job_id) {
        setJobId(data.job_id);
        setJobStatus({ status: 'processing', total_records: data.total_records, processed_records: 0 });
        toast.info(`Geocoding ${data.total_records} records in the background...`);
      } else {
        toast.info(data.message || 'All records already geocoded.');
      }
    } catch (err: any) {
      toast.error(`Failed to start geocoding: ${err.message}`);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const isJobRunning = jobStatus && jobStatus.status === 'processing';
  const progressPercent = jobStatus && jobStatus.total_records > 0
    ? Math.round((jobStatus.processed_records / jobStatus.total_records) * 100)
    : 0;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <AdminPageHeader
              title="Retailer External Database"
              subtitle="Browse external grocery retailer data by state and city (with Address and category)"
            />
            <Button
              variant="outline"
              onClick={() => navigate('/admin/retailer-unsorted')}
              className="flex items-center gap-2"
            >
              View other retailers
            </Button>
          </div>

          <RetailerExternalDBLookup />
        </div>
      </div>
    </Layout>
  );
};

export default RetailerExternalDBPage;
