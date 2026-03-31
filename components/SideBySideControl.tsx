"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface SideBySideControlProps {
  leftUrl: string;
  rightUrl: string;
  wmsParams: Record<string, unknown>;
  enabled: boolean;
  opacity?: number;
}

/**
 * Pure-React side-by-side WMS compare control.
 * Avoids L.Control.extend / includes entirely — manages clip CSS directly.
 */
export default function SideBySideControl({
  leftUrl,
  rightUrl,
  wmsParams,
  enabled,
  opacity = 0.8,
}: SideBySideControlProps) {
  const map = useMap();
  const leftLayerRef  = useRef<L.TileLayer.WMS | null>(null);
  const rightLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const containerRef  = useRef<HTMLDivElement | null>(null);
  const rangeRef      = useRef<HTMLInputElement | null>(null);
  const rafRef        = useRef<number>(0);

  // ── clip helpers ──────────────────────────────────────────────
  const getSliderX = useCallback((): number => {
    const range = rangeRef.current;
    if (!range) return map.getSize().x / 2;
    const val    = parseFloat(range.value); // 0–1
    const offset = (0.5 - val) * 42;        // 42 = thumb width
    return map.getSize().x * val + offset;
  }, [map]);

  const applyClip = useCallback(() => {
    try {
      const nw    = map.containerPointToLayerPoint(L.point(0, 0));
      const se    = map.containerPointToLayerPoint(map.getSize());
      const clipX = nw.x + getSliderX();

      // move divider bar
      const divider = containerRef.current?.querySelector<HTMLElement>(".sbs-divider");
      if (divider) divider.style.left = `${getSliderX()}px`;

      const rect = (t: number, r: number, b: number, l: number) =>
        `rect(${t}px,${r}px,${b}px,${l}px)`;

      const leftEl  = leftLayerRef.current?.getContainer();
      const rightEl = rightLayerRef.current?.getContainer();
      if (leftEl)  leftEl.style.clip  = rect(nw.y, clipX, se.y, nw.x);
      if (rightEl) rightEl.style.clip = rect(nw.y, se.x,  se.y, clipX);
    } catch (err) {
      // Defensive: if layers/DOM not ready or Leaflet internals are missing, skip clipping
      // This prevents uncaught errors such as reading _leaflet_pos on detached elements.
      // We'll try again on the next scheduled frame.
      // eslint-disable-next-line no-console
      console.warn('SideBySideControl.applyClip skipped due to:', err);
    }
  }, [map, getSliderX]);

  const scheduleClip = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyClip);
  }, [applyClip]);

  // ── layer / slider lifecycle ───────────────────────────────────
  useEffect(() => {
    // Clean up any previous state
    const clearLayers = () => {
      const lc = leftLayerRef.current;
      const rc = rightLayerRef.current;
      if (lc) { try { const el = lc.getContainer() as HTMLElement; el.style.clip = ""; delete el.dataset.sbsRole; } catch { /* noop */ } map.removeLayer(lc); leftLayerRef.current  = null; }
      if (rc) { try { const el = rc.getContainer() as HTMLElement; el.style.clip = ""; delete el.dataset.sbsRole; } catch { /* noop */ } map.removeLayer(rc); rightLayerRef.current = null; }
      containerRef.current?.remove();
      containerRef.current = null;
    };

    map.off("move zoom", scheduleClip);
    clearLayers();

    if (!enabled) return;

    // Add both WMS layers (overlay pane so they sit above basemap)
    const params = { ...wmsParams, opacity, pane: "overlayPane", zIndex: 650 } as L.WMSOptions;
    leftLayerRef.current  = L.tileLayer.wms(leftUrl,  params).addTo(map);
    rightLayerRef.current = L.tileLayer.wms(rightUrl, params).addTo(map);

    // Tag containers so MapScreenshotButton can identify each layer
    try { (leftLayerRef.current.getContainer()  as HTMLElement).dataset.sbsRole = "left";  } catch { /* noop */ }
    try { (rightLayerRef.current.getContainer() as HTMLElement).dataset.sbsRole = "right"; } catch { /* noop */ }

    // Build slider UI – append to map's _controlContainer so it overlays the map
    const ctrlRoot = (map as unknown as { _controlContainer: HTMLElement })._controlContainer;
    const wrap = containerRef.current = document.createElement("div");
    wrap.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;z-index:700;pointer-events:none;";

    const divider = document.createElement("div");
    divider.className = "sbs-divider";
    divider.style.cssText = [
      "position:absolute", "top:0", "bottom:0", "width:2px",
      "background:rgba(255,255,255,0.85)",
      "box-shadow:0 0 6px rgba(0,0,0,0.4)",
      "pointer-events:none",
      "transform:translateX(-50%)",
    ].join(";");

    const range = rangeRef.current = document.createElement("input");
    range.type  = "range";
    range.min   = "0";
    range.max   = "1";
    range.step  = "any";
    range.value = "0.5";
    range.className = "leaflet-sbs-range";
    range.style.cssText = [
      "position:absolute",
      "top:50%", "left:0", "right:0",
      "width:100%", "height:44px",
      "transform:translateY(-50%)",
      "background:transparent",
      "outline:none",
      "cursor:ew-resize",
      "pointer-events:auto",
      "appearance:none",
      "-webkit-appearance:none",
      "margin:0", "padding:0",
    ].join(";");

    wrap.appendChild(divider);
    wrap.appendChild(range);
    ctrlRoot.appendChild(wrap);

    // Prevent map drag while sliding
    let draggingWasEnabled = false;
    const onDown = () => { draggingWasEnabled = map.dragging.enabled(); map.dragging.disable(); };
    const onUp   = () => { if (draggingWasEnabled) map.dragging.enable(); };
    range.addEventListener("mousedown",  onDown);
    range.addEventListener("touchstart", onDown);
    range.addEventListener("mouseup",    onUp);
    range.addEventListener("touchend",   onUp);
    range.addEventListener("input",      scheduleClip);

    map.on("move zoom", scheduleClip);

    // Wait one frame for tile layer containers to be in the DOM, then clip
    setTimeout(scheduleClip, 50);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off("move zoom", scheduleClip);
      range.removeEventListener("mousedown",  onDown);
      range.removeEventListener("touchstart", onDown);
      range.removeEventListener("mouseup",    onUp);
      range.removeEventListener("touchend",   onUp);
      range.removeEventListener("input",      scheduleClip);
      clearLayers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, leftUrl, rightUrl, opacity]);
  // wmsParams is stable (useMemo); scheduleClip has stable identity per render cycle

  return null;
}
