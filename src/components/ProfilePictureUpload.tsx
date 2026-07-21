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
      <Avatar className={`${sizeClasses[size]} border-4 border-white shadow-elegant cursor-pointer`}>
        <AvatarImage src={signedPhotoUrl || undefined} />
        <AvatarFallback className="text-4xl">{fullName.charAt(0)}</AvatarFallback>
      </Avatar>
      <Button
        size="icon"
        variant="secondary"
        className="absolute bottom-0 right-0 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => setShowOptions(true)}
        disabled={isUploading}
      >
        {isUploading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
      </Button>

      {/* Options Dialog */}
      <Dialog open={showOptions} onOpenChange={setShowOptions}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Update Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button variant="outline" className="w-full justify-start gap-3" onClick={startCamera}>
              <Video className="h-5 w-5" />
              Take Photo with Camera
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => { setShowOptions(false); fileInputRef.current?.click(); }}>
              <Upload className="h-5 w-5" />
              Upload from Files
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => { if (!open) stopCamera(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Take a Photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              <Button variant="outline" onClick={stopCamera}>Cancel</Button>
              <Button onClick={capturePhoto}>
                <Camera className="h-4 w-4 mr-2" /> Capture
              </Button>
            </div>
          </div>
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
