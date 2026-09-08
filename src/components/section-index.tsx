type SectionIndexItem = Readonly<{
  href: string;
  label: string;
  count?: number | string;
  status?: string;
}>;

type SectionIndexProps = Readonly<{
  items: readonly SectionIndexItem[];
  label?: string;
  compact?: boolean;
}>;

export function SectionIndex({
  items,
  label = "Page sections",
  compact = false,
}: SectionIndexProps) {
  return (
    <nav
      className={`compact-section-index${compact ? " compact-section-index-subtle" : ""}`}
      aria-label={label}
    >
      <div className="compact-section-index-track">
        {items.map((item) => (
          <a className="compact-section-index-link" href={item.href} key={item.href}>
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span className="compact-section-index-count">{item.count}</span>
            ) : null}
            {item.status ? (
              <span className="compact-section-index-status">{item.status}</span>
            ) : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
