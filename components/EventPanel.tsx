"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import Papa from "papaparse";
import styles from "./FilterSidebar.module.css";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

interface EventPanelProps {
  selectedCountry?: string;
  selectedIsland?: string;
}

type EventImpactRow = Record<string, any>;

const countryToIso3: { [key: string]: string } = {
  CK: "COK",
  TO: "TON",
  TV: "TUV",
  VU: "VUT",
  WS: "WSM",
  MH: "MHL",
};

const countryEventFileMap: { [key: string]: string } = {
  COK: "latest results-event-impact.csv",
  TON: "Example dashboard results-event-impact.csv",
  TUV: "latest (no duplicate regions)-event-impact.csv",
  VUT: "Latest full results-event-impact.csv",
  WSM: "SLR example-event-impact.csv",
  MHL: "dashboard results-event-impact.csv",
};

const countryRegionalImpactFileMap: { [key: string]: string } = {
  COK: "latest results-regional-impact.csv",
  TON: "Example dashboard results-regional-impact.csv",
  VUT: "Latest full results-regional-impact.csv",
  WSM: "SLR example-regional-summary_region.csv",
  MHL: "dashboard results-regional-impact.csv",
};

interface RegionalImpactRow {
  Region: string;
  Scenario: string;
  Year: number;
  Return_Period: number;
  Damaged_Buildings: number;
  Building_Loss: number;
  Exposed_Population: number;
  Road_Loss: number;
  Total_Loss: number;
}

interface SummaryRegionalRow {
  Region: string;
  Scenario: string;
  "First.Year": number;
  "First.Total_AAL": number;
  "First.Building_AAL": number;
  "First.Crops_AAL": number;
  "First.Road_AAL": number;
  "First.Infrastructure_AAL": number;
  "First.Average_Annual_Population_Exposed": number;
  "Last.Year": number;
  "Last.Total_AAL": number;
  "Last.Building_AAL": number;
  "Last.Crops_AAL": number;
  "Last.Road_AAL": number;
  "Last.Infrastructure_AAL": number;
  "Last.Average_Annual_Population_Exposed": number;
}

type RegionalRow = RegionalImpactRow | SummaryRegionalRow;

const REGIONAL_METRIC_OPTIONS = [
  { value: "Damaged_Buildings", label: "Damaged Buildings" },
  { value: "Building_Loss", label: "Building Loss ($)" },
  { value: "Exposed_Population", label: "Exposed Population" },
  { value: "Road_Loss", label: "Road Loss ($)" },
  { value: "Total_Loss", label: "Total Loss ($)" },
];

const SAMOA_METRIC_OPTIONS = [
  { value: "Total_AAL", label: "Total AAL ($/yr)" },
  { value: "Building_AAL", label: "Building AAL ($/yr)" },
  { value: "Crops_AAL", label: "Crops AAL ($/yr)" },
  { value: "Road_AAL", label: "Road AAL ($/yr)" },
  { value: "Infrastructure_AAL", label: "Infrastructure AAL ($/yr)" },
  { value: "Average_Annual_Population_Exposed", label: "Avg Annual Population Exposed" },
];

const formatCurrency = (value: number) => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const EventPanel = React.memo(function EventPanel({ selectedCountry, selectedIsland }: EventPanelProps) {
  const [rows, setRows] = useState<EventImpactRow[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | "">("");
  const [selectedReturnPeriod, setSelectedReturnPeriod] = useState<number | "">("");
  const [isTableOpen, setIsTableOpen] = useState(false);

  const [regionalRows, setRegionalRows] = useState<RegionalRow[]>([]);
  const [regionalLoading, setRegionalLoading] = useState(false);
  const [regionalError, setRegionalError] = useState<string | null>(null);
  const [regionalMetric, setRegionalMetric] = useState<string>("Damaged_Buildings");
  const [regionalReturnPeriod, setRegionalReturnPeriod] = useState<number | "">("");

  useEffect(() => {
    if (!selectedCountry) {
      setRows([]);
      setError(null);
      return;
    }

    const iso3 = countryToIso3[selectedCountry];
    const filename = iso3 ? countryEventFileMap[iso3] : "";
    if (!filename) {
      setRows([]);
      setError("Event impact data not available for this country.");
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/dataset/${iso3}/${filename}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load event impact data");
        return response.text();
      })
      .then((csvText) => {
        Papa.parse<EventImpactRow>(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            setRows(results.data || []);
            setFields(results.meta?.fields || []);
            setLoading(false);
          },
          error: (err: Error) => {
            const message = err?.message || "Unknown CSV parse error";
            setError(`CSV Parse Error: ${message}`);
            setLoading(false);
          },
        });
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedCountry]);

  useEffect(() => {
    if (!selectedCountry || (selectedCountry !== "VU" && !selectedIsland)) {
      setRegionalRows([]);
      setRegionalError(null);
      return;
    }

    const iso3 = countryToIso3[selectedCountry];
    const filename = iso3 ? countryRegionalImpactFileMap[iso3] : "";
    if (!filename) {
      setRegionalRows([]);
      setRegionalError("Regional impact data not available for this country.");
      return;
    }

    setRegionalLoading(true);
    setRegionalError(null);
    fetch(`/dataset/${iso3}/${filename}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load regional impact data");
        return response.text();
      })
      .then((csvText) => {
        Papa.parse<RegionalRow>(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            setRegionalRows(results.data || []);
            setRegionalLoading(false);
          },
          error: (err: Error) => {
            const message = err?.message || "Unknown CSV parse error";
            setRegionalError(`CSV Parse Error: ${message}`);
            setRegionalLoading(false);
          },
        });
      })
      .catch((err: Error) => {
        setRegionalError(err.message);
        setRegionalLoading(false);
      });
  }, [selectedCountry, selectedIsland]);

  useEffect(() => {
    if (selectedCountry === "WS") {
      setRegionalMetric("Total_AAL");
    } else {
      setRegionalMetric("Damaged_Buildings");
    }
  }, [selectedCountry]);

  const yearOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.Year).filter((value) => value !== null && value !== undefined)))
      .sort((a, b) => Number(a) - Number(b)) as number[];
  }, [rows]);

  const returnPeriodOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.Return_Period).filter((value) => value !== null && value !== undefined)))
      .sort((a, b) => Number(a) - Number(b)) as number[];
  }, [rows]);

  useEffect(() => {
    if (!rows.length || yearOptions.length === 0) return;
    if (selectedYear === "" || !yearOptions.includes(selectedYear as number)) {
      setSelectedYear(yearOptions[yearOptions.length - 1]);
    }
  }, [rows, yearOptions, selectedYear]);

  useEffect(() => {
    if (!rows.length || returnPeriodOptions.length === 0) return;
    if (selectedReturnPeriod === "" || !returnPeriodOptions.includes(selectedReturnPeriod as number)) {
      setSelectedReturnPeriod(returnPeriodOptions.includes(100) ? 100 : returnPeriodOptions[returnPeriodOptions.length - 1]);
    }
  }, [rows, returnPeriodOptions, selectedReturnPeriod]);

  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    return rows.filter((row) => {
      if (selectedYear !== "" && row.Year !== selectedYear) return false;
      if (selectedReturnPeriod !== "" && row.Return_Period !== selectedReturnPeriod) return false;
      return true;
    });
  }, [rows, selectedYear, selectedReturnPeriod]);

  const regionalReturnPeriods = useMemo(() => {
    if (selectedCountry === "WS") return [] as number[];
    return Array.from(
      new Set(
        regionalRows
          .map((row) => (row as RegionalImpactRow).Return_Period)
          .filter((value) => value !== null && value !== undefined)
      )
    ).sort((a, b) => Number(a) - Number(b)) as number[];
  }, [regionalRows, selectedCountry]);

  useEffect(() => {
    if (selectedCountry === "WS") return;
    if (!regionalRows.length || regionalReturnPeriods.length === 0) return;
    if (regionalReturnPeriod === "" || !regionalReturnPeriods.includes(regionalReturnPeriod as number)) {
      setRegionalReturnPeriod(regionalReturnPeriods.includes(100) ? 100 : regionalReturnPeriods[0]);
    }
  }, [regionalRows, regionalReturnPeriods, regionalReturnPeriod, selectedCountry]);

  const regionalChartData = useMemo(() => {
    if (!regionalRows.length) return null;

    const normalizeRegion = (value: string) =>
      value
        .replace(/_/g, " ")
        .replace(/\bprovince\b/gi, "")
        .replace(/&/g, "and")
        .replace(/[()'".,]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const targetRegion = selectedIsland ? normalizeRegion(selectedIsland) : "";
    if (!targetRegion) return null;

    if (selectedCountry === "WS") {
      const normalizedTarget = targetRegion;
      const summaryRow = regionalRows.find((row) => {
        const region = (row as SummaryRegionalRow).Region;
        if (!region) return false;
        const normalizedRegion = normalizeRegion(String(region));
        if (normalizedRegion === normalizedTarget) return true;
        return normalizedRegion.includes(normalizedTarget) || normalizedTarget.includes(normalizedRegion);
      }) as SummaryRegionalRow | undefined;

      if (!summaryRow) return null;

      const firstValue = Number(summaryRow[`First.${regionalMetric}` as keyof SummaryRegionalRow]);
      const lastValue = Number(summaryRow[`Last.${regionalMetric}` as keyof SummaryRegionalRow]);
      const firstYear = Number(summaryRow["First.Year"]);
      const lastYear = Number(summaryRow["Last.Year"]);

      return {
        labels: [firstYear, lastYear],
        datasets: [
          {
            label: SAMOA_METRIC_OPTIONS.find((m) => m.value === regionalMetric)?.label,
            data: [Number.isFinite(firstValue) ? firstValue : null, Number.isFinite(lastValue) ? lastValue : null],
            borderColor: "#64b5f6",
            backgroundColor: "rgba(100, 181, 246, 0.2)",
            fill: true,
            tension: 0.3,
          },
        ],
      };
    }

    if (regionalReturnPeriod === "") return null;

    const filtered = (regionalRows as RegionalImpactRow[]).filter(
      (row) =>
        row.Region &&
        normalizeRegion(String(row.Region)) === targetRegion &&
        row.Return_Period === regionalReturnPeriod
    );

    if (!filtered.length) return null;

    const ssp245 = filtered.filter((row) => String(row.Scenario || "").includes("ssp245"));
    const ssp585 = filtered.filter((row) => String(row.Scenario || "").includes("ssp585"));

    const years = Array.from(new Set([...ssp245.map((d) => d.Year), ...ssp585.map((d) => d.Year)])).sort(
      (a, b) => a - b
    );

    const datasets = [
      {
        label: `${REGIONAL_METRIC_OPTIONS.find((m) => m.value === regionalMetric)?.label} (SSP585)`,
        data: years.map((year) => ssp585.find((d) => d.Year === year)?.[regionalMetric as keyof RegionalImpactRow] ?? null),
        borderColor: "#ef5350",
        backgroundColor: "rgba(239, 83, 80, 0.1)",
        fill: true,
        tension: 0.3,
      },
      {
        label: `${REGIONAL_METRIC_OPTIONS.find((m) => m.value === regionalMetric)?.label} (SSP245)`,
        data: years.map((year) => ssp245.find((d) => d.Year === year)?.[regionalMetric as keyof RegionalImpactRow] ?? null),
        borderColor: "#ffa726",
        borderDash: [5, 5],
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
      },
    ];

    return { labels: years, datasets };
  }, [regionalRows, selectedCountry, selectedIsland, regionalReturnPeriod, regionalMetric]);

  const scenarioRows = useMemo(() => {
    const hasSsp245 = filteredRows.some((row) => String(row.Scenario || "").includes("ssp245"));
    const hasSsp585 = filteredRows.some((row) => String(row.Scenario || "").includes("ssp585"));
    const rowsByScenario: { [key: string]: EventImpactRow | null } = {
      ssp245: null,
      ssp585: null,
    };

    if (hasSsp245) {
      rowsByScenario.ssp245 = filteredRows.find((row) => String(row.Scenario || "").includes("ssp245")) || null;
    }
    if (hasSsp585) {
      rowsByScenario.ssp585 = filteredRows.find((row) => String(row.Scenario || "").includes("ssp585")) || null;
    }

    return rowsByScenario;
  }, [filteredRows]);

  const buildChartData = (row: EventImpactRow | null) => {
    if (!row) return null;
    const values = [
      row.Building_Loss || 0,
      row.Road_Loss || 0,
      row.Infrastructure_Loss || 0,
      row.Crop_Loss || 0,
    ];
    return {
      labels: ["Buildings", "Roads", "Infrastructure", "Crops"],
      datasets: [
        {
          data: values,
          backgroundColor: ["#9575CD", "#FFB74D", "#4DD0E1", "#81C784"],
          borderColor: "#1f2023",
          borderWidth: 2,
        },
      ],
    };
  };

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: { color: "#e0e0e0", font: { size: 10 }, boxWidth: 10 },
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const value = context.parsed || 0;
              return `${context.label}: ${formatCurrency(value)}`;
            },
          },
        },
      },
    }),
    []
  );

  if (!selectedCountry) {
    return <div className={styles.panelPlaceholder}>Select a country to view event impact.</div>;
  }

  if (loading) {
    return <div className={styles.panelPlaceholder}>Loading event impact...</div>;
  }

  if (error) {
    return <div className={styles.panelPlaceholder}>{error}</div>;
  }

  if (!filteredRows.length) {
    return <div className={styles.panelPlaceholder}>No event impact data available.</div>;
  }

  const displayValue = (value: any) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString("en-US");
    return String(value);
  };

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardTitle}>Event impact breakdown</div>
      <div className={styles.panelFilters}>
        <label className={styles.panelFilterItem}>
          Year
          <select
            className={styles.panelSelect}
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.panelFilterItem}>
          Return Period
          <select
            className={styles.panelSelect}
            value={selectedReturnPeriod}
            onChange={(event) => setSelectedReturnPeriod(Number(event.target.value))}
          >
            {returnPeriodOptions.map((rp) => (
              <option key={rp} value={rp}>
                {rp}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.panelChartGrid}>
        {scenarioRows.ssp245 && (
          <button
            type="button"
            className={styles.panelChartCard}
            onClick={() => setIsTableOpen(true)}
          >
            <div className={styles.panelCardMeta}>ssp245 (medium confidence)</div>
            <div className={styles.panelChartWrap}>
              <Doughnut data={buildChartData(scenarioRows.ssp245)!} options={chartOptions} />
            </div>
            <div className={styles.panelCardFooter}>
              Total loss: {formatCurrency(scenarioRows.ssp245.Total_Loss || 0)}
            </div>
          </button>
        )}
        {scenarioRows.ssp585 && (
          <button
            type="button"
            className={styles.panelChartCard}
            onClick={() => setIsTableOpen(true)}
          >
            <div className={styles.panelCardMeta}>ssp585 (medium confidence)</div>
            <div className={styles.panelChartWrap}>
              <Doughnut data={buildChartData(scenarioRows.ssp585)!} options={chartOptions} />
            </div>
            <div className={styles.panelCardFooter}>
              Total loss: {formatCurrency(scenarioRows.ssp585.Total_Loss || 0)}
            </div>
          </button>
        )}
      </div>

      {selectedIsland && (
        <div className={styles.panelCard} style={{ marginTop: "16px" }}>
          <div className={styles.panelCardTitle}>Regional impact projection</div>
          <div className={styles.panelFilters} style={{ gridTemplateColumns: "1fr" }}>
            <label className={styles.panelFilterItem}>
              Metric
              <select
                className={styles.panelSelect}
                value={regionalMetric}
                onChange={(event) => setRegionalMetric(event.target.value)}
              >
                {(selectedCountry === "WS" ? SAMOA_METRIC_OPTIONS : REGIONAL_METRIC_OPTIONS).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedCountry !== "WS" && (
              <label className={styles.panelFilterItem}>
                Return Period
                <select
                  className={styles.panelSelect}
                  value={regionalReturnPeriod}
                  onChange={(event) => setRegionalReturnPeriod(Number(event.target.value))}
                >
                  {regionalReturnPeriods.map((rp) => (
                    <option key={rp} value={rp}>
                      {rp}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {regionalLoading && <div className={styles.panelPlaceholder}>Loading regional impact...</div>}
          {!regionalLoading && regionalError && <div className={styles.panelPlaceholder}>{regionalError}</div>}
          {!regionalLoading && !regionalError && regionalChartData && (
            <div className={styles.panelChartWrap} style={{ height: 260 }}>
              <Line
                data={regionalChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: "bottom",
                      labels: { color: "#ccc", boxWidth: 10, font: { size: 10 } },
                    },
                    tooltip: {
                      mode: "index",
                      intersect: false,
                      bodyFont: { size: 10 },
                      titleFont: { size: 11 },
                      callbacks: {
                        label: (context: any) => {
                          const val = context.parsed.y;
                          if (val === null || val === undefined) return "";
                          const isCurrency = /Loss|AAL/i.test(String(regionalMetric));
                          if (isCurrency) {
                            return `${context.dataset.label}: $${Number(val).toLocaleString()}`;
                          }
                          return `${context.dataset.label}: ${Math.round(Number(val)).toLocaleString()}`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { color: "#333" },
                      ticks: { color: "#aaa", font: { size: 9 } },
                    },
                    y: {
                      grid: { color: "#333" },
                      ticks: {
                        color: "#aaa",
                        font: { size: 9 },
                        callback: (value: any) => {
                          const isCurrency = /Loss|AAL/i.test(String(regionalMetric));
                          if (typeof value === "number" && isCurrency) {
                            if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1) + "M";
                            if (value >= 1_000) return "$" + (value / 1_000).toFixed(0) + "k";
                            return "$" + value;
                          }
                          return value;
                        },
                      },
                      title: {
                        display: true,
                        text: (selectedCountry === "WS" ? SAMOA_METRIC_OPTIONS : REGIONAL_METRIC_OPTIONS).find(
                          (m) => m.value === regionalMetric
                        )?.label,
                        color: "#888",
                        font: { size: 9 },
                      },
                    },
                  },
                }}
              />
            </div>
          )}

          {!regionalLoading && !regionalError && !regionalChartData && (
            <div className={styles.panelPlaceholder}>No regional data for the selected island.</div>
          )}
        </div>
      )}

      {isTableOpen &&
        createPortal(
          <div className={styles.modalOverlay} onClick={() => setIsTableOpen(false)}>
            <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Event impact data</h3>
                <button className={styles.closeButton} onClick={() => setIsTableOpen(false)}>
                  Close
                </button>
              </div>
              <div className={styles.modalBody} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className={styles.panelFilters}>
                  <label className={styles.panelFilterItem}>
                    Year
                    <select
                      className={styles.panelSelect}
                      value={selectedYear}
                      onChange={(event) => setSelectedYear(Number(event.target.value))}
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.panelFilterItem}>
                    Return Period
                    <select
                      className={styles.panelSelect}
                      value={selectedReturnPeriod}
                      onChange={(event) => setSelectedReturnPeriod(Number(event.target.value))}
                    >
                      {returnPeriodOptions.map((rp) => (
                        <option key={rp} value={rp}>
                          {rp}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.panelChartGrid}>
                  {scenarioRows.ssp245 && (
                    <div className={styles.panelChartCard} style={{ cursor: "default" }}>
                      <div className={styles.panelCardMeta}>ssp245 (medium confidence)</div>
                      <div className={styles.panelChartWrap}>
                        <Doughnut data={buildChartData(scenarioRows.ssp245)!} options={chartOptions} />
                      </div>
                      <div className={styles.panelCardFooter}>
                        Total loss: {formatCurrency(scenarioRows.ssp245.Total_Loss || 0)}
                      </div>
                    </div>
                  )}
                  {scenarioRows.ssp585 && (
                    <div className={styles.panelChartCard} style={{ cursor: "default" }}>
                      <div className={styles.panelCardMeta}>ssp585 (medium confidence)</div>
                      <div className={styles.panelChartWrap}>
                        <Doughnut data={buildChartData(scenarioRows.ssp585)!} options={chartOptions} />
                      </div>
                      <div className={styles.panelCardFooter}>
                        Total loss: {formatCurrency(scenarioRows.ssp585.Total_Loss || 0)}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.tableContainer} style={{ flex: 1, minHeight: 0 }}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        {fields.map((field) => (
                          <th key={field}>{field}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows
                        .filter((row) =>
                          String(row.Scenario || "").includes("ssp245") || String(row.Scenario || "").includes("ssp585")
                        )
                        .map((row, index) => (
                          <tr key={`${row.Scenario}-${index}`}>
                            {fields.map((field) => (
                              <td key={field}>{displayValue(row[field])}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

export default EventPanel;
