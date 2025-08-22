// Viewport Manager Module - Handles viewport, zoom, pan, and minimap operations
// This module manages the infinite canvas viewport, zoom levels, panning, and minimap

// Viewport state
export let viewportX = 0;
export let viewportY = 0;
export let zoomLevel = 1;

// Pan state
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

// Smooth camera movement
let targetViewportX = 0;
let targetViewportY = 0;
let cameraAnimationId = null;

// Minimap state
let minimapCanvas = null;
let minimapCtx = null;
let minimapViewport = null;
let isMinimapDragging = false;
let minimapDragStart = { x: 0, y: 0 };
let minimapHasDragged = false;

// Minimap performance optimization
let minimapUpdateQueued = false;
let lastMinimapUpdate = 0;
const minimapUpdateThrottle = 16; // ~60fps

// Zoom configuration
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_FACTOR = 1.1;

// Dependencies that will be injected from other modules
let dependencies = {
    canvas: null,
    ctx: null,
    elements: null,
    redrawCanvas: null,
    renderElementToMinimap: null,
    applyViewportTransform: null,
    resetCanvasTransform: null,
    updateCanvasCursor: null,
    blazorReference: null
};

// Set dependencies from other modules
export function setDependencies(deps) {
    Object.assign(dependencies, deps);
}

// Initialize viewport manager
export function initializeViewport() {
    try {
        // Set initial viewport
        resetViewport();
        
        // Initialize minimap
        initializeMinimap();
        
        console.log('Viewport manager initialized');
        return true;
    } catch (error) {
        console.error('Failed to initialize viewport:', error);
        return false;
    }
}

// Reset viewport to default position and zoom
export function resetViewport() {
    try {
        viewportX = 0;
        viewportY = 0;
        zoomLevel = 1;
        targetViewportX = 0;
        targetViewportY = 0;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateZoomLevelDisplay();
        updateMinimapImmediate();
    } catch (error) {
        console.error('Failed to reset viewport:', error);
    }
}

// Zoom functions
export function zoomAtCenter(factor) {
    try {
        if (!dependencies.canvas) return false;
        
        const canvas = dependencies.canvas;
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        return zoomAtPoint(centerX, centerY, factor);
    } catch (error) {
        console.error('Failed to zoom at center:', error);
        return false;
    }
}

export function zoomAtPoint(screenX, screenY, factor) {
    try {
        const oldZoom = zoomLevel;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel * factor));
        
        if (newZoom === zoomLevel) return false;
        
        // Calculate world position at zoom point
        const worldX = (screenX + viewportX) / oldZoom;
        const worldY = (screenY + viewportY) / oldZoom;
        
        // Update zoom level
        zoomLevel = newZoom;
        
        // Adjust viewport to keep the zoom point stationary
        viewportX = worldX * newZoom - screenX;
        viewportY = worldY * newZoom - screenY;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateZoomLevelDisplay();
        updateMinimapImmediate();
        
        return true;
    } catch (error) {
        console.error('Failed to zoom at point:', error);
        return false;
    }
}

export function resetZoom() {
    try {
        if (zoomLevel === 1) return false;
        
        zoomLevel = 1;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateZoomLevelDisplay();
        updateMinimapImmediate();
        
        return true;
    } catch (error) {
        console.error('Failed to reset zoom:', error);
        return false;
    }
}

// Pan functions
export function startPan(x, y) {
    try {
        isPanning = true;
        lastPanX = x;
        lastPanY = y;
        
        if (dependencies.updateCanvasCursor) {
            dependencies.updateCanvasCursor('grabbing');
        }
        
        return true;
    } catch (error) {
        console.error('Failed to start pan:', error);
        return false;
    }
}

export function updatePan(x, y) {
    try {
        if (!isPanning) return false;
        
        const deltaX = x - lastPanX;
        const deltaY = y - lastPanY;
        
        viewportX -= deltaX;
        viewportY -= deltaY;
        
        lastPanX = x;
        lastPanY = y;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateMinimapThrottled();
        
        return true;
    } catch (error) {
        console.error('Failed to update pan:', error);
        return false;
    }
}

export function endPan() {
    try {
        if (!isPanning) return false;
        
        isPanning = false;
        
        if (dependencies.updateCanvasCursor) {
            dependencies.updateCanvasCursor('grab');
        }
        
        updateMinimapImmediate();
        
        return true;
    } catch (error) {
        console.error('Failed to end pan:', error);
        return false;
    }
}

// Mouse wheel handler
export function handleMouseWheel(event) {
    try {
        if (!dependencies.canvas) {
            console.warn('Canvas not available for mouse wheel handling');
            return false;
        }
        
        event.preventDefault();
        
        const rect = dependencies.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        
        return zoomAtPoint(mouseX, mouseY, factor);
    } catch (error) {
        console.error('Failed to handle mouse wheel:', error);
        return false;
    }
}

// Smooth camera animation
export function animateToPosition(targetX, targetY, duration = 500) {
    try {
        targetViewportX = targetX;
        targetViewportY = targetY;
        
        const startX = viewportX;
        const startY = viewportY;
        const startTime = performance.now();
        
        if (cameraAnimationId) {
            cancelAnimationFrame(cameraAnimationId);
        }
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function (ease-out)
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            viewportX = startX + (targetX - startX) * easeProgress;
            viewportY = startY + (targetY - startY) * easeProgress;
            
            if (dependencies.redrawCanvas) {
                dependencies.redrawCanvas();
            }
            
            if (progress < 1) {
                cameraAnimationId = requestAnimationFrame(animate);
            } else {
                cameraAnimationId = null;
                updateMinimapImmediate();
            }
        }
        
        cameraAnimationId = requestAnimationFrame(animate);
        
        return true;
    } catch (error) {
        console.error('Failed to animate to position:', error);
        return false;
    }
}

// World bounds calculation
export function getWorldBounds() {
    try {
        if (!dependencies.elements || dependencies.elements.size === 0) {
            return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
        }
        
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        for (const element of dependencies.elements.values()) {
            minX = Math.min(minX, element.x);
            minY = Math.min(minY, element.y);
            maxX = Math.max(maxX, element.x + element.width);
            maxY = Math.max(maxY, element.y + element.height);
        }
        
        // Add padding
        const padding = 200;
        return {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
    } catch (error) {
        console.error('Failed to calculate world bounds:', error);
        return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    }
}

// Minimap functions
export function initializeMinimap() {
    try {
        minimapCanvas = document.getElementById('minimap-canvas');
        if (!minimapCanvas) {
            console.warn('Minimap canvas not found - element may not be rendered yet');
            return false;
        }
        
        minimapCtx = minimapCanvas.getContext('2d');
        if (!minimapCtx) {
            console.error('Could not get minimap 2D context');
            return false;
        }
        
        minimapViewport = document.getElementById('minimap-viewport');
        if (!minimapViewport) {
            console.warn('Minimap viewport not found');
        }
        
        // Set up event handlers
        minimapCanvas.addEventListener('mousedown', handleMinimapMouseDown);
        minimapCanvas.addEventListener('mousemove', handleMinimapMouseMove);
        minimapCanvas.addEventListener('mouseup', handleMinimapMouseUp);
        minimapCanvas.addEventListener('click', handleMinimapClick);
        
        console.log('Minimap initialized');
        return true;
    } catch (error) {
        console.error('Failed to initialize minimap:', error);
        return false;
    }
}

export function handleMinimapMouseDown(event) {
    try {
        event.preventDefault();
        isMinimapDragging = true;
        minimapHasDragged = false;
        
        const rect = minimapCanvas.getBoundingClientRect();
        minimapDragStart.x = event.clientX - rect.left;
        minimapDragStart.y = event.clientY - rect.top;
        
        return true;
    } catch (error) {
        console.error('Failed to handle minimap mouse down:', error);
        return false;
    }
}

export function handleMinimapMouseMove(event) {
    try {
        if (!isMinimapDragging) return false;
        
        event.preventDefault();
        minimapHasDragged = true;
        
        const rect = minimapCanvas.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        
        const deltaX = currentX - minimapDragStart.x;
        const deltaY = currentY - minimapDragStart.y;
        
        // Convert minimap coordinates to world coordinates
        const bounds = getWorldBounds();
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        const worldDeltaX = (deltaX / minimapCanvas.width) * worldWidth;
        const worldDeltaY = (deltaY / minimapCanvas.height) * worldHeight;
        
        viewportX += worldDeltaX * zoomLevel;
        viewportY += worldDeltaY * zoomLevel;
        
        minimapDragStart.x = currentX;
        minimapDragStart.y = currentY;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateMinimapActual();
        
        return true;
    } catch (error) {
        console.error('Failed to handle minimap mouse move:', error);
        return false;
    }
}

export function handleMinimapMouseUp(event) {
    try {
        if (!isMinimapDragging) return false;
        
        isMinimapDragging = false;
        
        if (!minimapHasDragged) {
            // This was a click, not a drag
            handleMinimapClick(event);
        }
        
        return true;
    } catch (error) {
        console.error('Failed to handle minimap mouse up:', error);
        return false;
    }
}

export function handleMinimapClick(event) {
    try {
        if (minimapHasDragged) return false;
        
        const rect = minimapCanvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Convert minimap coordinates to world coordinates
        const bounds = getWorldBounds();
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        const worldX = bounds.minX + (clickX / minimapCanvas.width) * worldWidth;
        const worldY = bounds.minY + (clickY / minimapCanvas.height) * worldHeight;
        
        // Center viewport on clicked position
        const canvasWidth = dependencies.canvas ? dependencies.canvas.width : 800;
        const canvasHeight = dependencies.canvas ? dependencies.canvas.height : 600;
        
        const targetX = worldX * zoomLevel - canvasWidth / 2;
        const targetY = worldY * zoomLevel - canvasHeight / 2;
        
        animateToPosition(targetX, targetY);
        
        return true;
    } catch (error) {
        console.error('Failed to handle minimap click:', error);
        return false;
    }
}

// Minimap update functions
export function updateMinimapThrottled() {
    if (minimapUpdateQueued) return;
    
    minimapUpdateQueued = true;
    
    const now = performance.now();
    const timeSinceLastUpdate = now - lastMinimapUpdate;
    
    if (timeSinceLastUpdate >= minimapUpdateThrottle) {
        updateMinimapActual();
    } else {
        setTimeout(() => {
            updateMinimapActual();
        }, minimapUpdateThrottle - timeSinceLastUpdate);
    }
}

export function updateMinimapActual() {
    try {
        minimapUpdateQueued = false;
        lastMinimapUpdate = performance.now();
        
        if (!minimapCtx || !minimapCanvas) return;
        
        // Clear minimap
        minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        
        // Get world bounds
        const bounds = getWorldBounds();
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        if (worldWidth <= 0 || worldHeight <= 0) return;
        
        // Set up scaling
        const scaleX = minimapCanvas.width / worldWidth;
        const scaleY = minimapCanvas.height / worldHeight;
        const scale = Math.min(scaleX, scaleY);
        
        minimapCtx.save();
        minimapCtx.scale(scale, scale);
        minimapCtx.translate(-bounds.minX, -bounds.minY);
        
        // Draw elements
        if (dependencies.elements && dependencies.renderElementToMinimap) {
            for (const element of dependencies.elements.values()) {
                dependencies.renderElementToMinimap(element, minimapCtx);
            }
        }
        
        minimapCtx.restore();
        
        // Draw viewport indicator
        drawMinimapViewport(bounds, worldWidth, worldHeight);
        
    } catch (error) {
        console.error('Failed to update minimap:', error);
    }
}

export function updateMinimapImmediate() {
    minimapUpdateQueued = false;
    updateMinimapActual();
}

// Draw viewport indicator on minimap
function drawMinimapViewport(bounds, worldWidth, worldHeight) {
    try {
        if (!minimapCtx || !minimapCanvas || !dependencies.canvas) return;
        
        const canvasWidth = dependencies.canvas.width;
        const canvasHeight = dependencies.canvas.height;
        
        // Calculate viewport bounds in world coordinates
        const viewportLeft = viewportX / zoomLevel;
        const viewportTop = viewportY / zoomLevel;
        const viewportRight = (viewportX + canvasWidth) / zoomLevel;
        const viewportBottom = (viewportY + canvasHeight) / zoomLevel;
        
        // Convert to minimap coordinates
        const minimapX = ((viewportLeft - bounds.minX) / worldWidth) * minimapCanvas.width;
        const minimapY = ((viewportTop - bounds.minY) / worldHeight) * minimapCanvas.height;
        const minimapWidth = ((viewportRight - viewportLeft) / worldWidth) * minimapCanvas.width;
        const minimapHeight = ((viewportBottom - viewportTop) / worldHeight) * minimapCanvas.height;
        
        // Draw viewport rectangle
        minimapCtx.strokeStyle = '#007bff';
        minimapCtx.lineWidth = 2;
        minimapCtx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);
        
        // Draw semi-transparent fill
        minimapCtx.fillStyle = 'rgba(0, 123, 255, 0.1)';
        minimapCtx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);
        
    } catch (error) {
        console.error('Failed to draw minimap viewport:', error);
    }
}

// Update zoom level display
function updateZoomLevelDisplay() {
    try {
        if (dependencies.blazorReference && dependencies.blazorReference.invokeMethodAsync) {
            dependencies.blazorReference.invokeMethodAsync('UpdateZoomLevel', Math.round(zoomLevel * 100));
        }
        
        // Also update any HTML zoom display elements
        const zoomDisplay = document.getElementById('zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    } catch (error) {
        console.error('Failed to update zoom level display:', error);
    }
}

// Utility functions
export function getViewportInfo() {
    return {
        x: viewportX,
        y: viewportY,
        zoom: zoomLevel,
        isPanning: isPanning
    };
}

export function getViewportX() {
    return viewportX;
}

export function getViewportY() {
    return viewportY;
}

export function getZoomLevel() {
    return zoomLevel;
}

export function setViewport(x, y, zoom) {
    try {
        viewportX = x || 0;
        viewportY = y || 0;
        zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom || 1));
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateZoomLevelDisplay();
        updateMinimapImmediate();
        
        return true;
    } catch (error) {
        console.error('Failed to set viewport:', error);
        return false;
    }
}

export function fitToElements() {
    try {
        if (!dependencies.elements || dependencies.elements.size === 0) return false;
        
        const bounds = getWorldBounds();
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        if (!dependencies.canvas) return false;
        
        const canvasWidth = dependencies.canvas.width;
        const canvasHeight = dependencies.canvas.height;
        
        // Calculate zoom to fit all elements
        const zoomX = canvasWidth / worldWidth;
        const zoomY = canvasHeight / worldHeight;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY) * 0.9));
        
        // Center on elements
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        
        zoomLevel = newZoom;
        viewportX = centerX * zoomLevel - canvasWidth / 2;
        viewportY = centerY * zoomLevel - canvasHeight / 2;
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
        
        updateZoomLevelDisplay();
        updateMinimapImmediate();
        
        return true;
    } catch (error) {
        console.error('Failed to fit to elements:', error);
        return false;
    }
}

// Initialize the module
export function init() {
    initializeViewport();
    console.log('Viewport Manager module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
    window.viewportX = viewportX;
    window.viewportY = viewportY;
    window.zoomLevel = zoomLevel;
    window.initializeViewport = initializeViewport;
    window.resetViewport = resetViewport;
    window.zoomAtCenter = zoomAtCenter;
    window.zoomAtPoint = zoomAtPoint;
    window.resetZoom = resetZoom;
    window.handleMouseWheel = handleMouseWheel;
    window.getWorldBounds = getWorldBounds;
    window.initializeMinimap = initializeMinimap;
    window.handleMinimapMouseDown = handleMinimapMouseDown;
    window.handleMinimapMouseMove = handleMinimapMouseMove;
    window.handleMinimapMouseUp = handleMinimapMouseUp;
    window.handleMinimapClick = handleMinimapClick;
    window.updateMinimapThrottled = updateMinimapThrottled;
    window.updateMinimapActual = updateMinimapActual;
    window.updateMinimapImmediate = updateMinimapImmediate;
    window.updateMinimap = updateMinimapImmediate; // Legacy alias
    window.animateToPosition = animateToPosition;
    window.getViewportInfo = getViewportInfo;
    window.setViewport = setViewport;
    window.fitToElements = fitToElements;
}