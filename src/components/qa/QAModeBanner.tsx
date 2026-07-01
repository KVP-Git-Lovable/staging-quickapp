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
      className="fixed top-0 left-0 right-0 z-[10000] bg-yellow-400 text-black text-center text-[10px] leading-none font-semibold py-0.5 px-2 shadow"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)' }}
    >
      ⚠ QA MODE — mirrored tables route to qa_*; writes to other prod tables & unsafe RPCs are blocked
    </div>
  );
};
