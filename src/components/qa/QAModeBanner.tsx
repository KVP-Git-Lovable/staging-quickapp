import { useQAMode } from '@/contexts/QAModeContext';

/**
 * QA-only top banner. Renders nothing in production builds (zero DOM cost).
 * z-[10000] is intentionally above the existing safe-area spacers in Layout.
 */
export const QAModeBanner = () => {
  const { isQAMode } = useQAMode();
  if (!isQAMode) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[10000] bg-yellow-400 text-black text-center text-xs font-semibold py-1 px-2 shadow"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)' }}
    >
      ⚠ QA MODE — writes to qa_* tables only
    </div>
  );
};
