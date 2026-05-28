export interface SubTab<K extends string> {
  key: K;
  label: string;
}

export default function SubTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<SubTab<K>>;
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="subtabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`subtab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
