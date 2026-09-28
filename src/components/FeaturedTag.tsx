/**
 * The copper "Featured" tag (migration 030, DESIGN §5.5). Guest pages and the TV only; admin shows a star.
 * The color is never used alone: anything featured carries this tag.
 */
export function FeaturedTag({ className = "" }: { className?: string }) {
  return <span className={`feat-tag${className ? ` ${className}` : ""}`}>Featured</span>;
}
