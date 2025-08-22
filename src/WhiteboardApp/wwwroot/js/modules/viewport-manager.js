
// Viewport Manager Module - fixed

// State (world units)
export let viewportX = 0;
export let viewportY = 0;
export let zoomLevel = 1;

// Pan
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

// Smooth camera
let targetViewportX = 0;
let targetViewportY = 0;
let cameraAnimationId = null;

// Minimap
let minimapCanvas = null;
let minimapCtx = null;
let minimapViewport = null;
let isMinimapDragging = false;
let minimapDragStart = { x: 0, y: 0 };
let minimapHasDragged = false;

// Minimap perf
let minimapUpdateQueued = false;
let lastMinimapUpdate = 0;
const minimapUpdateThrottle = 16; // ~60fps

// Minimap drag state
let minimapDragTransform = null;

// Zoom config - infinite scaling
const MIN_ZOOM = 0.001; // Very small but not zero to prevent division errors
const MAX_ZOOM = 1000;  // Very large to allow infinite-like scaling
const ZOOM_FACTOR = 1.1;

// Deps
let dependencies = {
  canvas: null,                       // HTMLCanvasElement (main)
  ctx: null,
  elements: null,                     // Map
  redrawCanvas: null,                 // () => void
  renderElementToMinimap: null,       // (element, minimapCtx) => void
  applyViewportTransform: null,       // unused here; canvas module owns transforms
  resetCanvasTransform: null,         // unused here
  updateCanvasCursor: null,           // (cssCursor) => void
  blazorReference: null,              // optional
};

export function setDependencies(deps) { Object.assign(dependencies, deps); }

// --- helpers ---------------------------------------------------------------

function clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); }

function cssCanvasSize() {
  const rect = dependencies.canvas?.getBoundingClientRect();
  return rect ? { w: rect.width, h: rect.height } : { w: 800, h: 600 };
}

function requestRedraw() { dependencies.redrawCanvas?.(); }

// --- init / reset ----------------------------------------------------------

export function initializeViewport() {
  try {
    resetViewport();
    initializeMinimap();
    return true;
  } catch (e) {
    console.error('Failed to initialize viewport:', e);
    return false;
  }
}

export function resetViewport() {
  try {
    // console.log('resetViewport called - setting to (0,0,1)');
    viewportX = 0; viewportY = 0; zoomLevel = 1;
    targetViewportX = 0; targetViewportY = 0;
    requestRedraw();
    updateZoomLevelDisplay();
    updateMinimapImmediate();
  } catch (e) {
    console.error('Failed to reset viewport:', e);
  }
}

// --- zoom ------------------------------------------------------------------

export function zoomAtCenter(factor) {
  try {
    if (!dependencies.canvas) return false;
    const { w, h } = cssCanvasSize();
    return zoomAtPoint(w / 2, h / 2, factor);
  } catch (e) {
    console.error('Failed to zoom at center:', e);
    return false;
  }
}

export function zoomAtPoint(screenX, screenY, factor) {
  try {
    const oldZoom = zoomLevel;
    const newZoom = clampZoom(oldZoom * factor);
    if (newZoom === oldZoom) return false;

    // console.log('[zoomAtPoint:before] sx=%o sy=%o oldZ=%o vx=%o vy=%o', screenX, screenY, zoomLevel, viewportX, viewportY);

    // screen -> world at the focal point
    const worldX = screenX / oldZoom + viewportX;
    const worldY = screenY / oldZoom + viewportY;

    zoomLevel = newZoom;

    // keep the same world point under the cursor
    viewportX = worldX - screenX / newZoom;
    viewportY = worldY - screenY / newZoom;

    // console.log('[zoomAtPoint:after] newZ=%o vx=%o vy=%o', zoomLevel, viewportX, viewportY);

    requestRedraw();
    updateZoomLevelDisplay();
    updateMinimapImmediate();
    return true;
  } catch (e) {
    console.error('Failed to zoom at point:', e);
    return false;
  }
}

export function resetZoom() {
  try {
    if (zoomLevel === 1) return false;
    zoomLevel = 1;
    requestRedraw();
    updateZoomLevelDisplay();
    updateMinimapImmediate();
    return true;
  } catch (e) {
    console.error('Failed to reset zoom:', e);
    return false;
  }
}

// TEMP DEBUG: Function to manually fix viewport coordinates  
export function fixViewportCoordinates() {
  // console.log(`BEFORE FIX: viewport:(${viewportX.toFixed(1)}, ${viewportY.toFixed(1)}) zoom:${(zoomLevel*100).toFixed(0)}%`);
  viewportX = 0;
  viewportY = 0;
  zoomLevel = 1;
  // console.log(`AFTER FIX: viewport:(${viewportX.toFixed(1)}, ${viewportY.toFixed(1)}) zoom:${(zoomLevel*100).toFixed(0)}%`);
  requestRedraw();
  updateZoomLevelDisplay();
  updateMinimapImmediate();
}

// Auto-fix function for large viewport offsets
export function autoFixLargeViewportOffset() {
  // console.log('Auto-fixing large viewport offset');
  fixViewportCoordinates();
}

// DEBUG: Track what's changing the viewport (logging only)
const originalViewportX = viewportX;
const originalViewportY = viewportY;

// --- pan -------------------------------------------------------------------

export function startPan(x, y) {
  try {
    isPanning = true;
    lastPanX = x; lastPanY = y;
    dependencies.updateCanvasCursor?.('grabbing');
    return true;
  } catch (e) {
    console.error('Failed to start pan:', e);
    return false;
  }
}

export function updatePan(x, y) {
  try {
    if (!isPanning) return false;
    const dx = x - lastPanX;
    const dy = y - lastPanY;

    // screen delta -> world delta
    viewportX -= dx / zoomLevel;
    viewportY -= dy / zoomLevel;

    // console.log('[updatePan] dx=%o dy=%o z=%o -> dWorld={%o,%o} newV={%o,%o}',
    //   dx, dy, zoomLevel, dx/zoomLevel, dy/zoomLevel, viewportX, viewportY);

    lastPanX = x; lastPanY = y;
    requestRedraw();
    updateMinimapThrottled();
    return true;
  } catch (e) {
    console.error('Failed to update pan:', e);
    return false;
  }
}

export function endPan() {
  try {
    if (!isPanning) return false;
    isPanning = false;
    dependencies.updateCanvasCursor?.('grab');
    updateMinimapImmediate();
    return true;
  } catch (e) {
    console.error('Failed to end pan:', e);
    return false;
  }
}

// Wheel (bind with { passive:false } at the call site)
export function handleMouseWheel(event) {
  try {
    if (!dependencies.canvas) return false;
    event.preventDefault();
    const rect = dependencies.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    return zoomAtPoint(mouseX, mouseY, factor);
  } catch (e) {
    console.error('Failed to handle mouse wheel:', e);
    return false;
  }
}

// --- smooth camera ---------------------------------------------------------

export function animateToPosition(targetX, targetY, duration = 500) {
  try {
    targetViewportX = targetX;
    targetViewportY = targetY;

    const startX = viewportX;
    const startY = viewportY;
    const startTime = performance.now();

    if (cameraAnimationId) cancelAnimationFrame(cameraAnimationId);

    function animate(ts) {
      const t = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      viewportX = startX + (targetX - startX) * ease;
      viewportY = startY + (targetY - startY) * ease;

      requestRedraw();
      updateMinimapThrottled(); // track during animation

      if (t < 1) cameraAnimationId = requestAnimationFrame(animate);
      else {
        cameraAnimationId = null;
        updateMinimapImmediate();
      }
    }

    cameraAnimationId = requestAnimationFrame(animate);
    return true;
  } catch (e) {
    console.error('Failed to animate to position:', e);
    return false;
  }
}

// --- world bounds ----------------------------------------------------------

export function getWorldBounds() {
  try {
    const els = dependencies.elements;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Include all elements
    if (els && els.size > 0) {
      for (const el of els.values()) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
    }
    
    // Always include current viewport area to ensure minimap shows where you are
    const { w: cssW, h: cssH } = cssCanvasSize();
    const viewportLeft = viewportX;
    const viewportTop = viewportY;
    const viewportRight = viewportX + cssW / zoomLevel;
    const viewportBottom = viewportY + cssH / zoomLevel;
    
    minX = Math.min(minX, viewportLeft);
    minY = Math.min(minY, viewportTop);
    maxX = Math.max(maxX, viewportRight);
    maxY = Math.max(maxY, viewportBottom);
    
    // If no elements and viewport is at origin, provide default bounds
    if (!isFinite(minX)) {
      minX = -1000;
      maxX = 1000;
    }
    if (!isFinite(minY)) {
      minY = -1000;
      maxY = 1000;
    }
    
    const padding = 200;
    return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
  } catch (e) {
    console.error('Failed to calculate world bounds:', e);
    return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
  }
}

// --- minimap ---------------------------------------------------------------

export function initializeMinimap() {
  try {
    minimapCanvas = document.getElementById('minimap-canvas');
    if (!minimapCanvas) {
      console.warn('Minimap canvas not found');
      return false;
    }

    minimapCtx = minimapCanvas.getContext('2d');
    if (!minimapCtx) {
      console.error('Could not get minimap 2D context');
      return false;
    }

    minimapViewport = document.getElementById('minimap-viewport') || null;

    // Mouse handlers; drag capture on window to avoid "stuck" states
    minimapCanvas.addEventListener('mousedown', handleMinimapMouseDown);
    minimapCanvas.addEventListener('click', handleMinimapClick);

    return true;
  } catch (e) {
    console.error('Failed to initialize minimap:', e);
    return false;
  }
}

export function handleMinimapMouseDown(event) {
  try {
    event.preventDefault();
    const rect = minimapCanvas.getBoundingClientRect();
    minimapDragStart.x = event.clientX - rect.left;
    minimapDragStart.y = event.clientY - rect.top;
    isMinimapDragging = true;
    minimapHasDragged = false;

    // Capture the transform at the start of the drag to avoid drift
    minimapDragTransform = computeMinimapTransform();

    const move = (ev) => handleMinimapMouseMove(ev);
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      handleMinimapMouseUp(ev);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return true;
  } catch (e) {
    console.error('Failed to handle minimap mouse down:', e);
    return false;
  }
}

export function handleMinimapMouseMove(event) {
  try {
    if (!isMinimapDragging || !minimapDragTransform) return false;
    event.preventDefault();
    minimapHasDragged = true;

    const rect = minimapCanvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    const deltaX = currentX - minimapDragStart.x;
    const deltaY = currentY - minimapDragStart.y;

    const oldX = viewportX;
    const oldY = viewportY;

    // Use the captured transform to avoid drift during drag
    const { scale } = minimapDragTransform;
    const worldDeltaX = deltaX / scale; // screen px on minimap -> world units
    const worldDeltaY = deltaY / scale;

    viewportX += worldDeltaX;
    viewportY += worldDeltaY;

    // Debug large viewport changes from minimap
    if (Math.abs(viewportX) > 100 || Math.abs(viewportY) > 100) {
      // console.log(`MINIMAP: viewport changed from (${oldX.toFixed(1)},${oldY.toFixed(1)}) to (${viewportX.toFixed(1)},${viewportY.toFixed(1)}) | delta:(${deltaX},${deltaY}) scale:${scale.toFixed(3)}`);
    }

    minimapDragStart.x = currentX;
    minimapDragStart.y = currentY;

    requestRedraw();
    updateMinimapActual();
    return true;
  } catch (e) {
    console.error('Failed to handle minimap mouse move:', e);
    return false;
  }
}

export function handleMinimapMouseUp(event) {
  try {
    if (!isMinimapDragging) return false;
    isMinimapDragging = false;
    minimapDragTransform = null; // Clear the captured transform

    if (!minimapHasDragged) {
      handleMinimapClick(event);
    }
    return true;
  } catch (e) {
    console.error('Failed to handle minimap mouse up:', e);
    return false;
  }
}

export function handleMinimapClick(event) {
  try {
    if (minimapHasDragged) return false;

    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const { scale, offX, offY, bounds } = computeMinimapTransform();

    // minimap -> world
    const worldX = bounds.minX + (clickX - offX) / scale;
    const worldY = bounds.minY + (clickY - offY) / scale;

    const { w: cssW, h: cssH } = cssCanvasSize();
    const targetX = worldX - cssW / (2 * zoomLevel);
    const targetY = worldY - cssH / (2 * zoomLevel);

    // animate expects world coords for viewportX/Y
    animateToPosition(targetX, targetY);
    return true;
  } catch (e) {
    console.error('Failed to handle minimap click:', e);
    return false;
  }
}

// compute scale+offset for letterboxed minimap drawing/mapping
function computeMinimapTransform() {
  const bounds = getWorldBounds();
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;
  const scaleX = minimapCanvas.width / worldWidth;
  const scaleY = minimapCanvas.height / worldHeight;
  const scale = Math.min(scaleX, scaleY);
  const drawW = worldWidth * scale;
  const drawH = worldHeight * scale;
  const offX = (minimapCanvas.width - drawW) / 2;
  const offY = (minimapCanvas.height - drawH) / 2;
  return { scale, offX, offY, bounds, worldWidth, worldHeight };
}

export function updateMinimapThrottled() {
  if (minimapUpdateQueued) return;
  minimapUpdateQueued = true;
  const now = performance.now();
  const dt = now - lastMinimapUpdate;
  if (dt >= minimapUpdateThrottle) {
    updateMinimapActual();
  } else {
    setTimeout(updateMinimapActual, minimapUpdateThrottle - dt);
  }
}

export function updateMinimapActual() {
  try {
    minimapUpdateQueued = false;
    lastMinimapUpdate = performance.now();
    if (!minimapCtx || !minimapCanvas) return;

    // clear
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    const { scale, offX, offY, bounds } = computeMinimapTransform();
    if (!isFinite(scale) || scale <= 0) return;

    minimapCtx.save();
    minimapCtx.translate(offX, offY);
    minimapCtx.scale(scale, scale);
    minimapCtx.translate(-bounds.minX, -bounds.minY);

    // draw elements
    const els = dependencies.elements;
    if (els && dependencies.renderElementToMinimap) {
      for (const el of els.values()) {
        dependencies.renderElementToMinimap(el, minimapCtx);
      }
    }
    minimapCtx.restore();

    drawMinimapViewport();
  } catch (e) {
    console.error('Failed to update minimap:', e);
  }
}

export function updateMinimapImmediate() {
  minimapUpdateQueued = false;
  updateMinimapActual();
}

function drawMinimapViewport() {
  try {
    if (!minimapCtx || !minimapCanvas || !dependencies.canvas) return;

    const { scale, offX, offY, bounds } = computeMinimapTransform();
    const { w: cssW, h: cssH } = cssCanvasSize();

    const left = viewportX;
    const top = viewportY;
    const right = viewportX + cssW / zoomLevel;
    const bottom = viewportY + cssH / zoomLevel;

    const x = offX + (left - bounds.minX) * scale;
    const y = offY + (top - bounds.minY) * scale;
    const w = (right - left) * scale;
    const h = (bottom - top) * scale;

    minimapCtx.strokeStyle = '#007bff';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(x, y, w, h);
    minimapCtx.fillStyle = 'rgba(0, 123, 255, 0.1)';
    minimapCtx.fillRect(x, y, w, h);

    // Draw zoom level text
    minimapCtx.fillStyle = '#333333';
    minimapCtx.font = '12px Arial';
    minimapCtx.textAlign = 'left';
    minimapCtx.textBaseline = 'top';
    const zoomText = `${Math.round(zoomLevel * 100)}%`;
    minimapCtx.fillText(zoomText, 5, 5);
  } catch (e) {
    console.error('Failed to draw minimap viewport:', e);
  }
}

// --- zoom level UI ---------------------------------------------------------

function updateZoomLevelDisplay() {
  try {
    const pct = Math.round(zoomLevel * 100);
    dependencies.blazorReference?.invokeMethodAsync?.('UpdateZoomLevel', pct);
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) zoomDisplay.textContent = `${pct}%`;
  } catch (e) {
    console.error('Failed to update zoom level display:', e);
  }
}

// --- utils / API -----------------------------------------------------------

export function getViewportInfo() {
  return { x: viewportX, y: viewportY, zoom: zoomLevel, isPanning };
}
export function getViewportX() { return viewportX; }
export function getViewportY() { return viewportY; }
export function getZoomLevel() { return zoomLevel; }

export function setViewport(x, y, zoom) {
  try {
    viewportX = x ?? 0;
    viewportY = y ?? 0;
    zoomLevel = clampZoom(zoom ?? 1);
    requestRedraw();
    updateZoomLevelDisplay();
    updateMinimapImmediate();
    return true;
  } catch (e) {
    console.error('Failed to set viewport:', e);
    return false;
  }
}

export function fitToElements() {
  try {
    const els = dependencies.elements;
    if (!els || els.size === 0 || !dependencies.canvas) return false;

    const b = getWorldBounds();
    const worldW = b.maxX - b.minX;
    const worldH = b.maxY - b.minY;
    if (worldW <= 0 || worldH <= 0) return false;

    const { w: cssW, h: cssH } = cssCanvasSize();
    const zoomX = cssW / worldW;
    const zoomY = cssH / worldH;
    const newZoom = clampZoom(Math.min(zoomX, zoomY) * 0.9);

    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;

    zoomLevel = newZoom;
    viewportX = cx - cssW / (2 * newZoom);
    viewportY = cy - cssH / (2 * newZoom);

    requestRedraw();
    updateZoomLevelDisplay();
    updateMinimapImmediate();
    return true;
  } catch (e) {
    console.error('Failed to fit to elements:', e);
    return false;
  }
}

// --- init glue -------------------------------------------------------------

export function init() {
  initializeViewport();
  // console.log('Viewport Manager module loaded');
}

// --- Backward compatibility / globals (live getters) -----------------------


if (typeof window !== 'undefined') {
  const g = window;
  if (!g.viewportManager) g.viewportManager = {};

  // getters on the namespace; configurable so HMR can redefine
  Object.defineProperties(g.viewportManager, {
    viewportX: { get: () => viewportX, configurable: true },
    viewportY: { get: () => viewportY, configurable: true },
    zoomLevel: { get: () => zoomLevel, configurable: true },
  });

  Object.assign(g.viewportManager, {
    initializeViewport,
    resetViewport,
    zoomAtCenter,
    zoomAtPoint,
    resetZoom,
    handleMouseWheel,
    getWorldBounds,
    initializeMinimap,
    handleMinimapMouseDown,
    handleMinimapMouseMove,
    handleMinimapMouseUp,
    handleMinimapClick,
    updateMinimapThrottled,
    updateMinimapActual,
    updateMinimapImmediate,
    updateMinimap: updateMinimapImmediate, // legacy alias
    animateToPosition,
    getViewportInfo,
    setViewport,
    fitToElements,
    fixViewportCoordinates, // TEMP DEBUG
    autoFixLargeViewportOffset
  });
}

