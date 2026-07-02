import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ThumbsUp, ThumbsDown, Mic, Square, Play, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { VoiceSearchButton } from '@/components/VoiceSearchButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activityId: string;
  visitId: string | null;
  onCompleted?: () => void;
}

type Outcome = 'productive' | 'unproductive' | null;

export const ActivityCompletionDialog = ({ open, onOpenChange, activityId, visitId, onCompleted }: Props) => {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [summary, setSummary] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) {
      setOutcome(null);
      setSummary('');
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecording(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error('Recording failed:', err);
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
  };

  const appendTranscript = (text: string) => {
    setSummary((prev) => (prev ? `${prev.trim()} ${text}`.trim() : text));
  };

  const canConfirm = !!outcome && summary.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm || !visitId) return;
    setSubmitting(true);
    try {
      let voicePath: string | null = null;
      if (audioBlob) {
        const path = `${activityId}/${Date.now()}.webm`;
        const { error: upErr } = await supabase.storage
          .from('activity-voice-notes')
          .upload(path, audioBlob, { contentType: 'audio/webm', upsert: false });
        if (upErr) throw upErr;
        voicePath = path;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('activity_visit_action', {
        p_visit_id: visitId,
        p_activity_event_id: activityId,
        p_action: 'complete',
        p_actor: user?.id,
        p_outcome: outcome,
        p_summary: summary.trim(),
        p_voice_url: voicePath,
      } as any);
      if (error) throw error;

      toast.success('Activity completed');
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      onOpenChange(false);
      onCompleted?.();
    } catch (err: any) {
      console.error('Complete activity failed:', err);
      toast.error(err?.message || 'Failed to complete activity');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Complete Activity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Outcome</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button
                type="button"
                variant={outcome === 'productive' ? 'default' : 'outline'}
                className={outcome === 'productive' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                onClick={() => setOutcome('productive')}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Productive
              </Button>
              <Button
                type="button"
                variant={outcome === 'unproductive' ? 'default' : 'outline'}
                className={outcome === 'unproductive' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
                onClick={() => setOutcome('unproductive')}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Unproductive
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-semibold">Summary <span className="text-rose-500">*</span></Label>
              <VoiceSearchButton onSearchResult={appendTranscript} />
            </div>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Type or tap the mic to speak…"
              rows={4}
            />
          </div>

          <div>
            <Label className="text-sm font-semibold">Voice note (optional)</Label>
            <div className="mt-2 flex items-center gap-2">
              {!recording && !audioBlob && (
                <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                  <Mic className="h-4 w-4 mr-2" /> Record
                </Button>
              )}
              {recording && (
                <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="animate-pulse">
                  <Square className="h-4 w-4 mr-2" /> Stop
                </Button>
              )}
              {audioUrl && !recording && (
                <>
                  <audio src={audioUrl} controls className="h-8 flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={discardRecording}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
