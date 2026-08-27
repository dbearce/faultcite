import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FaultCite Technician Console",
    short_name: "FaultCite",
    description: "Capture CNC breakdown evidence, manager review, and saved repair history.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f9",
    theme_color: "#07131f",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
