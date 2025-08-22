// Main Module - ES6 Module Entry Point and Coordinator
// This replaces the original drawing.js as the main entry point
// It imports all modules, sets up dependencies, and coordinates between modules

// Import all modules
import * as canvasManager from './modules/canvas-manager.js';
import * as toolManager from './modules/tool-manager.js';
import * as elementFactory from './modules/element-factory.js';
import * as signalrClient from './modules/signalr-client.js';
import * as viewportManager from './modules/viewport-manager.js';


console.log('[main] canvasManager keys:', Object.keys(canvasManager));

// Global state variables for coordination
let pendingImagePosition = null;
let shouldSwitchToSelectAfterEditing = false;
let startX = 0, startY = 0;

// Dragging state
let isDragging = false;
let draggedElementId = null;
let dragStartX = 0, dragStartY = 0;
let elementStartX = 0, elementStartY = 0;

// Multi-select state
let selectedElementIds = new Set();

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

    // Initialize core functionality first
    const canvasInitialized = canvasManager.initializeCanvas();
    if (!canvasInitialized) {
      throw new Error('Canvas initialization failed');
    }

    viewportManager.initializeViewport();
    toolManager.initializeToolManager();

    // Set up cross-module dependencies after initialization
    setupDependencies();

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
    getSelectedElementId: elementFactory.getSelectedElementId,
    getElementAtPoint: elementFactory.getElementAtPoint,
    highlightElement: elementFactory.highlightElement,
    clearSelection: elementFactory.clearSelection,
    drawResizeHandles: elementFactory.drawResizeHandles,
    drawLineEndpointHandles: elementFactory.drawLineEndpointHandles,
    drawCollaborativeSelections: elementFactory.drawCollaborativeSelections,
    cursors: signalrClient.cursors,
    editorManager: elementFactory.editorManager,
    minimapCtx: null, // Will be set by viewport manager
    getViewportX: viewportManager.getViewportX,
    getViewportY: viewportManager.getViewportY,
    getZoomLevel: viewportManager.getZoomLevel
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
    getViewportInfo: viewportManager.getViewportInfo,
    zoomIn: () => viewportManager.zoomAtCenter(1.1),
    zoomOut: () => viewportManager.zoomAtCenter(1 / 1.1),
    resetZoom: viewportManager.resetZoom,
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

  // Element Factory Dependencies - FIXED: Use live getters instead of stale snapshots
  elementFactory.setDependencies({
    canvas: canvasManager.getCanvas(),
    ctx: canvasManager.getContext(),
    tempCanvas: canvasManager.getTempCanvas(),
    tempCtx: canvasManager.getTempContext(),
    getViewportX: viewportManager.getViewportX,
    getViewportY: viewportManager.getViewportY,
    getZoomLevel: viewportManager.getZoomLevel,
    // Keep the stale values as fallbacks for backward compatibility
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
    updateElementPositionLocal: elementFactory.updateElementPositionLocal,
    redrawCanvas: canvasManager.redrawCanvas,
    clearCanvas: canvasManager.clearCanvas,
    highlightElement: elementFactory.highlightElement,
    clearSelection: elementFactory.clearSelection,
    showElementSelection: elementFactory.showElementSelection,
    hideElementSelection: elementFactory.hideElementSelection,
    updateMinimapImmediate: viewportManager.updateMinimapImmediate,
    showNotification: showNotification,
    screenToWorld: canvasManager.screenToWorld,
    editorManager: elementFactory.editorManager
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
  canvas.addEventListener('wheel', viewportManager.handleMouseWheel, { passive: false });

  // Window resize handler with throttling
  let resizeTimeout;
  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      console.log('Window resized, updating canvas and viewport');
      canvasManager.resizeCanvas();
      viewportManager.updateMinimapImmediate();

      // Redraw canvas to ensure elements are visible
      canvasManager.redrawCanvas();
    }, 100);
  };

  window.addEventListener('resize', handleResize);

  // Handle fullscreen changes specifically
  document.addEventListener('fullscreenchange', () => {
    console.log('Fullscreen state changed');
    setTimeout(() => {
      handleResize();
    }, 200); // Give extra time for fullscreen transition
  });

  console.log('Event handlers set up');
}

// Main mouse event handlers
function handleMouseDown(event) {
  try {
    event.preventDefault();

    // Check if this is a right-click
    if (event.button === 2) {
      // Right-click - don't handle tool actions, let right-click handler manage this
      return;
    }

    const rect = event.target.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPos = canvasManager.screenToWorld(screenX, screenY);

    // Round-trip sanity check
    // const screenCheck = canvasManager.worldToScreen(worldPos.x, worldPos.y);
    // console.log('[roundtrip] screen->world->screen Δ=', { dx: screenCheck.x - screenX, dy: screenCheck.y - screenY });

    // console.log(`CLICK: screen(${screenX},${screenY}) -> world(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)})`);

    startX = worldPos.x;
    startY = worldPos.y;

    const currentTool = toolManager.getCurrentTool();

    // Handle spacebar panning
    if (event.key === ' ' || currentTool === 'pan') {
      viewportManager.startPan(screenX, screenY);
      return;
    }

    // Handle different tools (only for left-click)
    // console.log(`Handling mousedown for tool: ${currentTool} at (${worldPos.x}, ${worldPos.y})`);
    switch (currentTool) {
      case 'select':
        handleSelectMouseDown(worldPos.x, worldPos.y, event);
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

    // Handle element dragging in select mode
    if (isDragging && draggedElementId && currentTool === 'select') {
      const deltaX = worldPos.x - dragStartX;
      const deltaY = worldPos.y - dragStartY;
      const newX = elementStartX + deltaX;
      const newY = elementStartY + deltaY;

      elementFactory.updateElementPositionLocal(draggedElementId, newX, newY);
      canvasManager.redrawCanvas();
      return;
    }

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

    // Handle dragging completion
    if (isDragging && draggedElementId) {
      // console.log('Finished dragging element:', draggedElementId);

      // Send element move to other clients
      if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        const element = elementFactory.getElementById(draggedElementId);
        if (element) {
          signalrClient.sendElementMove(signalrClient.getCurrentBoardId(), draggedElementId, element.x, element.y);
        }
      }

      // Reset dragging state
      isDragging = false;
      draggedElementId = null;
      return;
    }

    // Handle tool completion
    if (toolManager.isCurrentlyDrawing()) {
      // Finish pen/drawing tool
      const path = toolManager.getCurrentPath();
      if (path.length > 1) {
        const element = elementFactory.createPathElement(path);
        if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
          signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
        }
        
        // Auto-select the newly created drawing and switch to select tool
        if (element) {
          elementFactory.highlightElement(element.id);
          toolManager.setCurrentTool('select');
          canvasManager.redrawCanvas();
        }
      }
      // Reset drawing state
      toolManager.finishDrawing();
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

      // Auto-select the newly created shape and switch to select tool
      if (element) {
        elementFactory.highlightElement(element.id);
        toolManager.setCurrentTool('select');
        canvasManager.redrawCanvas();
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
    const worldPos = canvasManager.screenToWorld(screenX, screenY);

    // Check if we right-clicked on an element
    const element = elementFactory.getElementAtPoint(worldPos.x, worldPos.y);

    if (element) {
      // Select the element first
      elementFactory.highlightElement(element.id);
      console.log('Right-clicked on element:', element.id);

      // Show context menu for the element
      showContextMenu(screenX, screenY, element);
    } else {
      // Right-clicked on empty space
      elementFactory.clearSelection();
      showContextMenu(screenX, screenY, null);
    }

  } catch (error) {
    console.error('Error in handleCanvasRightClick:', error);
  }
}

// Helper functions
function handleSelectMouseDown(x, y, event) {
  console.log('handleSelectMouseDown called with world coords:', { x, y });
  const element = elementFactory.getElementAtPoint(x, y);

  if (element) {
    if (event.shiftKey) {
      // Multi-select with Shift
      if (selectedElementIds.has(element.id)) {
        // Deselect if already selected
        selectedElementIds.delete(element.id);
        console.log('Deselected element:', element.id);
      } else {
        // Add to selection
        selectedElementIds.add(element.id);
        console.log('Added element to selection:', element.id);
      }
      
      // Update visual selection (highlight all selected)
      elementFactory.clearSelection();
      if (selectedElementIds.size > 0) {
        // For now, just highlight the last one (element-factory doesn't support multi-highlight yet)
        elementFactory.highlightElement(element.id);
      }
    } else {
      // Single select
      selectedElementIds.clear();
      selectedElementIds.add(element.id);
      console.log('Single selected element:', element.id);
      elementFactory.highlightElement(element.id);
      
      // Start dragging
      isDragging = true;
      draggedElementId = element.id;
      dragStartX = x;
      dragStartY = y;
      elementStartX = element.x;
      elementStartY = element.y;
      // console.log('Started dragging element:', element.id);
    }
  } else {
    if (!event.shiftKey) {
      // console.log('Clearing selection - clicked on empty space, starting canvas pan');
      selectedElementIds.clear();
      elementFactory.clearSelection();
      isDragging = false;
      draggedElementId = null;
      
      // Start canvas panning when no element is selected
      const rect = event.target.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      viewportManager.startPan(screenX, screenY);
    }
    // If shift-clicking empty space, keep existing selection
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
// Context menu state
let currentContextMenu = null;
let contextMenuElement = null;

function showContextMenu(x, y, element = null) {
  try {
    // Hide any existing context menu
    hideContextMenu();

    console.log(`Context menu requested at (${x}, ${y})`, element);

    // Create context menu element
    contextMenuElement = document.createElement('div');
    contextMenuElement.className = 'context-menu';
    contextMenuElement.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            min-width: 180px;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

    if (element) {
      // Element-specific context menu
      contextMenuElement.innerHTML = createElementContextMenu(element);
    } else {
      // General context menu
      contextMenuElement.innerHTML = createGeneralContextMenu();
    }

    document.body.appendChild(contextMenuElement);
    currentContextMenu = element;

    // Add click listener to hide menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', handleContextMenuOutsideClick);
    }, 0);

  } catch (error) {
    console.error('Error showing context menu:', error);
  }
}

function hideContextMenu() {
  if (contextMenuElement && contextMenuElement.parentNode) {
    contextMenuElement.parentNode.removeChild(contextMenuElement);
    contextMenuElement = null;
    currentContextMenu = null;
    document.removeEventListener('click', handleContextMenuOutsideClick);
  }
}

function handleContextMenuOutsideClick(event) {
  if (contextMenuElement && !contextMenuElement.contains(event.target)) {
    hideContextMenu();
  }
}

function createElementContextMenu(element) {
  const isShape = ['rectangle', 'circle', 'triangle', 'diamond', 'ellipse', 'star'].includes(element.type);
  const isLine = element.type === 'Line';
  const hasStylng = isShape || isLine;

  let menuHTML = `
        <div class="context-menu-section">
            <div class="context-menu-title">Element: ${element.type}</div>
        </div>
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="bringElementToFront('${element.id}')">
                📤 Bring to Front
            </button>
            <button class="context-menu-item" onclick="sendElementToBack('${element.id}')">
                📥 Send to Back
            </button>
        </div>
    `;

  if (hasStylng) {
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Styling</div>
                ${isShape ? `
                    <div class="context-menu-color-row">
                        <label>Fill Color:</label>
                        <input type="color" class="context-menu-color" value="${element.data?.fillColor || '#ffffff'}" 
                               onchange="updateElementFillColor('${element.id}', this.value)">
                        <button class="context-menu-btn" onclick="removeElementFill('${element.id}')">None</button>
                    </div>
                ` : ''}
                <div class="context-menu-color-row">
                    <label>Border Color:</label>
                    <input type="color" class="context-menu-color" value="${element.data?.color || '#000000'}" 
                           onchange="updateElementBorderColor('${element.id}', this.value)">
                </div>
                <div class="context-menu-range-row">
                    <label>Border Width:</label>
                    <input type="range" min="1" max="10" value="${element.data?.strokeWidth || 2}" 
                           class="context-menu-range" onchange="updateElementBorderWidth('${element.id}', this.value)">
                    <span class="range-value">${element.data?.strokeWidth || 2}px</span>
                </div>
            </div>
        `;
  }

  menuHTML += `
        <div class="context-menu-section">
            <button class="context-menu-item context-menu-delete" onclick="deleteElement('${element.id}')">
                🗑️ Delete
            </button>
        </div>
    `;

  return menuHTML + getContextMenuStyles();
}

function createGeneralContextMenu() {
  return `
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="pasteElementHere()">
                📋 Paste
            </button>
            <button class="context-menu-item" onclick="clearCanvasFromBlazor()">
                🗑️ Clear Canvas
            </button>
        </div>
    ` + getContextMenuStyles();
}

function getContextMenuStyles() {
  return `
        <style>
        .context-menu-section {
            border-bottom: 1px solid #eee;
            padding: 8px 0;
        }
        .context-menu-section:last-child {
            border-bottom: none;
        }
        .context-menu-title {
            font-weight: bold;
            padding: 4px 12px;
            color: #333;
        }
        .context-menu-subtitle {
            font-weight: bold;
            font-size: 12px;
            color: #666;
            padding: 4px 12px;
            margin-bottom: 4px;
        }
        .context-menu-item {
            display: block;
            width: 100%;
            padding: 8px 12px;
            background: none;
            border: none;
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .context-menu-item:hover {
            background-color: #f0f0f0;
        }
        .context-menu-delete {
            color: #dc3545;
        }
        .context-menu-delete:hover {
            background-color: #ffe6e6;
        }
        .context-menu-color-row, .context-menu-range-row {
            display: flex;
            align-items: center;
            padding: 4px 12px;
            gap: 8px;
        }
        .context-menu-color-row label, .context-menu-range-row label {
            font-size: 12px;
            min-width: 80px;
        }
        .context-menu-color {
            width: 30px;
            height: 25px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
        }
        .context-menu-range {
            flex: 1;
            margin: 0 4px;
        }
        .context-menu-btn {
            padding: 2px 6px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background: white;
            font-size: 10px;
            cursor: pointer;
        }
        .range-value {
            font-size: 11px;
            color: #666;
            min-width: 30px;
        }
        </style>
    `;
}

// Context menu action functions
function bringElementToFront(elementId) {
  try {
    // Update z-index locally immediately
    const element = elementFactory.getElementById(elementId);
    if (element) {
      const maxZ = Math.max(0, ...Array.from(elementFactory.elements.values()).map(e => e.z ?? 0));
      element.z = maxZ + 1;
      if (element.data) element.data.z = element.z;
      console.log(`Local z-update: element ${elementId} -> z=${element.z}`);
      // Force redraw
      if (typeof modules !== 'undefined' && modules.canvasManager) {
        modules.canvasManager.redrawCanvas();
      }
    }
    
    // Use SignalR to bring element to front
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
      signalrClient.sendBringToFront(signalrClient.getCurrentBoardId(), elementId);
    }
    hideContextMenu();
    showNotification('Element brought to front', 'success');
  } catch (error) {
    console.error('Error bringing element to front:', error);
  }
}

function sendElementToBack(elementId) {
  try {
    // Update z-index locally immediately
    const element = elementFactory.getElementById(elementId);
    if (element) {
      const minZ = Math.min(0, ...Array.from(elementFactory.elements.values()).map(e => e.z ?? 0));
      element.z = minZ - 1;
      if (element.data) element.data.z = element.z;
      console.log(`Local z-update: element ${elementId} -> z=${element.z}`);
      // Force redraw
      if (typeof modules !== 'undefined' && modules.canvasManager) {
        modules.canvasManager.redrawCanvas();
      }
    }
    
    // Use SignalR to send element to back
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
      signalrClient.sendElementToBack(signalrClient.getCurrentBoardId(), elementId);
    }
    hideContextMenu();
    showNotification('Element sent to back', 'success');
  } catch (error) {
    console.error('Error sending element to back:', error);
  }
}

function deleteElement(elementId) {
  try {
    elementFactory.deleteSelectedElement();
    hideContextMenu();
    showNotification('Element deleted', 'success');
  } catch (error) {
    console.error('Error deleting element:', error);
  }
}

function updateElementFillColor(elementId, color) {
  try {
    updateElementStyle(elementId, { fillColor: color });
    console.log(`Updated fill color of ${elementId} to ${color}`);
  } catch (error) {
    console.error('Error updating fill color:', error);
  }
}

function removeElementFill(elementId) {
  try {
    updateElementStyle(elementId, { fillColor: 'transparent' });
    console.log(`Removed fill from ${elementId}`);
  } catch (error) {
    console.error('Error removing fill:', error);
  }
}

function updateElementBorderColor(elementId, color) {
  try {
    updateElementStyle(elementId, { color: color });
    console.log(`Updated border color of ${elementId} to ${color}`);
  } catch (error) {
    console.error('Error updating border color:', error);
  }
}

function updateElementBorderWidth(elementId, width) {
  try {
    updateElementStyle(elementId, { strokeWidth: parseInt(width) });

    // Update the range value display
    const rangeValue = contextMenuElement?.querySelector('.range-value');
    if (rangeValue) {
      rangeValue.textContent = `${width}px`;
    }

    console.log(`Updated border width of ${elementId} to ${width}px`);
  } catch (error) {
    console.error('Error updating border width:', error);
  }
}

function updateElementStyle(elementId, styleData) {
  // Update local element data immediately for visual feedback
  const element = elementFactory.getElementById(elementId);
  if (element && element.data) {
    Object.assign(element.data, styleData);
    canvasManager.redrawCanvas();
  }

  // Send update to server if connected
  if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
    // Use the existing element style update functionality
    signalrClient.updateElementStyle(elementId, styleData);
  }
}

function pasteElementHere() {
  try {
    elementFactory.pasteElement();
    hideContextMenu();
    showNotification('Element pasted', 'success');
  } catch (error) {
    console.error('Error pasting element:', error);
  }
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
    reader.onload = function (e) {
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

export async function initializeSignalRConnection(boardId) {
  const result = await signalrClient.initializeSignalR(boardId);

  // Update dependencies after SignalR connection is established
  if (result) {
    console.log('SignalR connection established, updating dependencies...');

    // Update element factory dependencies with the actual connection
    elementFactory.setDependencies({
      signalRConnection: signalrClient.getConnection(),
      currentBoardId: signalrClient.getCurrentBoardId(),
      updateStickyNoteContent: signalrClient.updateStickyNoteContent,
      updateTextElementContent: signalrClient.updateTextElementContent
    });

    console.log('Dependencies updated with SignalR connection');
  }

  return result;
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

  // Context menu action functions
  window.bringElementToFront = bringElementToFront;
  window.sendElementToBack = sendElementToBack;
  window.deleteElement = deleteElement;
  window.updateElementFillColor = updateElementFillColor;
  window.removeElementFill = removeElementFill;
  window.updateElementBorderColor = updateElementBorderColor;
  window.updateElementBorderWidth = updateElementBorderWidth;
  window.updateElementStyle = updateElementStyle;
  window.pasteElementHere = pasteElementHere;

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
