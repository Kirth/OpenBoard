// Canvas Manager Module - Handles all canvas operations and rendering
// This module manages the main drawing canvas, temporary canvas for previews,
// coordinate transformations, and basic rendering operations

// Import dependencies (to be connected with other modules)
// import { elements, selectedElementId, getElementAtPoint } from './element-factory.js';
// import { viewportX, viewportY, zoomLevel } from './viewport-manager.js';

// Core canvas elements
let canvas = null;
let ctx = null;
let tempCanvas = null;
let tempCtx = null;

// Viewport state (will be managed by viewport-manager eventually)
let viewportX = 0;
let viewportY = 0;
let zoomLevel = 1;

// Dependencies that will be injected from other modules
let dependencies = {
    elements: null, // Map of elements
    selectedElementId: null,
    getElementAtPoint: null,
    highlightElement: null,
    clearSelection: null,
    drawResizeHandles: null,
    drawLineEndpointHandles: null,
    drawCollaborativeSelections: null,
    cursors: null,
    editorManager: null,
    minimapCtx: null
};

// Set dependencies from other modules
export function setDependencies(deps) {
    Object.assign(dependencies, deps);
}

// Initialize the canvas and set up basic properties
export function initializeCanvas() {
    try {
        canvas = document.getElementById('whiteboard-canvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }

        ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D rendering context');
        }

        // Set up canvas properties
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.imageSmoothingEnabled = true;

        // Create temporary canvas for shape previews
        createTempCanvas();

        // Set initial size
        resizeCanvas();

        console.log('Canvas initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize canvas:', error);
        return false;
    }
}

// Create temporary canvas for drawing previews
function createTempCanvas() {
    try {
        tempCanvas = document.createElement('canvas');
        tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) {
            throw new Error('Could not create temporary canvas context');
        }

        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';
        tempCtx.imageSmoothingEnabled = true;

        console.log('Temporary canvas created');
    } catch (error) {
        console.error('Failed to create temporary canvas:', error);
    }
}

// Handle canvas resizing with proper device pixel ratio support
export function resizeCanvas() {
    if (!canvas || !ctx) {
        console.warn('Canvas not initialized');
        return;
    }

    try {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set the internal size to the display size * device pixel ratio
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Scale the context to match the device pixel ratio
        ctx.scale(dpr, dpr);

        // Set the CSS size to the display size
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        // Update temp canvas size
        if (tempCanvas && tempCtx) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.scale(dpr, dpr);
        }

        // Restore canvas properties after resize
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.imageSmoothingEnabled = true;

        if (tempCtx) {
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';
            tempCtx.imageSmoothingEnabled = true;
        }

        console.log(`Canvas resized to ${rect.width}x${rect.height} (${canvas.width}x${canvas.height} internal)`);
    } catch (error) {
        console.error('Failed to resize canvas:', error);
    }
}

// Main canvas redraw function
export function redrawCanvas() {
    if (!canvas || !ctx) {
        console.warn('Canvas not initialized');
        return;
    }

    try {
        // Clear the canvas
        clearCanvas();

        // Apply viewport transformation
        applyViewportTransform();

        // Render all elements
        if (dependencies.elements && dependencies.elements instanceof Map) {
            for (const [elementId, element] of dependencies.elements) {
                renderExistingElement(element);
            }
        }

        // Reset transformation for UI elements
        resetCanvasTransform();

        // Draw selection handles and collaborative selections
        drawUIElements();

        // Draw cursors
        drawCursors();

    } catch (error) {
        console.error('Failed to redraw canvas:', error);
    }
}

// Apply viewport transformation (translate and scale)
export function applyViewportTransform() {
    if (!ctx) return;

    try {
        ctx.save();
        // Use viewport manager's values instead of local ones
        const currentViewportX = dependencies.getViewportX ? dependencies.getViewportX() : viewportX;
        const currentViewportY = dependencies.getViewportY ? dependencies.getViewportY() : viewportY;
        const currentZoomLevel = dependencies.getZoomLevel ? dependencies.getZoomLevel() : zoomLevel;
        
        ctx.translate(-currentViewportX, -currentViewportY);
        ctx.scale(currentZoomLevel, currentZoomLevel);
    } catch (error) {
        console.error('Failed to apply viewport transform:', error);
    }
}

// Reset canvas transformation
export function resetCanvasTransform() {
    if (!ctx) return;

    try {
        ctx.restore();
    } catch (error) {
        console.error('Failed to reset canvas transform:', error);
    }
}

// Convert screen coordinates to world coordinates
export function screenToWorld(screenX, screenY) {
    try {
        const currentViewportX = dependencies.getViewportX ? dependencies.getViewportX() : viewportX;
        const currentViewportY = dependencies.getViewportY ? dependencies.getViewportY() : viewportY;
        const currentZoomLevel = dependencies.getZoomLevel ? dependencies.getZoomLevel() : zoomLevel;
        
        return {
            x: (screenX + currentViewportX) / currentZoomLevel,
            y: (screenY + currentViewportY) / currentZoomLevel
        };
    } catch (error) {
        console.error('Failed to convert screen to world coordinates:', error);
        return { x: screenX, y: screenY };
    }
}

// Convert world coordinates to screen coordinates
export function worldToScreen(worldX, worldY) {
    try {
        const currentViewportX = dependencies.getViewportX ? dependencies.getViewportX() : viewportX;
        const currentViewportY = dependencies.getViewportY ? dependencies.getViewportY() : viewportY;
        const currentZoomLevel = dependencies.getZoomLevel ? dependencies.getZoomLevel() : zoomLevel;
        
        return {
            x: (worldX * currentZoomLevel) - currentViewportX,
            y: (worldY * currentZoomLevel) - currentViewportY
        };
    } catch (error) {
        console.error('Failed to convert world to screen coordinates:', error);
        return { x: worldX, y: worldY };
    }
}

// Clear the canvas
export function clearCanvas() {
    if (!ctx || !canvas) return;

    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (error) {
        console.error('Failed to clear canvas:', error);
    }
}

// Render an existing element to the canvas
export function renderExistingElement(element) {
    if (!ctx || !element) return;

    try {
        ctx.save();

        switch (element.type) {
            case 'Rectangle':
            case 'rectangle':
                renderRectangle(element);
                break;
            case 'Shape':
                // Shape elements can be rectangles, circles, etc.
                renderShapeElement(element);
                break;
            case 'Circle':
            case 'circle':
                renderCircle(element);
                break;
            case 'Line':
                renderLine(element);
                break;
            case 'Path':
                renderPath(element);
                break;
            case 'Drawing':
                // Drawing is the same as Path, just a different name from the server
                renderPath(element);
                break;
            case 'triangle':
                renderTriangle(element);
                break;
            case 'diamond':
                renderDiamond(element);
                break;
            case 'ellipse':
                renderEllipse(element);
                break;
            case 'star':
                renderStar(element);
                break;
            case 'StickyNote':
                renderStickyNote(element);
                break;
            case 'Text':
                renderText(element);
                break;
            case 'Image':
                renderImage(element);
                break;
            default:
                console.warn('Unknown element type:', element.type);
        }

        ctx.restore();
    } catch (error) {
        console.error('Failed to render element:', error);
    }
}

// Render element to minimap with performance optimizations
export function renderElementToMinimap(element, minimapCtx) {
    if (!minimapCtx || !element) return;

    try {
        minimapCtx.save();

        // Simplified rendering for minimap - basic shapes only
        minimapCtx.strokeStyle = element.data?.color || '#000000';
        minimapCtx.fillStyle = element.data?.fillColor || 'transparent';
        minimapCtx.lineWidth = Math.max(1, (element.data?.strokeWidth || 2) * 0.5);

        switch (element.type) {
            case 'Rectangle':
            case 'rectangle':
            case 'triangle':
            case 'diamond':
            case 'ellipse':
            case 'star':
                if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
                    minimapCtx.fillRect(element.x, element.y, element.width, element.height);
                }
                minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
                break;

            case 'Circle':
            case 'circle':
                minimapCtx.beginPath();
                const radius = Math.min(element.width, element.height) / 2;
                const centerX = element.x + element.width / 2;
                const centerY = element.y + element.height / 2;
                minimapCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
                    minimapCtx.fill();
                }
                minimapCtx.stroke();
                break;

            case 'Line':
                minimapCtx.beginPath();
                minimapCtx.moveTo(element.x, element.y);
                minimapCtx.lineTo(element.x + element.width, element.y + element.height);
                minimapCtx.stroke();
                break;

            case 'Path':
            case 'Drawing':
                // Simplified path rendering for minimap - just show bounding box
                minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
                break;

            case 'StickyNote':
                minimapCtx.fillStyle = element.data?.color || '#ffeb3b';
                minimapCtx.fillRect(element.x, element.y, element.width, element.height);
                minimapCtx.strokeStyle = '#fbc02d';
                minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
                break;

            case 'Text':
                // Simple text representation as a small rectangle
                minimapCtx.fillStyle = '#333333';
                minimapCtx.fillRect(element.x, element.y, Math.max(element.width, 20), Math.max(element.height, 10));
                break;

            case 'Image':
                // Simple image representation as a rectangle
                minimapCtx.fillStyle = '#e0e0e0';
                minimapCtx.fillRect(element.x, element.y, element.width, element.height);
                minimapCtx.strokeStyle = '#bdbdbd';
                minimapCtx.strokeRect(element.x, element.y, element.width, element.height);
                break;
        }

        minimapCtx.restore();
    } catch (error) {
        console.error('Failed to render element to minimap:', error);
    }
}

// Update canvas cursor
export function updateCanvasCursor(cursorStyle) {
    if (!canvas) return;

    try {
        canvas.style.cursor = cursorStyle || 'default';
    } catch (error) {
        console.error('Failed to update canvas cursor:', error);
    }
}

// Update cursor for resize handles
export function updateCursorForResizeHandles(x, y) {
    if (!canvas || !dependencies.getElementAtPoint) return;

    try {
        const element = dependencies.getElementAtPoint(x, y);
        if (element && dependencies.selectedElementId === element.id) {
            // This would need to be implemented based on resize handle logic
            // For now, just set a resize cursor
            canvas.style.cursor = 'nw-resize';
        } else {
            canvas.style.cursor = 'default';
        }
    } catch (error) {
        console.error('Failed to update cursor for resize handles:', error);
    }
}

// Set up image upload functionality
export function setupImageUpload() {
    try {
        const imageInput = document.getElementById('image-upload');
        if (imageInput) {
            imageInput.addEventListener('change', handleImageUpload);
            console.log('Image upload setup complete');
        } else {
            console.warn('Image upload input not found');
        }
    } catch (error) {
        console.error('Failed to setup image upload:', error);
    }
}

// Handle image upload (placeholder - actual implementation would be in element-factory)
function handleImageUpload(event) {
    console.log('Image upload triggered:', event);
    // Implementation would be moved to element-factory module
}

// Draw UI elements (selection handles, etc.)
function drawUIElements() {
    try {
        const selectedElementId = dependencies.getSelectedElementId ? dependencies.getSelectedElementId() : null;
        if (selectedElementId && dependencies.elements && dependencies.drawResizeHandles) {
            const selectedElement = dependencies.elements.get(selectedElementId);
            if (selectedElement) {
                const screenPos = worldToScreen(selectedElement.x, selectedElement.y);
                const selectionRect = {
                    x: screenPos.x,
                    y: screenPos.y,
                    width: selectedElement.width * zoomLevel,
                    height: selectedElement.height * zoomLevel
                };
                dependencies.drawResizeHandles(selectionRect);

                // Draw line endpoint handles if it's a line
                if (selectedElement.type === 'Line' && dependencies.drawLineEndpointHandles) {
                    dependencies.drawLineEndpointHandles(selectedElement);
                }
            }
        }

        // Draw collaborative selections
        if (dependencies.drawCollaborativeSelections) {
            dependencies.drawCollaborativeSelections();
        }
    } catch (error) {
        console.error('Failed to draw UI elements:', error);
    }
}

// Draw cursors
function drawCursors() {
    try {
        if (dependencies.cursors && dependencies.cursors instanceof Map) {
            for (const [connectionId, cursor] of dependencies.cursors) {
                const screenPos = worldToScreen(cursor.x, cursor.y);
                
                ctx.save();
                ctx.fillStyle = cursor.color || '#ff0000';
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw cursor label
                if (cursor.userName) {
                    ctx.fillStyle = '#000000';
                    ctx.font = '12px Arial';
                    ctx.fillText(cursor.userName, screenPos.x + 10, screenPos.y - 5);
                }
                
                ctx.restore();
            }
        }
    } catch (error) {
        console.error('Failed to draw cursors:', error);
    }
}

// Rendering functions for different element types
function renderRectangle(element) {
    ctx.strokeStyle = element.data?.color || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fillRect(element.x, element.y, element.width, element.height);
    }
    ctx.strokeRect(element.x, element.y, element.width, element.height);
}

function renderCircle(element) {
    ctx.strokeStyle = element.data?.color || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    const radius = Math.min(element.width, element.height) / 2;
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    
    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fill();
    }
    ctx.stroke();
}

function renderShapeElement(element) {
    // Handle generic Shape elements by checking their shape type
    const shapeType = element.data?.shapeType || element.data?.type || 'rectangle';
    
    switch (shapeType) {
        case 'rectangle':
            renderRectangle(element);
            break;
        case 'circle':
            renderCircle(element);
            break;
        case 'triangle':
            renderTriangle(element);
            break;
        case 'diamond':
            renderDiamond(element);
            break;
        case 'ellipse':
            renderEllipse(element);
            break;
        case 'star':
            renderStar(element);
            break;
        default:
            // Default to rectangle if unknown
            renderRectangle(element);
    }
}

function renderLine(element) {
    ctx.strokeStyle = element.data?.color || '#000000';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    ctx.moveTo(element.x, element.y);
    ctx.lineTo(element.x + element.width, element.y + element.height);
    ctx.stroke();
}

function renderPath(element) {
    if (!element.data?.path || !Array.isArray(element.data.path)) return;

    ctx.strokeStyle = element.data?.color || '#000000';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    const path = element.data.path;
    
    for (let i = 0; i < path.length; i++) {
        const point = path[i];
        if (i === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    ctx.stroke();
}

function renderStickyNote(element) {
    // Background
    ctx.fillStyle = element.data?.color || '#ffeb3b';
    ctx.fillRect(element.x, element.y, element.width, element.height);

    // Border
    ctx.strokeStyle = '#fbc02d';
    ctx.lineWidth = 1;
    ctx.strokeRect(element.x, element.y, element.width, element.height);

    // Content
    if (element.data?.content && !element.data?.isEditing) {
        ctx.fillStyle = '#333333';
        ctx.font = `${element.data?.fontSize || 14}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const lines = element.data.content.split('\n');
        const lineHeight = (element.data?.fontSize || 14) * 1.2;
        
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], element.x + 10, element.y + 10 + (i * lineHeight));
        }
    }
}

function renderTriangle(element) {
    ctx.strokeStyle = element.data?.strokeColor || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    ctx.moveTo(element.x + element.width / 2, element.y);
    ctx.lineTo(element.x + element.width, element.y + element.height);
    ctx.lineTo(element.x, element.y + element.height);
    ctx.closePath();
    
    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fill();
    }
    ctx.stroke();
}

function renderDiamond(element) {
    ctx.strokeStyle = element.data?.strokeColor || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    ctx.moveTo(element.x + element.width / 2, element.y);
    ctx.lineTo(element.x + element.width, element.y + element.height / 2);
    ctx.lineTo(element.x + element.width / 2, element.y + element.height);
    ctx.lineTo(element.x, element.y + element.height / 2);
    ctx.closePath();
    
    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fill();
    }
    ctx.stroke();
}

function renderEllipse(element) {
    ctx.strokeStyle = element.data?.strokeColor || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    ctx.beginPath();
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const radiusX = element.width / 2;
    const radiusY = element.height / 2;
    
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    
    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fill();
    }
    ctx.stroke();
}

function renderStar(element) {
    ctx.strokeStyle = element.data?.strokeColor || '#000000';
    ctx.fillStyle = element.data?.fillColor || 'transparent';
    ctx.lineWidth = element.data?.strokeWidth || 2;

    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const outerRadius = Math.min(element.width, element.height) / 2;
    const innerRadius = outerRadius * 0.4;
    const points = 5;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    
    if (element.data?.fillColor && element.data.fillColor !== 'transparent') {
        ctx.fill();
    }
    ctx.stroke();
}

function renderText(element) {
    if (element.data?.content && !element.data?.isEditing) {
        ctx.fillStyle = element.data?.color || '#000000';
        ctx.font = `${element.data?.fontSize || 16}px ${element.data?.fontFamily || 'Arial'}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const lines = element.data.content.split('\n');
        const lineHeight = (element.data?.fontSize || 16) * 1.2;
        
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], element.x, element.y + (i * lineHeight));
        }
    }
}

function renderImage(element) {
    if (element.data?.imageData) {
        const img = new Image();
        img.onload = function() {
            ctx.drawImage(img, element.x, element.y, element.width, element.height);
        };
        img.src = element.data.imageData;
    }
}

// Utility functions
export function getCanvas() {
    return canvas;
}

export function getContext() {
    return ctx;
}

export function getTempCanvas() {
    return tempCanvas;
}

export function getTempContext() {
    return tempCtx;
}

export function isCanvasInitialized() {
    return canvas !== null && ctx !== null;
}

// Initialize the module
export function init() {
    console.log('Canvas Manager module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
    window.canvasManager = {
        initializeCanvas,
        resizeCanvas,
        redrawCanvas,
        applyViewportTransform,
        resetCanvasTransform,
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
        setDependencies
    };
}