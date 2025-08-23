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

// Dragging state
let isDragging = false;
let draggedElementId = null;
let dragStartX = 0, dragStartY = 0;
let elementStartX = 0, elementStartY = 0;

// Line handle dragging state
let isDraggingLineHandle = false;
let draggedLineHandle = null; // 'start' or 'end'
let lineOriginalStart = { x: 0, y: 0 };
let lineOriginalEnd = { x: 0, y: 0 };

// Multi-select state
let selectedElementIds = new Set();

// Resize state
let isResizing = false;

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

    // Initialize dark mode
    initializeDarkMode();

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
    validateCanvasState: canvasManager.validateCanvasState,
    recoverCanvasState: canvasManager.recoverCanvasState,
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
    applyViewportTransform: canvasManager.applyViewportTransform,
    redrawCanvas: canvasManager.redrawCanvas,
    signalRConnection: signalrClient.getConnection(),
    currentBoardId: signalrClient.getCurrentBoardId(),
    sendElement: signalrClient.sendElement,
    sendElementMove: signalrClient.sendElementMove,
    sendElementSelect: signalrClient.sendElementSelect,
    sendElementDeselect: signalrClient.sendElementDeselect,
    sendElementDelete: signalrClient.sendElementDelete,
    sendElementResize: signalrClient.sendElementResize,
    sendLineEndpointUpdate: signalrClient.sendLineEndpointUpdate,
    updateStickyNoteContent: signalrClient.updateStickyNoteContent,
    updateTextElementContent: signalrClient.updateTextElementContent,
    blazorReference: null, // Will be set by Blazor
    showNotification: showNotification
  });

  // SignalR Client Dependencies
  signalrClient.setDependencies({
    elements: elementFactory.elements,
    selectedElementId: elementFactory.selectedElementId,
    collaborativeSelections: elementFactory.collaborativeSelections,
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

  // Touch event handlers
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

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

  // Add keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Set up image upload handler
  const imageInput = document.getElementById('imageUpload');
  if (imageInput) {
    imageInput.addEventListener('change', handleImageUpload);
    console.log('Image upload handler set up');
  } else {
    console.warn('Image upload input not found');
  }

  console.log('Event handlers set up');
}

// Keyboard event handler for shortcuts
function handleKeyDown(event) {
  // Dark mode toggle: Ctrl/Cmd + Shift + D
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'D') {
    event.preventDefault();
    toggleDarkMode();
    return;
  }
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

    // Check for link clicks before any other interactions
    const linkHandled = canvasManager.handleLinkClick(screenX, screenY);
    if (linkHandled) {
        return; // Stop further processing if link was clicked
    }

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
      case 'image':
        triggerImageUpload(worldPos.x, worldPos.y);
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

    // Handle line handle dragging in select mode
    if (isDraggingLineHandle && draggedElementId && currentTool === 'select') {
      const element = elementFactory.getElementById(draggedElementId);
      if (element && element.type === 'Line') {
        // Update the specific handle position
        if (draggedLineHandle === 'start') {
          // Moving start point - update element.x and element.y
          element.x = worldPos.x;
          element.y = worldPos.y;
          // Update width and height to maintain end point
          element.width = lineOriginalEnd.x - worldPos.x;
          element.height = lineOriginalEnd.y - worldPos.y;
          
          // Update absolute coordinates in data for backend compatibility
          if (element.data) {
            element.data.startX = worldPos.x;
            element.data.startY = worldPos.y;
            element.data.endX = lineOriginalEnd.x;
            element.data.endY = lineOriginalEnd.y;
          }
        } else if (draggedLineHandle === 'end') {
          // Moving end point - keep start point, update width and height
          element.width = worldPos.x - element.x;
          element.height = worldPos.y - element.y;
          
          // Update absolute coordinates in data for backend compatibility
          if (element.data) {
            element.data.startX = element.x;
            element.data.startY = element.y;
            element.data.endX = worldPos.x;
            element.data.endY = worldPos.y;
          }
        }
        
        canvasManager.redrawCanvas();
        return;
      }
    }
    
    // Handle element resizing in select mode
    if (isResizing && elementFactory.isCurrentlyResizing()) {
      elementFactory.updateElementResize(worldPos.x, worldPos.y);
      // Redraw is handled inside updateElementResize
      return;
    }
    
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

    // Update cursor based on hover state (only when not actively dragging/resizing)
    if (currentTool === 'select' && !isDragging && !isResizing && !isDraggingLineHandle) {
      updateCursorForHover(worldPos.x, worldPos.y);
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

    // Handle line handle dragging completion
    if (isDraggingLineHandle && draggedElementId) {
      // console.log('Finished dragging line handle:', draggedLineHandle);

      // Send line endpoint update to other clients (uses dedicated method with absolute coordinates)
      if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        const element = elementFactory.getElementById(draggedElementId);
        if (element && element.data && 
            element.data.startX !== undefined && element.data.startY !== undefined &&
            element.data.endX !== undefined && element.data.endY !== undefined) {
          signalrClient.sendLineEndpointUpdate(
            signalrClient.getCurrentBoardId(), 
            draggedElementId, 
            element.data.startX,
            element.data.startY,
            element.data.endX,
            element.data.endY
          );
        }
      }

      // Reset line handle dragging state
      isDraggingLineHandle = false;
      draggedLineHandle = null;
      draggedElementId = null;
      return;
    }

    // Handle element resizing completion
    if (isResizing) {
      elementFactory.finishElementResize();
      isResizing = false;
      
      // Reset cursor to default
      canvasManager.updateCanvasCursor('default');
      
      console.log('Finished resizing element');
      return;
    }

    // Handle element dragging completion
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

// Touch event handlers
function handleTouchStart(event) {
  try {
    event.preventDefault(); // Prevent default touch behaviors
    
    const touchCount = getTouchCount(event);
    lastTouchCount = touchCount;
    touchStartTime = Date.now();
    
    if (touchCount === 1) {
      // Single touch - treat like mouse down
      const coords = getEventCoordinates(event);
      const rect = event.target.getBoundingClientRect();
      const screenX = coords.clientX - rect.left;
      const screenY = coords.clientY - rect.top;
      const worldPos = canvasManager.screenToWorld(screenX, screenY);

      startX = worldPos.x;
      startY = worldPos.y;
      
      const currentTool = toolManager.getCurrentTool();
      
      // Handle different tools for single touch
      switch (currentTool) {
        case 'select':
          handleSelectTouchStart(worldPos.x, worldPos.y, event);
          break;
        case 'pen':
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
        case 'image':
          triggerImageUpload(worldPos.x, worldPos.y);
          break;
      }
    } else if (touchCount === 2) {
      // Two-finger touch - prepare for pinch/zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      // Calculate initial distance between touches
      const deltaX = touch2.clientX - touch1.clientX;
      const deltaY = touch2.clientY - touch1.clientY;
      initialTouchDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Calculate pinch center in screen coordinates
      const rect = event.target.getBoundingClientRect();
      pinchCenter = {
        x: ((touch1.clientX + touch2.clientX) / 2) - rect.left,
        y: ((touch1.clientY + touch2.clientY) / 2) - rect.top
      };
      
      // Store initial zoom level
      initialZoomLevel = viewportManager.getZoomLevel();
      
      console.log('Pinch gesture started, initial distance:', initialTouchDistance);
    }
    
  } catch (error) {
    console.error('Error in handleTouchStart:', error);
  }
}

function handleTouchMove(event) {
  try {
    event.preventDefault();
    
    const touchCount = getTouchCount(event);
    
    if (touchCount === 1) {
      // Single touch - treat like mouse move
      const coords = getEventCoordinates(event);
      const rect = event.target.getBoundingClientRect();
      const screenX = coords.clientX - rect.left;
      const screenY = coords.clientY - rect.top;
      const worldPos = canvasManager.screenToWorld(screenX, screenY);

      // Handle viewport panning
      if (viewportManager.getViewportInfo().isPanning) {
        viewportManager.updatePan(screenX, screenY);
        return;
      }

      const currentTool = toolManager.getCurrentTool();

      // Handle line handle dragging in select mode
      if (isDraggingLineHandle && draggedElementId && currentTool === 'select') {
        const element = elementFactory.getElementById(draggedElementId);
        if (element && element.type === 'Line') {
          // Update the specific handle position
          if (draggedLineHandle === 'start') {
            element.x = worldPos.x;
            element.y = worldPos.y;
            element.width = lineOriginalEnd.x - worldPos.x;
            element.height = lineOriginalEnd.y - worldPos.y;
            
            if (element.data) {
              element.data.startX = worldPos.x;
              element.data.startY = worldPos.y;
              element.data.endX = lineOriginalEnd.x;
              element.data.endY = lineOriginalEnd.y;
            }
          } else if (draggedLineHandle === 'end') {
            element.width = worldPos.x - element.x;
            element.height = worldPos.y - element.y;
            
            if (element.data) {
              element.data.startX = element.x;
              element.data.startY = element.y;
              element.data.endX = worldPos.x;
              element.data.endY = worldPos.y;
            }
          }
          
          canvasManager.redrawCanvas();
          return;
        }
      }
      
      // Handle element resizing in select mode
      if (isResizing && elementFactory.isCurrentlyResizing()) {
        elementFactory.updateElementResize(worldPos.x, worldPos.y);
        return;
      }
      
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

      // Handle tool-specific touch move
      if (toolManager.isCurrentlyDrawing()) {
        toolManager.drawLine(worldPos.x, worldPos.y);
      } else if (toolManager.isCurrentlyDrawingShape()) {
        if (currentTool === 'line') {
          toolManager.updateLine(startX, startY, worldPos.x, worldPos.y);
        } else if (toolManager.isShapeTool()) {
          toolManager.updateShape(currentTool, startX, startY, worldPos.x, worldPos.y);
        }
      }

      // Update cursor based on hover state (only when not actively dragging/resizing)
      if (currentTool === 'select' && !isDragging && !isResizing && !isDraggingLineHandle) {
        updateCursorForHover(worldPos.x, worldPos.y);
      }

    } else if (touchCount === 2) {
      // Two-finger pinch/zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      // Calculate current distance between touches
      const deltaX = touch2.clientX - touch1.clientX;
      const deltaY = touch2.clientY - touch1.clientY;
      const currentDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (initialTouchDistance > 0) {
        // Calculate zoom factor
        const zoomFactor = currentDistance / initialTouchDistance;
        
        // Apply zoom with focal point using the existing zoomAtPoint method
        viewportManager.zoomAtPoint(pinchCenter.x, pinchCenter.y, zoomFactor);
        
        // Update initial distance for next frame
        initialTouchDistance = currentDistance;
      }
    }
    
  } catch (error) {
    console.error('Error in handleTouchMove:', error);
  }
}

function handleTouchEnd(event) {
  try {
    event.preventDefault();
    
    const touchCount = getTouchCount(event);
    const touchDuration = Date.now() - touchStartTime;
    
    // Handle touch end for remaining touches
    if (touchCount === 0) {
      // All touches ended
      
      // Check for double tap (similar to double click)
      if (lastTouchCount === 1 && touchDuration < 300) {
        // This could be the first tap of a double tap, but we'll handle it simply for now
        setTimeout(() => {
          if (getTouchCount(event) === 0) {
            // No second tap detected, treat as single tap end
            handleSingleTouchEnd(event);
          }
        }, 300);
      } else {
        handleSingleTouchEnd(event);
      }
      
      // Reset pinch state
      initialTouchDistance = 0;
      initialZoomLevel = 1;
      
    } else if (touchCount === 1 && lastTouchCount === 2) {
      // One finger lifted from pinch, reset pinch state
      initialTouchDistance = 0;
      initialZoomLevel = 1;
    }
    
    lastTouchCount = touchCount;
    
  } catch (error) {
    console.error('Error in handleTouchEnd:', error);
  }
}

function handleSingleTouchEnd(event) {
  const coords = getEventCoordinates(event);
  const rect = event.target.getBoundingClientRect();
  const screenX = coords.clientX - rect.left;
  const screenY = coords.clientY - rect.top;
  const worldPos = canvasManager.screenToWorld(screenX, screenY);

  // Handle viewport panning
  if (viewportManager.getViewportInfo().isPanning) {
    viewportManager.endPan();
    return;
  }

  const currentTool = toolManager.getCurrentTool();

  // Handle line handle dragging completion
  if (isDraggingLineHandle && draggedElementId) {
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
      const element = elementFactory.getElementById(draggedElementId);
      if (element && element.data && 
          element.data.startX !== undefined && element.data.startY !== undefined &&
          element.data.endX !== undefined && element.data.endY !== undefined) {
        signalrClient.sendLineEndpointUpdate(
          signalrClient.getCurrentBoardId(), 
          draggedElementId, 
          element.data.startX,
          element.data.startY,
          element.data.endX,
          element.data.endY
        );
      }
    }

    isDraggingLineHandle = false;
    draggedLineHandle = null;
    draggedElementId = null;
    return;
  }

  // Handle element resizing completion
  if (isResizing) {
    elementFactory.finishElementResize();
    isResizing = false;
    canvasManager.updateCanvasCursor('default');
    return;
  }

  // Handle element dragging completion
  if (isDragging && draggedElementId) {
    if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
      const element = elementFactory.getElementById(draggedElementId);
      if (element) {
        signalrClient.sendElementMove(signalrClient.getCurrentBoardId(), draggedElementId, element.x, element.y);
      }
    }

    isDragging = false;
    draggedElementId = null;
    return;
  }

  // Handle tool completion
  if (toolManager.isCurrentlyDrawing()) {
    const path = toolManager.getCurrentPath();
    if (path.length > 1) {
      const element = elementFactory.createPathElement(path);
      if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
      }
      
      if (element) {
        elementFactory.highlightElement(element.id);
        toolManager.setCurrentTool('select');
        canvasManager.redrawCanvas();
      }
    }
    toolManager.finishDrawing();
  } else if (toolManager.isCurrentlyDrawingShape()) {
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

    if (element) {
      elementFactory.highlightElement(element.id);
      toolManager.setCurrentTool('select');
      canvasManager.redrawCanvas();
    }
  }
}

function handleSelectTouchStart(x, y, event) {
  const element = elementFactory.getElementAtPoint(x, y);

  if (element) {
    // Check if this is a selected line element and if we touched a handle
    if (elementFactory.getSelectedElementId() === element.id && element.type === 'Line') {
      const handle = getLineHandleAt(element, x, y);
      if (handle) {
        isDraggingLineHandle = true;
        draggedLineHandle = handle;
        draggedElementId = element.id;
        dragStartX = x;
        dragStartY = y;
        
        lineOriginalStart = { x: element.x, y: element.y };
        lineOriginalEnd = { x: element.x + element.width, y: element.y + element.height };
        return;
      }
    }
    
    // Check if this is a selected resizable element and if we touched a resize handle
    if (elementFactory.getSelectedElementId() === element.id && elementFactory.isElementResizable(element)) {
      const screenPos = canvasManager.worldToScreen(x, y);
      const selectionRect = getElementSelectionRect(element);
      const resizeHandle = elementFactory.getResizeHandleAt(screenPos.x, screenPos.y, selectionRect);
      
      if (resizeHandle) {
        const success = elementFactory.startElementResize(element.id, resizeHandle, x, y);
        if (success) {
          isResizing = true;
          const cursor = elementFactory.getResizeCursor(resizeHandle);
          canvasManager.updateCanvasCursor(cursor);
          return;
        }
      }
    }
    
    // Select element and start dragging
    selectedElementIds.clear();
    selectedElementIds.add(element.id);
    elementFactory.highlightElement(element.id);
    
    isDragging = true;
    draggedElementId = element.id;
    dragStartX = x;
    dragStartY = y;
    elementStartX = element.x;
    elementStartY = element.y;
  } else {
    // Touched empty space - clear selection and start canvas panning
    selectedElementIds.clear();
    elementFactory.clearSelection();
    isDragging = false;
    draggedElementId = null;
    
    const coords = getEventCoordinates(event);
    const rect = event.target.getBoundingClientRect();
    const screenX = coords.clientX - rect.left;
    const screenY = coords.clientY - rect.top;
    viewportManager.startPan(screenX, screenY);
  }
}

// Touch/Mouse utility functions
function getEventCoordinates(event) {
  if (event.touches && event.touches.length > 0) {
    // Touch event
    const touch = event.touches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    // Touch end event
    const touch = event.changedTouches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  } else {
    // Mouse event
    return { clientX: event.clientX, clientY: event.clientY };
  }
}

function getTouchCount(event) {
  return event.touches ? event.touches.length : 0;
}

// Touch state tracking
let touchStartTime = 0;
let lastTouchCount = 0;
let initialTouchDistance = 0;
let initialZoomLevel = 1;
let pinchCenter = { x: 0, y: 0 };

// Helper functions
function isPointInLineHandle(x, y, handleX, handleY) {
  // Get current zoom level to adjust handle size (same logic as in canvas-manager.js)
  const zoom = viewportManager.getViewportInfo().zoomLevel || 1;
  const handleSize = 8 / zoom; // Same size calculation as canvas selection handles
  const distance = Math.sqrt((x - handleX) ** 2 + (y - handleY) ** 2);
  return distance <= handleSize / 2;
}

function getLineHandleAt(element, x, y) {
  if (element.type !== 'Line') return null;
  
  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;
  
  // Check start handle
  if (isPointInLineHandle(x, y, x1, y1)) {
    return 'start';
  }
  
  // Check end handle
  if (isPointInLineHandle(x, y, x2, y2)) {
    return 'end';
  }
  
  return null;
}

function handleSelectMouseDown(x, y, event) {
  console.log('handleSelectMouseDown called with world coords:', { x, y });
  const element = elementFactory.getElementAtPoint(x, y);

  if (element) {
    // Check if this is a selected line element and if we clicked on a handle
    if (elementFactory.getSelectedElementId() === element.id && element.type === 'Line') {
      const handle = getLineHandleAt(element, x, y);
      if (handle) {
        // Start dragging line handle
        isDraggingLineHandle = true;
        draggedLineHandle = handle;
        draggedElementId = element.id;
        dragStartX = x;
        dragStartY = y;
        
        // Store original line coordinates
        lineOriginalStart = { x: element.x, y: element.y };
        lineOriginalEnd = { x: element.x + element.width, y: element.y + element.height };
        
        // console.log(`Started dragging line ${handle} handle for element:`, element.id);
        return;
      }
    }
    
    // Check if this is a selected resizable element and if we clicked on a resize handle
    if (elementFactory.getSelectedElementId() === element.id && elementFactory.isElementResizable(element)) {
      // Convert world coordinates to screen coordinates for resize handle detection
      const screenPos = canvasManager.worldToScreen(x, y);
      const selectionRect = getElementSelectionRect(element);
      const resizeHandle = elementFactory.getResizeHandleAt(screenPos.x, screenPos.y, selectionRect);
      
      if (resizeHandle) {
        // Start resize operation
        const success = elementFactory.startElementResize(element.id, resizeHandle, x, y);
        if (success) {
          isResizing = true;
          console.log(`Started resizing element ${element.id} with handle ${resizeHandle}`);
          
          // Update cursor for resize operation
          const cursor = elementFactory.getResizeCursor(resizeHandle);
          canvasManager.updateCanvasCursor(cursor);
          return;
        }
      }
    }
    
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
      
      // Start dragging (entire element)
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
  const isStickyNote = element.type === 'StickyNote';
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

  // Sticky note color picker section
  if (isStickyNote) {
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Sticky Color</div>
                <div class="context-menu-color-row">
                    <label>Background:</label>
                    <input type="color" class="context-menu-color" value="${element.data?.color || '#ffeb3b'}" 
                           onchange="updateStickyNoteColor('${element.id}', this.value)">
                </div>
                <div class="context-menu-color-presets">
                    <button class="color-preset" style="background-color: #ffeb3b" onclick="updateStickyNoteColor('${element.id}', '#ffeb3b')" title="Yellow"></button>
                    <button class="color-preset" style="background-color: #ff9800" onclick="updateStickyNoteColor('${element.id}', '#ff9800')" title="Orange"></button>
                    <button class="color-preset" style="background-color: #4caf50" onclick="updateStickyNoteColor('${element.id}', '#4caf50')" title="Green"></button>
                    <button class="color-preset" style="background-color: #2196f3" onclick="updateStickyNoteColor('${element.id}', '#2196f3')" title="Blue"></button>
                    <button class="color-preset" style="background-color: #e91e63" onclick="updateStickyNoteColor('${element.id}', '#e91e63')" title="Pink"></button>
                    <button class="color-preset" style="background-color: #9c27b0" onclick="updateStickyNoteColor('${element.id}', '#9c27b0')" title="Purple"></button>
                    <button class="color-preset" style="background-color: #ffffff" onclick="updateStickyNoteColor('${element.id}', '#ffffff')" title="White"></button>
                    <button class="color-preset" style="background-color: #f44336" onclick="updateStickyNoteColor('${element.id}', '#f44336')" title="Red"></button>
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
  const themeIcon = getCurrentTheme() === 'dark' ? '☀️' : getCurrentTheme() === 'light' ? '🌙' : '🔄';
  const themeName = getCurrentTheme() === 'dark' ? 'Light Mode' : getCurrentTheme() === 'light' ? 'Auto Mode' : 'Dark Mode';
  
  return `
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="pasteElementHere()">
                📋 Paste
            </button>
            <button class="context-menu-item" onclick="toggleDarkMode()">
                ${themeIcon} ${themeName}
            </button>
        </div>
        <div class="context-menu-section">
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
        .context-menu-color-presets {
            display: flex;
            gap: 4px;
            padding: 4px 12px;
            flex-wrap: wrap;
        }
        .color-preset {
            width: 24px;
            height: 24px;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .color-preset:hover {
            border-color: #3b82f6;
            transform: scale(1.1);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }
        .color-preset[style*="#ffffff"] {
            border-color: #ddd;
        }
        .color-preset[style*="#ffffff"]:hover {
            border-color: #3b82f6;
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

function updateStickyNoteColor(elementId, color) {
  try {
    updateElementStyle(elementId, { color: color });
    console.log(`Updated sticky note color of ${elementId} to ${color}`);
  } catch (error) {
    console.error('Error updating sticky note color:', error);
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

// Enhanced notification system
let notificationContainer = null;
let activeNotifications = new Map();
let notificationIdCounter = 0;

function showNotification(message, type = 'info', duration = null) {
  console.log(`Notification [${type}]: ${message}`);
  
  // Create notification container if it doesn't exist
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(notificationContainer);
  }
  
  // Clear previous notifications of the same type for connection status
  if (type === 'warning' || type === 'error' || type === 'success') {
    clearNotificationsByType(type);
  }
  
  // Create notification element
  const notificationId = ++notificationIdCounter;
  const notification = document.createElement('div');
  notification.id = `notification-${notificationId}`;
  notification.style.cssText = `
    background: ${getNotificationColor(type)};
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    margin-bottom: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    font-family: Arial, sans-serif;
    font-size: 14px;
    pointer-events: auto;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  
  // Add close button for persistent notifications
  if (type === 'error' || duration === 0) {
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      float: right;
      margin-left: 12px;
      cursor: pointer;
      font-weight: bold;
      font-size: 18px;
    `;
    closeBtn.onclick = () => removeNotification(notificationId);
    notification.appendChild(closeBtn);
  }
  
  notificationContainer.appendChild(notification);
  activeNotifications.set(notificationId, { element: notification, type });
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // Auto-remove after duration (if specified)
  if (duration !== 0) {
    const autoRemoveDuration = duration || (type === 'success' ? 3000 : type === 'warning' ? 5000 : 8000);
    setTimeout(() => removeNotification(notificationId), autoRemoveDuration);
  }
  
  return notificationId;
}

function removeNotification(notificationId) {
  const notificationData = activeNotifications.get(notificationId);
  if (notificationData) {
    const element = notificationData.element;
    element.style.opacity = '0';
    element.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      activeNotifications.delete(notificationId);
    }, 300);
  }
}

function clearNotificationsByType(type) {
  for (const [id, data] of activeNotifications) {
    if (data.type === type) {
      removeNotification(id);
    }
  }
}

function clearAllNotifications() {
  for (const id of activeNotifications.keys()) {
    removeNotification(id);
  }
}

function getNotificationColor(type) {
  switch (type) {
    case 'success': return '#4caf50';
    case 'warning': return '#ff9800';
    case 'error': return '#f44336';
    case 'info': 
    default: return '#2196f3';
  }
}

// Get element selection rectangle in screen coordinates
function getElementSelectionRect(element) {
  if (!element) return null;
  
  // Convert world coordinates to screen coordinates
  const topLeft = canvasManager.worldToScreen(element.x, element.y);
  const bottomRight = canvasManager.worldToScreen(element.x + element.width, element.y + element.height);
  
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y
  };
}

// Update cursor based on hover state for resize handles
function updateCursorForHover(worldX, worldY) {
  const selectedElementId = elementFactory.getSelectedElementId();
  if (!selectedElementId) {
    canvasManager.updateCanvasCursor('default');
    return;
  }
  
  const element = elementFactory.getElementById(selectedElementId);
  if (!element || !elementFactory.isElementResizable(element)) {
    canvasManager.updateCanvasCursor('default');
    return;
  }
  
  // Convert world coordinates to screen coordinates for handle detection
  const screenPos = canvasManager.worldToScreen(worldX, worldY);
  const selectionRect = getElementSelectionRect(element);
  const resizeHandle = elementFactory.getResizeHandleAt(screenPos.x, screenPos.y, selectionRect);
  
  if (resizeHandle) {
    const cursor = elementFactory.getResizeCursor(resizeHandle);
    canvasManager.updateCanvasCursor(cursor);
  } else {
    // Check if we're over the element itself
    const elementAtPoint = elementFactory.getElementAtPoint(worldX, worldY);
    if (elementAtPoint && elementAtPoint.id === selectedElementId) {
      canvasManager.updateCanvasCursor('move');
    } else {
      canvasManager.updateCanvasCursor('default');
    }
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
  if (file && pendingImagePosition) {
    try {
      console.log('Uploading image via HTTP API:', file.name, 'Size:', file.size);
      
      // Upload image via HTTP API instead of sending through SignalR
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/Image/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const result = await response.json();
      
      console.log('Image upload successful:', result);
      
      // Use image dimensions from server, with display scaling
      const maxWidth = 400;
      const maxHeight = 400;
      let { originalWidth: width, originalHeight: height } = result;
      
      // Scale down display size if too large
      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width *= scale;
        height *= scale;
      }
      
      // Create element with image URL reference instead of base64 data
      const element = elementFactory.createImageElement(
        pendingImagePosition.x,
        pendingImagePosition.y,
        width,
        height,
        result.src  // Use server URL instead of base64
      );

      console.log('Created image element with URL:', element);

      // Send smaller element data via SignalR (no base64 data)
      if (signalrClient.isConnected() && signalrClient.getCurrentBoardId()) {
        signalrClient.sendElement(signalrClient.getCurrentBoardId(), element, element.id);
      }

      pendingImagePosition = null;
      
      // Switch to select tool after placing image
      toolManager.setCurrentTool('select');
      
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Failed to upload image: ' + error.message);
      
      // Reset pending position on error
      pendingImagePosition = null;
    }
  }
  
  // Reset the file input so the same file can be selected again
  event.target.value = '';
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

// Dark mode functionality
let currentTheme = 'auto'; // 'light', 'dark', 'auto'

function initializeDarkMode() {
  // Get saved theme preference or default to auto
  currentTheme = localStorage.getItem('theme') || 'auto';
  console.log('Initializing dark mode with theme:', currentTheme);
  console.log('System prefers dark mode:', window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  applyTheme(currentTheme);
  
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  
  console.log('Dark mode initialized with theme:', currentTheme);
}

function handleSystemThemeChange(e) {
  if (currentTheme === 'auto') {
    applyTheme('auto');
  }
}

function applyTheme(theme) {
  const html = document.documentElement;
  console.log('applyTheme called with:', theme);
  console.log('Current data-theme attribute:', html.getAttribute('data-theme'));
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    console.log('Set data-theme to dark');
  } else if (theme === 'light') {
    html.removeAttribute('data-theme');
    console.log('Removed data-theme attribute (light mode)');
  } else if (theme === 'auto') {
    // For auto mode, check system preference and apply accordingly
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      html.setAttribute('data-theme', 'dark');
      console.log('Auto mode: Set data-theme to dark (system prefers dark)');
    } else {
      html.removeAttribute('data-theme');
      console.log('Auto mode: Removed data-theme attribute (system prefers light)');
    }
  }
  
  console.log('New data-theme attribute:', html.getAttribute('data-theme'));
  
  // Update theme icon
  updateThemeIcon();
  
  // Update canvas background if canvas exists
  updateCanvasBackground();
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    if (currentTheme === 'dark') {
      themeIcon.textContent = '☀️';
    } else if (currentTheme === 'light') {
      themeIcon.textContent = '🔄';
    } else {
      themeIcon.textContent = '🌙';
    }
  }
}

function updateCanvasBackground() {
  const canvas = canvasManager?.getCanvas();
  if (canvas) {
    // Force a redraw to apply new background color and color inversions
    setTimeout(() => {
      canvasManager.redrawCanvas();
    }, 100);
  }
}

function toggleDarkMode() {
  console.log('toggleDarkMode called, current theme:', currentTheme);
  
  if (currentTheme === 'light') {
    currentTheme = 'dark';
  } else if (currentTheme === 'dark') {
    currentTheme = 'auto';
  } else {
    currentTheme = 'light';
  }
  
  localStorage.setItem('theme', currentTheme);
  console.log('About to apply theme:', currentTheme);
  applyTheme(currentTheme);
  
  showNotification(`Theme set to ${currentTheme}`, 'success', 2000);
  console.log('Theme changed to:', currentTheme);
}

function getCurrentTheme() {
  return currentTheme;
}

function setTheme(theme) {
  if (['light', 'dark', 'auto'].includes(theme)) {
    currentTheme = theme;
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
    console.log('Theme set to:', currentTheme);
  }
}

// Color inversion utilities for dark mode
function isDarkModeActive() {
  const html = document.documentElement;
  const hasDataThemeDark = html.getAttribute('data-theme') === 'dark';
  
  if (currentTheme === 'dark') {
    return true;
  } else if (currentTheme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  // Also check the actual DOM state as a fallback
  console.log('isDarkModeActive check - theme:', currentTheme, 'hasDataThemeDark:', hasDataThemeDark);
  return hasDataThemeDark;
}

function isBlackColor(color) {
  if (!color) return false;
  
  // Handle hex colors
  if (color === '#000000' || color === '#000' || color.toLowerCase() === '#000000') return true;
  
  // Handle rgb colors
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return r === 0 && g === 0 && b === 0;
    }
  }
  
  // Handle named color
  if (color.toLowerCase() === 'black') return true;
  
  return false;
}

function invertBlackToWhite(color) {
  if (!isDarkModeActive() || !isBlackColor(color)) {
    return color;
  }
  
  // Convert black to white in dark mode
  return '#ffffff';
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
  window.updateStickyNoteColor = updateStickyNoteColor;
  window.updateElementStyle = updateElementStyle;
  window.pasteElementHere = pasteElementHere;
  
  // Dark mode functions
  window.initializeDarkMode = initializeDarkMode;
  window.toggleDarkMode = toggleDarkMode;
  window.getCurrentTheme = getCurrentTheme;
  window.setTheme = setTheme;
  
  // Color inversion functions
  window.isDarkModeActive = isDarkModeActive;
  window.isBlackColor = isBlackColor;
  window.invertBlackToWhite = invertBlackToWhite;

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
