export interface SortOption<V extends string> {
  value: V;
  label: string;
}

export default function SortOptions<V extends string>({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<SortOption<V>>;
  selected: V;
  onSelect: (value: V) => void;
}) {
  return (
    <div className="sort-options">
      {options.map((o) => (
        <button
          key={o.value}
          className={`sort-chip ${selected === o.value ? 'active' : ''}`}
          onClick={() => onSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
