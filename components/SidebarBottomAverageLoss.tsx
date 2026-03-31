"use client";

/// <reference types="react/canary" />
import React, { useEffect, useState, useRef } from "react";
import styles from './FilterSidebar.module.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Papa from 'papaparse';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SidebarBottomAverageLossProps {
  selectedCountry?: string;
  selectedIsland?: string;
  cardinalDirection?: string;
}

interface CSVRow {
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

const countryToIso3: { [key: string]: string } = {
  'CK': 'COK',
  'TO': 'TON',
  'TV': 'TUV',
  'VU': 'VUT',
  'WS': 'WSM',
  'FJ': 'FJI',
  'MH': 'MHL'
};

const countryFileMap: { [key: string]: string } = {
  'COK': 'latest results-average-loss.csv',
  'TON': 'Example dashboard results-average-loss.csv',
  'TUV': 'latest (no duplicate regions)-average-loss.csv',
  'VUT': 'Latest full results-average-loss.csv',
  'MHL': 'dashboard results-average-loss.csv',
  'WSM': 'SLR example-average-loss.csv' // Assumption/Fallback
};

const countryDisplayNames: { [key: string]: string } = {
  'CK': 'Cook Islands',
  'TO': 'Tonga',
  'TV': 'Tuvalu',
  'VU': 'Vanuatu',
  'WS': 'Samoa',
  'FJ': 'Fiji',
  'MH': 'Marshall Islands'
};

export default function SidebarBottomAverageLoss({
  selectedCountry,
  selectedIsland,
  cardinalDirection,
}: SidebarBottomAverageLossProps) {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Expansion State
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<any>(null);

  const displayIsland = selectedIsland ? selectedIsland.replace(/_/g, " ") : "";
  const scopeLabel = selectedIsland
    ? `${displayIsland} level`
    : selectedCountry
      ? "National level"
      : "";

  // Icons from Lucide (or inline SVGs)
  const IconMicroscope = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      <line x1="11" y1="8" x2="11" y2="14"></line>
      <line x1="8" y1="11" x2="14" y2="11"></line>
    </svg>
  );

  const IconDownload = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );

  const IconDownloadImage = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
  );

  const IconDownloadCSV = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  );

  const IconChart = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  );

  const IconTable = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
  );

  const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );

  useEffect(() => {
    if (!selectedCountry) {
        setChartData(null);
        return;
    }

    const iso3 = countryToIso3[selectedCountry];
    if (!iso3) { // Fallback or handle cases not in map if necessary
        setChartData(null); 
        return; 
    }

    let filename = countryFileMap[iso3];
    
    // Override for COK regional data
    if (iso3 === 'COK' && selectedIsland) {
        filename = 'latest results-regional-average-loss.csv';
    }

    if (!filename) {
         setError(`Configuration missing for ${iso3}`);
         return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/dataset/${iso3}/${filename}`);
        if (!response.ok) {
            // Check if it's 404
            if (response.status === 404) {
               throw new Error("Dataset not found");
            }
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const csvText = await response.text();

        Papa.parse<CSVRow>(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            let data = results.data;

            // Filter by Region if an island is selected (specifically for COK regional file)
            if (iso3 === 'COK' && selectedIsland) {
                 // Normalize both valid inputs to lower case for comparison
                 // selectedIsland typically format like "aitutaki" or "rarotonga"
                 // CSV Region format like "Aitutaki"
                 const targetRegion = selectedIsland.replace(/_/g, ' ').toLowerCase();
                 data = data.filter(d => d.Region && d.Region.toLowerCase() === targetRegion);
                 
                 if (data.length === 0) {
                     // Fallback check - sometimes names might differ slightly, try partial match or log
                     console.log(`No data found for region: ${targetRegion}. Available regions:`, [...new Set(results.data.map(d => d.Region))]);
                 }
            }

            processData(data);
            setLoading(false);
          },
          error: (err: any) => {
            setError(`CSV Parse Error: ${err.message}`);
            setLoading(false);
          }
        });
      } catch (err: any) {
        console.error("Error loading chart data:", err);
        setError(err.message);
        setChartData(null);
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCountry, selectedIsland]);

  const processData = (data: CSVRow[]) => {
    // Separate data by scenario
    const ssp245Data = data.filter(row => row.Scenario && row.Scenario.includes('ssp245')).sort((a, b) => a.Year - b.Year);
    const ssp585Data = data.filter(row => row.Scenario && row.Scenario.includes('ssp585')).sort((a, b) => a.Year - b.Year);
    
    // Check if we have data
    if (ssp245Data.length === 0 && ssp585Data.length === 0) {
        setError("No data found.");
        setChartData(null);
        return;
    }

    // Get years (union of years, sorted)
    const yearsSet = new Set([...ssp245Data.map(d => d.Year), ...ssp585Data.map(d => d.Year)]);
    const years = Array.from(yearsSet).sort((a, b) => a - b);
    
    // Map data to years (handle missing years if any)
    const getValues = (dataset: CSVRow[], key: keyof CSVRow) => {
        return years.map(year => {
            const row = dataset.find(d => d.Year === year);
            return row ? row[key] : null;
        });
    };

    // Colors mapping - Smoother/Softer Palette
    const colors = {
      Buildings: '#9575CD', // Soft Purple
      Infrastructure: '#4DD0E1', // Soft Cyan
      Roads: '#FFB74D', // Soft Orange
      Crops: '#81C784', // Soft Green
      Population: '#F06292' // Soft Pink
    };

    const datasets = [
      // SSP585 Series (Solid) - High risk scenario
      {
        label: 'Buildings (SSP585)',
        data: getValues(ssp585Data, 'Building_AAL'),
        borderColor: colors.Buildings,
        backgroundColor: colors.Buildings,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Infrastructure (SSP585)',
        data: getValues(ssp585Data, 'Infrastructure_AAL'),
        borderColor: colors.Infrastructure,
        backgroundColor: colors.Infrastructure,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Roads (SSP585)',
        data: getValues(ssp585Data, 'Road_AAL'),
        borderColor: colors.Roads,
        backgroundColor: colors.Roads,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Crops (SSP585)',
        data: getValues(ssp585Data, 'Crops_AAL'),
        borderColor: colors.Crops,
        backgroundColor: colors.Crops,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Population (SSP585)',
        data: getValues(ssp585Data, 'Average_Annual_Population_Exposed'),
        borderColor: colors.Population,
        backgroundColor: colors.Population,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y1'
      },
      // SSP245 Series (Dashed) - Lower risk scenario
      {
        label: 'Buildings (SSP245)',
        data: getValues(ssp245Data, 'Building_AAL'),
        borderColor: colors.Buildings,
        backgroundColor: colors.Buildings,
        borderDash: [6, 4], // Distinct dashed pattern
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: 'rectRot', // Different point style for distinction
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Infrastructure (SSP245)',
        data: getValues(ssp245Data, 'Infrastructure_AAL'),
        borderColor: colors.Infrastructure,
        backgroundColor: colors.Infrastructure,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: 'rectRot',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Roads (SSP245)',
        data: getValues(ssp245Data, 'Road_AAL'),
        borderColor: colors.Roads,
        backgroundColor: colors.Roads,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: 'rectRot',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Crops (SSP245)',
        data: getValues(ssp245Data, 'Crops_AAL'),
        borderColor: colors.Crops,
        backgroundColor: colors.Crops,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: 'rectRot',
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Population (SSP245)',
        data: getValues(ssp245Data, 'Average_Annual_Population_Exposed'),
        borderColor: colors.Population,
        backgroundColor: colors.Population,
        borderDash: [6, 4],
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointStyle: 'rectRot',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ];

    setChartData({
      labels: years,
      datasets: datasets
    });
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const, // Moved legend to bottom as it's large
        labels: {
            color: '#e0e0e0',
            font: {
                size: 9
            },
            boxWidth: 10,
            usePointStyle: true
        }
      },
      title: {
        display: true,
        text: selectedIsland
          ? `${displayIsland.charAt(0).toUpperCase() + displayIsland.slice(1)} - Average Annual Loss by Scenario`
          : selectedCountry
          ? `${countryDisplayNames[selectedCountry] || selectedCountry} - Average Annual Loss by Scenario`
          : 'Average Annual Loss Breakdown',
        color: '#fff',
        font: {
            size: 13
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
            label: function(context: any) {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                if (context.parsed.y !== null) {
                    if (context.dataset.label.includes('Population')) {
                        // Integer format for people, exact value
                        label += new Intl.NumberFormat('en-US').format(context.parsed.y);
                    } else {
                        // Currency format for AAL, standard 2 decimal places or auto
                        // "Exact values" requested so avoiding abbreviation or cutting off
                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                    }
                }
                return label;
            }
        }
      },
    },
    scales: {
      x: {
        grid: {
            color: '#4a4b4f'
        },
        ticks: {
            color: '#999'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        stacked: false,
        grid: {
            color: '#4a4b4f'
        },
        ticks: {
            color: '#999',
            callback: function(value: any) {
                 return '$' + (value / 1000000).toFixed(0) + 'M'; // Format as Millions
            }
        },
        title: {
            display: true,
            text: 'Annual Loss AAL ($)',
            color: '#999',
            font: {
                size: 12
            }
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
            drawOnChartArea: false, // only want the grid lines for one axis to show up
        },
        ticks: {
             color: '#F06292',
             precision: 0, // Force integers
             callback: function(value: any) {
                 if (Math.floor(value) === value) {
                     return new Intl.NumberFormat('en-US').format(value);
                 }
            }
        },
        title: {
            display: true,
            text: 'Population Exposed',
            color: '#F06292',
            font: {
                size: 12
            }
        }
      }
    },
    

    interaction: {
        mode: 'nearest' as const,
        axis: 'x' as const,
        intersect: false
    }
  };

  const downloadPNG = () => {
    setIsDownloadMenuOpen(false);
    if (chartRef.current) {
        const link = document.createElement('a');
        link.download = `${selectedCountry || 'chart'}_AAL_Analysis.png`;
        link.href = chartRef.current.toBase64Image();
        link.click();
    }
  };

  const downloadCSV = () => {
    setIsDownloadMenuOpen(false);
    if (!chartData) return;

    // Construct data for CSV
    const headers = ['Year', ...chartData.datasets.map((d: any) => d.label)];
    const data = chartData.labels.map((year: any, i: number) => {
        const rowObject: any = { Year: year };
        chartData.datasets.forEach((d: any) => {
            rowObject[d.label] = d.data[i] !== null ? d.data[i] : '';
        });
        return rowObject;
    });

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedCountry || 'data'}_AAL_Analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderTable = () => {
    if (!chartData) return null;

    const headers = ['Year', ...chartData.datasets.map((d: any) => d.label)];
    const rows = chartData.labels.map((year: any, i: number) => {
        return [
            year,
            ...chartData.datasets.map((d: any) => d.data[i] !== null ? `$${(d.data[i] / 1000000).toFixed(2)}M` : '-')
        ];
    });

    return (
        <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
                <thead>
                    <tr>
                        {headers.map((h: string, i: number) => <th key={i}>{h}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row: any[], i: number) => (
                        <tr key={i}>
                            {row.map((cell: any, j: number) => <td key={j}>{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
  };

  return (
    <div className={styles.bottomSection}>
      {!selectedCountry ? (
          <p className={styles.placeholder}>Select a country to view data</p>
      ) : loading ? (
          <p className={styles.placeholder}>Loading data...</p>
      ) : error ? (
          <p className={styles.placeholder}>Data unavailable for this selection ({error})</p>
      ) : chartData ? (
          <>
            {scopeLabel && <div className={styles.panelScope}>{scopeLabel}</div>}
            <div className={styles.chartWrapper} onClick={() => setIsExpanded(true)}>
                <div className={styles.expandOverlay}>
                    <IconMicroscope />
                    <span className={styles.overlayText}>Click to expand</span>
                </div>
                <div style={{ height: '300px', width: '100%' }}>
                    <Line options={options} data={chartData} />
                </div>
            </div>

            {isExpanded && (
                <div className={styles.modalOverlay} onClick={() => setIsExpanded(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{countryDisplayNames[selectedCountry] || selectedCountry} - Data Explorer</h3>
                            <div className={styles.modalControls}>
                                <div className={styles.downloadWrapper} style={{ marginRight: '12px' }}>
                                    <button 
                                        className={`${styles.viewToggleBtn} ${isDownloadMenuOpen ? styles.active : ''}`}
                                        onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                                        title="Download"
                                    >
                                        <IconDownload />
                                    </button>
                                    
                                    {isDownloadMenuOpen && (
                                        <div className={styles.downloadDropdown}>
                                            <button className={styles.downloadItem} onClick={downloadPNG}>
                                                <IconDownloadImage /> Save Chart as PNG
                                            </button>
                                            <button className={styles.downloadItem} onClick={downloadCSV}>
                                                <IconDownloadCSV /> Download Raw Data CSV
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.viewToggleGroup}>
                                    <button 
                                        className={`${styles.viewToggleBtn} ${viewMode === 'chart' ? styles.active : ''}`}
                                        onClick={() => setViewMode('chart')}
                                    >
                                        <IconChart /> 
                                        {/* Chart */}
                                    </button>
                                    <button 
                                        className={`${styles.viewToggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
                                        onClick={() => setViewMode('table')}
                                    >
                                        <IconTable />
                                         {/* Table */}
                                    </button>
                                </div>
                                <button className={styles.closeButton} onClick={() => setIsExpanded(false)}>
                                    <IconClose />
                                </button>
                            </div>
                        </div>
                        <div className={styles.modalBody}>
                            {viewMode === 'chart' ? (
                                <div className={styles.expandedChartContainer}>
                                    <Line ref={chartRef} options={{...options, maintainAspectRatio: false}} data={chartData} />
                                </div>
                            ) : (
                                renderTable()
                            )}
                        </div>
                    </div>
                </div>
            )}
          </>
      ) : (
          <p className={styles.placeholder}>No chart data available</p>
      )}
    </div>
  );
}
