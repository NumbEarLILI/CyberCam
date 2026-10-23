type ArtProps = { id: string };

export function CameraArt({ id }: ArtProps) {
  return (
    <svg className="product" viewBox="0 0 220 150" aria-hidden="true">
      <ellipse cx="110" cy="136" rx="74" ry="7" fill="rgba(0,0,0,0.28)" />
      {cameraBody(id)}
    </svg>
  );
}

export function FilmArt({ id }: ArtProps) {
  const film = FILM_LOOK[id] ?? FILM_LOOK["portra-400"];
  return (
    <svg className="product" viewBox="0 0 100 148" aria-hidden="true">
      <ellipse cx="50" cy="140" rx="26" ry="5" fill="rgba(0,0,0,0.28)" />
      <rect x="28" y="34" width="44" height="96" rx="7" fill="#161616" />
      <ellipse cx="50" cy="36" rx="22" ry="8" fill="#2c2c2c" />
      <rect x="43" y="18" width="14" height="20" rx="2" fill="#3a3a3a" />
      <rect x="47" y="14" width="6" height="8" rx="1" fill="#d0d0d0" />
      <path d="M30 78c8 6 32 6 40 0v18c-8 6-32 6-40 0V78z" fill="#111" />
      <rect x="28" y="48" width="44" height="58" fill={film.label} />
      {film.band ? <rect x="28" y={film.bandY} width="44" height={film.bandH} fill={film.band} /> : null}
      <text x="50" y="64" textAnchor="middle" fill={film.ink} fontFamily="Outfit, sans-serif" fontSize={film.brandSize ?? 7} fontWeight="700">
        {film.brand}
      </text>
      <text x="50" y="82" textAnchor="middle" fill={film.ink} fontFamily="Outfit, sans-serif" fontSize={film.titleSize ?? 11} fontWeight="700">
        {film.title}
      </text>
      <text x="50" y="96" textAnchor="middle" fill={film.ink} fontFamily="Outfit, sans-serif" fontSize="8">
        {film.iso}
      </text>
      <rect x="36" y="118" width="28" height="6" rx="1" fill="#0c0c0c" />
    </svg>
  );
}

const FILM_LOOK: Record<
  string,
  {
    label: string;
    ink: string;
    brand: string;
    title: string;
    iso: string;
    band?: string;
    bandY: number;
    bandH: number;
    brandSize?: number;
    titleSize?: number;
  }
> = {
  "portra-400": { label: "#d9c7a2", ink: "#1c1a16", brand: "KODAK", title: "PORTRA", iso: "400", band: "#2f6a45", bandY: 48, bandH: 6, titleSize: 10 },
  "portra-160": { label: "#efe4cf", ink: "#1c1a16", brand: "KODAK", title: "PORTRA", iso: "160", band: "#c4a36a", bandY: 48, bandH: 6, titleSize: 10 },
  "gold-200": { label: "#ffd000", ink: "#1a1208", brand: "KODAK", title: "GOLD", iso: "200", band: "#e23b2a", bandY: 48, bandH: 7 },
  "ektar-100": { label: "#141414", ink: "#f4f1ea", brand: "KODAK", title: "EKTAR", iso: "100", band: "#e10600", bandY: 92, bandH: 14 },
  "tri-x-400": { label: "#f2c200", ink: "#161616", brand: "KODAK", title: "TRI-X", iso: "400", band: "#161616", bandY: 100, bandH: 6 },
  "hp5-plus": { label: "#f3d34a", ink: "#161616", brand: "ILFORD", title: "HP5", iso: "PLUS", band: "#d0122d", bandY: 48, bandH: 5 },
  "superia-400": { label: "#14924c", ink: "#f4fff6", brand: "FUJI", title: "SUPERIA", iso: "400", band: "#e4569a", bandY: 98, bandH: 8, titleSize: 8 },
  "velvia-50": { label: "#101610", ink: "#b6f27a", brand: "FUJI", title: "VELVIA", iso: "50", band: "#1d4d28", bandY: 48, bandH: 8, titleSize: 9 },
  "cinestill-800t": { label: "#1a1a1a", ink: "#f4f1ea", brand: "CINESTILL", title: "800T", iso: "800", band: "#ff2a2a", bandY: 98, bandH: 8, brandSize: 6 },
  "vista-200": { label: "#f7f4ee", ink: "#c8102e", brand: "AGFA", title: "VISTA", iso: "200", band: "#c8102e", bandY: 48, bandH: 8 },
};

function cameraBody(id: string) {
  switch (id) {
    case "contax-t2":
      return <Contax />;
    case "nikon-f3":
      return <Nikon />;
    case "canon-ae1":
      return <Canon />;
    case "olympus-mju-ii":
      return <Mju />;
    case "hasselblad-500cm":
      return <Hassy />;
    case "pentax-67":
      return <Pentax />;
    case "yashica-t4":
      return <Yashica />;
    case "ricoh-gr1":
      return <Ricoh />;
    case "minolta-x700":
      return <Minolta />;
    default:
      return <Leica />;
  }
}

function Leica() {
  return (
    <g>
      <polygon points="176,52 190,44 190,112 176,120" fill="#121212" />
      <polygon points="36,52 50,44 190,44 176,52" fill="#8e8e8a" />
      <rect x="36" y="52" width="140" height="68" rx="3" fill="#1a1a1a" />
      <rect x="36" y="52" width="140" height="10" fill="#c8c8c4" />
      <rect x="36" y="112" width="140" height="8" fill="#9a9a96" />
      <rect x="48" y="66" width="24" height="12" rx="1" fill="#10202c" />
      <rect x="76" y="68" width="10" height="8" rx="1" fill="#0c1820" />
      <rect x="90" y="67" width="16" height="10" rx="1" fill="#163044" />
      <circle cx="118" cy="90" r="24" fill="#2a2a2a" />
      <circle cx="118" cy="90" r="18" fill="none" stroke="#d9d9d4" strokeWidth="3" />
      <circle cx="118" cy="90" r="10" fill="#1a2430" />
      <circle cx="160" cy="70" r="4" fill="#d0122d" />
    </g>
  );
}

function Contax() {
  return (
    <g>
      <polygon points="168,40 182,32 182,116 168,124" fill="#a9a396" />
      <polygon points="46,40 60,32 182,32 168,40" fill="#ece6da" />
      <rect x="46" y="40" width="122" height="84" rx="10" fill="#d9d3c6" />
      <rect x="58" y="52" width="22" height="12" rx="2" fill="#1c242c" />
      <circle cx="112" cy="86" r="26" fill="#1b1b1b" />
      <circle cx="112" cy="86" r="20" fill="none" stroke="#f4f1ea" strokeWidth="3" />
      <circle cx="112" cy="86" r="12" fill="#243240" />
      <rect x="146" y="50" width="12" height="8" rx="1" fill="#f7f4ee" />
    </g>
  );
}

function Nikon() {
  return (
    <g>
      <polygon points="176,58 190,50 190,116 176,124" fill="#111" />
      <polygon points="78,46 104,28 132,46" fill="#1a1a1a" />
      <rect x="40" y="58" width="136" height="62" rx="4" fill="#202020" />
      <rect x="150" y="64" width="8" height="46" fill="#d0122d" />
      <rect x="86" y="34" width="36" height="16" fill="#161616" />
      <circle cx="96" cy="92" r="22" fill="#111" />
      <circle cx="96" cy="92" r="16" fill="none" stroke="#cfcfcf" strokeWidth="3" />
      <circle cx="96" cy="92" r="9" fill="#1d2834" />
      <rect x="132" y="78" width="28" height="22" rx="3" fill="#2a2a2a" />
    </g>
  );
}

function Canon() {
  return (
    <g>
      <polygon points="174,56 188,48 188,118 174,126" fill="#1a1a1a" />
      <polygon points="70,44 108,26 146,44" fill="#d5d5d2" />
      <rect x="42" y="56" width="132" height="64" rx="4" fill="#242424" />
      <rect x="42" y="56" width="132" height="12" fill="#deded8" />
      <circle cx="100" cy="94" r="22" fill="#161616" />
      <circle cx="100" cy="94" r="16" fill="none" stroke="#b7b7b2" strokeWidth="4" />
      <circle cx="100" cy="94" r="8" fill="#203040" />
      <rect x="142" y="78" width="22" height="26" rx="4" fill="#3a3a3a" />
    </g>
  );
}

function Mju() {
  return (
    <g>
      <polygon points="170,48 182,42 182,112 170,118" fill="#0e0e0e" />
      <rect x="42" y="46" width="128" height="72" rx="26" fill="#1a1a1a" />
      <rect x="56" y="58" width="100" height="48" rx="18" fill="#111" />
      <circle cx="106" cy="82" r="18" fill="#2a2a2a" />
      <circle cx="106" cy="82" r="12" fill="#182430" />
      <circle cx="106" cy="82" r="6" fill="#d8e4ee" opacity="0.35" />
      <rect x="58" y="54" width="16" height="8" rx="2" fill="#f2f2ee" />
    </g>
  );
}

function Hassy() {
  return (
    <g>
      <polygon points="164,48 178,40 178,118 164,126" fill="#c5c9ce" />
      <polygon points="52,48 66,40 178,40 164,48" fill="#e6eaee" />
      <rect x="52" y="48" width="112" height="78" rx="2" fill="#d5dade" />
      <rect x="78" y="24" width="54" height="26" fill="#2a2a2a" />
      <rect x="84" y="18" width="42" height="10" fill="#1a1a1a" />
      <circle cx="108" cy="90" r="28" fill="#1a1a1a" />
      <circle cx="108" cy="90" r="20" fill="none" stroke="#f2f2f2" strokeWidth="4" />
      <circle cx="108" cy="90" r="11" fill="#1c2832" />
    </g>
  );
}

function Pentax() {
  return (
    <g>
      <polygon points="178,50 194,40 194,122 178,132" fill="#111" />
      <polygon points="70,40 112,16 154,40" fill="#202020" />
      <rect x="34" y="50" width="144" height="74" rx="4" fill="#1c1c1c" />
      <rect x="86" y="24" width="48" height="20" fill="#161616" />
      <circle cx="96" cy="92" r="30" fill="#101010" />
      <circle cx="96" cy="92" r="22" fill="none" stroke="#9a9a9a" strokeWidth="5" />
      <circle cx="96" cy="92" r="12" fill="#243240" />
      <rect x="142" y="70" width="26" height="36" rx="3" fill="#2c2c2c" />
    </g>
  );
}

function Yashica() {
  return (
    <g>
      <polygon points="172,46 186,38 186,116 172,124" fill="#111" />
      <rect x="40" y="46" width="132" height="76" rx="6" fill="#202020" />
      <rect x="52" y="56" width="18" height="10" rx="2" fill="#101820" />
      <circle cx="112" cy="88" r="24" fill="#111" />
      <circle cx="112" cy="88" r="18" fill="none" stroke="#f3f3f3" strokeWidth="4" />
      <circle cx="112" cy="88" r="10" fill="#1b2834" />
      <rect x="150" y="54" width="12" height="8" rx="1" fill="#f7f4ee" />
    </g>
  );
}

function Ricoh() {
  return (
    <g>
      <polygon points="184,58 194,52 194,104 184,110" fill="#161616" />
      <rect x="28" y="58" width="156" height="50" rx="4" fill="#242424" />
      <rect x="40" y="70" width="28" height="12" rx="1" fill="#101820" />
      <circle cx="138" cy="84" r="16" fill="#111" />
      <circle cx="138" cy="84" r="11" fill="none" stroke="#d0d0d0" strokeWidth="2" />
      <circle cx="138" cy="84" r="6" fill="#20303c" />
      <rect x="168" y="66" width="8" height="6" rx="1" fill="#f4f1ea" />
    </g>
  );
}

function Minolta() {
  return (
    <g>
      <polygon points="176,54 190,46 190,118 176,126" fill="#1a1a1a" />
      <polygon points="72,42 110,24 148,42" fill="#2a2a2a" />
      <rect x="36" y="54" width="140" height="66" rx="4" fill="#262626" />
      <rect x="146" y="64" width="24" height="46" rx="6" fill="#6e2a32" />
      <circle cx="96" cy="90" r="22" fill="#141414" />
      <circle cx="96" cy="90" r="16" fill="none" stroke="#c8c8c8" strokeWidth="3" />
      <circle cx="96" cy="90" r="9" fill="#243444" />
      <rect x="48" y="60" width="18" height="8" rx="1" fill="#f0c84a" />
    </g>
  );
}
