import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";

const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

interface SectionPlaceholderProps {
  icon: any;
  title: string;
  description: string;
  /** Optional shortcut to a page that already exists and belongs to this section. */
  link?: { label: string; to: string };
}

/**
 * Stand-in for a section whose screen hasn't been built yet. The tab bar routes
 * here so no tab is a dead end while the sections are filled in.
 */
export function SectionPlaceholder({ icon: Icon, title, description, link }: SectionPlaceholderProps) {
  const navigate = useNavigate();

  return (
    <div
      className="bg-white rounded-[20px] px-6 py-12 flex flex-col items-center text-center"
      style={{ border: `1px solid ${LINE}` }}
    >
      <div className="w-[52px] h-[52px] rounded-[16px] bg-[#f2edff] text-[#5A2DD8] flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-[17px] font-bold tracking-tight mt-4" style={{ color: INK }}>{title}</div>
      <p className="text-[13px] mt-2 max-w-[420px] leading-relaxed" style={{ color: SEC }}>{description}</p>
      <div className="text-[11px] mt-3 uppercase tracking-[0.14em] font-semibold" style={{ color: MUT }}>
        Coming next
      </div>

      {link && (
        <button
          onClick={() => navigate(link.to)}
          className="mt-5 text-[12.5px] rounded-[10px] px-3.5 py-2 inline-flex items-center gap-1.5 hover:bg-[#f4f5f9] transition-colors"
          style={{ border: `1px solid ${LINE}`, color: SEC }}
        >
          {link.label} <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
