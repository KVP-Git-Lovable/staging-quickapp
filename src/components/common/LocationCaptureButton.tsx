import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  onChange: (lat: number | null, lng: number | null) => void;
}

export const LocationCaptureButton = ({ latitude, longitude, onChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const has = typeof latitude === 'number' && typeof longitude === 'number';

  const capture = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(Number(pos.coords.latitude.toFixed(7)), Number(pos.coords.longitude.toFixed(7)));
        toast.success('Location captured');
        setLoading(false);
      },
      (err) => {
        toast.error(err.message || 'Unable to capture location');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button type="button" variant="outline" size="sm" onClick={capture} disabled={loading}>
        {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 mr-1.5" />}
        {has ? 'Recapture location' : 'Use current location'}
      </Button>
      {has && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
          <CheckCircle2 className="w-3 h-3" />
          {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
        </span>
      )}
      {has && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onChange(null, null)}>
          Clear
        </Button>
      )}
    </div>
  );
};

export default LocationCaptureButton;
