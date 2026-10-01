// A row of colour swatches plus a custom colour picker.

const PRESETS = ["#66ccff", "#7c5cff", "#13ce66", "#ffd166", "#ff7849", "#ff4d8d", "#ffffff", "#00e5ff"];

export function ColorChoices({
  value,
  onChange,
  presets = PRESETS,
  allowDefault,
}: {
  /** null means "default" (when `allowDefault` is given). */
  value: string | null;
  onChange: (c: string | null) => void;
  presets?: string[];
  allowDefault?: string;
}) {
  return (
    <div className="swatches">
      {allowDefault && (
        <button className={`swatch default ${value === null ? "on" : ""}`} onClick={() => onChange(null)} title={allowDefault}>
          A
        </button>
      )}
      {presets.map((c) => (
        <button key={c} className={`swatch ${value?.toLowerCase() === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
      <input type="color" value={value ?? presets[0]} onChange={(e) => onChange(e.target.value)} title="自定义颜色" />
    </div>
  );
}
