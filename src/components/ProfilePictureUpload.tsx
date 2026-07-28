import { useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Video, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSignedUrl } from "@/hooks/useSignedUrl";

interface ProfilePictureUploadProps {
  userId: string;
  currentPhotoUrl?: string;
  fullName: string;
  onPhotoUpdate: (newUrl: string) => void;
  size?: "sm" | "md" | "lg" | "xl";
}

export const ProfilePictureUpload = ({
  userId,
  currentPhotoUrl,
  fullName,
  onPhotoUpdate,
  size = "xl",
}: ProfilePictureUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const signedPhotoUrl = useSignedUrl(currentPhotoUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-40 h-40",
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  }, [stream]);

  const startCamera = async () => {
    setShowOptions(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 }
      });
      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch {
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      stopCamera();
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      await uploadFile(file);
    }, "image/jpeg", 0.9);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/profile_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("employee-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("employee-photos")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ profile_picture_url: urlData.publicUrl, onboarding_completed: true })
        .eq("id", userId);

      if (updateError) throw updateError;

      onPhotoUpdate(urlData.publicUrl);
      toast.success("Profile picture updated!");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setShowOptions(false);
    await uploadFile(file);
  };

  return (
    <div className="relative group">
      <Avatar
        className={`${sizeClasses[size]} border-4 border-white shadow-elegant cursor-pointer`}
        onClick={() => setShowViewer(true)}
      >
        <AvatarImage src={signedPhotoUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-4xl">{fullName.charAt(0)}</AvatarFallback>
      </Avatar>
      <Button
        size="icon"
        variant="secondary"
        className="absolute bottom-0 right-0 rounded-full shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setShowOptions(true); }}
        disabled={isUploading}
      >
        {isUploading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
      </Button>

      {/* Viewer Dialog */}
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
          <div className="relative">
            {/* Photo hero */}
            <div className="relative w-full aspect-square bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
              {signedPhotoUrl ? (
                <img src={signedPhotoUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="text-7xl font-semibold text-muted-foreground">{fullName.charAt(0)}</div>
              )}
              {/* Gradient scrim for legibility */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/70 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent" />
            </div>

            {/* Name overlay */}
            <div className="absolute bottom-0 inset-x-0 px-5 pb-4">
              <DialogHeader className="space-y-0.5 text-left">
                <DialogTitle className="text-xl font-semibold">{fullName}</DialogTitle>
                <p className="text-xs text-muted-foreground">Profile photo</p>
              </DialogHeader>
            </div>
          </div>

          <div className="flex gap-2 px-5 pb-5 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setShowViewer(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => { setShowViewer(false); setShowOptions(true); }}
              className="flex-1 gap-2 rounded-xl"
            >
              <Camera className="h-4 w-4" />
              {signedPhotoUrl ? "Change" : "Add photo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Options Dialog */}
      <Dialog open={showOptions} onOpenChange={setShowOptions}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Update profile photo</DialogTitle>
            <p className="text-sm text-muted-foreground">Choose how you'd like to add your picture.</p>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={startCamera}
              className="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Take a photo</p>
                <p className="text-xs text-muted-foreground">Use your device camera</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setShowOptions(false); fileInputRef.current?.click(); }}
              className="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Upload from files</p>
                <p className="text-xs text-muted-foreground">JPG or PNG, up to 5MB</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => { if (!open) stopCamera(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-0 bg-foreground text-background shadow-2xl">
          <div className="relative">
            <div className="relative w-full aspect-[3/4] bg-black overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

              {/* Face guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[62%] aspect-[3/4] rounded-[50%] border-2 border-background/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>

              {/* Top scrim + title */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
              <DialogHeader className="absolute inset-x-0 top-0 px-5 pt-4 text-left space-y-0.5">
                <DialogTitle className="text-base font-semibold text-white">Take a photo</DialogTitle>
                <p className="text-xs text-white/70">Center your face inside the oval</p>
              </DialogHeader>

              {/* Bottom scrim + controls */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-7 pb-7">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={capturePhoto}
                  aria-label="Capture photo"
                  className="group relative h-[70px] w-[70px] rounded-full ring-2 ring-white/90 p-1.5 transition-transform active:scale-95"
                >
                  <span className="block h-full w-full rounded-full bg-white shadow-lg transition-colors group-hover:bg-white/85" />
                </button>

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
                  <Camera className="h-4 w-4 text-white/80" />
                </div>
              </div>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>



      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
};
