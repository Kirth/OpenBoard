// Main Module - ES6 Module Entry Point and Coordinator
// This replaces the original drawing.js as the main entry point
// It imports all modules, sets up dependencies, and coordinates between modules

// Import all modules
import * as canvasManager from './modules/canvas-manager.js';
import * as toolManager from './modules/tool-manager.js';
import * as elementFactory from './modules/element-factory.js';
import * as signalrClient from './modules/signalr-client.js';
import * as viewportManager from './modules/viewport-manager.js';

// Global state variables for coordination
let pendingImagePosition = null;
let shouldSwitchToSelectAfterEditing = false;
let startX = 0, startY = 0;

// Initialize all modules and set up dependencies
export async function initializeApplication() {
    try {
        console.log('Initializing OpenBoard application...');

        // Initialize individual modules
        canvasManager.init();
        toolManager.init();
        elementFactory.init();
        signalrClient.init();
        viewportManager.init();

        // Set up cross-module dependencies
        setupDependencies();

        // Initialize core functionality
        const canvasInitialized = canvasManager.initializeCanvas();
        if (!canvasInitialized) {
            throw new Error('Canvas initialization failed');
        }

        viewportManager.initializeViewport();
        toolManager.initializeToolManager();

        // Set up event handlers
        setupEventHandlers();

        console.log('OpenBoard application initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize application:', error);
        return false;
    }
}

// Set up dependencies between modules
function setupDependencies() {
    // Canvas Manager Dependencies
    canvasManager.setDependencies({
        elements: elementFactory.elements,
        selectedElementId: elementFactory.selectedElementId,
        getElementAtPoint: elementFactory.getElementAtPoint,
        highlightElement: elementFactory.highlightElement,
        clearSelection: elementFactory.clearSelection,
        drawResizeHandles: elementFactory.drawResizeHandles,
        drawLineEndpointHandles: elementFactory.drawLineEndpointHandles,
        drawCollaborativeSelections: elementFactory.drawCollaborativeSelections,
        cursors: signalrClient.cursors,
        editorManager: elementFactory.editorManager,
        minimapCtx: null // Will be set by viewport manager
    });

    // Tool Manager Dependencies
    toolManager.setDependencies({
        canvas: canvasManager.getCanvas(),
        ctx: canvasManager.getContext(),
        tempCanvas: canvasManager.getTempCanvas(),
        tempCtx: canvasManager.getTempContext(),
        updateCanvasCursor: canvasManager.updateCanvasCursor,
        screenToWorld: canvasManager.screenToWorld,
        worldToScreen: canvasManager.worldToScreen,
        applyViewportTransform: canvasManager.applyViewportTransform,
        resetCanvasTransform: canvasManager.resetCanvasTransform,
        redrawCanvas: canvasManager.redrawCanvas,
        clearCanvas: canvasManager.clearCanvas,
        blazorReference: null, // Will be set by Blazor
        elements: elementFactory.elements,
        selectedElementId: elementFactory.selectedElementId,
        createShapeElement: elementFactory.createShapeElement,
        createLineElement: elementFactory.createLineElement,
        sendElement: signalrClient.sendElement,
        sendDrawingPath: signalrClient.sendDrawingPath,
        deleteSelectedElement: elementFactory.deleteSelectedElement,
        copySelectedElement: elementFactory.copySelectedElement,
        pasteElement: elementFactory.pasteElement,
        duplicateSelectedElement: elementFactory.duplicateSelectedElement,
        undo: elementFactory.undo,
        redo: elementFactory.redo,
        currentBoardId: null, // Will be set by SignalR
        startX: 0,
        startY: 0
    });

    // Element Factory Dependencies
    elementFactory.setDependencies({
        canvas: canvasManager.getCanvas(),
        ctx: canvasManager.getContext(),
        tempCanvas: canvasManager.getTempCanvas(),
        tempCtx: canvasManager.getTempContext(),
        viewportX: viewportManager.viewportX,
        viewportY: viewportManager.viewportY,
        zoomLevel: viewportManager.zoomLevel,
        screenToWorld: canvasManager.screenToWorld,
        worldToScreen: canvasManager.worldToScreen,
        redrawCanvas: canvasManager.redrawCanvas,
        signalRConnection: signalrClient.getConnection(),
        currentBoardId: signalrClient.getCurrentBoardId(),
        sendElement: signalrClient.sendElement,
        sendElementMove: signalrClient.sendElementMove,
        sendElementSelect: signalrClient.sendElementSelect,
        sendElementDeselect: signalrClient.sendElementDeselect,
        sendElementResize: signalrClient.sendElementResize,
        updateStickyNoteContent: signalrClient.updateStickyNoteContent,
        updateTextElementContent: signalrClient.updateTextElementContent,
        blazorReference: null, // Will be set by Blazor
        showNotification: showNotification
    });

    // SignalR Client Dependencies
    signalrClient.setDependencies({
        elements: elementFactory.elements,
        selectedElementId: elementFactory.selectedElementId,
        drawElement: elementFactory.drawElement,
        updateElementPosition: elementFactory.updateElementPosition,
        redrawCanvas: canvasManager.redrawCanvas,
        clearCanvas: canvasManager.clearCanvas,
        highlightElement: elementFactory.highlightElement,
        clearSelection: elementFactory.clearSelection,
        showElementSelection: elementFactory.showElementSelection,
        hideElementSelection: elementFactory.hideElementSelection,
        updateMinimapImmediate: viewportManager.updateMinimapImmediate,
        showNotification: showNotification,
        screenToWorld: canvasManager.screenToWorld
    });

    // Viewport Manager Dependencies
    viewportManager.setDependencies({
        canvas: canvasManager.getCanvas(),
        ctx: canvasManager.getContext(),
        elements: elementFactory.elements,
        redrawCanvas: canvasManager.redrawCanvas,
        renderElementToMinimap: canvasManager.renderElementToMinimap,
        applyViewportTransform: canvasManager.applyViewportTransform,
        resetCanvasTransform: canvasManager.resetCanvasTransform,
        updateCanvasCursor: canvasManager.updateCanvasCursor,
        blazorReference: null // Will be set by Blazor
    });

    console.log('Cross-module dependencies configured');
}

// Set up main event handlers
function setupEventHandlers() {
    const canvas = canvasManager.getCanvas();
    if (!canvas) {
        console.error('Canvas not available for event handlers');
        return;
    }

    // Mouse event handlers
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('contextmenu', handleCanvasRightClick);
    canvas.addEventListener('wheel', viewportManager.handleMouseWheel);

    // Window resize handler
    window.addEventListener('resize', () => {
        canvasManager.resizeCanvas();
        viewportManager.updateMinimapImmediate();
    });

    console.log('Event handlers set up');
}

// Main mouse event handlers
function handleMouseDown(event) {
    try {
        event.preventDefault();
        
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldPos = canvasManager.screenToWorld(screenX, screenY);
        
        startX = worldPos.x;
        startY = worldPos.y;

        const currentTool = toolManager.getCurrentTool();
        
        // Handle spacebar panning
        if (event.key === ' ' || currentTool === 'pan') {
            viewportManager.startPan(screenX, screenY);
            return;
        }

        // Handle different tools
        console.log(`Handling mousedown for tool: ${currentTool} at (${worldPos.x}, ${worldPos.y})`);
        switch (currentTool) {
            case 'select':
                handleSelectMouseDown(worldPos.x, worldPos.y);
                break;
            case 'pen':
                console.log('Starting pen drawing...');
                toolManager.startNewPath(worldPos.x, worldPos.y);
                break;
            case 'rectangle':
            case 'circle':
            case 'triangle':
            case 'diamond':
            case 'ellipse':
            case 'star':
                toolManager.startShape(currentTool, worldPos.x, worldPos.y);
                break;
            case 'line':
                toolManager.startLine(worldPos.x, worldPos.y);
                break;
            case 'text':
                createTextAtPosition(worldPos.x, worldPos.y);
                break;
            case 'stickynote':
                createStickyNoteAtPosition(worldPos.x, worldPos.y);
                break;
        }

    } catch (error) {
        console.error('Error in handleMouseDown:', error);
    }
}

function handleMouseMove(event) {
    try {
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldPos = canvasManager.screenToWorld(screenX, screenY);

        // Handle viewport panning
        if (viewportManager.getViewportInfo().isPanning) {
            viewportManager.updatePan(screenX, screenY);
            return;
        }

        const currentTool = toolManager.getCurrentTool();
        
        // Handle tool-specific mouse move
        if (toolManager.isCurrentlyDrawing()) {
            toolManager.drawLine(worldPos.x, worldPos.y);
        } else if (toolManager.isCurrentlyDrawingShape()) {
            if (currentTool === 'line') {
                toolManager.updateLine(startX, startY, worldPos.x, worldPos.y);
            } else if (toolManager.isShapeTool()) {
                toolManager.updateShape(currentTool, startX, startY, worldPos.x, worldPos.y);
            }
        }

        // Send cursor update to other users
        if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
            signalrClient.sendCursorUpdate(signalrClient.getCurrentBoardId(), worldPos.x, worldPos.y);
        }

    } catch (error) {
        console.error('Error in handleMouseMove:', error);
    }
}

function handleMouseUp(event) {
    try {
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldPos = canvasManager.screenToWorld(screenX, screenY);

        // Handle viewport panning
        if (viewportManager.getViewportInfo().isPanning) {
            viewportManager.endPan();
            return;
        }

        const currentTool = toolManager.getCurrentTool();

        // Handle tool completion
        if (toolManager.isCurrentlyDrawing()) {
            // Finish pen/drawing tool
            const path = toolManager.getCurrentPath();
            if (path.length > 1) {
                const element = elementFactory.createPathElement(path);
                if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
                    signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
                }
            }
            // Reset drawing state in tool manager would be needed here
        } else if (toolManager.isCurrentlyDrawingShape()) {
            // Finish shape
            let element = null;
            
            if (currentTool === 'line') {
                element = elementFactory.createLineElement(startX, startY, worldPos.x, worldPos.y);
                toolManager.finishLine();
            } else if (toolManager.isShapeTool()) {
                element = elementFactory.createShapeElement(currentTool, startX, startY, worldPos.x, worldPos.y);
                toolManager.finishShape();
            }
            
            if (element && signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
                signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
            }
        }

    } catch (error) {
        console.error('Error in handleMouseUp:', error);
    }
}

function handleCanvasDoubleClick(event) {
    try {
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldPos = canvasManager.screenToWorld(screenX, screenY);

        const element = elementFactory.getElementAtPoint(worldPos.x, worldPos.y);
        
        if (element && (element.type === 'StickyNote' || element.type === 'Text')) {
            if (element.type === 'StickyNote') {
                elementFactory.startEditingStickyNote(element.id, element);
            } else if (element.type === 'Text') {
                elementFactory.startEditingTextElement(element.id, element);
            }
        }

    } catch (error) {
        console.error('Error in handleCanvasDoubleClick:', error);
    }
}

function handleCanvasRightClick(event) {
    try {
        event.preventDefault();
        const rect = event.target.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        
        showContextMenu(screenX, screenY);
        
    } catch (error) {
        console.error('Error in handleCanvasRightClick:', error);
    }
}

// Helper functions
function handleSelectMouseDown(x, y) {
    const element = elementFactory.getElementAtPoint(x, y);
    
    if (element) {
        elementFactory.highlightElement(element.id);
        // Start dragging logic would go here
    } else {
        elementFactory.clearSelection();
    }
}

function createTextAtPosition(x, y) {
    const element = elementFactory.createTextElement(x, y);
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
    }
    elementFactory.startEditingTextElement(element.id, element);
}

function createStickyNoteAtPosition(x, y) {
    const element = elementFactory.createStickyNote(x, y);
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
    }
    elementFactory.startEditingStickyNote(element.id, element);
}

// Utility functions
function showContextMenu(x, y) {
    console.log(`Context menu requested at (${x}, ${y})`);
    // Context menu implementation
}

function hideContextMenu() {
    console.log('Hide context menu');
}

function showNotification(message, type = 'info') {
    console.log(`Notification [${type}]: ${message}`);
    // This could be enhanced to show actual notifications
}

function triggerImageUpload(x, y) {
    pendingImagePosition = { x, y };
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
        imageInput.click();
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && pendingImagePosition) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const element = elementFactory.createImageElement(
                pendingImagePosition.x, 
                pendingImagePosition.y, 
                e.target.result
            );
            
            if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
                signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
            }
            
            pendingImagePosition = null;
        };
        reader.readAsDataURL(file);
    }
}

// Blazor integration functions
export function setBlazorReference(dotNetRef) {
    // Set global reference for easy access
    if (typeof window !== 'undefined') {
        window.blazorReference = dotNetRef;
    }
    
    signalrClient.setBlazorReference(dotNetRef);
    
    // Update dependencies that need Blazor reference
    const blazorRef = dotNetRef;
    
    toolManager.setDependencies({ blazorReference: blazorRef });
    elementFactory.setDependencies({ blazorReference: blazorRef });
    viewportManager.setDependencies({ blazorReference: blazorRef });
    
    console.log('Blazor reference set across all modules');
}

export function initializeSignalRConnection(boardId) {
    return signalrClient.initializeSignalR(boardId);
}

export function clearCanvasFromBlazor() {
    elementFactory.elements.clear();
    elementFactory.clearSelection();
    canvasManager.redrawCanvas();
    viewportManager.updateMinimapImmediate();
    
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        signalrClient.sendBoardCleared(signalrClient.getCurrentBoardId());
    }
}

// Tool functions for Blazor
export function setCurrentTool(tool) {
    return toolManager.setCurrentTool(tool);
}

export function updateCurrentTool(tool) {
    return toolManager.updateBlazorCurrentTool(tool);
}

// Main initialization for window/global access
export function init() {
    return initializeApplication();
}

// Backward compatibility - expose main functions to window
if (typeof window !== 'undefined') {
    // Main functions
    window.initializeApplication = initializeApplication;
    window.initializeCanvas = () => canvasManager.initializeCanvas();
    window.initializeSignalR = initializeSignalRConnection;
    window.setBlazorReference = setBlazorReference;
    window.clearCanvasFromBlazor = clearCanvasFromBlazor;
    window.setCurrentTool = setCurrentTool;
    
    // Utility functions
    window.showContextMenu = showContextMenu;
    window.hideContextMenu = hideContextMenu;
    window.showNotification = showNotification;
    window.triggerImageUpload = triggerImageUpload;
    window.handleImageUpload = handleImageUpload;
    
    // Export module references for debugging
    window.modules = {
        canvasManager,
        toolManager,
        elementFactory,
        signalrClient,
        viewportManager
    };
}

console.log('Main drawing application module loaded');