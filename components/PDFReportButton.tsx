"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  House,
  Dam,
  User,
  CircleDollarSign,
  Download,
  FileDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PDFReportButtonProps {
  selectedCountry?: string;
  selectedIsland?: string;
}

interface EventImpactRow {
  Region: string;
  Scenario: string;
  Percentile: number;
  Year: number;
  SLR: number;
  Return_Period: number;
  Exceedance_Probability: number;
  Exposed_Buildings: number;
  Damaged_Buildings: number;
  Building_Loss: number;
  Road_Loss: number;
  Infrastructure_Loss: number;
  Crop_Loss: number;
  Total_Loss: number;
  Exposed_Population: number;
  Exposed_Road_km: number;
  Exposed_Building_Value: number;
  Total_Exposed_Value: number;
  [key: string]: unknown;
}

interface AALRow {
  Region: string;
  Scenario: string;
  Percentile: number;
  Year: number;
  SLR: number;
  Total_AAL: number;
  Building_AAL: number;
  Crops_AAL: number;
  Road_AAL: number;
  Infrastructure_AAL: number;
  Average_Annual_Population_Exposed: number;
}

// ---------------------------------------------------------------------------
// Lookup tables (same as existing components)
// ---------------------------------------------------------------------------

const countryToIso3: Record<string, string> = {
  CK: "COK", TO: "TON", TV: "TUV", VU: "VUT",
  WS: "WSM", FJ: "FJI", MH: "MHL",
};

const countryDisplayNames: Record<string, string> = {
  CK: "Cook Islands", TO: "Tonga", TV: "Tuvalu", VU: "Vanuatu",
  WS: "Samoa", FJ: "Fiji", MH: "Marshall Islands",
};

const eventFileMap: Record<string, string> = {
  COK: "latest results-event-impact.csv",
  TON: "Example dashboard results-event-impact.csv",
  TUV: "latest (no duplicate regions)-event-impact.csv",
  VUT: "Latest full results-event-impact.csv",
  WSM: "SLR example-event-impact.csv",
  MHL: "dashboard results-event-impact.csv",
};

const aalFileMap: Record<string, string> = {
  COK: "latest results-average-loss.csv",
  TON: "Example dashboard results-average-loss.csv",
  TUV: "latest (no duplicate regions)-average-loss.csv",
  VUT: "Latest full results-average-loss.csv",
  MHL: "dashboard results-average-loss.csv",
  WSM: "SLR example-average-loss.csv",
};

const aalRegionalFileMap: Record<string, string> = {
  COK: "latest results-regional-average-loss.csv",
};



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (v: number, prefix = "$") => {
  if (!Number.isFinite(v) || v === 0) return `${prefix}0`;
  if (v >= 1e9) return `${prefix}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${prefix}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${prefix}${(v / 1e3).toFixed(1)}K`;
  return `${prefix}${Math.round(v).toLocaleString()}`;
};

const fmtNum = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString();
};

const pct = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "—";

async function fetchCSV<T>(url: string): Promise<T[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  const text = await resp.text();
  return new Promise((resolve, reject) => {
    Papa.parse<T>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: (e: Error) => reject(e),
    });
  });
  }

  // Prefix asset paths with NEXT_PUBLIC_BASE_PATH (if set at build time)
  const assetPath = (p: string) => {
    const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
    return `${base}${p}`;
  };

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PDFReportButton({ selectedCountry, selectedIsland }: PDFReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Data
  const [eventRows, setEventRows] = useState<EventImpactRow[]>([]);
  const [aalRows, setAalRows] = useState<AALRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Scenario selectors (within modal)
  const [selectedYear, setSelectedYear] = useState<number | "">("");
  const [selectedRP, setSelectedRP] = useState<number | "">("");
  const [selectedScenario, setSelectedScenario] = useState<"ssp245" | "ssp585">("ssp585");

  // Split report into two DOM sections so the PDF can be generated as 2 pages.
  // Page 2 begins at the "Page 2 Header" image.
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);

  // ── Live map snapshot ────────────────────────────────────────────
  const [mapImageUrl, setMapImageUrl] = useState<string>("");
  const [isCapturing, setIsCapturing] = useState(false);

  const captureMainMap = useCallback(async () => {
    const mapEl = document.querySelector<HTMLElement>(".leaflet-container");
    if (!mapEl) return;
    setIsCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(mapEl, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#1a2533",
        ignoreElements: (el) => {
          // Strip all Leaflet UI controls (zoom, screenshot btn, attribution)
          if (el.classList.contains("leaflet-control-container")) return true;
          // Strip the flood-depth / road-impact legend
          if ((el as HTMLElement).dataset?.pdfIgnore === "true") return true;
          return false;
        },
      });
      setMapImageUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.error("Map capture failed", err);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  // Auto-capture the main map when the modal opens
  useEffect(() => {
    if (isOpen) captureMainMap();
  }, [isOpen, captureMainMap]);

  const iso3 = selectedCountry ? countryToIso3[selectedCountry] : null;
  const countryName = selectedCountry ? (countryDisplayNames[selectedCountry] ?? selectedCountry) : "";
  const islandDisplay = selectedIsland ? selectedIsland.replace(/_/g, " ") : "";

  // ------------------------------------------------------------------
  // Load data when modal opens
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !iso3) return;
    setLoading(true);
    setDataError(null);

    const eventFile = eventFileMap[iso3];
    const aalFile = iso3 === "COK" && selectedIsland ? aalRegionalFileMap[iso3] : aalFileMap[iso3];

    Promise.all([
      eventFile ? fetchCSV<EventImpactRow>(`/dataset/${iso3}/${eventFile}`) : Promise.resolve([]),
      aalFile ? fetchCSV<AALRow>(`/dataset/${iso3}/${aalFile}`) : Promise.resolve([]),
    ])
      .then(([ev, al]) => {
        setEventRows(ev);

        // filter AAL to region if island selected
        if (selectedIsland && iso3 === "COK") {
          const target = selectedIsland.replace(/_/g, " ").toLowerCase();
          const filtered = al.filter((r) => r.Region && r.Region.toLowerCase() === target);
          setAalRows(filtered.length ? filtered : al);
        } else {
          setAalRows(al.filter((r) => !r.Region || r.Region === "National" || !selectedIsland));
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        setDataError(err.message);
        setLoading(false);
      });
  }, [isOpen, iso3, selectedIsland]);

  // ------------------------------------------------------------------
  // Derive year/RP options from loaded data
  // ------------------------------------------------------------------
  const yearOptions = React.useMemo(
    () =>
      Array.from(new Set(eventRows.map((r) => r.Year).filter(Boolean))).sort((a, b) => a - b),
    [eventRows]
  );
  const rpOptions = React.useMemo(
    () =>
      Array.from(new Set(eventRows.map((r) => r.Return_Period).filter(Boolean))).sort(
        (a, b) => a - b
      ),
    [eventRows]
  );

  useEffect(() => {
    if (yearOptions.length && selectedYear === "") setSelectedYear(yearOptions[yearOptions.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearOptions]);

  useEffect(() => {
    if (rpOptions.length && selectedRP === "") {
      setSelectedRP(rpOptions.includes(100) ? 100 : rpOptions[rpOptions.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpOptions]);

  // ------------------------------------------------------------------
  // Compute report values
  // ------------------------------------------------------------------
  const scenarioRow = React.useMemo<EventImpactRow | null>(() => {
    if (!eventRows.length || selectedYear === "" || selectedRP === "") return null;
    const scenStr = selectedScenario;
    return (
      eventRows.find(
        (r) =>
          r.Year === selectedYear &&
          r.Return_Period === selectedRP &&
          String(r.Scenario || "").toLowerCase().includes(scenStr)
      ) ?? null
    );
  }, [eventRows, selectedYear, selectedRP, selectedScenario]);

  // Also get the other scenario for comparison
  const otherScenario = selectedScenario === "ssp585" ? "ssp245" : "ssp585";
  const otherRow = React.useMemo<EventImpactRow | null>(() => {
    if (!eventRows.length || selectedYear === "" || selectedRP === "") return null;
    return (
      eventRows.find(
        (r) =>
          r.Year === selectedYear &&
          r.Return_Period === selectedRP &&
          String(r.Scenario || "").toLowerCase().includes(otherScenario)
      ) ?? null
    );
  }, [eventRows, selectedYear, selectedRP, otherScenario]);

  const aalRow = React.useMemo<AALRow | null>(() => {
    if (!aalRows.length || selectedYear === "") return null;
    return (
      aalRows.find(
        (r) =>
          r.Year === selectedYear &&
          String(r.Scenario || "").toLowerCase().includes(selectedScenario)
      ) ??
      aalRows.find((r) => r.Year === selectedYear) ??
      null
    );
  }, [aalRows, selectedYear, selectedScenario]);

  // ------------------------------------------------------------------
  // PDF generation via html2canvas + jspdf
  // Captures each page section separately so nothing is sliced across the
  // explicit Page 1 / Page 2 boundary.
  // ------------------------------------------------------------------
  const handleDownloadPDF = useCallback(async () => {
    if (!page1Ref.current || !page2Ref.current) return;
    setIsGenerating(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const captureSection = async (el: HTMLDivElement) => {
        // Temporarily force the exact width so html2canvas captures cleanly
        const prevWidth = el.style.width;
        el.style.width = "794px";

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          // Capture the full scrollable content for just this section
          windowWidth: 794,
          windowHeight: el.scrollHeight,
          width: 794,
          height: el.scrollHeight,
        });

        el.style.width = prevWidth;

        const imgData = canvas.toDataURL("image/png");

        // Convert canvas pixels → mm (scale:2 means 2 canvas px per CSS px)
        const PAGE_W_MM = 210;
        const cssW = canvas.width / 2;
        const cssH = canvas.height / 2;
        const mmPerPx = PAGE_W_MM / cssW; // fit page width exactly
        const pageH_mm = cssH * mmPerPx;

        return { imgData, pageW_mm: PAGE_W_MM, pageH_mm };
      };

      const first = await captureSection(page1Ref.current);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [first.pageW_mm, first.pageH_mm],
      });
      pdf.addImage(first.imgData, "PNG", 0, 0, first.pageW_mm, first.pageH_mm);

      const second = await captureSection(page2Ref.current);
      pdf.addPage([second.pageW_mm, second.pageH_mm], "portrait");
      pdf.addImage(second.imgData, "PNG", 0, 0, second.pageW_mm, second.pageH_mm);

      const areaLabel = islandDisplay || countryName || "report";
      const yearLabel = selectedYear !== "" ? `-${selectedYear}` : "";
      pdf.save(`SLR-Impact-Report-${areaLabel}${yearLabel}.pdf`);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  }, [islandDisplay, countryName, selectedYear]);

  if (!selectedCountry) return null;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        title="Generate PDF Report"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 12px",
          background: "#c0392b",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
          width: "100%",
          justifyContent: "center",
          marginTop: "8px",
          letterSpacing: "0.3px",
        }}
      >
        <PDFIcon />
        Export PDF Report
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: "24px 16px",
          }}
        >
          {/* Modal Shell */}
          <div
            style={{
              background: "#f0f2f5",
              borderRadius: "10px",
              maxWidth: "860px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                background: "#1a1d24",
                borderRadius: "10px 10px 0 0",
                color: "#fff",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "15px" }}>SLR Impact Report Preview</span>

              {/* Refresh map snapshot */}
              <button
                onClick={captureMainMap}
                disabled={isCapturing}
                title="Refresh map from current view"
                style={{
                  padding: "5px 10px",
                  background: isCapturing ? "#444" : "#1e6b3a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isCapturing ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  flexShrink: 0,
                }}
              >
                {isCapturing ? "Capturing…" : "⟳ Refresh Map"}
              </button>

              {/* Scenario selectors */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {yearOptions.length > 0 && (
                  <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                    Year:
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      style={selectStyle}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </label>
                )}
                {rpOptions.length > 0 && (
                  <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                    Return Period:
                    <select
                      value={selectedRP}
                      onChange={(e) => setSelectedRP(Number(e.target.value))}
                      style={selectStyle}
                    >
                      {rpOptions.map((rp) => (
                        <option key={rp} value={rp}>ARI {rp}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                  Scenario:
                  <select
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value as "ssp245" | "ssp585")}
                    style={selectStyle}
                  >
                    <option value="ssp585">SSP5-8.5 (High)</option>
                    <option value="ssp245">SSP2-4.5 (Medium)</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGenerating || loading}
                  style={{
                    padding: "6px 14px",
                    background: isGenerating ? "#555" : "#c0392b",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "13px",
                  }}
                >
                  {isGenerating ? "Generating…" : <><Download size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />Download PDF</>}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: "6px 12px",
                    background: "#333",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Report preview area */}
            <div style={{ padding: "16px", overflowY: "auto", background: "#e5e5e5", overflowX: "auto" }}>
              {loading && (
                <div style={{ textAlign: "center", padding: "60px", color: "#555", background: "#fff", borderRadius: "6px" }}>
                  Loading data…
                </div>
              )}
              {dataError && (
                <div style={{ textAlign: "center", padding: "40px", color: "#c0392b", background: "#fff", borderRadius: "6px" }}>
                  Error: {dataError}
                </div>
              )}
              {!loading && !dataError && (
                <div style={{ margin: "0 auto", width: "794px" }}>
                  <ReportPage
                    page1Ref={page1Ref}
                    page2Ref={page2Ref}
                    countryName={countryName}
                    iso3={iso3 ?? ""}
                    islandDisplay={islandDisplay}
                    selectedYear={selectedYear}
                    selectedRP={selectedRP}
                    selectedScenario={selectedScenario}
                    scenarioRow={scenarioRow}
                    otherScenario={otherScenario}
                    otherRow={otherRow}
                    aalRow={aalRow}
                    mapImageUrl={mapImageUrl}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The actual report page (what gets captured by html2canvas)
// ---------------------------------------------------------------------------

interface ReportPageProps {
  page1Ref: React.RefObject<HTMLDivElement | null>;
  page2Ref: React.RefObject<HTMLDivElement | null>;
  countryName: string;
  iso3: string;
  islandDisplay: string;
  selectedYear: number | "";
  selectedRP: number | "";
  selectedScenario: string;
  scenarioRow: EventImpactRow | null;
  otherScenario: string;
  otherRow: EventImpactRow | null;
  aalRow: AALRow | null;
  mapImageUrl: string;
}

function ReportPage({
  page1Ref,
  page2Ref,
  countryName,
  iso3,
  islandDisplay,
  selectedYear,
  selectedRP,
  selectedScenario,
  scenarioRow,
  otherRow,
  otherScenario,
  aalRow,
  mapImageUrl,
}: ReportPageProps) {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const locationLabel = islandDisplay
    ? `${countryName} — ${islandDisplay}`
    : countryName || "—";

  const scenarioLabel = selectedScenario === "ssp585"
    ? "SSP5-8.5 (High emission, high confidence)"
    : "SSP2-4.5 (Medium emission, medium confidence)";
  void scenarioLabel;

  const totalLoss = (scenarioRow?.Total_Loss ?? 0) ||
    (scenarioRow?.Building_Loss ?? 0) + (scenarioRow?.Road_Loss ?? 0) +
    (scenarioRow?.Infrastructure_Loss ?? 0) + (scenarioRow?.Crop_Loss ?? 0);

  // Sector breakdown
  const bLoss  = scenarioRow?.Building_Loss ?? 0;
  const rLoss  = scenarioRow?.Road_Loss ?? 0;
  const iLoss  = scenarioRow?.Infrastructure_Loss ?? 0;
  const cLoss  = scenarioRow?.Crop_Loss ?? 0;
  const sectorTotal = bLoss + rLoss + iLoss + cLoss || 1;

  // Other scenario total
  const otherTotal = (otherRow?.Total_Loss ?? 0) ||
    (otherRow?.Building_Loss ?? 0) + (otherRow?.Road_Loss ?? 0) +
    (otherRow?.Infrastructure_Loss ?? 0) + (otherRow?.Crop_Loss ?? 0);

  const slrCm = scenarioRow?.SLR != null ? (scenarioRow.SLR * 100).toFixed(1) : "—";

  return (
    <div style={{ width: "794px" }}>
      {/* Page 1 */}
      <div
        ref={page1Ref}
        style={{
          background: "#ffffff",
          width: "794px",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          color: "#1a1a2e",
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* ── HEADER IMAGE (country-specific with fallback) ───────── */}
        {
          (() => {
            const candidate = iso3 ? assetPath(`/dataset/pdf_assets/header_${iso3.toLowerCase()}.png`) : assetPath('/dataset/pdf_assets/header_for_page2.png');
            return (
              <img
                src={candidate}
                alt="Report Header"
                style={{ width: "100%", display: "block" }}
                crossOrigin="anonymous"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  // If we've already tried a fallback, hide the image to avoid infinite re-request loops
                  if (img.dataset.failed === 'true') {
                    img.style.display = 'none';
                    return;
                  }
                  img.dataset.failed = 'true';
                  img.onerror = null;
                  img.src = assetPath('/dataset/pdf_assets/header_for_page2.png');
                }}
              />
            );
          })()
        }

        {/* ── LOCATION BANNER ─────────────────────────────────────── */}
        <div
          style={{
            background: "#d8eef8",
            padding: "8px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #b0d4ea",
          }}
        >
          {/* Flag + location */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {iso3 && (
              <img
                src={assetPath(`/dataset/${iso3}/${iso3}.png`)}
                alt={`${countryName} flag`}
                style={{
                  height: "28px",
                  width: "auto",
                  borderRadius: "2px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
                crossOrigin="anonymous"
              />
            )}
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#003d7a" }}>{countryName || locationLabel}</span>
            <span style={{ fontSize: "11px", color: "#555" }}>
              {islandDisplay ? `${islandDisplay} — Island / Regional Level` : "National Level"}
            </span>
          </div>
          {/* Report date */}
          <div style={{ fontSize: "11px", color: "#555" }}>
            Report Date - {today}
          </div>
        </div>

        {/* ── MAP IMAGE (live capture of the main map) ────────── */}
        {mapImageUrl ? (
          <img
            src={mapImageUrl}
            alt="Map snapshot"
            style={{ width: "100%", height: "260px", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "260px", background: "#1a2533",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.35)", fontSize: "13px", letterSpacing: "1px",
          }}>
            Capturing map…
          </div>
        )}

        {/* ── MAP CAPTION ─────────────────────────────────────────── */}
        <div
          style={{
            background: "#e8f4fb",
            padding: "7px 20px",
            fontSize: "10px",
            color: "#555",
            fontStyle: "italic",
            borderBottom: "1px solid #c8e2f0",
          }}
        >
          {/* 
          Satellite overview showing the study area.
          Flood exposure results are derived from coastal inundation
          modelling under projected sea level rise scenarios for the selected return period and climate pathway. */}
        </div>

        <div style={{ padding: "20px 28px 32px", display: "flex", flexDirection: "column", gap: "18px" }}>

          {/* ── SCENARIO DETAILS ──────────────────────────────────── */}
          <Section title="Scenario Details" accent="#005bbf">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
              <ScenCard label="Future Year" value={String(selectedYear !== "" ? selectedYear : "—")} sub="" color="#003d7a" />
              <ScenCard
                label="Return Period"
                value={selectedRP !== "" ? `ARI ${selectedRP}` : "—"}
                sub={selectedRP !== "" ? `1-in-${selectedRP} year event` : ""}
                color="#1565c0"
              />
              <ScenCard
                label="Sea Level Rise"
                value={slrCm !== "—" ? `+${slrCm} cm` : "—"}
                sub="Above present-day baseline"
                color="#0277bd"
              />
              <ScenCard
                label="Climate Scenario"
                value={selectedScenario.toUpperCase()}
                sub={selectedScenario === "ssp585" ? "High emission pathway" : "Medium emission pathway"}
                color="#01579b"
              />
            </div>
            <div
              style={{
                marginTop: "10px",
                fontSize: "11px",
                color: "#1a237e",
                textAlign: "center",
              }}
            >
              Climate Scenario:{" "}
              <strong>{selectedScenario === "ssp585" ? "SSP5-8.5" : "SSP2-4.5"}</strong>{" "}({selectedScenario === "ssp585" ? <><strong>High emission</strong>, high confidence</> : <><strong>Medium emission</strong>, medium confidence</>})
            </div>
          </Section>

          {/* ── KEY INDICATORS ───────────────────────────────────── */}
          {scenarioRow ? (
            <Section title="Key Impact Indicators" accent="#27ae60">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                <KPICard
                  label="Exposed Buildings"
                  value={fmtNum(scenarioRow.Exposed_Buildings ?? 0)}
                  icon={<House size={44} strokeWidth={1.5} />}
                  color="#003d7a"
                />
                <KPICard
                  label="Damaged Buildings"
                  value={fmtNum(scenarioRow.Damaged_Buildings ?? 0)}
                  sub={`${pct(scenarioRow.Damaged_Buildings ?? 0, scenarioRow.Exposed_Buildings ?? 0)} of exposed`}
                  icon={<Dam size={44} strokeWidth={1.5} />}
                  color="#003d7a"
                />
                <KPICard
                  label="Exposed Population"
                  value={fmtNum(scenarioRow.Exposed_Population ?? 0)}
                  icon={<User size={44} strokeWidth={1.5} />}
                  color="#003d7a"
                />
                <KPICard
                  label="Total Economic Loss"
                  value={fmt(totalLoss)}
                  icon={<CircleDollarSign size={44} strokeWidth={1.5} />}
                  color="#003d7a"
                />
              </div>
              {scenarioRow.Exposed_Road_km != null && (
                <div
                  style={{
                    marginTop: "10px",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "10px",
                  }}
                >
                  <StatPill label="Exposed Road" value={`${(scenarioRow.Exposed_Road_km ?? 0).toFixed(1)} km`} />
                  <StatPill
                    label="Exposed Asset Value"
                    value={fmt(scenarioRow.Exposed_Building_Value ?? 0)}
                  />
                  <StatPill
                    label="Total Exposed Value"
                    value={fmt(scenarioRow.Total_Exposed_Value ?? 0)}
                  />
                </div>
              )}
            </Section>
          ) : (
            <Section title="Key Impact Indicators" accent="#27ae60">
              <NoData />
            </Section>
          )}

          {/* ── FOOTER ─────────────────────────────────────────────── */}
        </div>

        {/* ── PAGE 1 FOOTER IMAGE ────────────────────────────────── */}
        <img
          src={assetPath('/dataset/pdf_assets/footer_for_page1.png')}
          alt="Page 1 Footer"
          style={{ width: "100%", display: "block" }}
          crossOrigin="anonymous"
        />
      </div>

      {/* Page 2 (starts at the Page 2 header image) */}
      <div
        ref={page2Ref}
        style={{
          background: "#ffffff",
          width: "794px",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          color: "#1a1a2e",
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* ── PAGE 2 HEADER IMAGE ────────────────────────────────── */}
        <img
          src={assetPath('/dataset/pdf_assets/header_for_page2.png')}
          alt="Page 2 Header"
          style={{ width: "100%", display: "block" }}
          crossOrigin="anonymous"
        />

        <div style={{ padding: "20px 28px 32px", display: "flex", flexDirection: "column", gap: "22px" }}>

          {/* ── FINANCIAL IMPACT BY SECTOR ────────────────────────── */}
          <Section title="Financial Impact by Sector" accent="#005bbf">
            {scenarioRow ? (
              <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
                {/* Table */}
                <table style={{ flex: "0 0 auto", borderCollapse: "collapse", fontSize: "11px", minWidth: "260px" }}>
                  <thead>
                    <tr style={{ background: "#003d7a", color: "#fff" }}>
                      <th style={thStyle}>SECTOR</th>
                      <th style={thStyle}>LOSS (USD)</th>
                      <th style={thStyle}>% OF TOTAL</th>
                      <th style={thStyle}>SHARE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Buildings",      val: bLoss,  color: "#b39ddb" },
                      { label: "Roads",          val: rLoss,  color: "#ffcc80" },
                      { label: "Infrastructure", val: iLoss,  color: "#80cbc4" },
                      { label: "Crops",          val: cLoss,  color: "#c5e1a5" },
                    ].map(({ label, val, color }) => (
                      <tr key={label}>
                        <td style={{ ...tdStyle, color, fontWeight: 600 }}>{label}</td>
                        <td style={tdStyle}>{fmt(val)}</td>
                        <td style={tdStyle}>{pct(val, sectorTotal)}</td>
                        <td style={{ ...tdStyle, padding: "4px 8px" }}>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <div style={{ width: `${Math.round((val / sectorTotal) * 40)}px`, height: "10px", background: color, borderRadius: "2px" }} />
                            <div style={{ width: `${40 - Math.round((val / sectorTotal) * 40)}px`, height: "10px", background: "#eee", borderRadius: "2px" }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f0f4fa", fontWeight: 700 }}>
                      <td style={tdStyle}>Total</td>
                      <td style={tdStyle}>{fmt(sectorTotal)}</td>
                      <td style={tdStyle}>100%</td>
                      <td style={tdStyle} />
                    </tr>
                  </tbody>
                </table>
                {/* Donut chart */}
                <SectorDonutSVG
                  slices={[
                    { value: bLoss, color: "#b39ddb" },
                    { value: rLoss, color: "#ffcc80" },
                    { value: iLoss, color: "#80cbc4" },
                    { value: cLoss, color: "#c5e1a5" },
                  ]}
                  total={sectorTotal}
                  labels={["Buildings", "Roads", "Infrastructure", "Crops"]}
                />
              </div>
            ) : <NoData />}
          </Section>

        {/* ── SCENARIO COMPARISON ──────────────────────────────── */}
        <Section title="Scenario Comparison" accent="#005bbf">
          {scenarioRow && otherRow ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#003d7a", color: "#fff" }}>
                  <th style={thStyle}>Metric</th>
                  <th style={thStyle}>{selectedScenario === "ssp585" ? "SSP585 (High)" : "SSP245 (Medium)"}</th>
                  <th style={thStyle}>{otherScenario === "ssp585" ? "SSP585 (High)" : "SSP245 (Medium)"}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Damaged Buildings",  a: fmtNum(scenarioRow.Damaged_Buildings ?? 0),  b: fmtNum(otherRow.Damaged_Buildings ?? 0) },
                  { label: "Building Loss",       a: fmt(scenarioRow.Building_Loss ?? 0),          b: fmt(otherRow.Building_Loss ?? 0) },
                  { label: "Road Loss",           a: fmt(scenarioRow.Road_Loss ?? 0),              b: fmt(otherRow.Road_Loss ?? 0) },
                  { label: "Total Economic Loss", a: fmt(totalLoss),                               b: fmt(otherTotal) },
                  { label: "Exposed Population",  a: fmtNum(scenarioRow.Exposed_Population ?? 0), b: fmtNum(otherRow.Exposed_Population ?? 0) },
                ].map(({ label, a, b }, i) => (
                  <tr key={label} style={{ background: i % 2 === 0 ? "#f7f9fc" : "#fff" }}>
                    <td style={{ ...tdStyle, color: "#003d7a", fontStyle: "italic" }}>{label}</td>
                    <td style={tdStyle}>{a}</td>
                    <td style={tdStyle}>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <NoData />}
        </Section>

        {/* ── AVERAGE ANNUAL LOSS (AAL) ────────────────────────── */}
        <Section title="Average Annual Loss (AAL)" accent="#005bbf">
          {aalRow ? (
            <>
              <p style={{ fontSize: "10px", color: "#555", margin: "0 0 14px", lineHeight: 1.6 }}>
                AAL represents the average annual economic loss expected due to coastal flooding across all return
                periods and probabilities. Year: <strong>{selectedYear}</strong>{" "}
                SLR: <strong>+{aalRow.SLR != null ? (aalRow.SLR * 100).toFixed(1) : "—"} cm</strong>{" "}
                Scenario: <strong style={{ color: "#003d7a" }}>{selectedScenario} ({selectedScenario === "ssp585" ? "medium confidence" : "medium confidence"})</strong>
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                <AALCard label="Total AAL"                  value={fmt(aalRow.Total_AAL ?? 0)} />
                <AALCard label="Building AAL"               value={`${fmt(aalRow.Building_AAL ?? 0)} USD/yr`} />
                <AALCard label="Infrastructure AAL"         value={`${fmt(aalRow.Infrastructure_AAL ?? 0)} USD/yr`} />
                <AALCard label="Road AAL"                   value={`${fmt(aalRow.Road_AAL ?? 0)} USD/yr`} />
                <AALCard label="Crops AAL"                  value={`${fmt(aalRow.Crops_AAL ?? 0)} USD/yr`} />
                <AALCard label="Avg. Annual Pop. Exposed"   value={`${fmtNum(aalRow.Average_Annual_Population_Exposed ?? 0)} people/yr`} />
              </div>
            </>
          ) : <NoData />}
        </Section>

      </div>

      {/* ── PAGE 2 FOOTER IMAGE ────────────────────────────────── */}
      
      <img
        src={assetPath('/dataset/pdf_assets/footer.png')}
        alt="Page 2 Footer"
        style={{ width: "100%", display: "block" }}
        crossOrigin="anonymous"
      />
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  void accent;
  return (
    <div>
      <div
        style={{
          textAlign: "center",
          borderTop: "1px dashed #b8d4e8",
          borderBottom: "1px dashed #b8d4e8",
          padding: "7px 0",
          marginBottom: "14px",
          fontSize: "12px",
          fontWeight: 700,
          color: "#003d7a",
          textTransform: "uppercase",
          letterSpacing: "1.5px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ScenCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  // `color` kept in signature for compat but we use uniform dark-navy style
  void color;
  return (
    <div
      style={{
        background: "#003d7a",
        borderRadius: "4px",
        padding: "12px 14px",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "1.2px", color: "rgba(255,255,255,0.75)", marginBottom: "5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.7)", marginTop: "5px", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function KPICard({
  label, value, sub, icon, color,
}: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string;
}) {
  void color;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 8px 8px",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#003d7a", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "1px", color: "#888", marginBottom: "4px", lineHeight: 1.4 }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: "#003d7a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#d8eef8",
        borderRadius: "4px",
        padding: "7px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "11px",
      }}
    >
      <span style={{ color: "#444" }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#003d7a" }}>{value}</span>
    </div>
  );
}

function NoData() {
  return (
    <div
      style={{
        background: "#fafafa",
        borderRadius: "5px",
        padding: "14px",
        textAlign: "center",
        color: "#aaa",
        fontSize: "12px",
        border: "1px dashed #ddd",
      }}
    >
      No data available for the selected filters
    </div>
  );
}

function PDFIcon() {
  return <FileDown size={15} strokeWidth={2} />;
}

function AALCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#003d7a",
        borderRadius: "4px",
        padding: "10px 14px",
        textAlign: "center",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "1.2px", color: "rgba(255,255,255,0.7)", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SectorDonutSVG({
  slices, total, labels,
}: {
  slices: { value: number; color: string }[];
  total: number;
  labels: string[];
}) {
  const size = 130;
  const cx = size / 2;
  const cy = size / 2;
  const r = 46;
  const innerR = 28;

  let cumAngle = -Math.PI / 2;  // start at top
  const paths: { d: string; color: string }[] = [];

  slices.forEach(({ value, color }) => {
    const angle = (value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const ix1 = cx + innerR * Math.cos(cumAngle);
    const iy1 = cy + innerR * Math.sin(cumAngle);
    const ix2 = cx + innerR * Math.cos(cumAngle + angle);
    const iy2 = cy + innerR * Math.sin(cumAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
    paths.push({ d, color });
    cumAngle += angle;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth="1" />
        ))}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="#555" fontWeight="600">Total</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "10px" }}>
        {slices.map(({ value, color }, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", background: color, borderRadius: "2px", flexShrink: 0 }} />
            <span style={{ color: "#444" }}>{labels[i]} {pct(value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}





// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "10px",
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
};
const tdStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderBottom: "1px solid #e8eef5",
  fontSize: "11px",
};
const selectStyle: React.CSSProperties = {
  background: "#333",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "3px",
  padding: "2px 6px",
  fontSize: "12px",
};
