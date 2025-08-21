let canvas;
let ctx;
let cursors = new Map();
let signalRConnection;
let tempCanvas;
let tempCtx;
let isDrawingShape = false;
let elements = new Map();
let selectedElementId = null;
let editingElement = null;
let editInput = null;
let currentBoardId = null;
let currentTool = 'select';
let isDrawing = false;
let currentPath = [];
let startX = 0, startY = 0;
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;
let hasMoved = false;
let pendingImagePosition = null;
let isResizing = false;
let activeResizeHandle = null;
let resizeStartBounds = null;
let hasResized = false;
let blazorReference = null;
// Viewport state for infinite canvas
let viewportX = 0;
let viewportY = 0;
let zoomLevel = 1;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
// Minimap state
let minimapCanvas = null;
let minimapCtx = null;
let minimapViewport = null;
let isMinimapDragging = false;
let minimapDragStart = { x: 0, y: 0 };
let minimapHasDragged = false;
// Smooth camera movement
let targetViewportX = 0;
let targetViewportY = 0;
let cameraAnimationId = null;
// Minimap performance optimization
let minimapUpdateQueued = false;
let lastMinimapUpdate = 0;
const minimapUpdateThrottle = 16; // ~60fps
// Undo/Redo system
let undoStack = [];
let redoStack = [];
let maxUndoSteps = 50;
let isUndoRedoOperation = false;
// Copy/Paste system
let copiedElement = null;

window.initializeCanvas = () => {
    canvas = document.getElementById('drawingCanvas');
    if (canvas) {
        // Add all mouse event listeners
        canvas.addEventListener('dblclick', handleCanvasDoubleClick);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        canvas.addEventListener('contextmenu', handleCanvasRightClick);
        canvas.addEventListener('wheel', handleMouseWheel);
        
        // Setup image upload handling
        setupImageUpload();
        
        // Setup keyboard event listeners
        setupKeyboardHandlers();
        
        // Initialize minimap
        initializeMinimap();
        
        // Set up canvas sizing
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        
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
        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';
    }
};

// Coordinate transformation functions for infinite canvas
function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - viewportX) / zoomLevel,
        y: (screenY - viewportY) / zoomLevel
    };
}

function worldToScreen(worldX, worldY) {
    return {
        x: worldX * zoomLevel + viewportX,
        y: worldY * zoomLevel + viewportY
    };
}

// Apply viewport transformation to canvas context
function applyViewportTransform() {
    if (!ctx) return;
    ctx.setTransform(zoomLevel, 0, 0, zoomLevel, viewportX, viewportY);
}

// Reset canvas transform
function resetCanvasTransform() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Resize canvas to match container
function resizeCanvas() {
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
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
}

// Minimap functionality
function initializeMinimap() {
    minimapCanvas = document.getElementById('minimapCanvas');
    minimapViewport = document.querySelector('.minimap-viewport');
    
    if (minimapCanvas) {
        minimapCtx = minimapCanvas.getContext('2d');
        
        // Add mouse event handlers for minimap interaction
        minimapCanvas.addEventListener('mousedown', handleMinimapMouseDown);
        minimapCanvas.addEventListener('mousemove', handleMinimapMouseMove);
        minimapCanvas.addEventListener('mouseup', handleMinimapMouseUp);
        minimapCanvas.addEventListener('mouseleave', handleMinimapMouseUp);
        minimapCanvas.addEventListener('click', handleMinimapClick);
        
        // Initial minimap render
        updateMinimapImmediate();
        
        // Initialize zoom level display
        updateZoomLevelDisplay();
    }
}

function handleMinimapMouseDown(event) {
    event.preventDefault();
    isMinimapDragging = true;
    minimapHasDragged = false;
    
    const rect = minimapCanvas.getBoundingClientRect();
    minimapDragStart.x = event.clientX - rect.left;
    minimapDragStart.y = event.clientY - rect.top;
    
    minimapCanvas.style.cursor = 'grabbing';
}

function handleMinimapMouseMove(event) {
    if (!isMinimapDragging) return;
    
    event.preventDefault();
    
    const rect = minimapCanvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    
    const deltaX = currentX - minimapDragStart.x;
    const deltaY = currentY - minimapDragStart.y;
    
    // Calculate world bounds
    const bounds = getWorldBounds();
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    
    // Convert minimap pixel movement to world coordinate movement
    const worldDeltaX = (deltaX / minimapCanvas.clientWidth) * worldWidth;
    const worldDeltaY = (deltaY / minimapCanvas.clientHeight) * worldHeight;
    
    // Mark as dragged if there's significant movement
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        minimapHasDragged = true;
    }
    
    // Update viewport position immediately for dragging (responsive feel)
    viewportX -= worldDeltaX * zoomLevel;
    viewportY -= worldDeltaY * zoomLevel;
    
    // Update drag start for next movement
    minimapDragStart.x = currentX;
    minimapDragStart.y = currentY;
    
    redrawCanvas();
    updateMinimapThrottled();
}

function handleMinimapMouseUp(event) {
    if (isMinimapDragging) {
        isMinimapDragging = false;
        minimapCanvas.style.cursor = 'grab';
    }
}

function handleMinimapClick(event) {
    // Don't trigger click if we were dragging
    if (minimapHasDragged) return;
    
    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left) / rect.width;
    const clickY = (event.clientY - rect.top) / rect.height;
    
    // Calculate world bounds
    const bounds = getWorldBounds();
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    
    // Calculate new viewport position
    const newWorldX = bounds.minX + clickX * worldWidth;
    const newWorldY = bounds.minY + clickY * worldHeight;
    
    // Set target positions for smooth animation
    targetViewportX = canvas.width / 2 - newWorldX * zoomLevel;
    targetViewportY = canvas.height / 2 - newWorldY * zoomLevel;
    
    animateToTargetViewport();
}

function animateToTargetViewport() {
    if (cameraAnimationId) {
        cancelAnimationFrame(cameraAnimationId);
    }
    
    const animationSpeed = 0.15; // Higher = faster animation
    const threshold = 1; // Stop animation when close enough
    
    function animate() {
        const deltaX = targetViewportX - viewportX;
        const deltaY = targetViewportY - viewportY;
        
        if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
            // Animation complete
            viewportX = targetViewportX;
            viewportY = targetViewportY;
            redrawCanvas();
            updateMinimapImmediate();
            cameraAnimationId = null;
            return;
        }
        
        // Smooth interpolation
        viewportX += deltaX * animationSpeed;
        viewportY += deltaY * animationSpeed;
        
        redrawCanvas();
        updateMinimapImmediate();
        
        cameraAnimationId = requestAnimationFrame(animate);
    }
    
    animate();
}

function getWorldBounds() {
    let minX = -canvas.width / (2 * zoomLevel);
    let minY = -canvas.height / (2 * zoomLevel);
    let maxX = canvas.width / (2 * zoomLevel);
    let maxY = canvas.height / (2 * zoomLevel);
    
    // Expand bounds to include all elements
    for (const [id, element] of elements.entries()) {
        minX = Math.min(minX, element.x);
        minY = Math.min(minY, element.y);
        maxX = Math.max(maxX, element.x + (element.width || 0));
        maxY = Math.max(maxY, element.y + (element.height || 0));
    }
    
    // Add padding
    const padding = 100;
    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
    };
}

function updateMinimapThrottled() {
    if (minimapUpdateQueued) return;
    
    const now = Date.now();
    if (now - lastMinimapUpdate < minimapUpdateThrottle) {
        minimapUpdateQueued = true;
        setTimeout(() => {
            minimapUpdateQueued = false;
            updateMinimapActual();
        }, minimapUpdateThrottle - (now - lastMinimapUpdate));
        return;
    }
    
    updateMinimapActual();
}

function updateMinimapActual() {
    if (!minimapCtx || !minimapCanvas || !minimapViewport) return;
    
    lastMinimapUpdate = Date.now();
    
    const bounds = getWorldBounds();
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    
    // Clear minimap
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    // Draw white background
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    // Calculate scale to fit world in minimap
    const scaleX = minimapCanvas.width / worldWidth;
    const scaleY = minimapCanvas.height / worldHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Draw actual elements
    minimapCtx.save();
    minimapCtx.scale(scale, scale);
    minimapCtx.translate(-bounds.minX, -bounds.minY);
    
    // Sort elements by z-index and render them
    const sortedElements = Array.from(elements.entries())
        .sort(([,a], [,b]) => (a.zIndex || 0) - (b.zIndex || 0));
    
    for (const [id, element] of sortedElements) {
        renderElementToMinimap(element, minimapCtx);
    }
    
    minimapCtx.restore();
    
    // Update viewport indicator
    const viewportWorldBounds = {
        x: (-viewportX) / zoomLevel,
        y: (-viewportY) / zoomLevel,
        width: canvas.width / zoomLevel,
        height: canvas.height / zoomLevel
    };
    
    const viewportX_minimap = ((viewportWorldBounds.x - bounds.minX) / worldWidth) * minimapCanvas.clientWidth;
    const viewportY_minimap = ((viewportWorldBounds.y - bounds.minY) / worldHeight) * minimapCanvas.clientHeight;
    const viewportWidth_minimap = (viewportWorldBounds.width / worldWidth) * minimapCanvas.clientWidth;
    const viewportHeight_minimap = (viewportWorldBounds.height / worldHeight) * minimapCanvas.clientHeight;
    
    minimapViewport.style.left = viewportX_minimap + 'px';
    minimapViewport.style.top = viewportY_minimap + 'px';
    minimapViewport.style.width = viewportWidth_minimap + 'px';
    minimapViewport.style.height = viewportHeight_minimap + 'px';
    
    // Update zoom level display
    updateZoomLevelDisplay();
}

// Public interface - use throttled version by default
window.updateMinimap = updateMinimapThrottled;

// Immediate version for when throttling is not desired
window.updateMinimapImmediate = updateMinimapActual;

// Update zoom level display
function updateZoomLevelDisplay() {
    let zoomDisplay = document.getElementById('zoomLevelDisplay');
    if (!zoomDisplay) {
        // Create zoom level display if it doesn't exist
        const minimapContainer = document.querySelector('.minimap-container');
        if (minimapContainer) {
            zoomDisplay = document.createElement('div');
            zoomDisplay.id = 'zoomLevelDisplay';
            zoomDisplay.className = 'zoom-level-display';
            minimapContainer.appendChild(zoomDisplay);
        }
    }
    
    if (zoomDisplay) {
        const zoomPercentage = Math.round(zoomLevel * 100);
        zoomDisplay.textContent = `${zoomPercentage}%`;
    }
}

function renderElementToMinimap(element, ctx) {
    if (!element || !element.data) return;
    
    // Skip elements that are outside reasonable bounds for performance
    const bounds = getWorldBounds();
    if (element.x > bounds.maxX + 1000 || element.y > bounds.maxY + 1000 || 
        element.x + (element.width || 0) < bounds.minX - 1000 || 
        element.y + (element.height || 0) < bounds.minY - 1000) {
        return;
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
            
            if (element.data.shapeType === 'circle') {
                const centerX = element.x + element.width / 2;
                const centerY = element.y + element.height / 2;
                const radius = Math.min(element.width, element.height) / 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                if (element.data.fillColor && element.data.fillColor !== 'transparent') {
                    ctx.fill();
                }
                ctx.stroke();
            } else {
                // Rectangle
                if (element.data.fillColor && element.data.fillColor !== 'transparent') {
                    ctx.fillRect(element.x, element.y, element.width, element.height);
                }
                ctx.strokeRect(element.x, element.y, element.width, element.height);
            }
            break;
            
        case 'StickyNote':
            ctx.fillStyle = element.data.color || '#ffff88';
            ctx.fillRect(element.x, element.y, element.width, element.height);
            ctx.strokeStyle = '#cccc00';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(element.x, element.y, element.width, element.height);
            
            if (element.data.content) {
                ctx.fillStyle = '#000000';
                ctx.font = `${Math.max(1, (element.data.fontSize || 14) * 0.4)}px Arial`;
                const lines = element.data.content.split('\n');
                for (let i = 0; i < Math.min(3, lines.length); i++) {
                    ctx.fillText(lines[i].substring(0, 15), element.x + 2, element.y + 8 + i * 6);
                }
            }
            break;
            
        case 'Image':
            // Draw a simple image placeholder
            ctx.fillStyle = '#e0e0e0';
            ctx.fillRect(element.x, element.y, element.width, element.height);
            ctx.strokeStyle = '#999999';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(element.x, element.y, element.width, element.height);
            
            // Draw a simple image icon
            ctx.fillStyle = '#666666';
            const iconSize = Math.min(element.width, element.height) * 0.3;
            const iconX = element.x + (element.width - iconSize) / 2;
            const iconY = element.y + (element.height - iconSize) / 2;
            ctx.fillRect(iconX, iconY, iconSize, iconSize);
            break;
            
        case 'Drawing':
            if (element.data.paths) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 0.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                for (const path of element.data.paths) {
                    if (path.points && path.points.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(path.points[0].x, path.points[0].y);
                        for (let i = 1; i < path.points.length; i++) {
                            ctx.lineTo(path.points[i].x, path.points[i].y);
                        }
                        ctx.stroke();
                    }
                }
            }
            break;
            
        default:
            // Fallback: draw a simple rectangle
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(element.x, element.y, element.width || 10, element.height || 10);
            break;
    }
    
    ctx.restore();
}

// Undo/Redo system
function saveCanvasState(action = 'unknown') {
    if (isUndoRedoOperation) return; // Don't save state during undo/redo
    
    const state = {
        elements: new Map(elements),
        action: action,
        timestamp: Date.now()
    };
    
    undoStack.push(state);
    
    // Limit undo stack size
    if (undoStack.length > maxUndoSteps) {
        undoStack.shift();
    }
    
    // Clear redo stack when new action is performed
    redoStack = [];
    
    console.log(`Canvas state saved: ${action} (undo stack: ${undoStack.length})`);
}

function undo() {
    if (undoStack.length === 0) {
        console.log('Nothing to undo');
        return;
    }
    
    console.log('Performing undo...');
    isUndoRedoOperation = true;
    
    // Save current state to redo stack
    const currentState = {
        elements: new Map(elements),
        action: 'redo_point',
        timestamp: Date.now()
    };
    redoStack.push(currentState);
    
    // Restore previous state
    const previousState = undoStack.pop();
    elements = new Map(previousState.elements);
    
    // Clear selection
    selectedElementId = null;
    
    // Redraw canvas
    redrawCanvas();
    
    isUndoRedoOperation = false;
    console.log(`Undid: ${previousState.action} (undo stack: ${undoStack.length}, redo stack: ${redoStack.length})`);
}

function redo() {
    if (redoStack.length === 0) {
        console.log('Nothing to redo');
        return;
    }
    
    console.log('Performing redo...');
    isUndoRedoOperation = true;
    
    // Save current state to undo stack
    const currentState = {
        elements: new Map(elements),
        action: 'undo_point',
        timestamp: Date.now()
    };
    undoStack.push(currentState);
    
    // Restore redo state
    const redoState = redoStack.pop();
    elements = new Map(redoState.elements);
    
    // Clear selection
    selectedElementId = null;
    
    // Redraw canvas
    redrawCanvas();
    
    isUndoRedoOperation = false;
    console.log(`Redid action (undo stack: ${undoStack.length}, redo stack: ${redoStack.length})`);
}

window.undo = undo;
window.redo = redo;

// Copy/Paste system
function copySelectedElement() {
    if (!selectedElementId) {
        console.log('No element selected to copy');
        return;
    }
    
    const element = elements.get(selectedElementId);
    if (element) {
        // Create a deep copy of the element
        copiedElement = {
            type: element.type,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            data: JSON.parse(JSON.stringify(element.data)), // Deep copy
            zIndex: element.zIndex
        };
        console.log('Element copied:', copiedElement);
        showNotification('Element copied');
    }
}

async function pasteElement() {
    try {
        // First try to read from system clipboard
        const clipboardItems = await navigator.clipboard.read();
        
        for (const clipboardItem of clipboardItems) {
            // Check for images
            for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                    console.log('Image found in clipboard');
                    const blob = await clipboardItem.getType(type);
                    await pasteImageFromClipboard(blob);
                    return;
                }
            }
            
            // Check for text
            if (clipboardItem.types.includes('text/plain')) {
                console.log('Text found in clipboard');
                const blob = await clipboardItem.getType('text/plain');
                const text = await blob.text();
                if (text.trim()) {
                    pasteTextFromClipboard(text.trim());
                    return;
                }
            }
        }
        
        // If no external content, paste copied element
        if (copiedElement) {
            pasteCopiedElement();
        } else {
            console.log('Nothing to paste');
        }
        
    } catch (error) {
        console.log('Clipboard access failed, trying fallback methods:', error);
        
        // Fallback: try text-only clipboard access
        try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) {
                pasteTextFromClipboard(text.trim());
                return;
            }
        } catch (textError) {
            console.log('Text clipboard access also failed:', textError);
        }
        
        // Final fallback: paste copied element if available
        if (copiedElement) {
            pasteCopiedElement();
        } else {
            console.log('No clipboard access and nothing copied');
        }
    }
}

function pasteCopiedElement() {
    if (!copiedElement) return;
    
    saveCanvasState('paste element');
    
    // Calculate paste position (offset from original)
    const offsetX = 20;
    const offsetY = 20;
    const newX = copiedElement.x + offsetX;
    const newY = copiedElement.y + offsetY;
    
    // Create the pasted element
    sendElement(currentBoardId, {
        type: copiedElement.type,
        x: newX,
        y: newY,
        width: copiedElement.width,
        height: copiedElement.height,
        data: copiedElement.data
    });
    
    console.log('Element pasted at:', newX, newY);
    showNotification('Element pasted');
}

function pasteTextFromClipboard(text) {
    saveCanvasState('paste text');
    
    // Calculate paste position (center of current viewport)
    const centerX = (-viewportX + canvas.width / 2) / zoomLevel;
    const centerY = (-viewportY + canvas.height / 2) / zoomLevel;
    
    const textData = {
        content: text,
        fontSize: 16,
        fontFamily: 'Arial',
        color: '#000000',
        bold: false,
        italic: false,
        isEditing: false
    };
    
    sendElement(currentBoardId, {
        type: 'Text',
        x: centerX,
        y: centerY,
        width: 0,
        height: 0,
        data: textData
    });
    
    console.log('Text pasted:', text);
    showNotification('Text pasted');
}

async function pasteImageFromClipboard(blob) {
    try {
        saveCanvasState('paste image');
        
        // Convert blob to File object
        const file = new File([blob], 'pasted-image.png', { type: blob.type });
        
        // Upload the image using existing image upload functionality
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/image/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Calculate paste position (center of current viewport)
            const centerX = (-viewportX + canvas.width / 2) / zoomLevel;
            const centerY = (-viewportY + canvas.height / 2) / zoomLevel;
            
            const imageData = {
                fileName: result.fileName,
                filePath: result.filePath,
                width: result.width,
                height: result.height,
                aspectRatio: result.width / result.height
            };
            
            // Calculate display size (max 300px while maintaining aspect ratio)
            const maxSize = 300;
            let displayWidth = result.width;
            let displayHeight = result.height;
            
            if (displayWidth > maxSize || displayHeight > maxSize) {
                if (displayWidth > displayHeight) {
                    displayHeight = (displayHeight * maxSize) / displayWidth;
                    displayWidth = maxSize;
                } else {
                    displayWidth = (displayWidth * maxSize) / displayHeight;
                    displayHeight = maxSize;
                }
            }
            
            sendElement(currentBoardId, {
                type: 'Image',
                x: centerX - displayWidth / 2,
                y: centerY - displayHeight / 2,
                width: displayWidth,
                height: displayHeight,
                data: imageData
            });
            
            console.log('Image pasted successfully');
            showNotification('Image pasted');
        } else {
            console.error('Failed to upload pasted image');
        }
    } catch (error) {
        console.error('Error pasting image:', error);
    }
}

// Notification system
function showNotification(message) {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.copy-paste-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'copy-paste-notification';
    notification.textContent = message;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto-remove after 2 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 2000);
}

window.startNewPath = (x, y) => {
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
};

window.drawLine = (x, y) => {
    if (!ctx) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
};

window.clearCanvas = () => {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (tempCtx && tempCanvas) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
};

window.updateCanvasCursor = (cursorStyle) => {
    if (canvas) {
        canvas.style.cursor = cursorStyle;
    }
};

window.promptForText = (message) => {
    return prompt(message) || '';
};

window.startShape = (shapeType, x, y) => {
    isDrawingShape = true;
    window.shapeStartX = x;
    window.shapeStartY = y;
    window.currentShapeType = shapeType;
};

window.updateShape = (shapeType, startX, startY, currentX, currentY) => {
    if (!tempCtx || !isDrawingShape) return;
    
    // Clear temporary canvas
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Apply viewport transformation to temp canvas
    tempCtx.setTransform(zoomLevel, 0, 0, zoomLevel, viewportX, viewportY);
    
    // Set style
    tempCtx.strokeStyle = '#000000';
    tempCtx.lineWidth = 2;
    tempCtx.fillStyle = 'transparent';
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    tempCtx.beginPath();
    
    if (shapeType === 'rectangle') {
        tempCtx.rect(startX, startY, width, height);
    } else if (shapeType === 'circle') {
        const radius = Math.sqrt(width * width + height * height) / 2;
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        tempCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    }
    
    tempCtx.stroke();
    
    // Reset transform after drawing
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
};

window.finishShape = () => {
    isDrawingShape = false;
    if (tempCtx) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
};

window.drawElement = (id, x, y, type, data, width, height) => {
    if (!ctx || !data) return;
    
    console.log("Drawing element:", { id, x, y, type, data, width, height });
    
    // Only store if element doesn't exist (for backwards compatibility)
    if (!elements.has(id)) {
        elements.set(id, { x, y, width, height, type, data, zIndex: 0 });
    }
    
    switch (type) {
        case "Drawing":
            if (data.paths) {
                data.paths.forEach(path => {
                    if (path.points && path.points.length > 0) {
                        ctx.beginPath();
                        ctx.strokeStyle = path.strokeColor || '#000000';
                        ctx.lineWidth = path.strokeWidth || 2;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        
                        ctx.moveTo(path.points[0].x, path.points[0].y);
                        for (let i = 1; i < path.points.length; i++) {
                            ctx.lineTo(path.points[i].x, path.points[i].y);
                        }
                        ctx.stroke();
                    }
                });
            }
            break;
            
        case "Text":
            ctx.save();
            
            // Draw background for visibility (especially when empty)
            ctx.fillStyle = data.isEditing ? '#f0f8ff' : 'rgba(255, 255, 255, 0.8)';
            ctx.strokeStyle = data.isEditing ? '#007bff' : '#cccccc';
            ctx.lineWidth = 1;
            ctx.fillRect(x, y, width || 200, height || 30);
            ctx.strokeRect(x, y, width || 200, height || 30);
            
            // Don't draw text if currently editing
            if (!data.isEditing && data.content) {
                ctx.fillStyle = data.color || '#000000';
                ctx.font = `${data.bold ? 'bold ' : ''}${data.italic ? 'italic ' : ''}${data.fontSize || 16}px ${data.fontFamily || 'Arial'}`;
                // Better text positioning within the box
                const textY = y + (height || 30) / 2 + (data.fontSize || 16) / 3;
                ctx.fillText(data.content, x + 5, textY);
            }
            
            ctx.restore();
            break;
            
        case "Shape":
            ctx.save();
            ctx.strokeStyle = data.strokeColor || '#000000';
            ctx.lineWidth = data.strokeWidth || 2;
            if (data.fillColor && data.fillColor !== 'transparent') {
                ctx.fillStyle = data.fillColor;
            }
            
            ctx.beginPath();
            if (data.shapeType === 'rectangle') {
                ctx.rect(x, y, width || 100, height || 100);
            } else if (data.shapeType === 'circle') {
                const radius = Math.max(width || 100, height || 100) / 2;
                const centerX = x + (width || 100) / 2;
                const centerY = y + (height || 100) / 2;
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            }
            
            if (data.fillColor && data.fillColor !== 'transparent') {
                ctx.fill();
            }
            ctx.stroke();
            ctx.restore();
            break;
            
        case "StickyNote":
            ctx.save();
            // Draw sticky note background
            ctx.fillStyle = data.color || '#ffff88';
            ctx.fillRect(x, y, width || 200, height || 150);
            
            // Draw border
            ctx.strokeStyle = '#cccc00';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, width || 200, height || 150);
            
            // Don't draw text if currently editing
            if (!data.isEditing) {
                // Draw text
                ctx.fillStyle = '#000000';
                ctx.font = `${data.fontSize || 14}px Arial`;
                
                // Word wrap text
                const words = (data.content || '').split(' ');
                const lineHeight = (data.fontSize || 14) * 1.2;
                const maxWidth = (width || 200) - 20;
                let line = '';
                let yPos = y + 25;
                
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    
                    if (testWidth > maxWidth && n > 0) {
                        ctx.fillText(line, x + 10, yPos);
                        line = words[n] + ' ';
                        yPos += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, x + 10, yPos);
            }
            ctx.restore();
            break;
            
        case "Image":
            if (data.src) {
                const img = new Image();
                img.onload = function() {
                    ctx.save();
                    ctx.drawImage(img, x, y, width || data.originalWidth || img.width, height || data.originalHeight || img.height);
                    ctx.restore();
                };
                img.src = data.src;
            }
            break;
    }
};

window.renderExistingElement = (elementData) => {
    if (!ctx || !elementData) return;
    
    console.log("Rendering existing element:", elementData);
    
    try {
        // Parse the JSON data if it's a string
        let data = elementData.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        // Store element info for selection
        elements.set(elementData.id, { 
            x: elementData.x, 
            y: elementData.y, 
            width: elementData.width, 
            height: elementData.height, 
            type: elementData.type, 
            data: data,
            zIndex: elementData.zIndex || 0
        });
        
        drawElement(elementData.id, elementData.x, elementData.y, elementData.type, data, elementData.width, elementData.height);
    } catch (error) {
        console.error("Error rendering existing element:", error, elementData);
    }
};

window.updateCursor = (connectionId, x, y) => {
    let cursor = cursors.get(connectionId);
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.style.backgroundColor = `hsl(${Math.abs(connectionId.hashCode()) % 360}, 70%, 50%)`;
        document.body.appendChild(cursor);
        cursors.set(connectionId, cursor);
    }
    
    const canvasRect = canvas?.getBoundingClientRect();
    if (canvasRect) {
        cursor.style.left = (canvasRect.left + x) + 'px';
        cursor.style.top = (canvasRect.top + y) + 'px';
    }
};

// Hash function for connection ID colors
String.prototype.hashCode = function() {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
};

// Initialize SignalR connection
window.initializeSignalR = async (boardId) => {
    try {
        currentBoardId = boardId; // Store boardId globally
        signalRConnection = new signalR.HubConnectionBuilder()
            .withUrl("/collaborationhub")
            .withAutomaticReconnect()
            .build();

        signalRConnection.on("ElementAdded", (elementData) => {
            // Check if this element has a tempId that belongs to this client
            if (elementData.tempId && elements.has(elementData.tempId)) {
                // This is our own temp element being confirmed by the server
                const tempElement = elements.get(elementData.tempId);
                
                // Update the temporary element with server data
                tempElement.zIndex = elementData.zIndex || 0;
                
                // If currently editing this temp element, update references
                if (editingElement === elementData.tempId) {
                    editingElement = elementData.id;
                }
                
                // If this temp element is selected, update selection reference
                if (selectedElementId === elementData.tempId) {
                    selectedElementId = elementData.id;
                }
                
                // Check if there are pending updates to send
                const hasPendingUpdate = tempElement.data.pendingUpdate;
                if (hasPendingUpdate) {
                    tempElement.data.pendingUpdate = false;
                    
                    // Send the update with the real server ID
                    setTimeout(() => {
                        if (tempElement.type === 'Text') {
                            updateTextElementContent(elementData.id, tempElement.data.content);
                        } else if (tempElement.type === 'StickyNote') {
                            updateStickyNoteContent(elementData.id, tempElement.data.content);
                        }
                    }, 100); // Small delay to ensure server has processed the element creation
                }
                
                // Move element from temp ID to server ID
                elements.delete(elementData.tempId);
                elements.set(elementData.id, tempElement);
            } else {
                // This is a new element from another client OR an element without tempId
                // Add it regardless of whether it has a tempId (from other clients)
                elements.set(elementData.id, {
                    x: elementData.x,
                    y: elementData.y,
                    width: elementData.width,
                    height: elementData.height,
                    type: elementData.type,
                    data: elementData.data,
                    zIndex: elementData.zIndex || 0
                });
            }
            
            // Redraw entire canvas to maintain proper z-order
            redrawCanvas();
        });

        signalRConnection.on("CursorUpdated", (connectionId, x, y) => {
            updateCursor(connectionId, x, y);
        });

        signalRConnection.on("BoardCleared", () => {
            clearCanvas();
            elements.clear();
        });
        
        signalRConnection.on("ElementMoved", (elementId, newX, newY) => {
            updateElementPosition(elementId, newX, newY);
        });
        
        signalRConnection.on("StickyNoteUpdated", (elementId, updatedData) => {
            const element = elements.get(elementId);
            if (element) {
                element.data = updatedData;
                redrawCanvas();
            }
        });
        
        signalRConnection.on("TextElementUpdated", (elementId, updatedData) => {
            const element = elements.get(elementId);
            if (element) {
                element.data = updatedData;
                redrawCanvas();
            }
        });
        
        signalRConnection.on("ElementSelected", (elementId, userName, connectionId) => {
            // Show element selection by other users
            showElementSelection(elementId, userName, connectionId);
        });
        
        signalRConnection.on("ElementDeselected", (elementId, connectionId) => {
            // Hide element selection
            hideElementSelection(elementId, connectionId);
        });
        
        signalRConnection.on("ElementZIndexUpdated", (elementId, newZIndex) => {
            console.log('ElementZIndexUpdated received:', elementId, newZIndex);
            console.log('Current elements map:', Array.from(elements.entries()).map(([id, el]) => ({id, zIndex: el.zIndex})));
            const element = elements.get(elementId);
            if (element) {
                console.log('Updating element zIndex from', element.zIndex, 'to', newZIndex);
                element.zIndex = newZIndex;
                console.log('After update, element zIndex is:', element.zIndex);
                redrawCanvas();
                console.log('Canvas redrawn, elements now:', Array.from(elements.entries()).map(([id, el]) => ({id, zIndex: el.zIndex})));
            } else {
                console.log('Element not found in local map:', elementId);
                console.log('Available elements:', Array.from(elements.keys()));
            }
        });

        signalRConnection.on("ElementDeleted", (elementId) => {
            console.log('ElementDeleted received:', elementId);
            // Remove element from local map
            elements.delete(elementId);
            
            // Clear selection if deleted element was selected
            if (selectedElementId === elementId) {
                selectedElementId = null;
            }
            
            // Hide context menu
            hideContextMenu();
            
            // Redraw canvas
            redrawCanvas();
        });

        signalRConnection.on("ElementResized", (elementId, x, y, width, height) => {
            console.log('ElementResized received:', elementId, x, y, width, height);
            const element = elements.get(elementId);
            if (element) {
                element.x = x;
                element.y = y;
                element.width = width;
                element.height = height;
                redrawCanvas();
            }
        });

        signalRConnection.on("ElementStyleUpdated", (elementId, newStyleData) => {
            console.log('ElementStyleUpdated received:', elementId, newStyleData);
            const element = elements.get(elementId);
            if (element) {
                // Update element style data
                element.data = { ...element.data, ...newStyleData };
                
                // For drawings, update all paths with new style
                if (element.type === 'Drawing' && element.data.paths) {
                    for (const path of element.data.paths) {
                        if (newStyleData.strokeColor) {
                            path.strokeColor = newStyleData.strokeColor;
                        }
                        if (newStyleData.strokeWidth) {
                            path.strokeWidth = newStyleData.strokeWidth;
                        }
                    }
                }
                
                redrawCanvas();
            }
        });

        await signalRConnection.start();
        await signalRConnection.invoke("JoinBoard", boardId, "Anonymous");
        
        console.log("SignalR connected successfully");
        return "Connected";
    } catch (error) {
        console.log("SignalR connection failed:", error.message);
        return "Local Mode";
    }
};

window.sendDrawingPath = async (boardId, pathData) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("AddDrawingPath", boardId, pathData);
        } catch (error) {
            console.log("Failed to send drawing path:", error);
        }
    }
};

window.sendCursorUpdate = async (boardId, x, y) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("UpdateCursor", boardId, x, y);
        } catch (error) {
            // Ignore cursor update errors
        }
    }
};

window.sendBoardCleared = async (boardId) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("ClearBoard", boardId);
        } catch (error) {
            console.log("Failed to send board clear:", error);
        }
    }
};

window.sendElement = async (boardId, elementData, tempId = null) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            // Include tempId in the data sent to server for correlation if provided
            const elementDataWithTemp = tempId ? { ...elementData, tempId: tempId } : elementData;
            await signalRConnection.invoke("AddElement", boardId, elementDataWithTemp);
        } catch (error) {
            console.log("Failed to send element:", error);
        }
    }
};

// Element selection and movement functions
window.getElementAtPoint = (x, y) => {
    console.log('getElementAtPoint called with:', x, y);
    console.log('Available elements:', elements.size);
    
    // Check elements in z-index order (highest z-index first, top to bottom visually)
    const sortedElements = Array.from(elements.entries())
        .sort(([,a], [,b]) => (b.zIndex || 0) - (a.zIndex || 0));
    
    for (const [id, element] of sortedElements) {
        if (!element) continue;
        
        console.log('Checking element:', id, element.type, element.x, element.y, element.width, element.height, 'zIndex:', element.zIndex || 0);
        
        // Special case for text elements (use text metrics) - check this first
        if (element.type === 'Text' && element.data && element.data.content) {
            ctx.save();
            ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
            const textMetrics = ctx.measureText(element.data.content);
            const textWidth = textMetrics.width;
            const textHeight = element.data.fontSize || 16;
            
            // Text is rendered at y + fontSize, so the clickable area should be there too
            const textY = element.y + textHeight;
            console.log('Text element check:', {
                content: element.data.content,
                textWidth, textHeight, textY,
                clickX: x, clickY: y,
                elementX: element.x, elementY: element.y,
                xInRange: x >= element.x && x <= element.x + textWidth,
                yInRange: y >= element.y && y <= textY
            });
            
            if (x >= element.x && x <= element.x + textWidth &&
                y >= element.y && y <= textY) {
                console.log('Text element HIT!', id);
                ctx.restore();
                return id;
            }
            ctx.restore();
        }
        
        // Special case for Drawing elements (use path data for bounds)
        if (element.type === 'Drawing' && element.data && element.data.paths) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            // Calculate bounds from all paths
            for (const path of element.data.paths) {
                if (path.points && path.points.length > 0) {
                    for (const point of path.points) {
                        minX = Math.min(minX, point.x);
                        minY = Math.min(minY, point.y);
                        maxX = Math.max(maxX, point.x);
                        maxY = Math.max(maxY, point.y);
                    }
                }
            }
            
            // Add some tolerance for drawing stroke width
            const tolerance = 10;
            if (x >= minX - tolerance && x <= maxX + tolerance &&
                y >= minY - tolerance && y <= maxY + tolerance) {
                console.log('Drawing element HIT!', id);
                return id;
            }
        }
        
        // Check if point is within element bounds (for other element types)
        if (x >= element.x && x <= element.x + (element.width || 0) &&
            y >= element.y && y <= element.y + (element.height || 0)) {
            return id;
        }
    }
    
    return null;
};

window.getElementInfo = (id) => {
    return elements.get(id) || null;
};

window.highlightElement = (id) => {
    const element = elements.get(id);
    if (!element || !ctx) return;
    
    selectedElementId = id;
    
    // Draw selection border
    ctx.save();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    const padding = 5;
    let width = element.width || 0;
    let height = element.height || 0;
    
    // Special handling for text elements
    if (element.type === 'Text' && element.data && element.data.content) {
        ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
        const textMetrics = ctx.measureText(element.data.content);
        width = textMetrics.width;
        height = element.data.fontSize || 16;
    }
    
    // Draw selection rectangle
    const selectionRect = {
        x: element.x - padding,
        y: element.y - padding,
        width: width + (2 * padding),
        height: height + (2 * padding)
    };
    
    ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
    
    // Draw resize handles (only for resizable elements)
    if (isElementResizable(element)) {
        drawResizeHandles(selectionRect);
    }
    
    ctx.restore();
};

window.clearSelection = () => {
    selectedElementId = null;
    redrawCanvas();
};

// Check if element is resizable
function isElementResizable(element) {
    // Text elements and drawing paths are not resizable
    return element.type !== 'Text' && element.type !== 'Drawing';
}

// Draw resize handles around the selection rectangle
function drawResizeHandles(selectionRect) {
    const handleSize = 8;
    const handleOffset = handleSize / 2;
    
    ctx.save();
    ctx.fillStyle = '#007bff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    
    // Calculate handle positions
    const handles = [
        // Top-left
        { x: selectionRect.x - handleOffset, y: selectionRect.y - handleOffset, cursor: 'nw-resize' },
        // Top-center
        { x: selectionRect.x + selectionRect.width/2 - handleOffset, y: selectionRect.y - handleOffset, cursor: 'n-resize' },
        // Top-right
        { x: selectionRect.x + selectionRect.width - handleOffset, y: selectionRect.y - handleOffset, cursor: 'ne-resize' },
        // Middle-left
        { x: selectionRect.x - handleOffset, y: selectionRect.y + selectionRect.height/2 - handleOffset, cursor: 'w-resize' },
        // Middle-right
        { x: selectionRect.x + selectionRect.width - handleOffset, y: selectionRect.y + selectionRect.height/2 - handleOffset, cursor: 'e-resize' },
        // Bottom-left
        { x: selectionRect.x - handleOffset, y: selectionRect.y + selectionRect.height - handleOffset, cursor: 'sw-resize' },
        // Bottom-center
        { x: selectionRect.x + selectionRect.width/2 - handleOffset, y: selectionRect.y + selectionRect.height - handleOffset, cursor: 's-resize' },
        // Bottom-right
        { x: selectionRect.x + selectionRect.width - handleOffset, y: selectionRect.y + selectionRect.height - handleOffset, cursor: 'se-resize' }
    ];
    
    // Draw each handle
    handles.forEach(handle => {
        ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
        ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
    });
    
    ctx.restore();
    
    // Store handles for hit testing
    window.resizeHandles = handles;
}

// Check if point is on a resize handle
function getResizeHandleAt(x, y) {
    if (!window.resizeHandles || !selectedElementId) return null;
    
    const handleSize = 8;
    for (let i = 0; i < window.resizeHandles.length; i++) {
        const handle = window.resizeHandles[i];
        if (x >= handle.x && x <= handle.x + handleSize &&
            y >= handle.y && y <= handle.y + handleSize) {
            return { index: i, handle: handle };
        }
    }
    return null;
}

// Start resizing operation
function startResize(resizeHandle) {
    isResizing = true;
    activeResizeHandle = resizeHandle;
    hasResized = false; // Reset resize flag
    
    const element = elements.get(selectedElementId);
    if (element) {
        // Store original bounds for resize calculations
        resizeStartBounds = {
            x: element.x,
            y: element.y,
            width: element.width || 0,
            height: element.height || 0
        };
        
        // Set cursor style
        if (canvas) {
            canvas.style.cursor = resizeHandle.handle.cursor;
        }
    }
}

window.updateElementPosition = (id, newX, newY) => {
    const element = elements.get(id);
    if (!element) return;
    
    element.x = newX;
    element.y = newY;
    
    // Redraw canvas with new position
    redrawCanvas();
    
    // Highlight the moved element
    if (selectedElementId === id) {
        highlightElement(id);
    }
};

window.sendElementMove = async (boardId, elementId, newX, newY) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("MoveElement", boardId, elementId, newX, newY);
        } catch (error) {
            console.log("Failed to send element move:", error);
        }
    }
};

function sendElementSelect(elementId) {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        signalRConnection.invoke("SelectElement", currentBoardId, elementId)
            .catch(error => console.log("Failed to send element select:", error));
    }
}

function sendElementDeselect(elementId) {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        signalRConnection.invoke("DeselectElement", currentBoardId, elementId)
            .catch(error => console.log("Failed to send element deselect:", error));
    }
}

function bringElementToFront(elementId) {
    console.log('bringElementToFront called for element:', elementId, 'boardId:', currentBoardId);
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        console.log('SignalR connected, sending BringToFront');
        signalRConnection.invoke("BringToFront", currentBoardId, elementId)
            .then(() => console.log('BringToFront sent successfully'))
            .catch(error => console.log("Failed to bring element to front:", error));
    } else {
        console.log('SignalR not connected, state:', signalRConnection?.state);
    }
}

function sendElementToBack(elementId) {
    console.log('sendElementToBack called for element:', elementId, 'boardId:', currentBoardId);
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        console.log('SignalR connected, sending SendToBack');
        signalRConnection.invoke("SendToBack", currentBoardId, elementId)
            .then(() => console.log('SendToBack sent successfully'))
            .catch(error => console.log("Failed to send element to back:", error));
    } else {
        console.log('SignalR not connected, state:', signalRConnection?.state);
    }
}

async function sendElementResize(boardId, elementId, x, y, width, height) {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        console.log('SignalR connected, sending element resize');
        await signalRConnection.invoke("ResizeElement", boardId, elementId, x, y, width, height);
    } else {
        console.log('SignalR not connected, state:', signalRConnection?.state);
    }
}

// Handle double-click on canvas for editing text elements and sticky notes
function handleCanvasDoubleClick(event) {
    console.log('Double-click detected');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find element at click point
    const elementId = getElementAtPoint(x, y);
    const element = elementId ? elements.get(elementId) : null;
    
    console.log('Element found at double-click:', elementId, element);
    
    if (element && element.type === 'StickyNote') {
        console.log('Starting sticky note editing');
        startEditingStickyNote(elementId, element);
    } else if (element && element.type === 'Text') {
        console.log('Starting text element editing');
        startEditingTextElement(elementId, element);
    } else {
        console.log('No editable element found, stopping any current editing');
        // Stop editing if clicking elsewhere
        stopEditingStickyNote();
        stopEditingTextElement();
    }
}

// Start editing a sticky note
function startEditingStickyNote(elementId, element) {
    // Stop any current editing
    stopEditingStickyNote();
    
    editingElement = elementId;
    
    // Mark element as editing
    element.data.isEditing = true;
    
    // Create text area overlay
    const rect = canvas.getBoundingClientRect();
    
    // Convert world coordinates to screen coordinates for proper positioning
    const screenPos = worldToScreen(element.x, element.y);
    
    editInput = document.createElement('textarea');
    editInput.style.position = 'absolute';
    editInput.style.left = (rect.left + screenPos.x + 10) + 'px';
    editInput.style.top = (rect.top + screenPos.y + 10) + 'px';
    editInput.style.width = (element.width * zoomLevel - 20) + 'px';
    editInput.style.height = (element.height * zoomLevel - 20) + 'px';
    editInput.style.fontSize = ((element.data.fontSize || 14) * zoomLevel) + 'px';
    editInput.style.fontFamily = 'Arial';
    editInput.style.border = '2px solid #007bff';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '5px';
    editInput.style.backgroundColor = element.data.color || '#ffff88';
    editInput.style.resize = 'none';
    editInput.style.zIndex = '1000';
    editInput.value = element.data.content || '';
    
    document.body.appendChild(editInput);
    editInput.focus();
    editInput.select();
    
    // Handle finishing edit
    editInput.addEventListener('blur', () => stopEditingStickyNote());
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            stopEditingStickyNote();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default newline behavior
            stopEditingStickyNote();
        }
        // Shift+Enter will naturally create newlines since we're not preventing it
    });
    
    // Redraw canvas to hide the text while editing
    redrawCanvas();
}

// Stop editing sticky note
function stopEditingStickyNote() {
    if (!editingElement || !editInput) return;
    
    const element = elements.get(editingElement);
    if (element) {
        // Update element content
        const newContent = editInput.value.trim();
        element.data.content = newContent;
        element.data.isEditing = false;
        
        // Send update via SignalR only if not a temporary element
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            if (!editingElement.startsWith('temp-')) {
                updateStickyNoteContent(editingElement, newContent);
            } else {
                // Mark that this temp element has pending updates
                element.data.pendingUpdate = true;
            }
        }
    }
    
    // Remove input element
    if (editInput && editInput.parentNode) {
        editInput.parentNode.removeChild(editInput);
    }
    
    editInput = null;
    editingElement = null;
    
    // Redraw canvas
    redrawCanvas();
}

// Start editing a text element
function startEditingTextElement(elementId, element) {
    // Stop any current editing
    stopEditingTextElement();
    stopEditingStickyNote();
    
    editingElement = elementId;
    
    // Mark element as editing
    element.data.isEditing = true;
    
    // Create text input overlay
    const rect = canvas.getBoundingClientRect();
    
    // Convert world coordinates to screen coordinates for proper positioning
    const screenPos = worldToScreen(element.x, element.y);
    
    editInput = document.createElement('textarea');
    editInput.style.position = 'absolute';
    editInput.style.left = (rect.left + screenPos.x) + 'px';
    editInput.style.top = (rect.top + screenPos.y) + 'px';
    editInput.style.fontSize = ((element.data.fontSize || 16) * zoomLevel) + 'px';
    editInput.style.fontFamily = element.data.fontFamily || 'Arial';
    editInput.style.color = element.data.color || '#000000';
    editInput.style.fontWeight = element.data.bold ? 'bold' : 'normal';
    editInput.style.fontStyle = element.data.italic ? 'italic' : 'normal';
    editInput.style.border = '2px solid #007bff';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '2px 5px';
    editInput.style.backgroundColor = '#ffffff';
    editInput.style.zIndex = '1000';
    editInput.style.minWidth = '100px';
    editInput.style.resize = 'none'; // Prevent manual resizing
    editInput.style.overflow = 'hidden'; // Hide scrollbars initially
    editInput.value = element.data.content || '';
    
    document.body.appendChild(editInput);
    editInput.focus();
    editInput.select();
    
    // Handle finishing edit
    editInput.addEventListener('blur', () => stopEditingTextElement());
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            stopEditingTextElement();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default newline behavior
            stopEditingTextElement();
        }
        // Shift+Enter will naturally create newlines since we're not preventing it
    });
    
    // Redraw canvas to hide the text while editing
    redrawCanvas();
}

// Stop editing text element
function stopEditingTextElement() {
    if (!editingElement || !editInput) return;
    
    const element = elements.get(editingElement);
    if (element && element.type === 'Text') {
        // Update element content
        const newContent = editInput.value.trim();
        element.data.content = newContent;
        element.data.isEditing = false;
        
        // Send update via SignalR only if not a temporary element
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            if (!editingElement.startsWith('temp-')) {
                updateTextElementContent(editingElement, newContent);
            } else {
                // Mark that this temp element has pending updates
                element.data.pendingUpdate = true;
            }
        }
    }
    
    // Remove input element
    if (editInput && editInput.parentNode) {
        editInput.parentNode.removeChild(editInput);
    }
    
    editInput = null;
    editingElement = null;
    
    // Redraw canvas
    redrawCanvas();
}

// Send text element update via SignalR
function updateTextElementContent(elementId, newContent) {
    const element = elements.get(elementId);
    if (!element || element.type !== 'Text') return;
    
    const updatedData = { ...element.data, content: newContent };
    
    console.log('Sending text element update:', currentBoardId, elementId, updatedData);
    console.log('SignalR connection state:', signalRConnection.state);
    signalRConnection.invoke('UpdateTextElement', currentBoardId, elementId, updatedData)
        .then(() => console.log('Text element update sent successfully'))
        .catch(err => console.log('Failed to update text element:', err));
}

// Send sticky note update via SignalR
function updateStickyNoteContent(elementId, newContent) {
    const element = elements.get(elementId);
    if (!element || element.type !== 'StickyNote') return;
    
    const updatedData = { ...element.data, content: newContent };
    
    console.log('Sending sticky note update:', currentBoardId, elementId, updatedData);
    console.log('SignalR connection state:', signalRConnection.state);
    signalRConnection.invoke('UpdateStickyNote', currentBoardId, elementId, updatedData)
        .then(() => console.log('Sticky note update sent successfully'))
        .catch(err => console.log('Failed to update sticky note:', err));
}

// Redraw entire canvas
function redrawCanvas() {
    if (!ctx || !canvas) return;
    
    // Reset transform and clear canvas
    resetCanvasTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply viewport transformation
    applyViewportTransform();
    
    // Sort elements by z-index and redraw them
    const sortedElements = Array.from(elements.entries())
        .sort(([,a], [,b]) => (a.zIndex || 0) - (b.zIndex || 0));
    
    for (const [id, element] of sortedElements) {
        drawElement(id, element.x, element.y, element.type, element.data, element.width, element.height);
    }
    
    // Redraw collaborative selections
    drawCollaborativeSelections();
    
    // Redraw current user's selection highlight
    if (selectedElementId) {
        highlightElement(selectedElementId);
    }
    
    // Update minimap
    if (window.updateMinimap) {
        window.updateMinimap();
    }
}

// Tool management
window.setCurrentTool = (tool) => {
    currentTool = tool;
    console.log('Tool set to:', currentTool);
    
    // Update cursor style
    const cursorStyle = tool === 'pen' ? 'crosshair' :
                       tool === 'text' ? 'text' :
                       (tool === 'rectangle' || tool === 'circle') ? 'crosshair' :
                       tool === 'sticky' ? 'pointer' :
                       tool === 'image' ? 'crosshair' :
                       tool === 'select' ? 'default' : 'default';
    
    if (canvas) {
        canvas.style.cursor = cursorStyle;
    }
};

// Zoom helper functions
function zoomAtCenter(factor) {
    if (!canvas) return;
    
    // Get center of canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Get world coordinates before zoom
    const worldPos = screenToWorld(centerX, centerY);
    
    // Apply zoom
    const newZoom = Math.max(0.1, Math.min(5, zoomLevel * factor));
    
    if (newZoom !== zoomLevel) {
        zoomLevel = newZoom;
        
        // Adjust viewport to keep center position stable
        const newScreenPos = worldToScreen(worldPos.x, worldPos.y);
        viewportX += centerX - newScreenPos.x;
        viewportY += centerY - newScreenPos.y;
        
        redrawCanvas();
        
        // Update minimap if it exists
        if (window.updateMinimap) {
            window.updateMinimap();
        } else {
            // Update zoom level display if minimap isn't available yet
            updateZoomLevelDisplay();
        }
    }
}

function resetZoom() {
    zoomLevel = 1;
    viewportX = 0;
    viewportY = 0;
    
    redrawCanvas();
    
    // Update minimap if it exists
    if (window.updateMinimap) {
        window.updateMinimap();
    } else {
        // Update zoom level display if minimap isn't available yet
        updateZoomLevelDisplay();
    }
}

// Mouse event handlers
function handleMouseWheel(event) {
    event.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Get world coordinates before zoom
    const worldPos = screenToWorld(mouseX, mouseY);
    
    // Apply zoom
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoomLevel * zoomFactor));
    
    if (newZoom !== zoomLevel) {
        zoomLevel = newZoom;
        
        // Adjust viewport to keep mouse position stable
        const newScreenPos = worldToScreen(worldPos.x, worldPos.y);
        viewportX += mouseX - newScreenPos.x;
        viewportY += mouseY - newScreenPos.y;
        
        redrawCanvas();
        
        // Update minimap if it exists
        if (window.updateMinimap) {
            window.updateMinimap();
        } else {
            // Update zoom level display if minimap isn't available yet
            updateZoomLevelDisplay();
        }
    }
}

function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    const x = worldPos.x;
    const y = worldPos.y;
    
    startX = x;
    startY = y;
    
    console.log('Mouse down:', currentTool, x, y);
    
    switch (currentTool) {
        case 'pen':
            isDrawing = true;
            currentPath = [{ x, y }];
            startNewPath(x, y);
            break;
            
        case 'text':
            createTextElement(x, y);
            break;
            
        case 'sticky':
            createStickyNote(x, y);
            break;
            
        case 'image':
            triggerImageUpload(x, y);
            break;
            
        case 'rectangle':
        case 'circle':
            isDrawing = true;
            startShape(currentTool, x, y);
            break;
            
        case 'select':
            handleSelectClick(x, y);
            break;
    }
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    const x = worldPos.x;
    const y = worldPos.y;
    
    // Handle panning first
    if (isPanning) {
        const deltaX = x - lastPanX;
        const deltaY = y - lastPanY;
        
        viewportX += deltaX * zoomLevel;
        viewportY += deltaY * zoomLevel;
        
        redrawCanvas();
        
        // Update minimap if it exists
        if (window.updateMinimap) {
            window.updateMinimap();
        }
        return;
    }
    
    if (isDrawing) {
        switch (currentTool) {
            case 'pen':
                currentPath.push({ x, y });
                drawLine(x, y);
                break;
                
            case 'rectangle':
            case 'circle':
                updateShape(currentTool, startX, startY, x, y);
                break;
        }
    }
    
    // Handle resizing
    if (isResizing && activeResizeHandle && selectedElementId) {
        // Convert screen coordinates to world coordinates for resize calculations
        const worldPos = screenToWorld(screenX, screenY);
        handleElementResize(worldPos.x, worldPos.y);
    }
    // Handle select tool dragging separately (doesn't use isDrawing)  
    else if (currentTool === 'select' && isDragging && selectedElementId) {
        handleElementDrag(x, y);
    }
    // Update cursor for resize handles when not dragging/resizing
    else if (currentTool === 'select' && selectedElementId && !isDragging && !isResizing) {
        updateCursorForResizeHandles(x, y);
    }
    
    // Send cursor updates
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        sendCursorUpdate(currentBoardId, x, y).catch(() => {});
    }
}

function handleMouseUp(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    const x = worldPos.x;
    const y = worldPos.y;
    
    console.log('Mouse up:', currentTool, 'isDrawing:', isDrawing, 'isDragging:', isDragging);
    
    if (isDrawing) {
        isDrawing = false;
        
        switch (currentTool) {
        case 'pen':
            if (currentPath.length > 0) {
                saveCanvasState('create drawing');
                
                const pathData = {
                    paths: [{
                        points: currentPath.map(p => ({ x: p.x, y: p.y })),
                        strokeColor: '#000000',
                        strokeWidth: 2
                    }]
                };
                
                if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                    sendDrawingPath(currentBoardId, pathData).catch(() => {});
                }
                currentPath = [];
            }
            break;
            
        case 'rectangle':
        case 'circle':
            createShapeElement(startX, startY, x, y);
            finishShape();
            break;
        }
    }
    
    // Handle pan end
    if (isPanning) {
        console.log('Finishing pan');
        isPanning = false;
        canvas.style.cursor = 'default';
    }
    // Handle resize end
    else if (isResizing) {
        console.log('Finishing element resize');
        finishElementResize();
    }
    // Handle select tool drag end separately (doesn't use isDrawing)
    else if (currentTool === 'select' && isDragging) {
        console.log('Finishing element drag');
        finishElementDrag();
    }
}

// Element creation functions
function createTextElement(x, y) {
    saveCanvasState('create text element');
    
    const textData = {
        content: 'Click to type...',
        fontSize: 16,
        fontFamily: 'Arial',
        color: '#000000',
        bold: false,
        italic: false,
        isEditing: true
    };
    
    // Create the element and immediately start editing
    const elementData = {
        type: 'Text',
        x: x,
        y: y,
        width: 200,
        height: 30,
        data: textData
    };
    
    // For local creation, we need to generate a temporary ID and add to elements map
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    elements.set(tempId, {
        x: x,
        y: y,
        width: 200,
        height: 30,
        type: 'Text',
        data: textData,
        zIndex: 0
    });
    
    // Auto-select and start editing immediately
    selectedElementId = tempId;
    setTimeout(() => {
        startEditingTextElement(tempId, elements.get(tempId));
    }, 50);
    
    // Switch back to select tool after creating text element
    setCurrentTool('select');
    
    sendElement(currentBoardId, elementData, tempId);
}

function createStickyNote(x, y) {
    saveCanvasState('create sticky note');
    
    const stickyData = {
        content: 'Click to type...',
        color: '#ffff88',
        fontSize: 14,
        isEditing: true
    };
    
    // Create the element and immediately start editing
    const elementData = {
        type: 'StickyNote',
        x: x,
        y: y,
        width: 200,
        height: 150,
        data: stickyData
    };
    
    // For local creation, we need to generate a temporary ID and add to elements map
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    elements.set(tempId, {
        x: x,
        y: y,
        width: 200,
        height: 150,
        type: 'StickyNote',
        data: stickyData,
        zIndex: 0
    });
    
    // Auto-select and start editing immediately
    selectedElementId = tempId;
    setTimeout(() => {
        startEditingStickyNote(tempId, elements.get(tempId));
    }, 50);
    
    // Switch back to select tool after creating sticky note
    setCurrentTool('select');
    
    sendElement(currentBoardId, elementData, tempId);
}

function createShapeElement(startX, startY, endX, endY) {
    saveCanvasState('create shape');
    
    let width = Math.abs(endX - startX);
    let height = Math.abs(endY - startY);
    
    // Ensure minimum dimensions for click-drawn shapes (when user just clicks without dragging)
    const minSize = 40; // Minimum size for shapes
    if (width < minSize) width = minSize;
    if (height < minSize) height = minSize;
    
    const x = Math.min(startX, endX) - (width - Math.abs(endX - startX)) / 2;
    const y = Math.min(startY, endY) - (height - Math.abs(endY - startY)) / 2;
    
    const shapeData = {
        shapeType: currentTool,
        fillColor: 'transparent',
        strokeColor: '#000000',
        strokeWidth: 2
    };
    
    sendElement(currentBoardId, {
        type: 'Shape',
        x: x,
        y: y,
        width: width,
        height: height,
        data: shapeData
    });
}

// Selection functions
function handleSelectClick(x, y) {
    console.log('handleSelectClick called:', x, y);
    
    // First check if clicking on a resize handle of selected element
    if (selectedElementId) {
        const resizeHandle = getResizeHandleAt(x, y);
        if (resizeHandle) {
            console.log('Resize handle clicked:', resizeHandle.index);
            startResize(resizeHandle);
            return;
        }
    }
    
    const elementId = getElementAtPoint(x, y);
    const element = elementId ? elements.get(elementId) : null;
    
    console.log('Element found for selection:', elementId, element);
    
    if (element) {
        // Deselect previous element if any
        if (selectedElementId && selectedElementId !== elementId) {
            sendElementDeselect(selectedElementId);
        }
        
        selectedElementId = elementId;
        isDragging = true;
        hasMoved = false; // Reset move flag
        
        dragOffsetX = x - element.x;
        dragOffsetY = y - element.y;
        
        console.log('Element selected:', elementId, 'dragOffset:', dragOffsetX, dragOffsetY);
        highlightElement(elementId);
        
        // Send selection event
        sendElementSelect(elementId);
    } else {
        if (selectedElementId) {
            console.log('Deselecting element:', selectedElementId);
            sendElementDeselect(selectedElementId);
            clearSelection();
            selectedElementId = null;
        }
        
        // Start panning when no element is selected
        console.log('Starting pan mode');
        isPanning = true;
        lastPanX = x;
        lastPanY = y;
        canvas.style.cursor = 'grabbing';
    }
}

function handleElementDrag(x, y) {
    if (selectedElementId) {
        const newX = x - dragOffsetX;
        const newY = y - dragOffsetY;
        
        // Save state on first movement
        if (!hasMoved) {
            saveCanvasState('move element');
            hasMoved = true;
        }
        
        console.log('Dragging element:', selectedElementId, 'to:', newX, newY);
        updateElementPosition(selectedElementId, newX, newY);
    }
}

function finishElementDrag() {
    console.log('finishElementDrag called:', selectedElementId, isDragging);
    if (selectedElementId && isDragging) {
        const element = elements.get(selectedElementId);
        console.log('Element for drag finish:', element);
        if (element) {
            console.log('Sending element move to:', element.x, element.y);
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                sendElementMove(currentBoardId, selectedElementId, element.x, element.y)
                    .then(() => console.log('Element move sent successfully'))
                    .catch((err) => console.log('Element move failed:', err));
            } else {
                console.log('SignalR not connected for element move');
            }
        }
        isDragging = false;
        hasMoved = false; // Reset move flag
        console.log('isDragging set to false');
    }
}

// Resize handling functions
function handleElementResize(x, y) {
    if (!selectedElementId || !activeResizeHandle || !resizeStartBounds) return;
    
    const element = elements.get(selectedElementId);
    if (!element || !isElementResizable(element)) return;
    
    // Save state on first resize
    if (!hasResized) {
        saveCanvasState('resize element');
        hasResized = true;
    }
    
    const handleIndex = activeResizeHandle.index;
    const newBounds = calculateNewBounds(x, y, handleIndex, resizeStartBounds);
    
    // Update element bounds
    element.x = newBounds.x;
    element.y = newBounds.y;
    element.width = newBounds.width;
    element.height = newBounds.height;
    
    // Redraw canvas with updated element
    redrawCanvas();
}

function calculateNewBounds(mouseX, mouseY, handleIndex, originalBounds) {
    let newBounds = { ...originalBounds };
    
    switch (handleIndex) {
        case 0: // Top-left
            newBounds.width = originalBounds.width + (originalBounds.x - mouseX);
            newBounds.height = originalBounds.height + (originalBounds.y - mouseY);
            newBounds.x = mouseX;
            newBounds.y = mouseY;
            break;
        case 1: // Top-center
            newBounds.height = originalBounds.height + (originalBounds.y - mouseY);
            newBounds.y = mouseY;
            break;
        case 2: // Top-right
            newBounds.width = mouseX - originalBounds.x;
            newBounds.height = originalBounds.height + (originalBounds.y - mouseY);
            newBounds.y = mouseY;
            break;
        case 3: // Middle-left
            newBounds.width = originalBounds.width + (originalBounds.x - mouseX);
            newBounds.x = mouseX;
            break;
        case 4: // Middle-right
            newBounds.width = mouseX - originalBounds.x;
            break;
        case 5: // Bottom-left
            newBounds.width = originalBounds.width + (originalBounds.x - mouseX);
            newBounds.height = mouseY - originalBounds.y;
            newBounds.x = mouseX;
            break;
        case 6: // Bottom-center
            newBounds.height = mouseY - originalBounds.y;
            break;
        case 7: // Bottom-right
            newBounds.width = mouseX - originalBounds.x;
            newBounds.height = mouseY - originalBounds.y;
            break;
    }
    
    // Enforce minimum size
    const minSize = 10;
    newBounds.width = Math.max(minSize, newBounds.width);
    newBounds.height = Math.max(minSize, newBounds.height);
    
    return newBounds;
}

function finishElementResize() {
    if (selectedElementId && isResizing) {
        const element = elements.get(selectedElementId);
        if (element && signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            // Send resize update via SignalR
            sendElementResize(currentBoardId, selectedElementId, element.x, element.y, element.width, element.height)
                .then(() => console.log('Element resize sent successfully'))
                .catch((err) => console.log('Element resize failed:', err));
        }
        
        isResizing = false;
        activeResizeHandle = null;
        resizeStartBounds = null;
        hasResized = false; // Reset resize flag
        
        // Reset cursor
        if (canvas) {
            canvas.style.cursor = 'default';
        }
    }
}

function updateCursorForResizeHandles(x, y) {
    if (!selectedElementId) return;
    
    const resizeHandle = getResizeHandleAt(x, y);
    if (resizeHandle && canvas) {
        canvas.style.cursor = resizeHandle.handle.cursor;
    } else if (canvas) {
        canvas.style.cursor = 'default';
    }
}

// Board management
window.clearCanvasFromBlazor = () => {
    clearCanvas();
    elements.clear();
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        sendBoardCleared(currentBoardId).catch(() => {});
    }
};

// Test function to check SignalR connection
window.testSignalRConnection = () => {
    console.log('SignalR Connection State:', signalRConnection ? signalRConnection.state : 'null');
    console.log('Current Board ID:', currentBoardId);
    console.log('Elements Count:', elements.size);
    console.log('Available Elements:', Array.from(elements.keys()));
};

// Initialize canvas when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initializeCanvas();
    }, 100);
});

// Mouse tracking for cursor updates
window.addMouseMoveListener = (dotNetRef) => {
    let mouseTracker = (event) => {
        const rect = canvas?.getBoundingClientRect();
        if (rect) {
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            dotNetRef.invokeMethodAsync('OnMouseMove', x, y);
        }
    };
    
    if (canvas) {
        canvas.addEventListener('mousemove', mouseTracker);
    } else {
        // Retry if canvas not ready
        setTimeout(() => {
            canvas = document.getElementById('drawingCanvas');
            if (canvas) {
                canvas.addEventListener('mousemove', mouseTracker);
            }
        }, 100);
    }
};

// Collaborative selection handling
let collaborativeSelections = new Map();

window.showElementSelection = (elementId, userName, connectionId) => {
    if (!ctx) return;
    
    const element = elements.get(elementId);
    if (!element) return;
    
    // Store selection info
    collaborativeSelections.set(connectionId, { elementId, userName });
    
    // Redraw canvas with collaborative selections
    redrawCanvas();
    drawCollaborativeSelections();
};

window.hideElementSelection = (elementId, connectionId) => {
    collaborativeSelections.delete(connectionId);
    redrawCanvas();
    drawCollaborativeSelections();
};

function drawCollaborativeSelections() {
    if (!ctx) return;
    
    for (const [connectionId, selection] of collaborativeSelections.entries()) {
        const element = elements.get(selection.elementId);
        if (!element) continue;
        
        // Draw selection border with different color
        ctx.save();
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        
        const padding = 3;
        let width = element.width || 0;
        let height = element.height || 0;
        
        // Special handling for text elements
        if (element.type === 'Text' && element.data && element.data.content) {
            ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
            const textMetrics = ctx.measureText(element.data.content);
            width = textMetrics.width;
            height = element.data.fontSize || 16;
        }
        
        ctx.strokeRect(
            element.x - padding,
            element.y - padding,
            width + (2 * padding),
            height + (2 * padding)
        );
        
        // Draw user name label
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '12px Arial';
        ctx.fillText(selection.userName, element.x, element.y - 8);
        
        ctx.restore();
    }
};

// Image upload functionality
function setupImageUpload() {
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
        imageInput.addEventListener('change', handleImageUpload);
    }
}

function triggerImageUpload(x, y) {
    pendingImagePosition = { x, y };
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
        imageInput.click();
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file || !pendingImagePosition) return;
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/image/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            createImageElement(pendingImagePosition.x, pendingImagePosition.y, result);
        } else {
            const error = await response.text();
            alert('Image upload failed: ' + error);
        }
    } catch (error) {
        console.error('Image upload error:', error);
        alert('Image upload failed: ' + error.message);
    } finally {
        // Clear the input and pending position
        event.target.value = '';
        pendingImagePosition = null;
    }
}

function createImageElement(x, y, imageData) {
    // Calculate display size (max 400x300 while maintaining aspect ratio)
    const maxWidth = 400;
    const maxHeight = 300;
    const aspectRatio = imageData.originalWidth / imageData.originalHeight;
    
    let displayWidth = imageData.originalWidth;
    let displayHeight = imageData.originalHeight;
    
    if (displayWidth > maxWidth) {
        displayWidth = maxWidth;
        displayHeight = displayWidth / aspectRatio;
    }
    
    if (displayHeight > maxHeight) {
        displayHeight = maxHeight;
        displayWidth = displayHeight * aspectRatio;
    }
    
    const elementData = {
        type: 'Image',
        x: x,
        y: y,
        width: displayWidth,
        height: displayHeight,
        data: imageData
    };
    
    sendElement(currentBoardId, elementData, tempId);
};

// Z-index control functions for UI buttons
window.bringSelectedToFront = () => {
    console.log('bringSelectedToFront called, selectedElementId:', selectedElementId);
    if (selectedElementId) {
        bringElementToFront(selectedElementId);
    } else {
        alert('Please select an element first');
    }
};

window.sendSelectedToBack = () => {
    console.log('sendSelectedToBack called, selectedElementId:', selectedElementId);
    if (selectedElementId) {
        sendElementToBack(selectedElementId);
    } else {
        alert('Please select an element first');
    }
};

// Context menu functionality
let contextMenu = null;

window.showContextMenu = (x, y) => {
    contextMenu = document.getElementById('contextMenu');
    if (contextMenu && selectedElementId) {
        const element = elements.get(selectedElementId);
        
        // Show/hide style options based on element type
        const styleOptions = document.getElementById('styleOptions');
        if (styleOptions && element) {
            if (element.type === 'Shape' || element.type === 'Drawing') {
                styleOptions.style.display = 'block';
            } else {
                styleOptions.style.display = 'none';
            }
        }
        
        contextMenu.style.display = 'block';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        
        // Hide menu when clicking elsewhere
        document.addEventListener('click', hideContextMenu);
        return true; // Prevent default context menu
    }
    return false;
};

window.hideContextMenu = () => {
    if (contextMenu) {
        contextMenu.style.display = 'none';
        document.removeEventListener('click', hideContextMenu);
    }
};

window.deleteSelectedElement = () => {
    if (selectedElementId) {
        console.log('Deleting element:', selectedElementId);
        saveCanvasState('delete element');
        
        // Remove from local elements map
        elements.delete(selectedElementId);
        
        // Send delete request via SignalR if connected
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            signalRConnection.invoke("DeleteElement", currentBoardId, selectedElementId)
                .then(() => console.log('Element deletion sent successfully'))
                .catch(error => console.log("Failed to delete element:", error));
        }
        
        // Clear selection and redraw canvas
        selectedElementId = null;
        redrawCanvas();
    }
    hideContextMenu();
};

// Shape style update function
window.updateShapeStyle = (property, value) => {
    if (!selectedElementId) {
        console.log('No element selected for style update');
        return;
    }
    
    const element = elements.get(selectedElementId);
    if (!element) {
        console.log('Selected element not found');
        return;
    }
    
    // Only allow style updates for shapes and drawings
    if (element.type !== 'Shape' && element.type !== 'Drawing') {
        console.log('Style updates only supported for shapes and drawings');
        return;
    }
    
    console.log('Updating style:', property, '=', value, 'for element:', selectedElementId);
    
    // Save state for undo
    saveCanvasState('update style');
    
    // Update the element's style data
    if (!element.data) {
        element.data = {};
    }
    element.data[property] = value;
    
    // For drawings, update all paths
    if (element.type === 'Drawing' && element.data.paths) {
        for (const path of element.data.paths) {
            if (property === 'strokeColor') {
                path.strokeColor = value;
            } else if (property === 'strokeWidth') {
                path.strokeWidth = value;
            }
        }
    }
    
    // Redraw canvas to show changes
    redrawCanvas();
    
    // Send update via SignalR
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        updateElementStyle(selectedElementId, element.data);
    }
    
    // Hide context menu after selection
    hideContextMenu();
};

// Send style update via SignalR
function updateElementStyle(elementId, newStyleData) {
    console.log('Sending style update via SignalR:', elementId, newStyleData);
    signalRConnection.invoke('UpdateElementStyle', currentBoardId, elementId, newStyleData)
        .then(() => console.log('Style update sent successfully'))
        .catch(err => console.log('Failed to update element style:', err));
}

// Right-click handler for canvas
function handleCanvasRightClick(event) {
    event.preventDefault(); // Prevent default context menu
    
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates for element detection
    const worldPos = screenToWorld(screenX, screenY);
    const x = worldPos.x;
    const y = worldPos.y;
    
    // Check if we're right-clicking on a selected element
    if (selectedElementId) {
        const element = elements.get(selectedElementId);
        if (element && isPointInElement(x, y, element)) {
            // Show context menu at mouse position
            showContextMenu(event.clientX, event.clientY);
            return;
        }
    }
    
    // If not on selected element, try to select element under cursor
    const elementId = getElementAtPoint(x, y);
    if (elementId) {
        // Select the element first
        if (selectedElementId && selectedElementId !== elementId) {
            sendElementDeselect(selectedElementId);
        }
        selectedElementId = elementId;
        highlightElement(elementId);
        sendElementSelect(elementId);
        
        // Then show context menu
        showContextMenu(event.clientX, event.clientY);
    }
}

// Helper function to check if point is within element bounds
function isPointInElement(x, y, element) {
    if (element.type === 'Text' && element.data && element.data.content) {
        // Special handling for text elements
        const canvas = document.getElementById('drawingCanvas');
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
        const textMetrics = ctx.measureText(element.data.content);
        const textWidth = textMetrics.width;
        const textHeight = element.data.fontSize || 16;
        ctx.restore();
        
        return x >= element.x && x <= element.x + textWidth &&
               y >= element.y && y <= element.y + textHeight;
    } else {
        return x >= element.x && x <= element.x + (element.width || 0) &&
               y >= element.y && y <= element.y + (element.height || 0);
    }
}

// Setup keyboard event handlers
function setupKeyboardHandlers() {
    let previousTool = null;
    
    document.addEventListener('keydown', function(event) {
        // Handle Ctrl+Z for undo
        if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undo();
        }
        // Handle Ctrl+Y or Ctrl+Shift+Z for redo
        else if (event.ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            redo();
        }
        // Handle Ctrl+C for copy
        else if (event.ctrlKey && event.key === 'c') {
            event.preventDefault();
            copySelectedElement();
        }
        // Handle Ctrl+V for paste
        else if (event.ctrlKey && event.key === 'v') {
            event.preventDefault();
            pasteElement();
        }
        // Handle DEL key for deleting selected element
        else if (event.key === 'Delete' && selectedElementId) {
            event.preventDefault();
            deleteSelectedElement();
        }
        // Handle + key for zoom in
        else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAtCenter(1.1);
        }
        // Handle - key for zoom out
        else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomAtCenter(0.9);
        }
        // Handle 0 key for reset zoom
        else if (event.key === '0') {
            event.preventDefault();
            resetZoom();
        }
        // Handle spacebar for hand tool
        else if (event.code === 'Space' && !event.repeat) {
            // Don't hijack spacebar if user is editing text
            if (editingElement || document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return; // Let the browser handle the spacebar normally
            }
            
            event.preventDefault();
            
            // If already on select tool, do nothing
            if (currentTool === 'select') return;
            
            // Store current tool and switch to select
            previousTool = currentTool;
            window.setCurrentTool('select');
            
            // Update Blazor component
            window.updateBlazorCurrentTool('select');
        }
    });
    
    document.addEventListener('keyup', function(event) {
        // Handle spacebar release to return to previous tool
        if (event.code === 'Space' && previousTool && currentTool === 'select') {
            // Don't handle spacebar release if user is editing text
            if (editingElement || document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return;
            }
            
            event.preventDefault();
            
            // Switch back to previous tool
            window.setCurrentTool(previousTool);
            window.updateBlazorCurrentTool(previousTool);
            previousTool = null;
        }
    });
}

// Set Blazor reference for JavaScript to call back to Blazor
window.setBlazorReference = (dotNetRef) => {
    blazorReference = dotNetRef;
    console.log('Blazor reference set for tool updates');
};

// Function to update Blazor component tool state
window.updateBlazorCurrentTool = async (tool) => {
    if (blazorReference) {
        try {
            await blazorReference.invokeMethodAsync('UpdateCurrentTool', tool);
            console.log('Blazor tool updated to:', tool);
        } catch (error) {
            console.log('Failed to update Blazor tool:', error);
        }
    }
};