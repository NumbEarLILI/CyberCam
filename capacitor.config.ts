import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.cybercam.android",
  appName: "CyberCam",
  webDir: "dist",
  android: {
    backgroundColor: "#0c0c0b",
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DARK",
    },
  },
};

export default config;
