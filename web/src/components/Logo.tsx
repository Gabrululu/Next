/** Hand-lettered wordmark. Font: Sedgwick Ave Display (Google Fonts, OFL). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-logo inline-block -rotate-3 leading-none tracking-normal ${className}`}>
      Next<span className="text-volt">.</span>
    </span>
  );
}
