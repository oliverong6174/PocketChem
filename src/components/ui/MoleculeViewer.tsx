import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { useDialog } from "./useDialog";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 24;
const STEP = 1.25;

/** The SVG's own size: its width and height attributes, else its viewBox. Used for proportions only; the markup itself is never rewritten. */
export function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const num = (name: string) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*['"]\\s*([0-9.]+)(?:px)?\\s*['"]`, "i").exec(tag);
    return match ? Number.parseFloat(match[1]) : null;
  };
  const box = /viewBox\s*=\s*['"]\s*([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)\s*['"]/i.exec(tag);
  const width = num("width") ?? (box ? Number.parseFloat(box[3]) : 400);
  const height = num("height") ?? (box ? Number.parseFloat(box[4]) : 300);
  return { width: width > 0 ? width : 400, height: height > 0 ? height : 300 };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export type MoleculeViewerProps = { svg: string; title: string; onClose: () => void; toolbar?: React.ReactNode };

/**
 * A full-window viewer for a molecular SVG. The SVG is the exact depiction that was on the page (highlights, wedges, charges,
 * labels), re-laid-out at a larger size: it is resized, never rasterised, so it stays sharp at any zoom.
 */
export function MoleculeViewer({ svg, title, onClose, toolbar }: MoleculeViewerProps) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { width: naturalWidth, height: naturalHeight } = useMemo(() => svgIntrinsicSize(svg), [svg]);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1); // relative to "fit"
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; centre: { x: number; y: number } } | null>(null);
  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => { stateRef.current = { zoom, pan }; });

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const measure = () => setStage({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = stage.width > 0 ? Math.min((stage.width - 24) / naturalWidth, (stage.height - 24) / naturalHeight) : 1;
  const displayWidth = naturalWidth * fitScale * zoom;
  const displayHeight = naturalHeight * fitScale * zoom;

  const fit = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  /** Zoom keeping the point (px, py), measured from the stage centre, fixed on screen. */
  const zoomTo = useCallback((next: number, px = 0, py = 0) => {
    const { zoom: current, pan: currentPan } = stateRef.current;
    const target = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const ratio = target / current;
    setZoom(target);
    setPan({ x: px - (px - currentPan.x) * ratio, y: py - (py - currentPan.y) * ratio });
  }, []);
  /** 100% means one SVG pixel per CSS pixel. */
  const actualSize = useCallback(() => { if (fitScale > 0) zoomTo(1 / fitScale); }, [fitScale, zoomTo]);

  // The wheel listener is attached natively: React's is passive, and the page must not scroll under the viewer.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      zoomTo(stateRef.current.zoom * factor, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const centreOf = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: stateRef.current.zoom, pan: stateRef.current.pan, centre: centreOf(a, b) };
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const start = gesture.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const centre = centreOf(a, b);
      const target = clamp(start.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / start.distance), MIN_ZOOM, MAX_ZOOM);
      const ratio = target / start.zoom;
      const px = start.centre.x - rect.left - rect.width / 2;
      const py = start.centre.y - rect.top - rect.height / 2;
      setZoom(target);
      setPan({ x: px - (px - start.pan.x) * ratio + (centre.x - start.centre.x), y: py - (py - start.pan.y) * ratio + (centre.y - start.centre.y) });
    } else if (pointers.current.size === 1) {
      setPan((current) => ({ x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }));
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) setDragging(false);
    else if (pointers.current.size === 1) { /* continue the drag from the remaining finger */ }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const move = 40;
    switch (event.key) {
      case "+": case "=": zoomTo(zoom * STEP); break;
      case "-": case "_": zoomTo(zoom / STEP); break;
      case "0": fit(); break;
      case "1": actualSize(); break;
      case "ArrowLeft": setPan((p) => ({ ...p, x: p.x + move })); break;
      case "ArrowRight": setPan((p) => ({ ...p, x: p.x - move })); break;
      case "ArrowUp": setPan((p) => ({ ...p, y: p.y + move })); break;
      case "ArrowDown": setPan((p) => ({ ...p, y: p.y - move })); break;
      default: return;
    }
    event.preventDefault();
  };

  const percent = Math.round(fitScale * zoom * 100);
  const node = (
    <div className="mv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-label={`${title}, enlarged`} aria-modal="true" className="mv-dialog" data-testid="molecule-viewer" ref={dialogRef} role="dialog">
        <div className="mv-bar">
          <span className="mv-title" title={title}>{title}</span>
          <div className="mv-tools" role="toolbar" aria-label="View controls">
            <button aria-label="Zoom out" className="mv-btn" data-testid="mv-zoom-out" onClick={() => zoomTo(zoom / STEP)} title="Zoom out (-)" type="button"><Icon name="zoomOut" /></button>
            <output aria-live="off" className="mv-zoom" data-testid="mv-zoom">{percent}%</output>
            <button aria-label="Zoom in" className="mv-btn" data-testid="mv-zoom-in" onClick={() => zoomTo(zoom * STEP)} title="Zoom in (+)" type="button"><Icon name="zoomIn" /></button>
            <button aria-label="Fit molecule to view" className="mv-btn" data-testid="mv-fit" onClick={fit} title="Fit to view (0)" type="button"><Icon name="fit" /></button>
            <button className="mv-btn mv-text" data-testid="mv-reset" onClick={actualSize} title="Actual size (1)" type="button">100%</button>
            {toolbar}
          </div>
          <button aria-label="Close" className="mv-btn mv-close" data-autofocus data-testid="mv-close" onClick={onClose} title="Close (Esc)" type="button"><Icon name="close" /></button>
        </div>
        <div
          aria-label="Molecule. Drag to pan, scroll or pinch to zoom, arrow keys to move, plus and minus to zoom, 0 to fit."
          className={`mv-stage${dragging ? " is-dragging" : ""}`}
          data-testid="mv-stage"
          onDoubleClick={() => (zoom === 1 ? zoomTo(2.5) : fit())}
          onKeyDown={onKeyDown}
          onPointerCancel={onPointerEnd}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          ref={stageRef}
          role="application"
          tabIndex={0}
        >
          <div
            aria-hidden="true"
            className="mv-canvas"
            // The exact SVG the page was showing; only its box is resized.
            dangerouslySetInnerHTML={{ __html: svg }}
            data-testid="mv-canvas"
            style={{ width: displayWidth, height: displayHeight, left: (stage.width - displayWidth) / 2 + pan.x, top: (stage.height - displayHeight) / 2 + pan.y }}
          />
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
