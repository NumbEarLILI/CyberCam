import type { CameraProfile } from "../lib/develop";

export type Camera = {
  id: string;
  name: string;
  maker: string;
  format: string;
  kind: string;
  blurb: string;
  profile: CameraProfile;
};

export function getCamera(id: string) {
  return CAMERAS.find((camera) => camera.id === id) ?? CAMERAS[0];
}

export const CAMERAS: Camera[] = [
  {
    id: "leica-m6",
    name: "Leica M6",
    maker: "Leica",
    format: "35mm",
    kind: "旁轴",
    blurb: "中心锐利，微反差干净，暗角只压住四角。",
    profile: { exposure: 1, vignette: 0.3, contrast: 1.08, softness: 0, sharpness: 0.5, glare: 0.02, aspect: 1.5 },
  },
  {
    id: "contax-t2",
    name: "Contax T2",
    maker: "Contax",
    format: "35mm",
    kind: "便携",
    blurb: "钛金属小相机。高光晕开，边缘发柔，颜色被镜头烘暖。",
    profile: { exposure: 1.05, vignette: 0.4, contrast: 0.94, softness: 0.34, sharpness: 0, glare: 0.14, aspect: 1.5 },
  },
  {
    id: "nikon-f3",
    name: "Nikon F3",
    maker: "Nikon",
    format: "35mm",
    kind: "单反",
    blurb: "专业机身。平、直、锐，暗角很轻。",
    profile: { exposure: 1, vignette: 0.12, contrast: 1.16, softness: 0, sharpness: 0.42, glare: 0, aspect: 1.5 },
  },
  {
    id: "canon-ae1",
    name: "Canon AE-1",
    maker: "Canon",
    format: "35mm",
    kind: "单反",
    blurb: "七十年代的反差。稍微柔一点，高光不那么硬。",
    profile: { exposure: 1.03, vignette: 0.28, contrast: 1.02, softness: 0.18, sharpness: 0.08, glare: 0.05, aspect: 1.5 },
  },
  {
    id: "olympus-mju-ii",
    name: "Olympus μ-II",
    maker: "Olympus",
    format: "35mm",
    kind: "口袋机",
    blurb: "暗角重，反差冲，角落明显发虚。",
    profile: { exposure: 1.08, vignette: 0.66, contrast: 1.24, softness: 0.22, sharpness: 0, glare: 0.05, aspect: 1.5 },
  },
  {
    id: "hasselblad-500cm",
    name: "Hasselblad 500C/M",
    maker: "Hasselblad",
    format: "6×6",
    kind: "中画幅",
    blurb: "方画幅。影调过渡很慢，高光圆，像一块磨砂玻璃。",
    profile: { exposure: 1.02, vignette: 0.2, contrast: 0.88, softness: 0.2, sharpness: 0, glare: 0.09, aspect: 1 },
  },
  {
    id: "pentax-67",
    name: "Pentax 67",
    maker: "Pentax",
    format: "6×7",
    kind: "中画幅",
    blurb: "6×7 的宽厚画幅，边缘渐晕，高光收得缓。",
    profile: { exposure: 1, vignette: 0.34, contrast: 0.92, softness: 0.16, sharpness: 0.06, glare: 0.07, aspect: 7 / 6 },
  },
  {
    id: "yashica-t4",
    name: "Yashica T4",
    maker: "Yashica",
    format: "35mm",
    kind: "便携",
    blurb: "小机器里的硬镜头。反差高，暗角清楚，颜色被往前推。",
    profile: { exposure: 1.06, vignette: 0.52, contrast: 1.22, softness: 0.06, sharpness: 0.28, glare: 0.03, aspect: 1.5 },
  },
  {
    id: "ricoh-gr1",
    name: "Ricoh GR1",
    maker: "Ricoh",
    format: "35mm",
    kind: "街头",
    blurb: "几乎没有暗角。边缘也锐，影调平，像直接印在纸上。",
    profile: { exposure: 0.98, vignette: 0.03, contrast: 1.01, softness: 0, sharpness: 0.9, glare: 0, aspect: 1.5 },
  },
  {
    id: "minolta-x700",
    name: "Minolta X-700",
    maker: "Minolta",
    format: "35mm",
    kind: "单反",
    blurb: "略暖的标准单反。暗角中等，反差刚刚好。",
    profile: { exposure: 1.04, vignette: 0.33, contrast: 1.06, softness: 0.12, sharpness: 0.16, glare: 0.04, aspect: 1.5 },
  },
];
