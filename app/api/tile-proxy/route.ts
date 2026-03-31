import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for ESRI World Imagery satellite tiles.
 * This adds CORS headers so html2canvas can capture tiles for PDF generation.
 *
 * Usage: /api/tile-proxy?z={z}&y={y}&x={x}
 * (ESRI tile scheme is tile/{z}/{row}/{col} → tile/{z}/{y}/{x} in Leaflet terms)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const z = searchParams.get("z");
  const y = searchParams.get("y");
  const x = searchParams.get("x");

  if (!z || !y || !x) {
    return new NextResponse("Missing z/y/x params", { status: 400 });
  }

  // Validate numeric inputs to prevent SSRF/injection
  if (![z, y, x].every((v) => /^\d{1,6}$/.test(v))) {
    return new NextResponse("Invalid tile coordinates", { status: 400 });
  }

  const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

  try {
    const resp = await fetch(tileUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 }, // cache tiles for 24h
    });

    if (!resp.ok) {
      return new NextResponse("Upstream tile error", { status: resp.status });
    }

    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "image/jpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse("Tile proxy error", { status: 502 });
  }
}
