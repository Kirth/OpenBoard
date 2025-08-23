// Tool Manager Module - Handles all tool selection and behavior
// This module manages the current tool state, tool switching, keyboard shortcuts,
// and tool-specific drawing operations

// Tool state tracking
let currentTool = 'select'; // Legacy compatibility
let previousTool = null; // Legacy compatibility
let isDrawing = false;
let currentPath = [];
let isDrawingShape = false;

// Shift key tracking for line snapping and other shortcuts
window.isShiftHeld = false;

// Dependencies that will be injected from other modules
let dependencies = {
    canvas: null,
    ctx: null,
    tempCanvas: null,
    tempCtx: null,
    updateCanvasCursor: null,
    screenToWorld: null,
    worldToScreen: null,
    applyViewportTransform: null,
    resetCanvasTransform: null,
    redrawCanvas: null,
    clearCanvas: null,
    blazorReference: null,
    elements: null,
    selectedElementId: null,
    createShapeElement: null,
    createLineElement: null,
    sendElement: null,
    sendDrawingPath: null,
    deleteSelectedElement: null,
    copySelectedElement: null,
    pasteElement: null,
    duplicateSelectedElement: null,
    undo: null,
    redo: null,
    currentBoardId: null,
    startX: 0,
    startY: 0
};

// Set dependencies from other modules
export function setDependencies(deps) {
    Object.assign(dependencies, deps);
}

// ToolManager class for centralized tool management
export class ToolManager {
    constructor() {
        this.currentTool = 'select';
        this.previousTool = null;
        this.availableTools = [
            'select', 'pen', 'rectangle', 'circle', 'line', 
            'text', 'stickynote', 'image', 'triangle', 'diamond', 'ellipse', 'star'
        ];
        this.onToolChange = null; // Callback for tool changes
    }

    // Get current tool
    getTool() {
        return this.currentTool;
    }

    // Get previous tool
    getPreviousTool() {
        return this.previousTool;
    }

    // Set tool with validation
    setTool(tool) {
        if (!this.isValidTool(tool)) {
            console.warn('Invalid tool:', tool);
            return false;
        }

        if (this.currentTool !== tool) {
            this.previousTool = this.currentTool;
            this.currentTool = tool;

            // Update legacy global variable
            currentTool = tool;

            // Trigger callback if set
            if (this.onToolChange) {
                this.onToolChange(tool, this.previousTool);
            }

            console.log(`Tool changed from ${this.previousTool} to ${this.currentTool}`);
            return true;
        }
        return false;
    }

    // Check if tool is valid
    isValidTool(tool) {
        return this.availableTools.includes(tool);
    }

    // Get all available tools
    getAvailableTools() {
        return [...this.availableTools];
    }

    // Check if current tool is a shape tool
    isShapeTool() {
        return ['rectangle', 'circle', 'triangle', 'diamond', 'ellipse', 'star'].includes(this.currentTool);
    }

    // Check if current tool is a drawing tool
    isDrawingTool() {
        return this.currentTool === 'pen';
    }

    // Check if current tool creates elements
    isCreationTool() {
        return ['pen', 'rectangle', 'circle', 'line', 'text', 'stickynote', 'image', 'triangle', 'diamond', 'ellipse', 'star'].includes(this.currentTool);
    }

    // Switch back to previous tool
    switchToPrevious() {
        if (this.previousTool && this.isValidTool(this.previousTool)) {
            this.setTool(this.previousTool);
            return true;
        }
        return false;
    }

    // Switch to select tool
    switchToSelect() {
        this.setTool('select');
    }
}

// Global tool manager instance
export const toolManager = new ToolManager();

// Initialize tool manager
export function initializeToolManager() {
    try {
        // Set up callbacks
        toolManager.onToolChange = (newTool, oldTool) => {
            updateCanvasCursor(newTool);
            updateBlazorCurrentTool(newTool);
        };

        console.log('Tool manager initialized');
        return true;
    } catch (error) {
        console.error('Failed to initialize tool manager:', error);
        return false;
    }
}

// Main function to set current tool
export function setCurrentTool(tool) {
    try {
        const success = toolManager.setTool(tool);
        if (success) {
            updateCanvasCursor(tool);
            updateBlazorCurrentTool(tool);
        }
        return success;
    } catch (error) {
        console.error('Failed to set current tool:', error);
        return false;
    }
}

// Update canvas cursor based on tool
function updateCanvasCursor(tool) {
    if (!dependencies.updateCanvasCursor) return;

    try {
        let cursor = 'default';
        
        switch (tool) {
            case 'select':
                cursor = 'default';
                break;
            case 'pen':
                cursor = 'crosshair';
                break;
            case 'rectangle':
            case 'circle':
            case 'triangle':
            case 'diamond':
            case 'ellipse':
            case 'star':
                cursor = 'crosshair';
                break;
            case 'line':
                cursor = 'crosshair';
                break;
            case 'text':
            case 'stickynote':
                cursor = 'text';
                break;
            default:
                cursor = 'default';
        }

        dependencies.updateCanvasCursor(cursor);
    } catch (error) {
        console.error('Failed to update canvas cursor:', error);
    }
}

// Update Blazor component with current tool
export function updateBlazorCurrentTool(tool) {
    try {
        if (dependencies.blazorReference && dependencies.blazorReference.invokeMethodAsync) {
            dependencies.blazorReference.invokeMethodAsync('UpdateCurrentTool', tool);
        }
    } catch (error) {
        console.error('Failed to update Blazor current tool:', error);
    }
}

// Set up keyboard event handlers
export function setupKeyboardHandlers() {
    try {
        // Remove existing listeners to prevent duplicates
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);

        // Add new listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        console.log('Keyboard handlers set up');
    } catch (error) {
        console.error('Failed to setup keyboard handlers:', error);
    }
}

// Handle keyboard shortcuts
export function handleKeyDown(event) {
    try {
        // Skip if user is typing in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Track shift key
        if (event.key === 'Shift') {
            window.isShiftHeld = true;
        }

        // Handle keyboard shortcuts
        if (event.ctrlKey || event.metaKey) {
            switch (event.key.toLowerCase()) {
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) {
                        // Ctrl+Shift+Z = Redo
                        if (dependencies.redo) dependencies.redo();
                    } else {
                        // Ctrl+Z = Undo
                        if (dependencies.undo) dependencies.undo();
                    }
                    break;

                case 'y':
                    event.preventDefault();
                    // Ctrl+Y = Redo
                    if (dependencies.redo) dependencies.redo();
                    break;

                case 'c':
                    event.preventDefault();
                    // Ctrl+C = Copy
                    if (dependencies.copySelectedElement) dependencies.copySelectedElement();
                    break;

                case 'v':
                    event.preventDefault();
                    // Ctrl+V = Paste
                    if (dependencies.pasteElement) dependencies.pasteElement();
                    break;

                case 'd':
                    event.preventDefault();
                    // Ctrl+D = Duplicate
                    if (dependencies.duplicateSelectedElement) dependencies.duplicateSelectedElement();
                    break;
            }
        } else {
            // Non-Ctrl shortcuts
            switch (event.key) {
                case 'Delete':
                case 'Backspace':
                    event.preventDefault();
                    if (dependencies.deleteSelectedElement) dependencies.deleteSelectedElement();
                    break;

                case ' ':
                    event.preventDefault();
                    // Spacebar - temporarily switch to pan tool (handled in viewport-manager)
                    break;

                case 'Escape':
                    event.preventDefault();
                    // Escape - switch to select tool
                    setCurrentTool('select');
                    break;

                // Tool shortcuts
                case '1':
                    event.preventDefault();
                    setCurrentTool('select');
                    break;
                case '2':
                    event.preventDefault();
                    setCurrentTool('pen');
                    break;
                case '3':
                    event.preventDefault();
                    setCurrentTool('rectangle');
                    break;
                case '4':
                    event.preventDefault();
                    setCurrentTool('circle');
                    break;
                case '5':
                    event.preventDefault();
                    setCurrentTool('line');
                    break;
                case '6':
                    event.preventDefault();
                    setCurrentTool('text');
                    break;
                case '7':
                    event.preventDefault();
                    setCurrentTool('stickynote');
                    break;
            }
        }

        // Zoom controls (without Ctrl/Cmd)
        if (!event.ctrlKey && !event.metaKey) {
            switch (event.key) {
                case '-':
                case '_':
                    event.preventDefault();
                    if (dependencies.zoomOut) {
                        dependencies.zoomOut();
                    }
                    break;
                case '+':
                case '=':
                    event.preventDefault();
                    if (dependencies.zoomIn) {
                        dependencies.zoomIn();
                    }
                    break;
                case '0':
                    event.preventDefault();
                    if (dependencies.resetZoom) {
                        dependencies.resetZoom();
                    }
                    break;
            }
        }
    } catch (error) {
        console.error('Error in handleKeyDown:', error);
    }
}

// Handle key releases
export function handleKeyUp(event) {
    try {
        // Track shift key
        if (event.key === 'Shift') {
            window.isShiftHeld = false;
        }

        // Handle spacebar release (pan tool)
        if (event.key === ' ') {
            // This would be handled by viewport-manager
        }
    } catch (error) {
        console.error('Error in handleKeyUp:', error);
    }
}

// Shape creation functions
export function startShape(shapeType, x, y) {
    try {
        if (!dependencies.tempCtx) return false;

        isDrawingShape = true;
        dependencies.startX = x;
        dependencies.startY = y;

        // console.log(`Started drawing ${shapeType} at (${x}, ${y})`);
        return true;
    } catch (error) {
        console.error('Failed to start shape:', error);
        return false;
    }
}

export function updateShape(shapeType, startX, startY, currentX, currentY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) {
            console.log('Missing temp canvas dependencies');
            return;
        }

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);
        
        // Save context state
        dependencies.tempCtx.save();

        // Apply viewport transformation to temp canvas
        // Get viewport values directly from viewport manager 
        const viewportInfo = dependencies.getViewportInfo ? dependencies.getViewportInfo() : { viewportX: 0, viewportY: 0, zoomLevel: 1 };
        dependencies.tempCtx.translate(-viewportInfo.viewportX, -viewportInfo.viewportY);
        dependencies.tempCtx.scale(viewportInfo.zoomLevel, viewportInfo.zoomLevel);

        // Set drawing style
        dependencies.tempCtx.strokeStyle = '#000000';
        dependencies.tempCtx.lineWidth = 2;
        dependencies.tempCtx.fillStyle = 'transparent';

        // Calculate dimensions
        const width = currentX - startX;
        const height = currentY - startY;

        // Draw shape preview
        dependencies.tempCtx.beginPath();

        switch (shapeType) {
            case 'rectangle':
                dependencies.tempCtx.strokeRect(startX, startY, width, height);
                break;

            case 'circle':
                const radius = Math.sqrt(width * width + height * height) / 2;
                const centerX = startX + width / 2;
                const centerY = startY + height / 2;
                dependencies.tempCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'triangle':
                dependencies.tempCtx.moveTo(startX + width / 2, startY);
                dependencies.tempCtx.lineTo(startX, startY + height);
                dependencies.tempCtx.lineTo(startX + width, startY + height);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'diamond':
                dependencies.tempCtx.moveTo(startX + width / 2, startY);
                dependencies.tempCtx.lineTo(startX + width, startY + height / 2);
                dependencies.tempCtx.lineTo(startX + width / 2, startY + height);
                dependencies.tempCtx.lineTo(startX, startY + height / 2);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'ellipse':
                const centerXE = startX + width / 2;
                const centerYE = startY + height / 2;
                const radiusX = Math.abs(width) / 2;
                const radiusY = Math.abs(height) / 2;
                dependencies.tempCtx.ellipse(centerXE, centerYE, radiusX, radiusY, 0, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'star':
                drawStar(dependencies.tempCtx, startX + width / 2, startY + height / 2, 5, Math.min(Math.abs(width), Math.abs(height)) / 2, Math.min(Math.abs(width), Math.abs(height)) / 4);
                break;
        }

        // Restore context state
        dependencies.tempCtx.restore();

    } catch (error) {
        console.error('Failed to update shape:', error);
    }
}

export function finishShape() {
    try {
        if (!isDrawingShape) return false;

        isDrawingShape = false;

        // Clear temporary canvas
        if (dependencies.tempCtx && dependencies.tempCanvas) {
            dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);
        }

        // Redraw main canvas
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }

        // console.log('Finished drawing shape');
        return true;
    } catch (error) {
        console.error('Failed to finish shape:', error);
        return false;
    }
}

// Line tool functions
export function startLine(x, y) {
    try {
        isDrawingShape = true;
        dependencies.startX = x;
        dependencies.startY = y;

        // console.log(`Started drawing line at (${x}, ${y})`);
        return true;
    } catch (error) {
        console.error('Failed to start line:', error);
        return false;
    }
}

export function updateLine(startX, startY, currentX, currentY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) return;

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);

        // Save context and apply viewport transformation
        dependencies.tempCtx.save();
        if (dependencies.applyViewportTransform) {
            dependencies.applyViewportTransform();
        }

        // Set drawing style
        dependencies.tempCtx.strokeStyle = '#000000';
        dependencies.tempCtx.lineWidth = 2;

        // Snap to angle if shift is held
        let endX = currentX;
        let endY = currentY;
        
        if (window.isShiftHeld) {
            const snapped = snapLineToAngle(startX, startY, currentX, currentY);
            endX = snapped.x;
            endY = snapped.y;
        }

        // Draw line preview
        dependencies.tempCtx.beginPath();
        dependencies.tempCtx.moveTo(startX, startY);
        dependencies.tempCtx.lineTo(endX, endY);
        dependencies.tempCtx.stroke();

        // Restore context state
        dependencies.tempCtx.restore();

    } catch (error) {
        console.error('Failed to update line:', error);
    }
}

export function finishLine() {
    try {
        if (!isDrawingShape) return false;

        isDrawingShape = false;

        // Clear temporary canvas
        if (dependencies.tempCtx && dependencies.tempCanvas) {
            dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);
        }

        // Redraw main canvas
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }

        console.log('Finished drawing line');
        return true;
    } catch (error) {
        console.error('Failed to finish line:', error);
        return false;
    }
}

// Snap line to nearest 45-degree angle
export function snapLineToAngle(startX, startY, currentX, currentY) {
    try {
        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate angle in degrees
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Snap to nearest 45 degrees
        const snapAngle = Math.round(angle / 45) * 45;
        const snapRadians = snapAngle * Math.PI / 180;
        
        return {
            x: startX + distance * Math.cos(snapRadians),
            y: startY + distance * Math.sin(snapRadians)
        };
    } catch (error) {
        console.error('Failed to snap line to angle:', error);
        return { x: currentX, y: currentY };
    }
}

// Drawing/pen tool functions
export function startNewPath(x, y) {
    try {
        isDrawing = true;
        currentPath = [{ x, y }];

        console.log(`Started new drawing path at (${x}, ${y})`);
        return true;
    } catch (error) {
        console.error('Failed to start new path:', error);
        return false;
    }
}

export function drawLine(x, y) {
    try {
        if (!isDrawing || !dependencies.ctx) return false;

        // Add point to current path
        currentPath.push({ x, y });

        // Save context and apply viewport transformation for drawing
        dependencies.ctx.save();
        dependencies.applyViewportTransform();

        // Draw line segment
        dependencies.ctx.strokeStyle = '#000000';
        dependencies.ctx.lineWidth = 2;
        dependencies.ctx.lineCap = 'round';
        dependencies.ctx.lineJoin = 'round';

        if (currentPath.length >= 2) {
            const prevPoint = currentPath[currentPath.length - 2];
            dependencies.ctx.beginPath();
            dependencies.ctx.moveTo(prevPoint.x, prevPoint.y);
            dependencies.ctx.lineTo(x, y);
            dependencies.ctx.stroke();
        }

        // Restore canvas transformation
        dependencies.ctx.restore();

        return true;
    } catch (error) {
        console.error('Failed to draw line:', error);
        return false;
    }
}

// Helper function to draw a star shape
function drawStar(ctx, centerX, centerY, points, outerRadius, innerRadius) {
    try {
        ctx.beginPath();
        
        const angle = Math.PI / points;
        let rotation = -Math.PI / 2; // Start at top
        
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = centerX + radius * Math.cos(rotation);
            const y = centerY + radius * Math.sin(rotation);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            rotation += angle;
        }
        
        ctx.closePath();
        ctx.stroke();
    } catch (error) {
        console.error('Failed to draw star:', error);
    }
}

// Utility functions
export function getCurrentTool() {
    return toolManager.getTool();
}

export function getPreviousTool() {
    return toolManager.getPreviousTool();
}

export function isCurrentlyDrawing() {
    return isDrawing;
}

export function isCurrentlyDrawingShape() {
    return isDrawingShape;
}

export function getCurrentPath() {
    return [...currentPath];
}

export function finishDrawing() {
    isDrawing = false;
    currentPath = [];
    console.log('Drawing finished and state reset');
}

export function isShapeTool(tool = null) {
    const checkTool = tool || currentTool;
    const shapeTools = ['rectangle', 'circle', 'triangle', 'diamond', 'ellipse', 'star'];
    return shapeTools.includes(checkTool);
}

// Initialize the module
export function init() {
    initializeToolManager();
    setupKeyboardHandlers();
    console.log('Tool Manager module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
    window.toolManager = toolManager;
    window.setCurrentTool = setCurrentTool;
    window.updateBlazorCurrentTool = updateBlazorCurrentTool;
    window.setupKeyboardHandlers = setupKeyboardHandlers;
    window.handleKeyDown = handleKeyDown;
    window.handleKeyUp = handleKeyUp;
    window.startShape = startShape;
    window.updateShape = updateShape;
    window.finishShape = finishShape;
    window.startLine = startLine;
    window.updateLine = updateLine;
    window.finishLine = finishLine;
    window.snapLineToAngle = snapLineToAngle;
    window.startNewPath = startNewPath;
    window.drawLine = drawLine;
    window.getCurrentTool = getCurrentTool;
    window.getPreviousTool = getPreviousTool;
    window.isCurrentlyDrawing = isCurrentlyDrawing;
    window.isCurrentlyDrawingShape = isCurrentlyDrawingShape;
    window.getCurrentPath = getCurrentPath;
}