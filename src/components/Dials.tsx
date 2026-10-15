import { APERTURE_VALUES, ISO_VALUES, SHUTTER_VALUES, formatAperture, formatShutter } from "../lib/exposure";

type Props = {
  iso: number;
  shutter: number;
  aperture: number;
  /** +1 lets in more light. −1 lets in less. */
  onIso: (delta: number) => void;
  onShutter: (delta: number) => void;
  onAperture: (delta: number) => void;
};

export function ExposureDials({ iso, shutter, aperture, onIso, onShutter, onAperture }: Props) {
  const slowest = SHUTTER_VALUES[0].seconds;
  const fastest = SHUTTER_VALUES[SHUTTER_VALUES.length - 1].seconds;
  return (
    <div className="meter">
      <Dial label="ISO" value={String(iso)} dark={iso === ISO_VALUES[0]} bright={iso === ISO_VALUES[ISO_VALUES.length - 1]} onStep={onIso} />
      <Dial
        label="快门"
        value={formatShutter(shutter)}
        dark={shutter === fastest}
        bright={shutter === slowest}
        decrease="加快快门"
        increase="放慢快门"
        onStep={onShutter}
      />
      <Dial
        label="光圈"
        value={formatAperture(aperture)}
        dark={aperture === APERTURE_VALUES[APERTURE_VALUES.length - 1]}
        bright={aperture === APERTURE_VALUES[0]}
        decrease="缩小光圈"
        increase="开大光圈"
        onStep={onAperture}
      />
    </div>
  );
}

function Dial({
  label,
  value,
  dark,
  bright,
  decrease = `降低${label}`,
  increase = `提高${label}`,
  onStep,
}: {
  label: string;
  value: string;
  dark: boolean;
  bright: boolean;
  decrease?: string;
  increase?: string;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="chip ev-chip">
      <span className="meta">{label}</span>
      <button type="button" aria-label={decrease} disabled={dark} onClick={() => onStep(-1)}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label={increase} disabled={bright} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}
