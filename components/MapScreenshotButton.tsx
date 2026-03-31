"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";

interface ScreenshotOptions {
  includeLegend: boolean;
  includeStoryOverlay: boolean;
  includeLeftPanel: boolean;
  includeRightPanel: boolean;
}

export default function MapScreenshotButton() {
  const map = useMap();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [options, setOptions] = useState<ScreenshotOptions>({
    includeLegend: true,
    includeStoryOverlay: true,
    includeLeftPanel: true,
    includeRightPanel: true,
  });

  useEffect(() => {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "position:absolute",
      "bottom:30px",
      "right:10px",
      "z-index:1000",
    ].join(";");

    const button = document.createElement("button");
    button.title = "Download map screenshot";
    button.style.cssText = [
      "width:36px",
      "height:36px",
      "background:white",
      "border:2px solid rgba(0,0,0,0.3)",
      "border-radius:4px",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "box-shadow:0 1px 5px rgba(0,0,0,0.4)",
      "padding:0",
    ].join(";");

    // Camera icon SVG
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
           fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>`;

    // Hover effect
    button.addEventListener("mouseenter", () => {
      button.style.background = "#f4f4f4";
    });
    button.addEventListener("mouseleave", () => {
      if (!button.disabled) button.style.background = "white";
    });

    button.addEventListener("click", () => {
      setShowModal(true);
    });

    wrap.appendChild(button);
    wrapRef.current = wrap;

    // Inject into the Leaflet control container so it sits above the map tiles
    const ctrlRoot = (map as unknown as { _controlContainer: HTMLElement })._controlContainer;
    ctrlRoot.appendChild(wrap);

    return () => {
      wrap.remove();
    };
  }, [map]);

  // Helper function to determine which elements to ignore in screenshots
  const shouldIgnoreElement = (
    el: Element,
    captureTarget: HTMLElement,
    options: ScreenshotOptions
  ): boolean => {
    // Left panel (Filters sidebar) — identified by data-panel="left"
    if ((el as HTMLElement).dataset?.panel === 'left') {
      return !options.includeLeftPanel;
    }
    // Right panel (Impact sidebar) — identified by data-panel="right"
    if ((el as HTMLElement).dataset?.panel === 'right') {
      return !options.includeRightPanel;
    }
    // Optionally hide legend (bottom-left corner with specific styling)
    if (!options.includeLegend) {
      // Check if element or parent has legend-like styling
      const style = el.getAttribute('style') || '';
      if (
        (style.includes('backgroundColor') || style.includes('background-color') || style.includes('background:')) &&
        (style.includes('rgba(0,0,0') || style.includes('rgba(0, 0, 0')) &&
        el.textContent?.includes('m')
      ) {
        return true;
      }
      if (el.classList.contains('leaflet-bottom') && el.classList.contains('leaflet-left')) {
        return true;
      }
    }
    // Always hide attribution
    if (el.classList.contains('leaflet-control-attribution')) {
      return true;
    }
    // Optionally hide story overlay (top-center banner)
    if (!options.includeStoryOverlay) {
      const style = el.getAttribute('style') || '';
      if (
        style.includes('backdropFilter') &&
        (el.textContent?.includes('Event') || el.textContent?.includes('Sea Level Rise'))
      ) {
        return true;
      }
    }
    return false;
  };

  const handleCapture = async () => {
    setShowModal(false);
    
    const button = wrapRef.current?.querySelector("button");
    if (!button) return;

    button.disabled = true;
    button.style.opacity = "0.4";
    // Spinner while working
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
           fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
      </svg>`;

    try {
      const html2canvas = (await import("html2canvas")).default;

      // Hide UI elements temporarily
      const wrap = wrapRef.current;
      if (wrap) wrap.style.display = "none";

      const mapContainer = map.getContainer();
      // Capture the parent container that includes both map and overlays
      const captureTarget = mapContainer.parentElement || mapContainer;

      // Measure crop coordinates relative to captureTarget (before any DOM changes)
      const scale = window.devicePixelRatio || 1;
      const captureRect = captureTarget.getBoundingClientRect();
      const mapRect = mapContainer.getBoundingClientRect();
      // Use the map container edges directly — pixel-perfect and ignores any border/gap on panels
      const cropLeft  = !options.includeLeftPanel
        ? Math.round((mapRect.left  - captureRect.left) * scale)
        : 0;
      const cropRight = !options.includeRightPanel
        ? Math.round((mapRect.right - captureRect.left) * scale)
        : -1;

      // Find compare mode elements
      const compareSlider = document.querySelector<HTMLElement>(".leaflet-sbs-range");
      const compareDivider = document.querySelector<HTMLElement>(".sbs-divider");
      const isCompareMode = !!(compareSlider && compareDivider);

      // Hide slider control and divider for clean capture
      if (compareSlider) compareSlider.style.display = "none";
      if (compareDivider) compareDivider.style.display = "none";

      let canvas: HTMLCanvasElement;

      if (isCompareMode) {
        // html2canvas ignores legacy CSS clip:rect() so we must capture each layer separately
        // using ignoreElements, then composite at the correct split position.
        const leftLayerEl  = document.querySelector<HTMLElement>('[data-sbs-role="left"]');
        const rightLayerEl = document.querySelector<HTMLElement>('[data-sbs-role="right"]');

        // Capture LEFT layer only (ignore right layer)
        const leftCanvas = await html2canvas(captureTarget, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
          ignoreElements: (el) => {
            if (rightLayerEl && el === rightLayerEl) return true;
            return shouldIgnoreElement(el, captureTarget, options);
          },
        });

        // Capture RIGHT layer only (ignore left layer)
        const rightCanvas = await html2canvas(captureTarget, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
          ignoreElements: (el) => {
            if (leftLayerEl && el === leftLayerEl) return true;
            return shouldIgnoreElement(el, captureTarget, options);
          },
        });

        // Calculate split position in canvas pixel coordinates.
        // Slider value is 0–1. getSliderX in SideBySideControl uses:
        //   sliderX = mapSize.x * val + (0.5 - val) * thumbWidth
        const sliderVal = parseFloat((compareSlider as HTMLInputElement).value); // 0–1
        const thumbWidth = 42;
        const sliderXinMap = map.getSize().x * sliderVal + (0.5 - sliderVal) * thumbWidth;
        const mapOffsetX = (mapRect.left - captureRect.left) * scale;
        const splitX = Math.round(mapOffsetX + sliderXinMap * scale);

        // Composite: left half from leftCanvas, right half from rightCanvas
        canvas = document.createElement('canvas');
        canvas.width  = leftCanvas.width;
        canvas.height = leftCanvas.height;
        const ctx = canvas.getContext('2d')!;

        ctx.drawImage(leftCanvas,  0,       0, splitX,                    leftCanvas.height,  0,       0, splitX,                   canvas.height);
        ctx.drawImage(rightCanvas, splitX,  0, rightCanvas.width - splitX, rightCanvas.height, splitX,  0, canvas.width - splitX,    canvas.height);

        // Draw the divider line
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur  = 4 * scale;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth   = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, canvas.height);
        ctx.stroke();
        ctx.restore();

      } else {
        // Normal mode - single capture
        canvas = await html2canvas(captureTarget, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
          ignoreElements: (el) => {
            return shouldIgnoreElement(el, captureTarget, options);
          },
        });
      }

      // Restore UI elements
      if (wrap) wrap.style.display = "";
      if (compareSlider) compareSlider.style.display = "";
      if (compareDivider) compareDivider.style.display = "";

      // Crop out white gaps where excluded panels were
      const finalRight = cropRight > 0 ? cropRight : canvas.width;
      if (cropLeft > 0 || finalRight < canvas.width) {
        const cropWidth = finalRight - cropLeft;
        const cropped = document.createElement('canvas');
        cropped.width  = cropWidth;
        cropped.height = canvas.height;
        cropped.getContext('2d')!.drawImage(
          canvas, cropLeft, 0, cropWidth, canvas.height,
          0,       0, cropWidth, canvas.height
        );
        canvas = cropped;
      }

      // Try to export; may throw if cross-origin tiles taint the canvas
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        // Fallback: export anyway (JPEG avoids some security restrictions)
        dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      }

      const link = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.download = `map-${ts}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Screenshot failed:", err);
      const wrap = wrapRef.current;
      if (wrap) wrap.style.display = "";
    } finally {
      button.disabled = false;
      button.style.opacity = "1";
      // Restore camera icon
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
             fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>`;
    }
  };

  // Detect if compare mode is active
  const compareSlider = typeof window !== 'undefined' ? document.querySelector<HTMLElement>(".leaflet-sbs-range") : null;
  const isCompareMode = compareSlider?.style.display !== "none" && compareSlider !== null;

  return (
    <>
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#2e2f33",
              border: "1px solid #4a4b4f",
              borderRadius: "10px",
              width: "90vw",
              maxWidth: "400px",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
              color: "#e0e0e0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #1a1b1e",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "14px", color: "#fff" }}>Screenshot Options</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#e0e0e0",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px" }}>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#bbb" }}>
                Select what to include in your screenshot:
              </p>
              {isCompareMode && (
                <div
                  style={{
                    padding: "10px",
                    marginBottom: "16px",
                    backgroundColor: "rgba(33, 150, 243, 0.15)",
                    border: "1px solid rgba(33, 150, 243, 0.3)",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#64b5f6",
                  }}
                >
                  ℹ️ Compare Layer: Screenshot will show the split view with both scenarios side-by-side.
                </div>
              )}
              <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={options.includeLegend}
                    onChange={(e) => setOptions({ ...options, includeLegend: e.target.checked })}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Include Map Legend</span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={options.includeStoryOverlay}
                    onChange={(e) => setOptions({ ...options, includeStoryOverlay: e.target.checked })}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Include Scenario Info (top banner)</span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={options.includeLeftPanel}
                    onChange={(e) => setOptions({ ...options, includeLeftPanel: e.target.checked })}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Include Left Panel (Filters)</span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={options.includeRightPanel}
                    onChange={(e) => setOptions({ ...options, includeRightPanel: e.target.checked })}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Include Right Panel (Impact)</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    borderRadius: "6px",
                    border: "1px solid #4a4b4f",
                    backgroundColor: "transparent",
                    color: "#e0e0e0",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCapture}
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: "600",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "#1976d2",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  📸 Capture Screenshot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
