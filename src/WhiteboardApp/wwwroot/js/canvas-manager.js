// Canvas Manager Module
// Handles core canvas setup, transformations, and rendering operations

// Placeholder imports - replace with actual module paths when available
// import { drawElement, highlightElement, drawCollaborativeSelections } from './drawing-renderer.js';
// import { getWorldBounds, getResizeHandleAt } from './geometry-utils.js';
// import { initializeMinimap, updateMinimap } from './minimap.js';
// import { setupKeyboardHandlers } from './keyboard-handlers.js';
// import { handleCanvasDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, handleCanvasRightClick, handleMouseWheel } from './event-handlers.js';
// import { handleImageUpload } from './image-handler.js';

// Core canvas variables
export let canvas = null;
export let ctx = null;
export let tempCanvas = null;
export let tempCtx = null;

// Viewport state for infinite canvas
export let viewportX = 0;
export let viewportY = 0;
export let zoomLevel = 1;

// External dependencies that need to be injected
let dependencies = {
    elements: null,
    selectedElementId: null,
    drawElement: null,
    highlightElement: null,
    drawCollaborativeSelections: null,
    getWorldBounds: null,
    getResizeHandleAt: null,
    initializeMinimap: null,
    updateMinimap: null,
    setupKeyboardHandlers: null,
    handleCanvasDoubleClick: null,
    handleMouseDown: null,
    handleMouseMove: null,
    handleMouseUp: null,
    handleCanvasRightClick: null,
    handleMouseWheel: null,
    handleImageUpload: null
};

// Dependency injection function
export function setDependencies(deps) {
    dependencies = { ...dependencies, ...deps };
}

// Core canvas setup and initialization
export function initializeCanvas() {
    try {
        canvas = document.getElementById('drawingCanvas');
        if (!canvas) {
            console.error('Canvas element not found');
            return false;
        }

        // Add all mouse event listeners
        if (dependencies.handleCanvasDoubleClick) {
            canvas.addEventListener('dblclick', dependencies.handleCanvasDoubleClick);
        }
        if (dependencies.handleMouseDown) {
            canvas.addEventListener('mousedown', dependencies.handleMouseDown);
        }
        if (dependencies.handleMouseMove) {
            canvas.addEventListener('mousemove', dependencies.handleMouseMove);
        }
        if (dependencies.handleMouseUp) {
            canvas.addEventListener('mouseup', dependencies.handleMouseUp);
            canvas.addEventListener('mouseleave', dependencies.handleMouseUp);
        }
        if (dependencies.handleCanvasRightClick) {
            canvas.addEventListener('contextmenu', dependencies.handleCanvasRightClick);
        }
        if (dependencies.handleMouseWheel) {
            canvas.addEventListener('wheel', dependencies.handleMouseWheel);
        }

        // Setup image upload handling
        setupImageUpload();

        // Setup keyboard event listeners
        if (dependencies.setupKeyboardHandlers) {
            dependencies.setupKeyboardHandlers();
        }

        // Initialize minimap
        if (dependencies.initializeMinimap) {
            dependencies.initializeMinimap();
        }

        // Set up canvas sizing
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Initialize main canvas context
        ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000000';
        }

        // Create temporary canvas for shape preview
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.style.position = 'absolute';
        tempCanvas.style.top = '0';
        tempCanvas.style.left = '0';
        tempCanvas.style.pointerEvents = 'none';
        tempCanvas.style.zIndex = '10';

        canvas.parentNode.appendChild(tempCanvas);
        tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';
        }

        return true;
    } catch (error) {
        console.error('Error initializing canvas:', error);
        return false;
    }
}

// Coordinate transformation functions for infinite canvas
export function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - viewportX) / zoomLevel,
        y: (screenY - viewportY) / zoomLevel
    };
}

export function worldToScreen(worldX, worldY) {
    return {
        x: worldX * zoomLevel + viewportX,
        y: worldY * zoomLevel + viewportY
    };
}

// Apply viewport transformation to canvas context
export function applyViewportTransform() {
    if (!ctx) return;
    ctx.setTransform(zoomLevel, 0, 0, zoomLevel, viewportX, viewportY);
}

// Reset canvas transform
export function resetCanvasTransform() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Resize canvas to match container
export function resizeCanvas() {
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
    try {
        const rect = container.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // Set canvas internal size (actual pixels)
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        
        // Scale the canvas back down using CSS
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        // Scale the context to match device pixel ratio
        if (ctx) {
            ctx.scale(devicePixelRatio, devicePixelRatio);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#000000';
        }
        
        // Update temp canvas too
        if (tempCanvas) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCanvas.style.width = rect.width + 'px';
            tempCanvas.style.height = rect.height + 'px';
            
            if (tempCtx) {
                tempCtx.scale(devicePixelRatio, devicePixelRatio);
                tempCtx.lineCap = 'round';
                tempCtx.lineJoin = 'round';
            }
        }
        
        // Redraw everything
        redrawCanvas();
    } catch (error) {
        console.error('Error resizing canvas:', error);
    }
}

// Main canvas redraw function
export function redrawCanvas() {
    if (!ctx || !canvas) return;
    
    try {
        // Reset transform and clear canvas
        resetCanvasTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Apply viewport transformation
        applyViewportTransform();
        
        // Sort elements by z-index and redraw them
        if (dependencies.elements && dependencies.drawElement) {
            const sortedElements = Array.from(dependencies.elements.entries())
                .sort(([,a], [,b]) => (a.zIndex || 0) - (b.zIndex || 0));
            
            for (const [id, element] of sortedElements) {
                dependencies.drawElement(id, element.x, element.y, element.type, element.data, element.width, element.height);
            }
        }
        
        // Redraw collaborative selections
        if (dependencies.drawCollaborativeSelections) {
            dependencies.drawCollaborativeSelections();
        }
        
        // Redraw current user's selection highlight
        if (dependencies.selectedElementId && dependencies.highlightElement) {
            dependencies.highlightElement(dependencies.selectedElementId);
        }
        
        // Update minimap
        if (dependencies.updateMinimap) {
            dependencies.updateMinimap();
        }
    } catch (error) {
        console.error('Error redrawing canvas:', error);
    }
}

// Clear canvas function
export function clearCanvas() {
    if (!ctx || !canvas) return;
    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (tempCtx && tempCanvas) {
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        }
    } catch (error) {
        console.error('Error clearing canvas:', error);
    }
}

// Render existing element function
export function renderExistingElement(elementData) {
    if (!ctx || !elementData) return;
    
    console.log("Rendering existing element:", elementData);
    
    try {
        // Parse the JSON data if it's a string
        let data = elementData.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        // Store element info for selection
        if (dependencies.elements) {
            dependencies.elements.set(elementData.id, { 
                x: elementData.x, 
                y: elementData.y, 
                width: elementData.width, 
                height: elementData.height, 
                type: elementData.type, 
                data: data,
                zIndex: elementData.zIndex || 0
            });
        }
        
        if (dependencies.drawElement) {
            dependencies.drawElement(elementData.id, elementData.x, elementData.y, elementData.type, data, elementData.width, elementData.height);
        }
    } catch (error) {
        console.error("Error rendering existing element:", error, elementData);
    }
}

// Render element to minimap
export function renderElementToMinimap(element, ctx) {
    if (!element || !element.data || !ctx) return;
    
    try {
        // Skip elements that are outside reasonable bounds for performance
        if (dependencies.getWorldBounds) {
            const bounds = dependencies.getWorldBounds();
            if (element.x > bounds.maxX + 1000 || element.y > bounds.maxY + 1000 || 
                element.x + (element.width || 0) < bounds.minX - 1000 || 
                element.y + (element.height || 0) < bounds.minY - 1000) {
                return;
            }
        }
        
        ctx.save();
        
        switch (element.type) {
            case 'Text':
                if (element.data.content) {
                    ctx.fillStyle = element.data.color || '#000000';
                    ctx.font = `${Math.max(1, (element.data.fontSize || 16) * 0.5)}px ${element.data.fontFamily || 'Arial'}`;
                    ctx.fillText(element.data.content.substring(0, 20), element.x, element.y + (element.data.fontSize || 16));
                }
                break;
                
            case 'Shape':
                ctx.strokeStyle = element.data.strokeColor || '#000000';
                ctx.fillStyle = element.data.fillColor || 'transparent';
                ctx.lineWidth = Math.max(0.5, (element.data.strokeWidth || 2) * 0.5);
                
                ctx.beginPath();
                if (element.data.shapeType === 'circle') {
                    const centerX = element.x + element.width / 2;
                    const centerY = element.y + element.height / 2;
                    const radius = Math.min(element.width, element.height) / 2;
                    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                } else if (element.data.shapeType === 'triangle') {
                    const centerX = element.x + element.width / 2;
                    ctx.moveTo(centerX, element.y);
                    ctx.lineTo(element.x, element.y + element.height);
                    ctx.lineTo(element.x + element.width, element.y + element.height);
                    ctx.closePath();
                } else if (element.data.shapeType === 'diamond') {
                    const centerX = element.x + element.width / 2;
                    const centerY = element.y + element.height / 2;
                    ctx.moveTo(centerX, element.y);
                    ctx.lineTo(element.x + element.width, centerY);
                    ctx.lineTo(centerX, element.y + element.height);
                    ctx.lineTo(element.x, centerY);
                    ctx.closePath();
                } else {
                    // Default rectangle
                    ctx.rect(element.x, element.y, element.width, element.height);
                }
                
                if (element.data.fillColor && element.data.fillColor !== 'transparent') {
                    ctx.fill();
                }
                ctx.stroke();
                break;
                
            case 'Drawing':
                if (element.data.points && element.data.points.length > 0) {
                    ctx.strokeStyle = element.data.color || '#000000';
                    ctx.lineWidth = Math.max(0.5, (element.data.lineWidth || 2) * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(element.data.points[0].x, element.data.points[0].y);
                    for (let i = 1; i < element.data.points.length; i++) {
                        ctx.lineTo(element.data.points[i].x, element.data.points[i].y);
                    }
                    ctx.stroke();
                }
                break;
                
            case 'Sticky':
                // Draw simplified sticky note
                ctx.fillStyle = element.data.color || '#ffff88';
                ctx.fillRect(element.x, element.y, element.width, element.height);
                ctx.strokeStyle = '#cccc00';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(element.x, element.y, element.width, element.height);
                break;
                
            case 'Image':
                // Draw placeholder for images in minimap
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(element.x, element.y, element.width, element.height);
                ctx.strokeStyle = '#999999';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(element.x, element.y, element.width, element.height);
                break;
        }
        
        ctx.restore();
    } catch (error) {
        console.error('Error rendering element to minimap:', error);
    }
}

// Update canvas cursor
export function updateCanvasCursor(cursorStyle) {
    if (canvas) {
        canvas.style.cursor = cursorStyle;
    }
}

// Update cursor for resize handles
export function updateCursorForResizeHandles(x, y) {
    if (!dependencies.selectedElementId || !dependencies.getResizeHandleAt) return;
    
    try {
        const resizeHandle = dependencies.getResizeHandleAt(x, y);
        if (resizeHandle && canvas) {
            canvas.style.cursor = resizeHandle.handle.cursor;
        } else if (canvas) {
            canvas.style.cursor = 'default';
        }
    } catch (error) {
        console.error('Error updating cursor for resize handles:', error);
    }
}

// Setup image upload functionality
export function setupImageUpload() {
    try {
        const imageInput = document.getElementById('imageUpload');
        if (imageInput && dependencies.handleImageUpload) {
            imageInput.addEventListener('change', dependencies.handleImageUpload);
        }
    } catch (error) {
        console.error('Error setting up image upload:', error);
    }
}

// Utility functions for viewport management
export function setViewport(x, y, zoom) {
    viewportX = x;
    viewportY = y;
    zoomLevel = zoom;
    redrawCanvas();
}

export function getViewport() {
    return { x: viewportX, y: viewportY, zoom: zoomLevel };
}

// Canvas validation
export function isCanvasReady() {
    return canvas !== null && ctx !== null;
}

// Export canvas references for external access
export function getCanvasRefs() {
    return { canvas, ctx, tempCanvas, tempCtx };
}

// Initialize module
export function init() {
    try {
        return initializeCanvas();
    } catch (error) {
        console.error('Error initializing canvas manager:', error);
        return false;
    }
}

// Window-level exports for backward compatibility
if (typeof window !== 'undefined') {
    window.initializeCanvas = initializeCanvas;
    window.clearCanvas = clearCanvas;
    window.updateCanvasCursor = updateCanvasCursor;
    window.renderExistingElement = renderExistingElement;
}