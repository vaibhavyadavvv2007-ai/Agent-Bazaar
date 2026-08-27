import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f4eeda",
          color: "#b3282d",
          border: "2px solid #b3282d",
          borderRadius: "4px",
          fontSize: 24,
          fontFamily: "monospace",
          fontWeight: "bold",
        }}
      >
        B
      </div>
    ),
    { ...size }
  );
}
