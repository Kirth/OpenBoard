
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

// Grid system configuration
let gridEnabled = false;
let gridSize = 20; // Grid spacing in world coordinates
let gridColor = 'rgba(200, 200, 200, 0.3)';
let snapToGrid = false;

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

  // Position temporary canvas to exactly match main canvas position and size
  tempCanvas.style.position = 'absolute';
  tempCanvas.style.top = '0';
  tempCanvas.style.left = '0';
  tempCanvas.style.width = '100%';
  tempCanvas.style.height = '100%';
  tempCanvas.style.display = 'block';
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

    // Mirror temp canvas dimensions and DPR exactly
    if (tempCanvas && tempCtx) {
      if (tempCanvas.width !== devW || tempCanvas.height !== devH) {
        tempCanvas.width = devW;
        tempCanvas.height = devH;
        // Force CSS size to match main canvas exactly
        tempCanvas.style.width = '100%';
        tempCanvas.style.height = '100%';
      }
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

// Helper functions for safe state access
function getSafe(obj, key) {
  const f = obj && typeof obj[key] === 'function' ? obj[key] : null;
  return f ? f.call(obj) : undefined;
}

function numberOr(fallback, v) {
  const n = Number(v ?? fallback ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function snapshotState() {
  const vx = numberOr(viewportX, getSafe(dependencies, 'getViewportX'));
  const vy = numberOr(viewportY, getSafe(dependencies, 'getViewportY'));
  const z = numberOr(zoomLevel, getSafe(dependencies, 'getZoomLevel'));
  return { vx, vy, z };
}

function snapshotStateValidated() {
  const s = snapshotState();
  if (!Number.isFinite(s.vx) || !Number.isFinite(s.vy)) throw new Error('Invalid viewport');
  if (!Number.isFinite(s.z) || s.z <= 0) throw new Error('Invalid zoom');
  return s;
}

// Do not touch this!!
// the correct mapping is: world from screen: world = screen / z + v → worldX = sx / z + vx
export function worldToScreen(wx, wy) {
  const { vx, vy, z } = snapshotState();
  return { x: (wx - vx) * z, y: (wy - vy) * z };
}

// Do not touch this!!
// the corrept mapping is: screen from world: screen = z * (world - v) → screenX = (wx - vx) * z
export function screenToWorld(sx, sy) {
  const { vx, vy, z } = snapshotStateValidated();
  const x = sx / z + vx;
  const y = sy / z + vy;

  // deterministic round-trip with the SAME snapshot
  const backX = (x - vx) * z;
  const backY = (y - vy) * z;
  const dx = Math.abs(backX - sx), dy = Math.abs(backY - sy);
  if (dx > 1e-3 || dy > 1e-3) console.warn(`[COORD] Δ=(${dx.toFixed(4)},${dy.toFixed(4)})`);
  return { x, y };
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

// RAF-throttled redraw for better performance
let rafPending = false;
export function requestRedraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    redrawCanvas();
  });
}

export function redrawCanvas() {
  if (!canvas || !ctx) return;

  try {
    // console.log('[redraw] vx=%o vy=%o z=%o', dependencies.getViewportX?.(), dependencies.getViewportY?.(), dependencies.getZoomLevel?.());

    // Clear clickable links array to avoid stale link hitboxes
    clickableLinks = [];

    // 1) Clear
    clearCanvas();

    // 2) Draw world-space elements under world transform
    ctx.save();               // save DPR baseline
    applyViewportTransform(); // no save/restore inside

    // Draw grid background if enabled
    if (gridEnabled) {
      renderGrid();
    }

    renderAllElements();
    ctx.restore();            // back to DPR baseline

    // 3) Draw screen-space overlays/UI
    drawUIElements();
    drawCursors();
  } catch (e) {
    console.error('Failed to redraw canvas:', e);
  }
}

export function applyViewportTransform(context = null) {
  const targetCtx = context || ctx;
  const { vx, vy, z } = snapshotState();
  // Apply transforms in order: scale first, then translate
  // This matches the coordinate system: transform: scale(z) translate(-vx, -vy)
  targetCtx.scale(z, z);
  targetCtx.translate(-vx, -vy);
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

  // Render lock icons for locked elements
  renderLockIcons(ordered);

  // Render sparkle effects on top of everything else
  if (dependencies.renderSparkleEffects) {
    dependencies.renderSparkleEffects(ctx);
  }
}

export function renderExistingElement(element) {
  if (!ctx || !element) return;
  try {
    ctx.save();
    
    // Apply rotation if the element has a rotation property
    const rotation = element.data?.rotation || 0;
    if (rotation !== 0) {
      // Calculate the center point of the element
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;
      
      // Translate to center, rotate, then translate back
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180); // Convert degrees to radians
      ctx.translate(-centerX, -centerY);
    }
    
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
      // Flowchart shapes
      case 'process': renderProcess(element); break;
      case 'decision': renderDecision(element); break;
      case 'startend': renderStartEnd(element); break;
      case 'database': renderDatabase(element); break;
      case 'document': renderDocument(element); break;
      // UML shapes
      case 'class': renderClass(element); break;
      case 'actor': renderActor(element); break;
      case 'package': renderPackage(element); break;
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

// Render lock icons for locked elements
function renderLockIcons(elements) {
  if (!ctx) return;

  // Get zoom level for proper sizing
  const { z: zoom } = snapshotState();
  const iconSize = 16 / zoom; // 16px icon at 100% zoom

  for (const element of elements) {
    // Check if element is locked
    if (element.data && element.data.locked === true) {
      ctx.save();

      // Position at top-right corner of element
      const iconX = element.x + element.width - iconSize - (4 / zoom);
      const iconY = element.y + (4 / zoom);

      // Draw lock icon background (semi-transparent circle)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1 / zoom;

      ctx.beginPath();
      ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2 + 2 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw lock icon (simplified lock shape)
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5 / zoom;
      ctx.fillStyle = '#333';

      const lockX = iconX + iconSize * 0.3;
      const lockY = iconY + iconSize * 0.25;
      const lockW = iconSize * 0.4;
      const lockH = iconSize * 0.35;

      // Lock body (rectangle)
      ctx.fillRect(lockX, lockY + lockH * 0.4, lockW, lockH * 0.6);

      // Lock shackle (arc)
      ctx.beginPath();
      ctx.arc(lockX + lockW / 2, lockY + lockH * 0.3, lockW * 0.25, Math.PI, 0);
      ctx.stroke();

      ctx.restore();
    }
  }
}

// Minimap: world-space drawing onto a world-space minimap context (caller sets transforms)
export function renderElementToMinimap(element, minimapCtx) {
  if (!minimapCtx || !element) return;
  try {
    minimapCtx.save();
    
    // Apply rotation if the element has a rotation property
    const rotation = element.data?.rotation || 0;
    if (rotation !== 0) {
      // Calculate the center point of the element
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;
      
      // Translate to center, rotate, then translate back
      minimapCtx.translate(centerX, centerY);
      minimapCtx.rotate((rotation * Math.PI) / 180); // Convert degrees to radians
      minimapCtx.translate(-centerX, -centerY);
    }

    const stroke = element.data?.strokeColor ?? window.invertBlackToWhite(element.data?.color) ?? window.invertBlackToWhite('#000000');

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

        // OLD: minimapCtx.strokeRect(element.x, element.y, element.width, element.height);

        const path = element.data?.path;
        if (!Array.isArray(path) || path.length < 2) break;

        // Compute source bbox of the path
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of path) {
          if (p == null) continue;
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const srcW = Math.max(1, maxX - minX);
        const srcH = Math.max(1, maxY - minY);

        // Heuristic: if the path is already 0..width/0..height, skip rescale
        const approx = (a, b) => Math.abs(a - b) <= 0.5; // tolerant, sub-px accuracy not needed on minimap
        const alreadyElementSpace =
          approx(minX, 0) &&
          approx(minY, 0) &&
          approx(srcW, element.width) &&
          approx(srcH, element.height);

        const sx = alreadyElementSpace ? 1 : element.width / srcW;
        const sy = alreadyElementSpace ? 1 : element.height / srcH;
        const ox = element.x - (alreadyElementSpace ? 0 : minX * sx);
        const oy = element.y - (alreadyElementSpace ? 0 : minY * sy);

        minimapCtx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          const wx = ox + p.x * sx;
          const wy = oy + p.y * sy;
          if (i === 0) minimapCtx.moveTo(wx, wy);
          else minimapCtx.lineTo(wx, wy);
        }

        if (element.data?.closed === true) minimapCtx.closePath();

        // Fill if requested and path is closed
        if (fill !== 'transparent' && element.data?.closed === true) {
          minimapCtx.fill();
        }
        minimapCtx.stroke();

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

  return { x: left, y: top, w, h, z: snapshotState().z };
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

        const { z: zoom } = snapshotState();
        const handleSize = 8 / zoom; // Adjust handle size for zoom
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1 / zoom;

        if (el.type === 'Line') {
          // For Line elements, show the actual line and endpoint handles
          const x1 = el.x;
          const y1 = el.y;
          const x2 = el.x + el.width;
          const y2 = el.y + el.height;

          // Draw the selection line
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 3 / zoom;
          ctx.setLineDash([5 / zoom, 5 / zoom]);
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
          ctx.lineWidth = 2 / zoom;

          for (const handle of handles) {
            ctx.beginPath();
            ctx.arc(handle.x, handle.y, handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        } else {
          // For other elements, show the traditional bounding box with rotation support
          const sw = el.data?.strokeWidth ?? 2;
          const inflate = sw * 0.5;
          const rotation = el.data?.rotation || 0;

          // Save context for rotation transforms
          ctx.save();
          
          // Apply rotation for selection UI if element is rotated
          if (rotation !== 0) {
            const centerX = el.x + el.width / 2;
            const centerY = el.y + el.height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-centerX, -centerY);
          }

          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2 / zoom;
          ctx.strokeRect(
            el.x - inflate,
            el.y - inflate,
            el.width + 2 * inflate,
            el.height + 2 * inflate
          );

          // Draw resize handles as small rectangles in world space
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

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#007bff';
          for (const handle of handles) {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          }
          
          // Draw rotation handle (small circle above the element)
          const rotationHandleY = el.y - 30 / zoom;
          const rotationHandleX = el.x + el.width / 2;
          
          // Draw line from top-center handle to rotation handle
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(el.x + el.width / 2, el.y);
          ctx.lineTo(rotationHandleX, rotationHandleY);
          ctx.stroke();
          
          // Draw rotation handle as a larger circle
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2 / zoom;
          ctx.beginPath();
          // Make the rotation handle visually bigger
          const rotationHandleRadius = Math.max(handleSize / 2, 6 / zoom);
          ctx.arc(rotationHandleX, rotationHandleY, rotationHandleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw rotation icon inside the circle
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          const iconRadius = rotationHandleRadius * 0.6;
          ctx.arc(rotationHandleX, rotationHandleY, iconRadius, 0, Math.PI * 1.5);
          ctx.stroke();
          // Arrow head
          const arrowSize = iconRadius * 0.3;
          ctx.beginPath();
          ctx.moveTo(rotationHandleX + iconRadius, rotationHandleY);
          ctx.lineTo(rotationHandleX + iconRadius - arrowSize, rotationHandleY - arrowSize);
          ctx.moveTo(rotationHandleX + iconRadius, rotationHandleY);
          ctx.lineTo(rotationHandleX + iconRadius - arrowSize, rotationHandleY + arrowSize);
          ctx.stroke();
          
          ctx.restore();
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
  let stroke = el.data?.strokeColor ?? el.data?.color ?? '#000000';
  let fill = el.data?.fillColor ?? 'transparent';
  const width = el.data?.strokeWidth ?? 2;

  // Convert black strokes to white in dark mode (client-side display only)
  if (typeof window !== 'undefined' && window.invertBlackToWhite) {
    stroke = window.invertBlackToWhite(stroke);
    // Keep fill colors unchanged - only stroke/outline colors are inverted
  }

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

  // Draw main line
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height);
  ctx.stroke();

  // Draw arrow heads if configured
  if (el.data?.startArrow && el.data.startArrow !== 'none') {
    drawArrowHead(el.x, el.y, el.x + el.width, el.y + el.height, el.data.arrowSize || 10, stroke, width, el.data.startArrow);
  }
  if (el.data?.endArrow && el.data.endArrow !== 'none') {
    drawArrowHead(el.x + el.width, el.y + el.height, el.x, el.y, el.data.arrowSize || 10, stroke, width, el.data.endArrow);
  }
}

function drawArrowHead(tipX, tipY, lineX, lineY, size, strokeColor, strokeWidth, arrowType) {
  // Calculate the angle of the line
  const angle = Math.atan2(tipY - lineY, tipX - lineX);
  
  // Calculate arrow head points
  const arrowAngle = Math.PI / 6; // 30 degrees
  const x1 = tipX - size * Math.cos(angle - arrowAngle);
  const y1 = tipY - size * Math.sin(angle - arrowAngle);
  const x2 = tipX - size * Math.cos(angle + arrowAngle);
  const y2 = tipY - size * Math.sin(angle + arrowAngle);

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;

  if (arrowType === 'filled') {
    // Filled arrow head
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  } else if (arrowType === 'outline') {
    // Outline arrow head
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(x1, y1);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
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

// Render a line of text with basic markdown support (keeping asterisks visible)
// Special version for headers that forces bold formatting on all segments
function renderMarkdownLineWithForcedBold(text, x, y, fontSize) {
  ctx.save();

  let currentX = x;
  const segments = parseMarkdownSegments(text);

  for (const segment of segments) {
    // Set font style based on segment type (combining styles) - ALWAYS include bold for headers
    let fontStyle = 'bold '; // Force bold for headers
    if (segment.italic) fontStyle += 'italic ';
    ctx.font = `${fontStyle}${fontSize}px Arial`;

    // Handle links with special color and underline
    if (segment.link) {
      ctx.save();
      ctx.fillStyle = '#0066cc'; // Link color
      ctx.fillText(segment.text, currentX, y);

      // Store link information for click detection
      storeClickableLink(segment.url, currentX, y, segment.text, fontSize);

      // Underline the link
      const textWidth = ctx.measureText(segment.text).width;
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(currentX, y + fontSize + 2);
      ctx.lineTo(currentX + textWidth, y + fontSize + 2);
      ctx.stroke();
      ctx.restore();
    } else if (segment.code) {
      // Handle code with special styling
      ctx.save();
      ctx.font = `bold ${fontSize}px 'Courier New', monospace`; // Keep bold for header code
      // Apply dark mode color inversion for code text
      let codeColor = '#d73a49'; // Code color (reddish)
      if (typeof window !== 'undefined' && window.invertBlackToWhite) {
        codeColor = window.invertBlackToWhite(codeColor);
      }
      ctx.fillStyle = codeColor;

      // Draw background for inline code
      const textWidth = ctx.measureText(segment.text).width;
      ctx.fillStyle = 'rgba(128, 128, 128, 0.1)'; // Light gray background
      ctx.fillRect(currentX - 2, y - fontSize + 2, textWidth + 4, fontSize + 4);

      ctx.fillStyle = codeColor; // Reset text color
      ctx.fillText(segment.text, currentX, y);
      ctx.restore();
    } else {
      // Render normal text (but keep bold for headers)
      ctx.fillText(segment.text, currentX, y);

      // Add decorations
      const textWidth = ctx.measureText(segment.text).width;

      // Underline
      if (segment.underline) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentX, y + fontSize + 2);
        ctx.lineTo(currentX + textWidth, y + fontSize + 2);
        ctx.stroke();
        ctx.restore();
      }

      // Strikethrough
      if (segment.strikethrough) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentX, y - fontSize / 3);
        ctx.lineTo(currentX + textWidth, y - fontSize / 3);
        ctx.stroke();
        ctx.restore();
      }
    }

    currentX += ctx.measureText(segment.text).width;
  }

  ctx.restore();
}

function renderMarkdownLine(text, x, y, fontSize) {
  ctx.save();

  let currentX = x;
  const segments = parseMarkdownSegments(text);

  for (const segment of segments) {
    // Set font style based on segment type (combining styles)
    let fontStyle = '';
    if (segment.italic) fontStyle += 'italic ';
    if (segment.bold) fontStyle += 'bold ';
    ctx.font = `${fontStyle}${fontSize}px Arial`;

    // Handle links with special color and underline
    if (segment.link) {
      ctx.save();
      ctx.fillStyle = '#0066cc'; // Link color
      ctx.fillText(segment.text, currentX, y);

      // Store link information for click detection
      storeClickableLink(segment.url, currentX, y, segment.text, fontSize);

      // Underline the link
      const textWidth = ctx.measureText(segment.text).width;
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(currentX, y + fontSize + 2);
      ctx.lineTo(currentX + textWidth, y + fontSize + 2);
      ctx.stroke();
      ctx.restore();
    } else if (segment.code) {
      // Handle code with special styling
      ctx.save();
      ctx.font = `${fontSize}px 'Courier New', monospace`; // Monospace font for code
      // Apply dark mode color inversion for code text
      let codeColor = '#d73a49'; // Code color (reddish)
      if (typeof window !== 'undefined' && window.invertBlackToWhite) {
        codeColor = window.invertBlackToWhite(codeColor);
      }
      ctx.fillStyle = codeColor;

      // Draw background for inline code
      const textWidth = ctx.measureText(segment.text).width;
      ctx.fillStyle = 'rgba(128, 128, 128, 0.1)'; // Light gray background
      ctx.fillRect(currentX - 2, y - fontSize + 2, textWidth + 4, fontSize + 4);

      ctx.fillStyle = codeColor; // Reset text color
      ctx.fillText(segment.text, currentX, y);
      ctx.restore();
    } else {
      // Render normal text
      ctx.fillText(segment.text, currentX, y);

      // Add decorations
      const textWidth = ctx.measureText(segment.text).width;

      // Underline
      if (segment.underline) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentX, y + fontSize + 2);
        ctx.lineTo(currentX + textWidth, y + fontSize + 2);
        ctx.stroke();
        ctx.restore();
      }

      // Strikethrough
      if (segment.strikethrough) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentX, y + fontSize / 2);
        ctx.lineTo(currentX + textWidth, y + fontSize / 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    currentX += ctx.measureText(segment.text).width;
  }

  ctx.restore();
}

// Helper function to check if a line is a bullet point
function isBulletLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('- ') || trimmed.startsWith('* ');
}

// Check if line is a numbered list item
function isNumberedLine(line) {
  return /^\s*\d+\.\s/.test(line);
}

// Check if line is a blockquote
function isBlockquoteLine(line) {
  return /^\s*>\s/.test(line);
}

// Parse numbered list item
function parseNumberedItem(line) {
  const match = line.match(/^\s*(\d+)\.\s*(.*)$/);
  if (match) {
    return {
      number: match[1],
      text: match[2]
    };
  }
  return null;
}

// Word wrap a line of text to fit within maxWidth, preserving markdown
function wrapTextWithMarkdown(text, maxWidth, fontSize) {
  ctx.save();
  ctx.font = `${fontSize}px Arial`; // Base font for measurement

  // Handle empty lines - they should still take up space
  if (text.trim() === '') {
    ctx.restore();
    return ['']; // Return array with one empty string to maintain line spacing
  }

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= maxWidth || currentLine === '') {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = words[i];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  ctx.restore();
  return lines;
}

// Check if line is a header (starts with #)
function isHeaderLine(line) {
  return /^\s*#{1,6}\s/.test(line);
}

// Get header level and text
function parseHeader(line) {
  const match = line.match(/^\s*(#{1,6})\s*(.*)$/);
  if (match) {
    return {
      level: match[1].length,
      text: match[2]
    };
  }
  return null;
}

// Render a line with bullet point, header, and word wrapping support
function renderLineWithBullet(line, x, y, fontSize, maxWidth) {
  if (isHeaderLine(line)) {
    // Handle header rendering
    const header = parseHeader(line);
    if (header) {
      ctx.save();

      // Set appropriate header sizes: H1=16px, H2=15px, H3=14px, H4=13px, H5=12px, H6=11px
      const headerSizes = {
        1: 16,   // H1
        2: 15,   // H2  
        3: 14,   // H3
        4: 13,   // H4
        5: 12,   // H5
        6: 11    // H6
      };
      const headerFontSize = headerSizes[header.level] || 14; // Default to 14px if level not found
      // Render header text with forced bold formatting
      renderMarkdownLineWithForcedBold(header.text, x, y, headerFontSize);

      ctx.restore();
      return 1; // Headers always use exactly 1 line
    }
  } else if (isBulletLine(line)) {
    // Extract bullet text (remove bullet marker)
    const bulletText = line.replace(/^\s*[-*]\s/, '');

    // Draw bullet point
    ctx.save();
    ctx.fillStyle = ctx.fillStyle; // Use current text color
    ctx.fillText('•', x, y);
    const bulletWidth = ctx.measureText('• ').width;
    ctx.restore();

    // Word wrap the bullet text
    const availableWidth = maxWidth - bulletWidth;
    const wrappedLines = wrapTextWithMarkdown(bulletText, availableWidth, fontSize);

    // Render each wrapped line with markdown
    const lineHeight = fontSize * 1.2;
    for (let i = 0; i < wrappedLines.length; i++) {
      renderMarkdownLine(wrappedLines[i], x + bulletWidth, y + i * lineHeight, fontSize);
    }

    return wrappedLines.length; // Return number of lines used
  } else if (isNumberedLine(line)) {
    // Handle numbered list
    const numberedItem = parseNumberedItem(line);
    if (numberedItem) {
      // Draw number
      ctx.save();
      const numberText = numberedItem.number + '. ';
      ctx.fillText(numberText, x, y);
      const numberWidth = ctx.measureText(numberText).width;
      ctx.restore();

      // Word wrap the numbered text
      const availableWidth = maxWidth - numberWidth;
      const wrappedLines = wrapTextWithMarkdown(numberedItem.text, availableWidth, fontSize);

      // Render each wrapped line with markdown
      const lineHeight = fontSize * 1.2;
      for (let i = 0; i < wrappedLines.length; i++) {
        renderMarkdownLine(wrappedLines[i], x + numberWidth, y + i * lineHeight, fontSize);
      }

      return wrappedLines.length;
    }
  } else if (isBlockquoteLine(line)) {
    // Handle blockquote
    const quoteText = line.replace(/^\s*>\s/, '');

    ctx.save();
    // Draw quote indicator with dark mode support
    let borderColor = '#ccc';
    let quoteTextColor = '#666';
    if (typeof window !== 'undefined' && window.invertBlackToWhite) {
      borderColor = window.invertBlackToWhite(borderColor);
      quoteTextColor = window.invertBlackToWhite(quoteTextColor);
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - fontSize);
    ctx.lineTo(x, y + fontSize * 0.5);
    ctx.stroke();

    // Render quote text with slight indent and italic style
    ctx.font = `italic ${fontSize}px Arial`;
    ctx.fillStyle = quoteTextColor;
    const quoteIndent = 10;

    const wrappedLines = wrapTextWithMarkdown(quoteText, maxWidth - quoteIndent, fontSize);
    const lineHeight = fontSize * 1.2;
    for (let i = 0; i < wrappedLines.length; i++) {
      renderMarkdownLine(wrappedLines[i], x + quoteIndent, y + i * lineHeight, fontSize);
    }

    ctx.restore();
    return wrappedLines.length;
  } else {
    // Regular line rendering with word wrap
    const wrappedLines = wrapTextWithMarkdown(line, maxWidth, fontSize);
    const lineHeight = fontSize * 1.2;

    for (let i = 0; i < wrappedLines.length; i++) {
      renderMarkdownLine(wrappedLines[i], x, y + i * lineHeight, fontSize);
    }

    return wrappedLines.length; // Return number of lines used
  }
}

// Parse text into segments with formatting information
function parseMarkdownSegments(text) {
  const segments = [];
  let currentPos = 0;

  // Pattern to match various markdown formats (order matters - longer patterns first)
  const patterns = [
    { regex: /(\*\*[^*]+\*\*)/g, type: 'bold' },        // **bold** must come before *italic*
    { regex: /(\_\_[^_]+\_\_)/g, type: 'underline' },    // __underline__
    { regex: /(~~[^~]+~~)/g, type: 'strikethrough' },    // ~~strikethrough~~
    { regex: /(\*[^*]+\*)/g, type: 'italic' },           // *italic* (after **bold**)
    { regex: /(\[[^\]]+\]\([^)]+\))/g, type: 'link' },   // [text](url)
    { regex: /(`[^`]+`)/g, type: 'code' }                // `inline code`
  ];

  const matches = [];

  // Find all matches
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: pattern.type
      });
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches - keep longer patterns first
  const filteredMatches = [];
  for (const match of matches) {
    // Check if this match overlaps with any already accepted match
    const hasOverlap = filteredMatches.some(existing =>
      (match.start < existing.end && match.end > existing.start)
    );
    if (!hasOverlap) {
      filteredMatches.push(match);
    }
  }

  // Process text with non-overlapping matches
  for (const match of filteredMatches) {
    // Add text before match
    if (currentPos < match.start) {
      segments.push({
        text: text.substring(currentPos, match.start),
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        link: false,
        code: false
      });
    }

    // Add formatted segment
    if (match.type === 'bold') {
      segments.push({
        text: match.text, // Keep asterisks visible
        bold: true,
        italic: false,
        underline: false,
        strikethrough: false,
        link: false,
        code: false
      });
    } else if (match.type === 'italic') {
      segments.push({
        text: match.text, // Keep asterisks visible
        bold: false,
        italic: true,
        underline: false,
        strikethrough: false,
        link: false,
        code: false
      });
    } else if (match.type === 'underline') {
      segments.push({
        text: match.text, // Keep underscores visible
        bold: false,
        italic: false,
        underline: true,
        strikethrough: false,
        link: false,
        code: false
      });
    } else if (match.type === 'strikethrough') {
      segments.push({
        text: match.text, // Keep tildes visible
        bold: false,
        italic: false,
        underline: false,
        strikethrough: true,
        link: false,
        code: false
      });
    } else if (match.type === 'link') {
      const linkMatch = match.text.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        segments.push({
          text: match.text, // Keep [text](url) format visible
          bold: false,
          italic: false,
          underline: false,
          strikethrough: false,
          link: true,
          code: false,
          url: linkMatch[2],
          linkText: linkMatch[1]
        });
      }
    } else if (match.type === 'code') {
      segments.push({
        text: match.text, // Keep backticks visible
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        link: false,
        code: true
      });
    }

    currentPos = match.end;
  }

  // Add remaining text
  if (currentPos < text.length) {
    segments.push({
      text: text.substring(currentPos),
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      link: false,
      code: false
    });
  }

  return segments;
}

// Store clickable link information for later click detection
let clickableLinks = [];
let currentElementId = null;

function storeClickableLink(url, x, y, text, fontSize) {
  const textWidth = ctx.measureText(text).width;
  clickableLinks.push({
    url: url,
    x: x,
    y: y,
    width: textWidth,
    height: fontSize + 4, // Add some padding for easier clicking
    elementId: currentElementId
  });
}

function clearLinksForElement(elementId) {
  clickableLinks = clickableLinks.filter(link => link.elementId !== elementId);
}

// Check if a click hits any link and handle it
export function handleLinkClick(screenX, screenY) {
  // Convert screen coordinates to world coordinates
  const worldPos = screenToWorld(screenX, screenY);

  for (const link of clickableLinks) {
    if (worldPos.x >= link.x && worldPos.x <= link.x + link.width &&
      worldPos.y >= link.y && worldPos.y <= link.y + link.height) {
      // Open link in new tab
      window.open(link.url, '_blank');
      return true; // Link was clicked
    }
  }
  return false; // No link clicked
}

// Canvas state validation and recovery functions
export function validateCanvasState() {
  try {
    if (!ctx || !canvas) {
      console.warn('Canvas context is missing');
      return false;
    }

    // Test that the canvas context is responsive
    const testTransform = ctx.getTransform();
    if (!testTransform) {
      console.warn('Canvas transform is invalid');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Canvas state validation failed:', error);
    return false;
  }
}

// Emergency canvas recovery function
export function recoverCanvasState() {
  try {
    if (!ctx || !canvas) return false;

    // Reset transform to identity
    ctx.resetTransform();

    // Clear any accumulated state
    ctx.restore(); // Try to restore any saved states

    // Force a redraw
    if (dependencies.requestRedraw) {
      dependencies.requestRedraw();
    } else {
      redrawCanvas();
    }

    console.log('Canvas state recovered');
    return true;
  } catch (error) {
    console.error('Canvas recovery failed:', error);
    return false;
  }
}

function renderStickyNote(el) {
  let bg = el.data?.color || '#ffeb3b';
  let borderColor = '#fbc02d';
  let textColor = '#222222';

  // todo: if we ever implement proper colour inversion invertBlackToWhite: this will mess up the rendering 

  // Convert black text to white in dark mode (client-side display only)
  if (typeof window !== 'undefined' && window.invertBlackToWhite) {
    // Keep sticky note backgrounds unchanged - they're usually colored
    // Only invert the text if it's black
    textColor = window.invertBlackToWhite(textColor);
  }

  ctx.fillStyle = bg;
  ctx.fillRect(el.x, el.y, el.width, el.height);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(el.x, el.y, el.width, el.height);

  if (el.data?.content && !el.data?.isEditing) {
    ctx.fillStyle = textColor;
    const fontSize = el.data?.fontSize || 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Clear links for this element and set context
    clearLinksForElement(el.id);
    currentElementId = el.id;

    const lines = String(el.data.content).split('\n');
    const lh = fontSize * 1.2;
    const padding = 10;
    const maxWidth = el.width - padding * 2; // Account for left and right padding

    let currentY = el.y + padding;
    for (let i = 0; i < lines.length; i++) {
      const linesUsed = renderLineWithBullet(lines[i], el.x + padding, currentY, fontSize, maxWidth);
      currentY += linesUsed * lh;
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

// Flowchart shape renderers
function renderProcess(el) {
  // Rounded rectangle for process
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const radius = Math.min(el.width, el.height) * 0.1;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, radius);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderDecision(el) {
  // Diamond shape for decision
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

function renderStartEnd(el) {
  // Oval/ellipse for start/end
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

function renderDatabase(el) {
  // Cylinder shape for database
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const ellipseHeight = el.height * 0.2;
  const bodyHeight = el.height - ellipseHeight;

  ctx.beginPath();
  // Top ellipse
  ctx.ellipse(el.x + el.width / 2, el.y + ellipseHeight / 2, el.width / 2, ellipseHeight / 2, 0, 0, 2 * Math.PI);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();

  // Body rectangle
  ctx.beginPath();
  ctx.rect(el.x, el.y + ellipseHeight / 2, el.width, bodyHeight);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();

  // Bottom ellipse
  ctx.beginPath();
  ctx.ellipse(el.x + el.width / 2, el.y + el.height - ellipseHeight / 2, el.width / 2, ellipseHeight / 2, 0, 0, 2 * Math.PI);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderDocument(el) {
  // Document shape with wavy bottom
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const waveHeight = el.height * 0.1;

  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.width, el.y);
  ctx.lineTo(el.x + el.width, el.y + el.height - waveHeight);

  // Wavy bottom
  const waveWidth = el.width / 4;
  ctx.quadraticCurveTo(el.x + el.width * 0.75, el.y + el.height, el.x + el.width * 0.5, el.y + el.height - waveHeight);
  ctx.quadraticCurveTo(el.x + el.width * 0.25, el.y + el.height, el.x, el.y + el.height - waveHeight);

  ctx.closePath();
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

// UML shape renderers
function renderClass(el) {
  // UML class with compartments
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  // Main rectangle
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.width, el.height);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();

  // Divider lines for class compartments
  const titleHeight = el.height / 3;
  const attributesHeight = el.height / 3;

  ctx.beginPath();
  ctx.moveTo(el.x, el.y + titleHeight);
  ctx.lineTo(el.x + el.width, el.y + titleHeight);
  ctx.moveTo(el.x, el.y + titleHeight + attributesHeight);
  ctx.lineTo(el.x + el.width, el.y + titleHeight + attributesHeight);
  ctx.stroke();
}

function renderActor(el) {
  // UML actor (stick figure)
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const centerX = el.x + el.width / 2;
  const headRadius = el.height * 0.15;
  const bodyLength = el.height * 0.4;
  const armLength = el.width * 0.3;
  const legLength = el.height * 0.3;

  ctx.beginPath();
  // Head
  ctx.arc(centerX, el.y + headRadius, headRadius, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  // Body
  ctx.moveTo(centerX, el.y + headRadius * 2);
  ctx.lineTo(centerX, el.y + headRadius * 2 + bodyLength);

  // Arms
  ctx.moveTo(centerX - armLength / 2, el.y + headRadius * 2 + bodyLength / 3);
  ctx.lineTo(centerX + armLength / 2, el.y + headRadius * 2 + bodyLength / 3);

  // Legs
  ctx.moveTo(centerX, el.y + headRadius * 2 + bodyLength);
  ctx.lineTo(centerX - armLength / 3, el.y + el.height);
  ctx.moveTo(centerX, el.y + headRadius * 2 + bodyLength);
  ctx.lineTo(centerX + armLength / 3, el.y + el.height);

  ctx.stroke();
}

function renderPackage(el) {
  // UML package shape
  const { stroke, fill, width } = strokeFillFrom(el);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = width;

  const tabWidth = el.width * 0.3;
  const tabHeight = el.height * 0.2;

  ctx.beginPath();
  // Tab
  ctx.rect(el.x, el.y, tabWidth, tabHeight);
  // Main body
  ctx.rect(el.x, el.y + tabHeight, el.width, el.height - tabHeight);
  if (fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function renderText(el) {
  if (!el.data?.content || el.data?.isEditing) return;

  let textColor = el.data?.color || '#000000';
  // Convert black text to white in dark mode (client-side display only)
  if (typeof window !== 'undefined' && window.invertBlackToWhite) {
    textColor = window.invertBlackToWhite(textColor);
  }

  ctx.fillStyle = textColor;
  const fontSize = el.data?.fontSize || 16;
  const fontFamily = el.data?.fontFamily || 'Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Clear links for this element and set context
  clearLinksForElement(el.id);
  currentElementId = el.id;

  const lines = String(el.data.content).split('\n');
  const lh = fontSize * 1.2;
  const maxWidth = el.width > 0 ? el.width : 500; // Use element width or default

  let currentY = el.y;
  for (let i = 0; i < lines.length; i++) {
    const linesUsed = renderLineWithBullet(lines[i], el.x, currentY, fontSize, maxWidth);
    currentY += linesUsed * lh;
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
  entry = { img, ready: false, retryCount: 0 };
  imageCache.set(src, entry);

  img.onload = () => {
    entry.ready = true;
    console.log(`Image loaded successfully: ${src.substring(0, 50)}...`);
    dependencies.requestRedraw?.();
  };
  img.onerror = () => {
    console.warn('Failed to load image src:', src);
    entry.retryCount = (entry.retryCount || 0) + 1;
    
    // Retry up to 3 times with increasing delays
    if (entry.retryCount < 3) {
      setTimeout(() => {
        console.log(`Retrying image load (attempt ${entry.retryCount + 1}):`, src.substring(0, 50));
        img.src = src; // Trigger retry
      }, entry.retryCount * 1000);
    } else {
      console.error(`Failed to load image after ${entry.retryCount} attempts:`, src);
      imageCache.delete(src);
    }
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
  if (!entry) return;
  if (entry.ready) {
    ctx.drawImage(entry.img, el.x, el.y, el.width, el.height);
  } else {
    // Optional light placeholder, or no-op to avoid extra paint cost.
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(el.x, el.y, el.width, el.height);
  }
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

// --- Grid System ------------------------------------------------------------

// Render grid background
function renderGrid() {
  if (!ctx || !gridEnabled) return;

  try {
    ctx.save();

    // Get current viewport bounds in world coordinates
    const { vx, vy, z } = snapshotState();

    // Calculate visible area in world coordinates
    const canvasRect = canvas.getBoundingClientRect();
    const canvasWidth = canvasRect.width / z;
    const canvasHeight = canvasRect.height / z;

    const startX = vx - (canvasWidth * 0.1);
    const endX = vx + canvasWidth * 1.1;
    const startY = vy - (canvasHeight * 0.1);
    const endY = vy + canvasHeight * 1.1;

    // Calculate grid line positions
    const firstVerticalLine = Math.floor(startX / gridSize) * gridSize;
    const firstHorizontalLine = Math.floor(startY / gridSize) * gridSize;

    // Set grid style
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1 / z; // Keep lines crisp at all zoom levels
    ctx.globalAlpha = Math.min(1, z * 0.8); // Fade out grid when zoomed out

    ctx.beginPath();

    // Draw vertical lines
    for (let x = firstVerticalLine; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }

    // Draw horizontal lines
    for (let y = firstHorizontalLine; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }

    ctx.stroke();
    ctx.restore();
  } catch (error) {
    console.error('Failed to render grid:', error);
  }
}

// Grid configuration functions
export function setGridEnabled(enabled) {
  gridEnabled = enabled;
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function isGridEnabled() {
  return gridEnabled;
}

export function setGridSize(size) {
  gridSize = Math.max(5, size); // Minimum grid size of 5 pixels
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function getGridSize() {
  return gridSize;
}

export function setSnapToGrid(enabled) {
  snapToGrid = enabled;
}

export function isSnapToGridEnabled() {
  return snapToGrid;
}

// Toggle grid visibility
export function toggleGrid() {
  console.log('toggleGrid called, gridEnabled was:', gridEnabled);
  gridEnabled = !gridEnabled;
  console.log('toggleGrid: gridEnabled is now:', gridEnabled);
  if (dependencies.requestRedraw) {
    dependencies.requestRedraw();
  } else {
    redrawCanvas();
  }
}

// Toggle snap to grid
export function toggleSnapToGrid() {
  console.log('toggleSnapToGrid called, snapToGrid was:', snapToGrid);
  snapToGrid = !snapToGrid;
  console.log('toggleSnapToGrid: snapToGrid is now:', snapToGrid);
}

// Snap coordinate to grid
export function snapToGridCoordinate(coord) {
  if (!snapToGrid) return coord;
  return Math.round(coord / gridSize) * gridSize;
}

// Snap point to grid
export function snapToGridPoint(x, y) {
  if (!snapToGrid) return { x, y };
  return {
    x: snapToGridCoordinate(x),
    y: snapToGridCoordinate(y)
  };
}

// --- Accessors --------------------------------------------------------------

export function getCanvas() { return canvas; }
export function getContext() { return ctx; }
export function getTempCanvas() { return tempCanvas; }
export function getTempContext() { return tempCtx; }
export function isCanvasInitialized() { return canvas !== null && ctx !== null; }

// --- Init -------------------------------------------------------------------

export function init() {
  console.log('Canvas Manager module loaded - with toggleGrid functions v1.1');
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
    // Grid system
    setGridEnabled,
    isGridEnabled,
    toggleGrid,
    setGridSize,
    getGridSize,
    setSnapToGrid,
    isSnapToGridEnabled,
    toggleSnapToGrid,
    snapToGridCoordinate,
    snapToGridPoint
  };
}

