import React from 'react';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceAssistantBarProps {
  isRecording: boolean;
  isProcessing: boolean;
  isGreeting: boolean;
  transcript: string;
  error: string | null;
  onTapToSpeak: () => void;
  onStopRecording: () => void;
  languageLabel: string;
  itemCount?: number;
}

export const VoiceAssistantBar: React.FC<VoiceAssistantBarProps> = ({
  isRecording,
  isProcessing,
  isGreeting,
  transcript,
  error,
  onTapToSpeak,
  onStopRecording,
  languageLabel,
  itemCount = 0,
}) => {
  const isBusy = isRecording || isProcessing || isGreeting;

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Main mic button */}
      <div className="relative">
        <button
          onClick={isRecording ? onStopRecording : onTapToSpeak}
          disabled={isProcessing || isGreeting}
          className={cn(
            "relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
            isRecording
              ? "bg-emerald-500 text-white scale-110 shadow-emerald-500/40"
              : isGreeting
              ? "bg-emerald-500 text-white shadow-emerald-500/30 animate-pulse"
              : isProcessing
              ? "bg-gray-400 text-white cursor-wait shadow-gray-400/30"
              : "bg-blue-500 text-white hover:bg-blue-600 hover:scale-105 active:scale-95 shadow-blue-500/30"
          )}
        >
          {isProcessing ? (
            <Loader2 size={40} className="animate-spin" />
          ) : isGreeting ? (
            <Volume2 size={40} />
          ) : isRecording ? (
            <MicOff size={40} />
          ) : (
            <Mic size={40} />
          )}

          {/* Pulsing rings when recording */}
          {isRecording && (
            <>
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-40" />
              <span className="absolute -inset-3 rounded-full border border-emerald-300/30 animate-ping opacity-25" style={{ animationDelay: '0.3s' }} />
              <span className="absolute -inset-6 rounded-full border border-emerald-200/20 animate-ping opacity-15" style={{ animationDelay: '0.6s' }} />
            </>
          )}
        </button>

        {/* Item count badge */}
        {itemCount > 0 && !isBusy && (
          <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
            {itemCount}
          </span>
        )}
      </div>

      {/* Sound wave bars when recording */}
      {isRecording && (
        <div className="flex items-end gap-1 h-6">
          {[0, 1, 2, 3, 4, 3, 2, 1, 0].map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-emerald-500"
              style={{
                animation: `voiceWave 0.8s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.08}s`,
                height: '6px',
              }}
            />
          ))}
        </div>
      )}

      {/* Status text */}
      <div className="text-center space-y-1">
        {isProcessing ? (
          <p className="text-sm font-medium text-muted-foreground">Processing your order...</p>
        ) : isGreeting ? (
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saathi is greeting you...</p>
        ) : isRecording ? (
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Listening... Tap to stop</p>
        ) : (
          <>
            <p className="text-base font-semibold text-foreground">Tap to speak</p>
            <p className="text-xs text-muted-foreground">
              Say your order clearly after tapping
            </p>
            {itemCount > 0 && (
              <p className="text-xs text-emerald-600 font-medium mt-1">You can add more items anytime</p>
            )}
          </>
        )}
      </div>

      {/* Live transcript */}
      {(isRecording || isProcessing) && transcript && (
        <div className="w-full max-w-sm mx-auto bg-muted/50 rounded-xl p-3 border border-border">
          <p className="text-sm text-muted-foreground italic text-center">"{transcript}"</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center max-w-sm">{error}</p>
      )}

      <style>{`
        @keyframes voiceWave {
          0% { height: 4px; }
          100% { height: 22px; }
        }
      `}</style>
    </div>
  );
};
