"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import MapWrapper from "@/components/MapWrapper";

export const dynamic = "force-dynamic";

// Map URL slug → 2-letter internal code
const slugToCode: Record<string, string> = {
  cok: "CK",
  mhl: "MH",
  ton: "TO",
  tuv: "TV",
  vut: "VU",
  wsm: "WS",
};

export default function CountryPage() {
  const params = useParams<{ country?: string | string[] }>();
  const countryParam = useMemo(() => {
    const value = params?.country;
    return Array.isArray(value) ? value[0] : value;
  }, [params]);

  const code = countryParam ? slugToCode[countryParam.toLowerCase()] : undefined;

  if (!code) {
    return (
      <main style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Page not found</h1>
          <p>The page you are looking for does not exist.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ margin: 0, padding: 0, height: "100vh", overflow: "hidden" }}>
      <MapWrapper country={code} />
    </main>
  );
}
