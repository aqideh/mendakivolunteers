import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Keluarga MENDAKI — Volunteer with MENDAKI in Singapore";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", backgroundColor: "#ffdf3d",
      padding: "72px", color: "#151515", fontFamily: "sans-serif",
    }}>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>
        YAYASAN MENDAKI
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.08 }}>
          Keluarga MENDAKI
        </div>
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.22 }}>
          Volunteer with MENDAKI in Singapore
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 25 }}>keluarga.mendaki.org.sg</div>
    </div>,
    size,
  );
}
