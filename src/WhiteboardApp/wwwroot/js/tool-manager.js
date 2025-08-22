// tool-manager.js - ES6 module for tool management
// Extracted from drawing.js for better code organization

// Tool state variables (legacy compatibility)
let currentTool = 'select'; // Legacy - use toolManager.getTool() instead
let previousTool = null; // Legacy - use toolManager.getPreviousTool() instead

// Drawing state variables
let isDrawing = false;
let currentPath = [];
let isDrawingShape = false;

// Shift key tracking for line snapping
window.isShiftHeld = false;

// ToolManager class - decoupled tool switching logic
class ToolManager {
    constructor() {
        this.currentTool = 'select';
        this.previousTool = null;
        this.onToolChange = null; // Callback for tool changes
    }
    
    // Set current tool with validation and callbacks
    setTool(newTool) {
        const validTools = ['select', 'pen', 'text', 'rectangle', 'circle', 'triangle', 'diamond', 'ellipse', 'star', 'line', 'sticky', 'image'];
        
        if (!validTools.includes(newTool)) {
            console.warn('Invalid tool:', newTool, 'Valid tools are:', validTools);
            return false;
        }
        
        if (this.currentTool === newTool) {
            return true; // No change needed
        }
        
        const oldTool = this.currentTool;
        this.previousTool = oldTool;
        this.currentTool = newTool;
        
        // Notify Blazor component
        if (typeof window.updateBlazorCurrentTool === 'function') {
            window.updateBlazorCurrentTool(newTool);
        }
        
        // Notify subscribers
        if (this.onToolChange) {
            this.onToolChange(oldTool, newTool);
        }
        
        console.log('Tool changed:', oldTool, '->', newTool);
        return true;
    }
    
    // Get current tool
    getTool() {
        return this.currentTool;
    }
    
    // Get previous tool
    getPreviousTool() {
        return this.previousTool;
    }
    
    // Switch to previous tool
    switchToPrevious() {
        if (this.previousTool) {
            return this.setTool(this.previousTool);
        }
        return false;
    }
    
    // Check if current tool is one of the specified tools
    isOneOf(tools) {
        return tools.includes(this.currentTool);
    }
    
    // Check if current tool supports editing
    isEditingTool() {
        return this.isOneOf(['text', 'sticky']);
    }
}

// Create global tool manager instance
const toolManager = new ToolManager();

// Set up callbacks to keep legacy variables synchronized
toolManager.onToolChange = (oldTool, newTool) => {
    currentTool = newTool; // Keep legacy variable in sync
};

// Tool switching functions
function setCurrentTool(tool) {
    console.log('setCurrentTool called with:', tool);
    // Use ToolManager instead of direct assignment
    const success = toolManager.setTool(tool);
    console.log('ToolManager setTool success:', success);
    if (success) {
        currentTool = tool; // Keep legacy variable in sync
        
        // Update cursor style - this should be injected as a dependency
        if (typeof updateCanvasCursor === 'function') {
            const cursorStyle = tool === 'pen' ? 'crosshair' :
                               tool === 'text' ? 'text' :
                               (tool === 'rectangle' || tool === 'circle' || tool === 'triangle' || tool === 'diamond' || tool === 'ellipse' || tool === 'star') ? 'crosshair' :
                               tool === 'sticky' ? 'pointer' :
                               tool === 'image' ? 'crosshair' :
                               tool === 'select' ? 'default' : 'default';
            
            updateCanvasCursor(cursorStyle);
        }
        
        // Direct canvas access for backward compatibility
        if (typeof canvas !== 'undefined' && canvas) {
            const cursorStyle = tool === 'pen' ? 'crosshair' :
                               tool === 'text' ? 'text' :
                               (tool === 'rectangle' || tool === 'circle' || tool === 'triangle' || tool === 'diamond' || tool === 'ellipse' || tool === 'star') ? 'crosshair' :
                               tool === 'sticky' ? 'pointer' :
                               tool === 'image' ? 'crosshair' :
                               tool === 'select' ? 'default' : 'default';
            canvas.style.cursor = cursorStyle;
        }
    }
    return success;
}

// Blazor integration function
async function updateBlazorCurrentTool(tool) {
    if (typeof blazorReference !== 'undefined' && blazorReference) {
        try {
            await blazorReference.invokeMethodAsync('UpdateCurrentTool', tool);
            console.log('Blazor tool updated to:', tool);
        } catch (error) {
            console.log('Failed to update Blazor tool:', error);
        }
    }
}

// Keyboard handlers
function setupKeyboardHandlers() {
    // Remove existing listeners to prevent duplicates
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

// Debounce mechanism to prevent double execution
let lastActionTime = 0;
const actionDebounceMs = 100;

function handleKeyDown(event) {
    // Track Shift key for line snapping
    if (event.key === 'Shift') {
        window.isShiftHeld = true;
    }
    
    // Debounce rapid key presses
    const now = Date.now();
    if (now - lastActionTime < actionDebounceMs && 
        (event.ctrlKey && ['c', 'v', 'd'].includes(event.key))) {
        return;
    }
    
    // Handle keyboard shortcuts - these should be injected as dependencies
    if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (typeof undo === 'function') undo();
    }
    // Handle Ctrl+Y or Ctrl+Shift+Z for redo
    else if (event.ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        if (typeof redo === 'function') redo();
    }
    // Handle Delete key
    else if (event.key === 'Delete') {
        if (typeof deleteSelectedElement === 'function') {
            // Don't handle delete if user is editing text
            if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return;
            }
            
            event.preventDefault();
            deleteSelectedElement();
        }
    }
    // Handle Ctrl+C for copy
    else if (event.ctrlKey && event.key === 'c') {
        if (typeof copySelectedElement === 'function') {
            // Don't handle copy if user is editing text
            if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return;
            }
            
            event.preventDefault();
            copySelectedElement();
            lastActionTime = now;
        }
    }
    // Handle Ctrl+V for paste
    else if (event.ctrlKey && event.key === 'v') {
        if (typeof pasteElement === 'function') {
            // Don't handle paste if user is editing text
            if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return;
            }
            
            event.preventDefault();
            pasteElement();
            lastActionTime = now;
        }
    }
    // Handle Ctrl+D for duplicate
    else if (event.ctrlKey && event.key === 'd') {
        if (typeof duplicateSelectedElement === 'function') {
            // Don't handle duplicate if user is editing text
            if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' || 
                document.activeElement.contentEditable === 'true') {
                return;
            }
            
            event.preventDefault();
            duplicateSelectedElement();
            lastActionTime = now;
        }
    }
    // Handle spacebar to temporarily switch to select tool
    else if (event.code === 'Space') {
        // Don't handle spacebar if user is editing text
        if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.contentEditable === 'true') {
            return;
        }
        
        // Only switch if not already on select tool
        if (toolManager.getTool() !== 'select') {
            event.preventDefault();
            toolManager.setTool('select');
            if (typeof updateBlazorCurrentTool === 'function') {
                updateBlazorCurrentTool('select');
            }
        }
    }
}

function handleKeyUp(event) {
    // Track Shift key release for line snapping
    if (event.key === 'Shift') {
        window.isShiftHeld = false;
    }
    
    // Handle spacebar release to return to previous tool
    if (event.code === 'Space' && toolManager.getPreviousTool() && toolManager.getTool() === 'select') {
        // Don't handle spacebar release if user is editing text
        if (typeof editorManager !== 'undefined' && editorManager.isEditing()) return;
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.contentEditable === 'true') {
            return;
        }
        
        event.preventDefault();
        
        // Switch back to previous tool
        toolManager.switchToPrevious();
    }
}

// Shape creation functions
function startShape(shapeType, x, y) {
    isDrawingShape = true;
    window.shapeStartX = x;
    window.shapeStartY = y;
    window.currentShapeType = shapeType;
}

function updateShape(shapeType, startX, startY, currentX, currentY) {
    console.log('updateShape called with:', shapeType, 'from', startX, startY, 'to', currentX, currentY);
    if (typeof tempCtx === 'undefined' || !tempCtx || !isDrawingShape) return;
    
    // Clear temporary canvas
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Apply viewport transformation to temp canvas (dependency injection needed)
    if (typeof zoomLevel !== 'undefined' && typeof viewportX !== 'undefined' && typeof viewportY !== 'undefined') {
        tempCtx.setTransform(zoomLevel, 0, 0, zoomLevel, viewportX, viewportY);
    }
    
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
    } else if (shapeType === 'triangle') {
        const centerX = startX + width / 2;
        tempCtx.moveTo(centerX, startY); // Top point
        tempCtx.lineTo(startX, startY + height); // Bottom left
        tempCtx.lineTo(startX + width, startY + height); // Bottom right
        tempCtx.closePath();
    } else if (shapeType === 'diamond') {
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        tempCtx.moveTo(centerX, startY); // Top
        tempCtx.lineTo(startX + width, centerY); // Right
        tempCtx.lineTo(centerX, startY + height); // Bottom
        tempCtx.lineTo(startX, centerY); // Left
        tempCtx.closePath();
    } else if (shapeType === 'ellipse') {
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        tempCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    } else if (shapeType === 'star') {
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        const outerRadius = Math.min(Math.abs(width), Math.abs(height)) / 2;
        const innerRadius = outerRadius * 0.4;
        const spikes = 5;
        
        for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI) / spikes;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = centerX + Math.cos(angle - Math.PI / 2) * radius;
            const y = centerY + Math.sin(angle - Math.PI / 2) * radius;
            
            if (i === 0) {
                tempCtx.moveTo(x, y);
            } else {
                tempCtx.lineTo(x, y);
            }
        }
        tempCtx.closePath();
    }
    
    tempCtx.stroke();
}

function finishShape() {
    isDrawingShape = false;
    if (typeof tempCtx !== 'undefined' && tempCtx) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
}

// Line drawing functions
function startLine(x, y) {
    isDrawingShape = true;
    window.lineStartX = x;
    window.lineStartY = y;
}

// Helper function to snap line to nearest horizontal, vertical, or diagonal
function snapLineToAngle(startX, startY, currentX, currentY) {
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Calculate angle in degrees
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    
    // Snap to nearest 45-degree increment
    const snapAngles = [0, 45, 90, 135, 180, -135, -90, -45];
    let closestAngle = snapAngles[0];
    let minDiff = Math.abs(angle - snapAngles[0]);
    
    for (const snapAngle of snapAngles) {
        const diff = Math.abs(angle - snapAngle);
        if (diff < minDiff) {
            minDiff = diff;
            closestAngle = snapAngle;
        }
    }
    
    // Calculate snapped position
    const radians = closestAngle * (Math.PI / 180);
    const snappedX = startX + Math.cos(radians) * distance;
    const snappedY = startY + Math.sin(radians) * distance;
    
    return { x: snappedX, y: snappedY };
}

function updateLine(startX, startY, currentX, currentY) {
    if (typeof tempCtx === 'undefined' || !tempCtx || !isDrawingShape) return;
    
    // Snap to angles when Shift is held
    let endX = currentX;
    let endY = currentY;
    
    if (window.isShiftHeld) {
        const snapped = snapLineToAngle(startX, startY, currentX, currentY);
        endX = snapped.x;
        endY = snapped.y;
    }
    
    // Clear temporary canvas
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Apply viewport transformation to temp canvas (dependency injection needed)
    if (typeof zoomLevel !== 'undefined' && typeof viewportX !== 'undefined' && typeof viewportY !== 'undefined') {
        tempCtx.setTransform(zoomLevel, 0, 0, zoomLevel, viewportX, viewportY);
    }
    
    // Set style - different appearance when snapping
    if (window.isShiftHeld) {
        tempCtx.strokeStyle = '#ff0000'; // Red when snapping
        tempCtx.lineWidth = 3;
    } else {
        tempCtx.strokeStyle = '#000000';
        tempCtx.lineWidth = 2;
    }
    
    // Draw line
    tempCtx.beginPath();
    tempCtx.moveTo(startX, startY);
    tempCtx.lineTo(endX, endY);
    tempCtx.stroke();
}

function finishLine() {
    isDrawingShape = false;
    if (typeof tempCtx !== 'undefined' && tempCtx) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
}

// Drawing/pen tool functions
function startNewPath(x, y) {
    if (typeof ctx === 'undefined' || !ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function drawLine(x, y) {
    if (typeof ctx === 'undefined' || !ctx) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
}

// Window exposure for backward compatibility
window.setCurrentTool = setCurrentTool;
window.updateBlazorCurrentTool = updateBlazorCurrentTool;
window.startShape = startShape;
window.updateShape = updateShape;
window.finishShape = finishShape;
window.startLine = startLine;
window.updateLine = updateLine;
window.finishLine = finishLine;
window.startNewPath = startNewPath;
window.drawLine = drawLine;
window.setupKeyboardHandlers = setupKeyboardHandlers;
window.handleKeyDown = handleKeyDown;
window.handleKeyUp = handleKeyUp;

// ES6 module exports
export {
    ToolManager,
    toolManager,
    currentTool,
    previousTool,
    isDrawing,
    currentPath,
    isDrawingShape,
    setCurrentTool,
    updateBlazorCurrentTool,
    setupKeyboardHandlers,
    handleKeyDown,
    handleKeyUp,
    startShape,
    updateShape,
    finishShape,
    startLine,
    updateLine,
    finishLine,
    snapLineToAngle,
    startNewPath,
    drawLine
};

// Default export
export default toolManager;