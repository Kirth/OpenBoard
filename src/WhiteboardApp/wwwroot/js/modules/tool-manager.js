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

// Spacebar tracking for temporary hand tool
let isSpacebarHeld = false;
let toolBeforeSpacebar = null;

// Hand tool state management for dual-mode behavior
const handToolState = {
    mode: null, // 'panning' | 'selecting' | null
    startPoint: null,
    isActive: false
};

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
        this.isTemporaryHandMode = false;
        this.toolBeforeTemporaryHand = null;
        this.availableTools = [
            'select', 'hand', 'pen', 'rectangle', 'circle', 'line', 
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

    // Check if current tool is hand tool
    isHandTool() {
        return this.currentTool === 'hand';
    }

    // Check if current tool allows panning
    allowsPanning() {
        return this.currentTool === 'hand';
    }

    // Temporarily switch to hand tool (e.g., when spacebar is pressed)
    enableTemporaryHand() {
        if (this.isTemporaryHandMode || this.currentTool === 'hand') {
            return false; // Already in hand mode
        }
        
        this.toolBeforeTemporaryHand = this.currentTool;
        this.isTemporaryHandMode = true;
        this.setTool('hand');
        return true;
    }

    // Return from temporary hand tool mode
    disableTemporaryHand() {
        if (!this.isTemporaryHandMode) {
            return false; // Not in temporary mode
        }
        
        this.isTemporaryHandMode = false;
        const previousTool = this.toolBeforeTemporaryHand;
        this.toolBeforeTemporaryHand = null;
        
        if (previousTool && this.isValidTool(previousTool)) {
            this.setTool(previousTool);
            return true;
        }
        return false;
    }

    // Check if currently in temporary hand mode
    isInTemporaryHandMode() {
        return this.isTemporaryHandMode;
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
            case 'hand':
                cursor = 'grab';
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

// Handle delete key press for single or group deletion
function handleDeleteKey() {
    try {
        // First check if we can access selected element IDs from interaction manager
        let selectedIds = new Set();
        
        // Try to get selected IDs from the global function if available
        if (typeof window !== 'undefined' && window.getSelectedElementIds) {
            selectedIds = window.getSelectedElementIds();
        }
        
        if (selectedIds.size > 1) {
            // Group deletion - use the dedicated multi-element deletion function
            console.log(`Deleting ${selectedIds.size} selected elements`);
            
            if (dependencies.elementFactory && dependencies.elementFactory.deleteMultipleElements) {
                const deletedIds = dependencies.elementFactory.deleteMultipleElements(selectedIds);
                console.log(`Successfully initiated deletion of ${deletedIds.length} elements`);
                
                // Clear multi-selection after deletion
                selectedIds.clear();
                
                // Clear global multi-selection and broadcast the change
                if (typeof window !== 'undefined' && window.getSelectedElementIds) {
                    const globalSelectedIds = window.getSelectedElementIds();
                    globalSelectedIds.clear();
                    
                    // Broadcast clear selection to other clients
                    if (dependencies.signalrClient && dependencies.currentBoardId) {
                        dependencies.signalrClient.sendSelectionClear(dependencies.currentBoardId);
                    }
                }
            } else {
                console.error('deleteMultipleElements function not available in elementFactory');
                // Fallback to single element deletion
                if (dependencies.deleteSelectedElement) {
                    dependencies.deleteSelectedElement();
                }
            }
        } else if (selectedIds.size === 1) {
            // Single element deletion - use existing function
            if (dependencies.deleteSelectedElement) {
                dependencies.deleteSelectedElement();
            }
        } else {
            // Fallback to existing single element deletion
            if (dependencies.deleteSelectedElement) {
                dependencies.deleteSelectedElement();
            }
        }
    } catch (error) {
        console.error('Error handling delete key:', error);
    }
}

// Handle arrow key movement (nudging) for selected elements
function handleArrowKeyMovement(deltaX, deltaY) {
    try {
        // Use the global moveSelectedElements function from element-factory
        if (typeof window !== 'undefined' && window.moveSelectedElements) {
            window.moveSelectedElements(deltaX, deltaY);
        } else {
            console.warn('moveSelectedElements function not available');
        }
    } catch (error) {
        console.error('Error handling arrow key movement:', error);
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

                case 'l':
                    event.preventDefault();
                    // Ctrl+L = Toggle lock
                    if (window.toggleElementLockAction && dependencies.selectedElementId) {
                        window.toggleElementLockAction(dependencies.selectedElementId);
                    }
                    break;

                case 'g':
                    event.preventDefault();
                    // Ctrl+G = Toggle grid
                    if (window.toggleGrid) {
                        window.toggleGrid();
                    }
                    break;

                case 'h':
                    event.preventDefault();
                    // Ctrl+H = Toggle snap to grid
                    if (window.toggleSnapToGrid) {
                        window.toggleSnapToGrid();
                    }
                    break;
            }
        } else {
            // Non-Ctrl shortcuts
            switch (event.key) {
                case 'Delete':
                case 'Backspace':
                    event.preventDefault();
                    handleDeleteKey();
                    break;

                case ' ':
                    event.preventDefault();
                    // Spacebar - temporarily switch to hand tool for panning
                    if (!isSpacebarHeld) {
                        isSpacebarHeld = true;
                        toolManager.enableTemporaryHand();
                    }
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
                
                // Arrow key movement (nudging)
                case 'ArrowUp':
                    event.preventDefault();
                    handleArrowKeyMovement(0, event.shiftKey ? -25 : -1);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    handleArrowKeyMovement(0, event.shiftKey ? 25 : 1);
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    handleArrowKeyMovement(event.shiftKey ? -25 : -1, 0);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    handleArrowKeyMovement(event.shiftKey ? 25 : 1, 0);
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

        // Handle spacebar release (return from temporary hand tool)
        if (event.key === ' ') {
            if (isSpacebarHeld) {
                isSpacebarHeld = false;
                toolManager.disableTemporaryHand();
            }
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

// Screen coordinate version - eliminates double conversion
export function updateShapeScreen(shapeType, startScreenX, startScreenY, currentScreenX, currentScreenY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) {
            console.log('Missing temp canvas dependencies');
            return;
        }

        // DEBUG: Log preview coordinates 
        console.log(`[PREVIEW-SCREEN] ${shapeType} start:(${startScreenX.toFixed(1)},${startScreenY.toFixed(1)}) current:(${currentScreenX.toFixed(1)},${currentScreenY.toFixed(1)})`);

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);
        
        // Set drawing style - no transforms needed since we're drawing in screen space
        let strokeColor = '#000000';
        // Apply dark mode color inversion for preview
        if (typeof window !== 'undefined' && window.invertBlackToWhite) {
            strokeColor = window.invertBlackToWhite(strokeColor);
        }
        dependencies.tempCtx.strokeStyle = strokeColor;
        dependencies.tempCtx.lineWidth = 2;
        dependencies.tempCtx.fillStyle = 'transparent';

        // Calculate dimensions in screen space
        const width = currentScreenX - startScreenX;
        const height = currentScreenY - startScreenY;

        // Draw shape preview in screen coordinates
        dependencies.tempCtx.beginPath();

        switch (shapeType) {
            case 'rectangle':
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, width, height);
                break;

            case 'circle':
                const radius = Math.sqrt(width * width + height * height) / 2;
                const centerX = startScreenX + width / 2;
                const centerY = startScreenY + height / 2;
                dependencies.tempCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'triangle':
                dependencies.tempCtx.moveTo(startScreenX + width / 2, startScreenY);
                dependencies.tempCtx.lineTo(startScreenX, startScreenY + height);
                dependencies.tempCtx.lineTo(startScreenX + width, startScreenY + height);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'diamond':
                dependencies.tempCtx.moveTo(startScreenX + width / 2, startScreenY);
                dependencies.tempCtx.lineTo(startScreenX + width, startScreenY + height / 2);
                dependencies.tempCtx.lineTo(startScreenX + width / 2, startScreenY + height);
                dependencies.tempCtx.lineTo(startScreenX, startScreenY + height / 2);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'ellipse':
                const centerXE = startScreenX + width / 2;
                const centerYE = startScreenY + height / 2;
                const radiusX = Math.abs(width) / 2;
                const radiusY = Math.abs(height) / 2;
                dependencies.tempCtx.ellipse(centerXE, centerYE, radiusX, radiusY, 0, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'star':
                drawStar(dependencies.tempCtx, startScreenX + width / 2, startScreenY + height / 2, 5, Math.min(Math.abs(width), Math.abs(height)) / 2, Math.min(Math.abs(width), Math.abs(height)) / 4);
                break;

            // Flowchart shapes
            case 'process':
                const cornerRadius = Math.min(Math.abs(width), Math.abs(height)) * 0.1;
                dependencies.tempCtx.roundRect(startScreenX, startScreenY, width, height, cornerRadius);
                dependencies.tempCtx.stroke();
                break;

            case 'decision':
                dependencies.tempCtx.moveTo(startScreenX + width / 2, startScreenY);
                dependencies.tempCtx.lineTo(startScreenX + width, startScreenY + height / 2);
                dependencies.tempCtx.lineTo(startScreenX + width / 2, startScreenY + height);
                dependencies.tempCtx.lineTo(startScreenX, startScreenY + height / 2);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'startend':
                const centerXS = startScreenX + width / 2;
                const centerYS = startScreenY + height / 2;
                const radiusXS = Math.abs(width) / 2;
                const radiusYS = Math.abs(height) / 2;
                dependencies.tempCtx.ellipse(centerXS, centerYS, radiusXS, radiusYS, 0, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'database':
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, width, height);
                break;

            case 'document':
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, width, height);
                break;

            // UML shapes
            case 'class':
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, width, height);
                // Draw class compartment lines
                dependencies.tempCtx.moveTo(startScreenX, startScreenY + height / 3);
                dependencies.tempCtx.lineTo(startScreenX + width, startScreenY + height / 3);
                dependencies.tempCtx.moveTo(startScreenX, startScreenY + 2 * height / 3);
                dependencies.tempCtx.lineTo(startScreenX + width, startScreenY + 2 * height / 3);
                dependencies.tempCtx.stroke();
                break;

            case 'actor':
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, width, height);
                break;

            case 'package':
                const tabWidth = width * 0.3;
                const tabHeight = height * 0.2;
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY, tabWidth, tabHeight);
                dependencies.tempCtx.strokeRect(startScreenX, startScreenY + tabHeight, width, height - tabHeight);
                break;
        }

    } catch (error) {
        console.error('Failed to update shape screen:', error);
    }
}

export function updateShape(shapeType, startX, startY, currentX, currentY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) {
            console.log('Missing temp canvas dependencies');
            return;
        }

        // DEBUG: Log preview coordinates and viewport state
        const vx = dependencies.getViewportX ? dependencies.getViewportX() : 0;
        const vy = dependencies.getViewportY ? dependencies.getViewportY() : 0;
        const z = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;
        console.log(`[PREVIEW] ${shapeType} start:(${startX.toFixed(1)},${startY.toFixed(1)}) current:(${currentX.toFixed(1)},${currentY.toFixed(1)}) viewport:(${vx.toFixed(1)},${vy.toFixed(1)}) zoom:${(z*100).toFixed(0)}%`);

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);
        
        // Convert world coordinates to screen coordinates using the same coordinate system as final placement
        const startScreen = dependencies.worldToScreen ? dependencies.worldToScreen(startX, startY) : { x: startX, y: startY };
        const currentScreen = dependencies.worldToScreen ? dependencies.worldToScreen(currentX, currentY) : { x: currentX, y: currentY };
        
        // Set drawing style - no transforms needed since we're drawing in screen space
        dependencies.tempCtx.strokeStyle = '#000000';
        dependencies.tempCtx.lineWidth = 2;
        dependencies.tempCtx.fillStyle = 'transparent';

        // Calculate dimensions in screen space
        const width = currentScreen.x - startScreen.x;
        const height = currentScreen.y - startScreen.y;

        // Draw shape preview in screen coordinates
        dependencies.tempCtx.beginPath();

        switch (shapeType) {
            case 'rectangle':
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, width, height);
                break;

            case 'circle':
                const radius = Math.sqrt(width * width + height * height) / 2;
                const centerX = startScreen.x + width / 2;
                const centerY = startScreen.y + height / 2;
                dependencies.tempCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'triangle':
                dependencies.tempCtx.moveTo(startScreen.x + width / 2, startScreen.y);
                dependencies.tempCtx.lineTo(startScreen.x, startScreen.y + height);
                dependencies.tempCtx.lineTo(startScreen.x + width, startScreen.y + height);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'diamond':
                dependencies.tempCtx.moveTo(startScreen.x + width / 2, startScreen.y);
                dependencies.tempCtx.lineTo(startScreen.x + width, startScreen.y + height / 2);
                dependencies.tempCtx.lineTo(startScreen.x + width / 2, startScreen.y + height);
                dependencies.tempCtx.lineTo(startScreen.x, startScreen.y + height / 2);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'ellipse':
                const centerXE = startScreen.x + width / 2;
                const centerYE = startScreen.y + height / 2;
                const radiusX = Math.abs(width) / 2;
                const radiusY = Math.abs(height) / 2;
                dependencies.tempCtx.ellipse(centerXE, centerYE, radiusX, radiusY, 0, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'star':
                drawStar(dependencies.tempCtx, startScreen.x + width / 2, startScreen.y + height / 2, 5, Math.min(Math.abs(width), Math.abs(height)) / 2, Math.min(Math.abs(width), Math.abs(height)) / 4);
                break;

            // Flowchart shapes
            case 'process':
                const cornerRadius = Math.min(Math.abs(width), Math.abs(height)) * 0.1;
                dependencies.tempCtx.roundRect(startScreen.x, startScreen.y, width, height, cornerRadius);
                dependencies.tempCtx.stroke();
                break;

            case 'decision':
                dependencies.tempCtx.moveTo(startScreen.x + width / 2, startScreen.y);
                dependencies.tempCtx.lineTo(startScreen.x + width, startScreen.y + height / 2);
                dependencies.tempCtx.lineTo(startScreen.x + width / 2, startScreen.y + height);
                dependencies.tempCtx.lineTo(startScreen.x, startScreen.y + height / 2);
                dependencies.tempCtx.closePath();
                dependencies.tempCtx.stroke();
                break;

            case 'startend':
                const centerXS = startScreen.x + width / 2;
                const centerYS = startScreen.y + height / 2;
                const radiusXS = Math.abs(width) / 2;
                const radiusYS = Math.abs(height) / 2;
                dependencies.tempCtx.ellipse(centerXS, centerYS, radiusXS, radiusYS, 0, 0, 2 * Math.PI);
                dependencies.tempCtx.stroke();
                break;

            case 'database':
                // Simple preview - just draw rectangle for now
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, width, height);
                break;

            case 'document':
                // Simple preview - just draw rectangle for now
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, width, height);
                break;

            // UML shapes
            case 'class':
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, width, height);
                // Draw class compartment lines
                dependencies.tempCtx.moveTo(startScreen.x, startScreen.y + height / 3);
                dependencies.tempCtx.lineTo(startScreen.x + width, startScreen.y + height / 3);
                dependencies.tempCtx.moveTo(startScreen.x, startScreen.y + 2 * height / 3);
                dependencies.tempCtx.lineTo(startScreen.x + width, startScreen.y + 2 * height / 3);
                dependencies.tempCtx.stroke();
                break;

            case 'actor':
                // Simple preview - draw stick figure outline
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, width, height);
                break;

            case 'package':
                // Tab
                const tabWidth = width * 0.3;
                const tabHeight = height * 0.2;
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y, tabWidth, tabHeight);
                // Main body
                dependencies.tempCtx.strokeRect(startScreen.x, startScreen.y + tabHeight, width, height - tabHeight);
                break;
        }

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

// Screen coordinate version - eliminates double conversion  
export function updateLineScreen(startScreenX, startScreenY, currentScreenX, currentScreenY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) {
            console.warn('Missing temp canvas context for line update');
            return;
        }

        // DEBUG: Log preview coordinates
        console.log(`[PREVIEW-LINE-SCREEN] start:(${startScreenX.toFixed(1)},${startScreenY.toFixed(1)}) current:(${currentScreenX.toFixed(1)},${currentScreenY.toFixed(1)})`);

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);

        // Handle shift-key snapping in screen space
        let endScreenX = currentScreenX;
        let endScreenY = currentScreenY;
        
        if (window.isShiftHeld) {
            // Calculate snapping in screen space to avoid coordinate conversion
            const dx = currentScreenX - startScreenX;
            const dy = currentScreenY - startScreenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate angle in degrees
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            // Snap to nearest 45 degrees
            const snapAngle = Math.round(angle / 45) * 45;
            const snapRadians = snapAngle * Math.PI / 180;
            
            endScreenX = startScreenX + distance * Math.cos(snapRadians);
            endScreenY = startScreenY + distance * Math.sin(snapRadians);
        }

        // Set drawing style - no transforms needed since we're drawing in screen space
        let strokeColor = '#000000';
        // Apply dark mode color inversion for preview
        if (typeof window !== 'undefined' && window.invertBlackToWhite) {
            strokeColor = window.invertBlackToWhite(strokeColor);
        }
        dependencies.tempCtx.strokeStyle = strokeColor;
        dependencies.tempCtx.lineWidth = 2;

        // Draw line preview in screen coordinates
        dependencies.tempCtx.beginPath();
        dependencies.tempCtx.moveTo(startScreenX, startScreenY);
        dependencies.tempCtx.lineTo(endScreenX, endScreenY);
        dependencies.tempCtx.stroke();

    } catch (error) {
        console.error('Failed to update line screen:', error);
    }
}

export function updateLine(startX, startY, currentX, currentY) {
    try {
        if (!dependencies.tempCtx || !dependencies.tempCanvas) {
            console.warn('Missing temp canvas context for line update');
            return;
        }

        // Clear temporary canvas
        dependencies.tempCtx.clearRect(0, 0, dependencies.tempCanvas.width, dependencies.tempCanvas.height);

        // Snap to angle if shift is held (in world coordinates)
        let endX = currentX;
        let endY = currentY;
        
        if (window.isShiftHeld) {
            const snapped = snapLineToAngle(startX, startY, currentX, currentY);
            endX = snapped.x;
            endY = snapped.y;
        }

        // Convert world coordinates to screen coordinates using the same coordinate system as final placement
        const startScreen = dependencies.worldToScreen ? dependencies.worldToScreen(startX, startY) : { x: startX, y: startY };
        const endScreen = dependencies.worldToScreen ? dependencies.worldToScreen(endX, endY) : { x: endX, y: endY };

        // Set drawing style - no transforms needed since we're drawing in screen space
        dependencies.tempCtx.strokeStyle = '#000000';
        dependencies.tempCtx.lineWidth = 2;

        // Draw line preview in screen coordinates
        dependencies.tempCtx.beginPath();
        dependencies.tempCtx.moveTo(startScreen.x, startScreen.y);
        dependencies.tempCtx.lineTo(endScreen.x, endScreen.y);
        dependencies.tempCtx.stroke();

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
        let strokeColor = '#000000';
        // Apply dark mode color inversion for pen drawing
        if (typeof window !== 'undefined' && window.invertBlackToWhite) {
            strokeColor = window.invertBlackToWhite(strokeColor);
        }
        dependencies.ctx.strokeStyle = strokeColor;
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
    console.log('Tool Manager module loaded');
}

// Hand tool state management functions
export function getHandToolState() {
    return { ...handToolState };
}

export function setHandToolMode(mode) {
    handToolState.mode = mode;
}

export function setHandToolStartPoint(point) {
    handToolState.startPoint = point;
}

export function clearHandToolState() {
    handToolState.mode = null;
    handToolState.startPoint = null;
    handToolState.isActive = false;
}

export function setHandToolActive(active) {
    handToolState.isActive = active;
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
    window.updateShapeScreen = updateShapeScreen;
    window.finishShape = finishShape;
    window.startLine = startLine;
    window.updateLine = updateLine;
    window.updateLineScreen = updateLineScreen;
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