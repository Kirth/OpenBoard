
// Canvas Manager Module - corrected

let canvas = null;
let ctx = null;
let tempCanvas = null;
let tempCtx = null;

// Local fallbacks; real values should come from dependency getters
let viewportX = 0;
let viewportY = 0;
let zoomLevel = 1;

let dependencies = {
  elements: null,                    // Map<string, Element>
  getSelectedElementId: null,        // () => string | null
  getElementAtPoint: null,           // (x,y) => Element | null (screen-space)
  drawResizeHandles: null,           // (screenRect) => void
  drawLineEndpointHandles: null,     // (element) => void
  drawCollaborativeSelections: null, // () => void
  cursors: null,                     // Map<connectionId, {x,y,color,userName}> (world)
  editorManager: null,               // optional
  minimapCtx: null,                  // optional
  getViewportX: null,                // () => number
  getViewportY: null,                // () => number
  getZoomLevel: null,                // () => number
  requestRedraw: null,               // optional: () => void
  canvasContainer: null,             // HTMLElement used for measuring size
};

let canvasContainer = null;
let ro = null;

export function setDependencies(deps) {
  Object.assign(dependencies, deps);
  canvasContainer = deps.canvasContainer ?? null;
}

// --- sizing / DPR helpers ---------------------------------------------------

function resetForDPR(context, dpr) {
  // 1 CSS px unit in ctx after this baseline
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(dpr, dpr);
}

// Attach/detach ResizeObserver
export function attachResizeObserver() {
  const target = canvasContainer || canvas?.parentElement || canvas;
  if (!target || ro) return;
  ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(target);
}

export function detachResizeObserver() {
  if (!ro) return;
  ro.disconnect();
  ro = null;
}

// --- Init / Resize ----------------------------------------------------------

export function initializeCanvas() {
  try {
    canvas = document.getElementById('whiteboard-canvas');
    if (!canvas) throw new Error('Canvas element not found');

    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context');

    // Canvas should fill its container via CSS; JS only controls bitmap size.
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;

    createTempCanvas();
    resizeCanvas();
    attachResizeObserver();

    // React to DPR changes or viewport resizes
    window.addEventListener('resize', resizeCanvas, { passive: true });

    console.log('Canvas initialized');
    return true;
  } catch (e) {
    console.error('Failed to initialize canvas:', e);
    return false;
  }
}

function createTempCanvas() {
  tempCanvas = document.createElement('canvas');
  tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    console.error('Could not create temporary canvas context');
    return;
  }
  
  // Position temporary canvas on top of main canvas
  tempCanvas.style.position = 'absolute';
  tempCanvas.style.top = '0';
  tempCanvas.style.left = '0';
  tempCanvas.style.pointerEvents = 'none'; // Allow mouse events to pass through
  tempCanvas.style.zIndex = '10'; // Above main canvas
  
  tempCtx.lineCap = 'round';
  tempCtx.lineJoin = 'round';
  tempCtx.imageSmoothingEnabled = true;
  
  // Add to DOM - append to the canvas container
  const canvasContainer = canvas?.parentElement;
  if (canvasContainer) {
    canvasContainer.appendChild(tempCanvas);
  } else {
    console.warn('Could not find canvas container for temporary canvas');
  }
}

export function resizeCanvas() {
  if (!canvas || !ctx) return;

  try {
    const target = canvasContainer || canvas?.parentElement || canvas;

    const rect = target.getBoundingClientRect();
    console.log('[resize] dpr=%o rect=%o canvas={w:%o,h:%o}', window.devicePixelRatio, rect, canvas.width, canvas.height);

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(0, rect.width);
    const cssH = Math.max(0, rect.height);

    if (cssW === 0 || cssH === 0) return; // nothing to do yet

    // Internal bitmap size in device pixels
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));

    if (canvas.width !== devW || canvas.height !== devH) {
      canvas.width = devW;
      canvas.height = devH;
    }

    // Keep CSS fill; do NOT set explicit px, avoid feedback loops
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // DPR baseline (1 unit == 1 CSS px)
    resetForDPR(ctx, dpr);

    // Mirror temp canvas
    if (tempCanvas && tempCtx) {
      if (tempCanvas.width !== devW) tempCanvas.width = devW;
      if (tempCanvas.height !== devH) tempCanvas.height = devH;
      resetForDPR(tempCtx, dpr);
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtx.imageSmoothingEnabled = true;
    }

    // Restore drawing props after setTransform
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;

    // Optional: trigger redraw
    dependencies.requestRedraw?.();

    // Debug:
    // console.log(`Canvas: css ${cssW}x${cssH}, dev ${devW}x${devH}, dpr ${dpr}`);
  } catch (e) {
    console.error('Failed to resize canvas:', e);
  }
}

// --- Coordinate conversions -------------------------------------------------

function currentViewportX() {
  const value = dependencies.getViewportX ? dependencies.getViewportX() : viewportX;
  return value;
}
function currentViewportY() {
  const value = dependencies.getViewportY ? dependencies.getViewportY() : viewportY;
  return value;
}
function currentZoom() {
  const value = dependencies.getZoomLevel ? dependencies.getZoomLevel() : zoomLevel;
  return value;
}

// world -> screen (CSS px), aligned with draw transform: translate(-vx,-vy) then scale(z)
export function worldToScreen(wx, wy) {
  const vx = currentViewportX();
  const vy = currentViewportY();
  const z = currentZoom();
  return { x: (wx - vx) * z, y: (wy - vy) * z };
}

// screen (CSS px) -> world
export function screenToWorld(sx, sy) {
  const vx = currentViewportX();
  const vy = currentViewportY();
  const z = currentZoom();
  
  // Debug coordinate conversion issues at different zoom levels
  // if (sx < 1000 && sy < 1000 && (z < 0.8 || Math.abs(vx) > 10 || Math.abs(vy) > 10)) {
  //   console.log(`screenToWorld: (${sx},${sy}) zoom:${(z*100).toFixed(0)}% viewport:(${vx.toFixed(1)},${vy.toFixed(1)}) -> (${(sx/z+vx).toFixed(1)},${(sy/z+vy).toFixed(1)})`);
  // }
  
  return { x: sx / z + vx, y: sy / z + vy };
}

// --- Drawing lifecycle ------------------------------------------------------

export function clearCanvas() {
  if (!ctx || !canvas) return;
  // Clear in device space to avoid transform surprises
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function redrawCanvas() {
  if (!canvas || !ctx) return;

  try {
    // console.log('[redraw] vx=%o vy=%o z=%o', dependencies.getViewportX?.(), dependencies.getViewportY?.(), dependencies.getZoomLevel?.());
    
    // 1) Clear
    clearCanvas();

    // 2) Draw world-space elements under world transform
    ctx.save();               // save DPR baseline
    applyViewportTransform(); // no save/restore inside
    renderAllElements();
    ctx.restore();            // back to DPR baseline

    // 3) Draw screen-space overlays/UI
    drawUIElements();
    drawCursors();
  } catch (e) {
    console.error('Failed to redraw canvas:', e);
  }
}

export function applyViewportTransform() {
  const vx = currentViewportX();
  const vy = currentViewportY();
  const z = currentZoom();
  ctx.translate(-vx, -vy);
  ctx.scale(z, z);
}

// --- Element rendering ------------------------------------------------------

function renderAllElements() {
  const els = dependencies.elements;
  if (!(els instanceof Map)) return;
  // Sort by z (undefined -> 0). Stable enough for our needs.
  const ordered = Array.from(els.values()).sort((a, b) => {
    const za = (a.z ?? a.data?.z ?? 0);
    const zb = (b.z ?? b.data?.z ?? 0);
    if (za !== zb) return za - zb;
    // tie-breaker: creation time/id to keep determinism
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
  for (const element of ordered) {
    renderExistingElement(element);
  }
}

export function renderExistingElement(element) {
  if (!ctx || !element) return;
  try {
    ctx.save();
    switch (element.type) {
      case 'Rectangle':
      case 'rectangle': renderRectangle(element); break;
      case 'Shape': renderShapeElement(element); break;
      case 'Circle':
      case 'circle': renderCircle(element); break;
      case 'Line': renderLine(element); break;
      case 'Path':
      case 'Drawing': renderPath(element); break;
      case 'triangle': renderTriangle(element); break;
      case 'diamond': renderDiamond(element); break;
      case 'ellipse': renderEllipse(element); break;
      case 'star': renderStar(element); break;
      case 'StickyNote': renderStickyNote(element); break;
      case 'Text': renderText(element); break;
      case 'Image': renderImage(element); break;
      default: console.warn('Unknown element type:', element.type);
    }
    ctx.restore();
  } catch (e) {
    console.error('Failed to render element:', e);
  }
}

// Minimap: world-space drawing onto a world-space minimap context (caller sets transforms)
export function renderElementToMinimap(element, minimapCtx) {
  if (!minimapCtx || !element) return;
  try {
    minimapCtx.save();

    const stroke = element.data?.strokeColor ?? element.data?.color ?? '#000000';
    const fill = element.data?.fillColor ?? 'transparent';
    minimapCtx.strokeStyle = stroke;
    minimapCtx.fillStyle = fill;
    minimapCtx.lineWidth = Math.max(1, (element.data?.strokeWidth || 2) * 0.5);

    switch (element.type) {
      case 'Rectangle':
      case 'rectangle':
      case 'triangle':
      case 'diamond':
      case 'ellipse':
      case 'star':
        if (fill !== 'transparent') minimapCtx.fillRect(element.x, element.y, element.width, element.height);
        minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
        break;

      case 'Circle':
      case 'circle': {
        minimapCtx.beginPath();
        const r = Math.min(element.width, element.height) / 2;
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        minimapCtx.arc(cx, cy, r, 0, 2 * Math.PI);
        if (fill !== 'transparent') minimapCtx.fill();
        minimapCtx.stroke();
        break;
      }

      case 'Line':
        minimapCtx.beginPath();
        minimapCtx.moveTo(element.x, element.y);
        minimapCtx.lineTo(element.x + element.width, element.y + element.height);
        minimapCtx.stroke();
        break;

      case 'Path':
      case 'Drawing':
        minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
        break;

      case 'StickyNote':
        minimapCtx.fillStyle = element.data?.color || '#ffeb3b';
        minimapCtx.fillRect(element.x, element.y, element.width, element.height);
        minimapCtx.strokeStyle = '#fbc02d';
        minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
        break;

      case 'Text':
        minimapCtx.fillStyle = '#333333';
        minimapCtx.fillRect(
          element.x,
          element.y,
          Math.max(element.width, 20),
          Math.max(element.height, 10)
        );
        break;

      case 'Image':
        minimapCtx.fillStyle = '#e0e0e0';
        minimapCtx.fillRect(element.x, element.y, element.width, element.height);
        minimapCtx.strokeStyle = '#bdbdbd';
        minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
        break;
    }

    minimapCtx.restore();
  } catch (e) {
    console.error('Failed to render element to minimap:', e);
  }
}

// --- UI overlays ------------------------------------------------------------

export function updateCanvasCursor(cursorStyle) {
  if (!canvas) return;
  try { canvas.style.cursor = cursorStyle || 'default'; }
  catch (e) { console.error('Failed to update canvas cursor:', e); }
}

export function updateCursorForResizeHandles(x, y) {
  if (!canvas || !dependencies.getElementAtPoint) return;
  try {
    // FIXED: Convert screen coordinates to world coordinates before hit testing
    const worldPos = screenToWorld(x, y);
    const element = dependencies.getElementAtPoint(worldPos.x, worldPos.y);
    const selId = dependencies.getSelectedElementId?.() ?? null;
    canvas.style.cursor = (element && selId && selId === element.id) ? 'nw-resize' : 'default';
  } catch (e) {
    console.error('Failed to update cursor for resize handles:', e);
  }
}

// Robust screen-space AABB (avoids skew/drift at non-1 zoom)
function elementScreenAABB(el) {
  // Use the same worldToScreen conversion that the rest of the system uses
  const topLeft = worldToScreen(el.x, el.y);
  const bottomRight = worldToScreen(el.x + el.width, el.y + el.height);

  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const w = Math.abs(bottomRight.x - topLeft.x);
  const h = Math.abs(bottomRight.y - topLeft.y);
  
  return { x: left, y: top, w, h, z: currentZoom() };
}

function drawUIElements() {
  try {
    const selId = dependencies.getSelectedElementId?.() ?? null;
    if (selId && dependencies.elements && dependencies.drawResizeHandles) {
      const el = dependencies.elements.get(selId);
      if (el) {
        // EXPERIMENTAL: Draw resize handles in world space using the same transform as elements
        ctx.save();
        applyViewportTransform();
        
        const handleSize = 8 / currentZoom(); // Adjust handle size for zoom
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1 / currentZoom();
        
        if (el.type === 'Line') {
          // For Line elements, show the actual line and endpoint handles
          const x1 = el.x;
          const y1 = el.y;
          const x2 = el.x + el.width;
          const y2 = el.y + el.height;
          
          // Draw the selection line
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 3 / currentZoom();
          ctx.setLineDash([5 / currentZoom(), 5 / currentZoom()]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]); // Reset line dash
          
          // Draw endpoint handles as circles
          const handles = [
            { x: x1, y: y1 }, // Start point
            { x: x2, y: y2 }  // End point
          ];
          
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2 / currentZoom();
          
          for (const handle of handles) {
            ctx.beginPath();
            ctx.arc(handle.x, handle.y, handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        } else {
          // For other elements, show the traditional bounding box
          const sw = el.data?.strokeWidth ?? 2;
          const inflate = sw * 0.5;
          
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2 / currentZoom();
          ctx.strokeRect(
            el.x - inflate, 
            el.y - inflate, 
            el.width + 2 * inflate, 
            el.height + 2 * inflate
          );
          
          // Draw handles as small rectangles in world space
          const handles = [
            { x: el.x, y: el.y }, // Top-left
            { x: el.x + el.width, y: el.y }, // Top-right
            { x: el.x, y: el.y + el.height }, // Bottom-left
            { x: el.x + el.width, y: el.y + el.height }, // Bottom-right
            { x: el.x + el.width / 2, y: el.y }, // Top-center
            { x: el.x + el.width / 2, y: el.y + el.height }, // Bottom-center
            { x: el.x, y: el.y + el.height / 2 }, // Left-center
            { x: el.x + el.width, y: el.y + el.height / 2 } // Right-center
          ];
          
          for (const handle of handles) {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          }
        }
        
        ctx.restore();

        if (el.type === 'Line' && dependencies.drawLineEndpointHandles) {
          dependencies.drawLineEndpointHandles(el);
        }
      }
    }

    dependencies.drawCollaborativeSelections?.();
  } catch (e) {
    console.error('Failed to draw UI elements:', e);
  }
}

function drawCursors() {
  try {
    const cursors = dependencies.cursors;
    if (!(cursors instanceof Map)) return;

    for (const [, cursor] of cursors) {
      const p = worldToScreen(cursor.x, cursor.y);
      ctx.save();
      ctx.fillStyle = cursor.color || '#ff0000';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      ctx.fill();

      if (cursor.userName) {
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(cursor.userName, p.x + 10, p.y - 5);
      }
      ctx.restore();
    }
  } catch (e) {
    console.error('Failed to draw cursors:', e);
  }
}

// --- Renderers --------------------------------------------------------------

function strokeFillFrom(el) {
  const stroke = el.data?.strokeColor ?? el.data?.color ?? '#000000';
  const fill = el.data?.fillColor ?? 'transparent';
  const width = el.data?.strokeWidth ?? 2;
  return { stroke, fill, width };
}

function renderRectangle(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  if (fill !== 'transparent') ctx.fillRect(el.x, el.y, el.width, el.height);
  ctx.strokeRect(el.x, el.y, el.width, el.height);
}

function renderCircle(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  ctx.beginPath();
  const r = Math.min(el.width, el.height) / 2;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderShapeElement(el) {
  const shapeType = el.data?.shapeType || el.data?.type || 'rectangle';
  switch (shapeType) {
    case 'rectangle': renderRectangle(el); break;
    case 'circle': renderCircle(el); break;
    case 'triangle': renderTriangle(el); break;
    case 'diamond': renderDiamond(el); break;
    case 'ellipse': renderEllipse(el); break;
    case 'star': renderStar(el); break;
    default: renderRectangle(el);
  }
}

function renderLine(el) {
  const { stroke, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height);
  ctx.stroke();
}

function renderPath(el) {
  const path = el.data?.path;
  if (!Array.isArray(path) || path.length === 0) return;

  const { stroke, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;

  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    // Render path points relative to element position (like other elements)
    const worldX = el.x + p.x;
    const worldY = el.y + p.y;
    if (i === 0) ctx.moveTo(worldX, worldY);
    else ctx.lineTo(worldX, worldY);
  }
  ctx.stroke();
}

function renderStickyNote(el) {
  const bg = el.data?.color || '#ffeb3b';
  ctx.fillStyle = bg;
  ctx.fillRect(el.x, el.y, el.width, el.height);

  ctx.strokeStyle = '#fbc02d';
  ctx.lineWidth = 1;
  ctx.strokeRect(el.x, el.y, el.width, el.height);

  if (el.data?.content && !el.data?.isEditing) {
    ctx.fillStyle = '#333333';
    const fontSize = el.data?.fontSize || 14;
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = String(el.data.content).split('\n');
    const lh = fontSize * 1.2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.x + 10, el.y + 10 + i * lh);
    }
  }
}

function renderTriangle(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(el.x + el.width / 2, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height);
  ctx.lineTo(el.x, el.y + el.height);
  ctx.closePath();
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderDiamond(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(el.x + el.width / 2, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height / 2);
  ctx.lineTo(el.x + el.width / 2, el.y + el.height);
  ctx.lineTo(el.x, el.y + el.height / 2);
  ctx.closePath();
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderEllipse(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = Math.abs(el.width / 2);
  const ry = Math.abs(el.height / 2);

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderStar(el) {
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const outer = Math.min(el.width, el.height) / 2;
  const inner = outer * 0.4;
  const points = 5;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderText(el) {
  if (!el.data?.content || el.data?.isEditing) return;
  ctx.fillStyle = el.data?.color || '#000000';
  const fontSize = el.data?.fontSize || 16;
  const fontFamily = el.data?.fontFamily || 'Arial';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const lines = String(el.data.content).split('\n');
  const lh = fontSize * 1.2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], el.x, el.y + i * lh);
  }
}

// --- Image caching ----------------------------------------------------------

const imageCache = new Map(); // src -> {img: HTMLImageElement, ready: boolean}

// Warning rate limiting to prevent console spam
const warningTracker = new Map(); // elementId -> timestamp of last warning
const WARNING_THROTTLE_MS = 5000; // Only warn once per 5 seconds per element

function getCachedImage(src) {
  if (!src) return null;
  let entry = imageCache.get(src);
  if (entry) return entry;

  const img = new Image();
  entry = { img, ready: false };
  imageCache.set(src, entry);

  img.onload = () => {
    entry.ready = true;
    dependencies.requestRedraw?.();
  };
  img.onerror = () => {
    console.warn('Failed to load image src:', src);
    imageCache.delete(src);
  };
  img.src = src;
  return entry;
}

function renderImage(el) {
  const src = el.data?.imageData;
  
  // Handle both URL paths and base64 data URLs
  if (!src || (typeof src !== 'string') || src.trim() === '') {
    throttledWarn(el.id, `Invalid image data for element: ${el.id}, src: ${src}`);
    // Try to clean up the corrupted element
    cleanupCorruptedImageElement(el);
    return;
  }
  
  // Accept both base64 data URLs and regular URL paths
  const isValidImageSrc = src.startsWith('data:image/') || src.startsWith('/uploads/') || src.startsWith('http');
  
  if (!isValidImageSrc) {
    throttledWarn(el.id, `Invalid image source for element: ${el.id}, src: ${src}`);
    // Try to clean up the corrupted element
    cleanupCorruptedImageElement(el);
    return;
  }
  
  const entry = getCachedImage(src);
  if (!entry || !entry.ready) return;
  ctx.drawImage(entry.img, el.x, el.y, el.width, el.height);
}

// Throttled warning function to prevent console spam
function throttledWarn(elementId, message) {
  const now = Date.now();
  const lastWarning = warningTracker.get(elementId);
  
  if (!lastWarning || (now - lastWarning) > WARNING_THROTTLE_MS) {
    console.warn(message);
    warningTracker.set(elementId, now);
  }
}

// Cleanup corrupted image elements
function cleanupCorruptedImageElement(element) {
  if (!element || !element.id) return;
  
  console.log(`Attempting to cleanup corrupted image element: ${element.id}`);
  
  // Check if this element exists in the element factory
  if (typeof window !== 'undefined' && window.elements && window.elements.has(element.id)) {
    console.log(`Removing corrupted image element from local storage: ${element.id}`);
    window.elements.delete(element.id);
    
    // Clear from selection if it was selected
    if (window.selectedElementId === element.id) {
      window.selectedElementId = null;
    }
    
    // Request redraw to update canvas
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }
}

// --- Image upload wiring (placeholder) -------------------------------------

export function setupImageUpload() {
  try {
    const imageInput = document.getElementById('image-upload');
    if (imageInput) {
      imageInput.addEventListener('change', handleImageUpload);
      console.log('Image upload setup complete');
    } else {
      console.warn('Image upload input not found');
    }
  } catch (e) {
    console.error('Failed to setup image upload:', e);
  }
}

function handleImageUpload(event) {
  console.log('Image upload triggered:', event);
  // Real handling should live in element-factory
}

// --- Accessors --------------------------------------------------------------

export function getCanvas() { return canvas; }
export function getContext() { return ctx; }
export function getTempCanvas() { return tempCanvas; }
export function getTempContext() { return tempCtx; }
export function isCanvasInitialized() { return canvas !== null && ctx !== null; }

// --- Init -------------------------------------------------------------------

export function init() {
  console.log('Canvas Manager module loaded');
}

// --- Backward compatibility -------------------------------------------------

if (typeof window !== 'undefined') {
  window.canvasManager = {
    initializeCanvas,
    resizeCanvas,
    redrawCanvas,
    applyViewportTransform,
    screenToWorld,
    worldToScreen,
    clearCanvas,
    renderExistingElement,
    renderElementToMinimap,
    updateCanvasCursor,
    updateCursorForResizeHandles,
    setupImageUpload,
    getCanvas,
    getContext,
    getTempCanvas,
    getTempContext,
    isCanvasInitialized,
    setDependencies,
    attachResizeObserver,
    detachResizeObserver,
    init,
  };
}

