// Interaction Manager Module - Handles user interactions with elements
// Manages dragging, resizing, selection, and element manipulation

// Dependencies will be injected by main coordinator
let dependencies = {};

// Global state variables for interaction management
let isDragging = false;
let draggedElementId = null;
let dragStartX = 0, dragStartY = 0;
let elementStartX = 0, elementStartY = 0;
let elementHasMoved = false;
let undoStateSaved = false;

// Line handle dragging state
let isDraggingLineHandle = false;
let draggedLineHandle = null; // 'start' or 'end'
let lineOriginalStart = { x: 0, y: 0 };
let lineOriginalEnd = { x: 0, y: 0 };

// Multi-select state
let selectedElementIds = new Set();

// Resize state
let isResizing = false;

// Selection rectangle state
let isSelectionDragging = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionEndX = 0;
let selectionEndY = 0;

// Long touch timer for mobile context menu
let longTouchTimer = null;

// Getters for state variables
export function getIsDragging() { return isDragging; }
export function getDraggedElementId() { return draggedElementId; }
export function getDragStartX() { return dragStartX; }
export function getDragStartY() { return dragStartY; }
export function getElementStartX() { return elementStartX; }
export function getElementStartY() { return elementStartY; }
export function getElementHasMoved() { return elementHasMoved; }
export function getUndoStateSaved() { return undoStateSaved; }
export function getIsDraggingLineHandle() { return isDraggingLineHandle; }
export function getDraggedLineHandle() { return draggedLineHandle; }
export function getLineOriginalStart() { return lineOriginalStart; }
export function getLineOriginalEnd() { return lineOriginalEnd; }
export function getIsResizing() { return isResizing; }
export function getIsSelectionDragging() { return isSelectionDragging; }
export function getLongTouchTimer() { return longTouchTimer; }

export function setDependencies(deps) {
  dependencies = deps;
}

// Selection rectangle functions
export function startSelectionRectangle(x, y) {
  isSelectionDragging = true;
  selectionStartX = x;
  selectionStartY = y;
  selectionEndX = x;
  selectionEndY = y;
  console.log(`Starting selection rectangle at (${x}, ${y})`);
}

export function updateSelectionRectangle(x, y) {
  if (!isSelectionDragging) return;
  
  selectionEndX = x;
  selectionEndY = y;
  
  // Redraw canvas to show selection rectangle
  dependencies.canvasManager.redrawCanvas();
  
  // Draw selection rectangle on temp canvas
  const tempCtx = dependencies.canvasManager.getTempContext();
  if (tempCtx) {
    tempCtx.clearRect(0, 0, tempCtx.canvas.width, tempCtx.canvas.height);
    
    // Convert world coordinates to screen coordinates for drawing
    const startScreen = dependencies.canvasManager.worldToScreen(selectionStartX, selectionStartY);
    const endScreen = dependencies.canvasManager.worldToScreen(selectionEndX, selectionEndY);
    
    const rectX = Math.min(startScreen.x, endScreen.x);
    const rectY = Math.min(startScreen.y, endScreen.y);
    const rectWidth = Math.abs(endScreen.x - startScreen.x);
    const rectHeight = Math.abs(endScreen.y - startScreen.y);
    
    tempCtx.save();
    tempCtx.strokeStyle = '#007bff';
    tempCtx.lineWidth = 1;
    tempCtx.setLineDash([5, 5]);
    tempCtx.strokeRect(rectX, rectY, rectWidth, rectHeight);
    tempCtx.fillStyle = 'rgba(0, 123, 255, 0.1)';
    tempCtx.fillRect(rectX, rectY, rectWidth, rectHeight);
    tempCtx.restore();
  }
}

export function finishSelectionRectangle() {
  if (!isSelectionDragging) return;
  
  // Clear temp canvas
  const tempCtx = dependencies.canvasManager.getTempContext();
  if (tempCtx) {
    tempCtx.clearRect(0, 0, tempCtx.canvas.width, tempCtx.canvas.height);
  }
  
  // Find elements within selection rectangle
  const minX = Math.min(selectionStartX, selectionEndX);
  const maxX = Math.max(selectionStartX, selectionEndX);
  const minY = Math.min(selectionStartY, selectionEndY);
  const maxY = Math.max(selectionStartY, selectionEndY);
  
  console.log(`Selection rectangle: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
  
  // Clear current selection
  dependencies.elementFactory.clearSelection();
  selectedElementIds.clear();
  
  // Check each element for intersection with selection rectangle
  for (const [id, element] of dependencies.elementFactory.elements) {
    if (isElementInSelection(element, minX, minY, maxX, maxY)) {
      selectedElementIds.add(id);
      console.log(`Selected element: ${id}`);
    }
  }
  
  // If only one element selected, make it the primary selection
  if (selectedElementIds.size === 1) {
    const elementId = Array.from(selectedElementIds)[0];
    dependencies.elementFactory.selectElement(elementId);
  } else if (selectedElementIds.size > 1) {
    // Multiple selection - implement multi-select UI if needed
    console.log(`Multiple elements selected: ${selectedElementIds.size}`);
  }
  
  isSelectionDragging = false;
  dependencies.canvasManager.redrawCanvas();
}

function isElementInSelection(element, minX, minY, maxX, maxY) {
  // Check if element bounding box intersects with selection rectangle
  const elementMinX = element.x;
  const elementMaxX = element.x + (element.width || 0);
  const elementMinY = element.y;
  const elementMaxY = element.y + (element.height || 0);
  
  return !(elementMaxX < minX || elementMinX > maxX || elementMaxY < minY || elementMinY > maxY);
}

// Element creation functions
export function createTextAtPosition(x, y) {
  // Apply snap-to-grid if enabled
  if (dependencies.canvasManager.isSnapToGridEnabled()) {
    const snapped = dependencies.canvasManager.snapToGridPoint(x, y);
    x = snapped.x;
    y = snapped.y;
  }

  const element = dependencies.elementFactory.createTextElement(x, y);
  if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
    dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
  }
  dependencies.elementFactory.startEditingTextElement(element.id, element);
}

export function createStickyNoteAtPosition(x, y) {
  // Apply snap-to-grid if enabled
  if (dependencies.canvasManager.isSnapToGridEnabled()) {
    const snapped = dependencies.canvasManager.snapToGridPoint(x, y);
    x = snapped.x;
    y = snapped.y;
  }

  const element = dependencies.elementFactory.createStickyNote(x, y);
  if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
    dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
  }
  dependencies.elementFactory.startEditingStickyNote(element.id, element);
}

// Image upload handling
export function triggerImageUpload(x, y) {
  dependencies.pendingImagePosition = { x, y };
  const imageInput = document.getElementById('imageUpload');
  if (imageInput) {
    imageInput.click();
  }
}

export function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) {
    console.warn('Please select a valid image file');
    if (dependencies.showNotification) {
      dependencies.showNotification('Please select a valid image file', 'error');
    }
    return;
  }

  if (!dependencies.pendingImagePosition) {
    console.warn('No pending image position found');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const img = new Image();
      img.onload = function() {
        // Apply snap-to-grid if enabled
        let x = dependencies.pendingImagePosition.x;
        let y = dependencies.pendingImagePosition.y;
        
        if (dependencies.canvasManager.isSnapToGridEnabled()) {
          const snapped = dependencies.canvasManager.snapToGridPoint(x, y);
          x = snapped.x;
          y = snapped.y;
        }

        // Create image element
        const element = dependencies.elementFactory.createImageElement(x, y, img.width, img.height, e.target.result);
        
        // Send to server
        if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
          dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
        }
        
        // Clear pending position
        dependencies.pendingImagePosition = null;
        
        // Redraw canvas
        dependencies.canvasManager.redrawCanvas();
        
        if (dependencies.showNotification) {
          dependencies.showNotification('Image added successfully', 'success');
        }
      };
      img.src = e.target.result;
    } catch (error) {
      console.error('Error processing image:', error);
      if (dependencies.showNotification) {
        dependencies.showNotification('Error processing image', 'error');
      }
    }
  };
  reader.readAsDataURL(file);
  
  // Clear the input
  event.target.value = '';
}

// Selection and interaction handling for select tool
export function handleSelectMouseDown(x, y, event) {
  try {
    console.log(`[SELECT MOUSE] Starting select interaction at (${x}, ${y})`);

    // Clear any existing selection first if not shift-clicking
    if (!event.shiftKey) {
      dependencies.elementFactory.clearSelection();
      selectedElementIds.clear();
    }

    // Check for element at click point
    const element = dependencies.elementFactory.getElementAtPoint(x, y);

    if (element) {
      console.log(`[SELECT MOUSE] Found element: ${element.id} (${element.type})`);

      // Select the element (or add to selection if shift-clicking)
      if (event.shiftKey && selectedElementIds.has(element.id)) {
        // Deselect if already selected and shift-clicking
        selectedElementIds.delete(element.id);
        if (dependencies.elementFactory.getSelectedElementId() === element.id) {
          dependencies.elementFactory.clearSelection();
        }
      } else {
        dependencies.elementFactory.selectElement(element.id);
        if (event.shiftKey) {
          selectedElementIds.add(element.id);
        }
      }

      // Check for line handles if it's a line
      if (element.type === 'Line') {
        const lineHandle = getLineHandleAt(element, x, y);
        if (lineHandle) {
          console.log(`[SELECT MOUSE] Starting line handle drag: ${lineHandle}`);
          isDraggingLineHandle = true;
          draggedElementId = element.id;
          draggedLineHandle = lineHandle;
          lineOriginalStart = { x: element.x, y: element.y };
          lineOriginalEnd = { x: element.x + element.width, y: element.y + element.height };
          return;
        }
      }

      // Check for resize handles
      const resizeHandle = dependencies.elementFactory.getResizeHandleAt(x, y, element);
      if (resizeHandle) {
        console.log(`[SELECT MOUSE] Starting resize with handle: ${resizeHandle}`);
        isResizing = true;
        dependencies.elementFactory.startElementResize(element.id, resizeHandle, x, y);
        return;
      }

      // Start dragging the element
      console.log(`[SELECT MOUSE] Starting element drag for: ${element.id}`);
      isDragging = true;
      draggedElementId = element.id;
      dragStartX = x;
      dragStartY = y;
      elementStartX = element.x;
      elementStartY = element.y;
      elementHasMoved = false;
      undoStateSaved = false;

    } else {
      console.log(`[SELECT MOUSE] No element found`);
      if (!event.shiftKey) {
        console.log(`[SELECT MOUSE] Starting selection rectangle`);
        // Start selection rectangle
        startSelectionRectangle(x, y);
      } else {
        // Shift-clicking empty space - start panning
        const canvas = dependencies.canvasManager.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        dependencies.viewportManager.startPan(screenX, screenY);
      }
    }

  } catch (error) {
    console.error('Error in handleSelectMouseDown:', error);
  }
}

// Cursor management
export function updateCursorForHover(worldX, worldY) {
  try {
    const currentTool = dependencies.toolManager.getCurrentTool();
    
    if (currentTool !== 'select') {
      // For non-select tools, use tool-specific cursors
      dependencies.canvasManager.updateCanvasCursor(currentTool);
      return;
    }

    // In select mode, check what's under the cursor
    const element = dependencies.elementFactory.getElementAtPoint(worldX, worldY);
    
    if (element) {
      // Check for resize handles first
      const resizeHandle = dependencies.elementFactory.getResizeHandleAt(worldX, worldY, element);
      if (resizeHandle) {
        const cursorMap = {
          'nw': 'nw-resize',
          'ne': 'ne-resize', 
          'sw': 'sw-resize',
          'se': 'se-resize',
          'n': 'n-resize',
          's': 's-resize',
          'e': 'e-resize',
          'w': 'w-resize'
        };
        dependencies.canvasManager.updateCanvasCursor(cursorMap[resizeHandle] || 'pointer');
        return;
      }
      
      // Check for line handles
      if (element.type === 'Line') {
        const lineHandle = getLineHandleAt(element, worldX, worldY);
        if (lineHandle) {
          dependencies.canvasManager.updateCanvasCursor('crosshair');
          return;
        }
      }
      
      // Regular element hover
      dependencies.canvasManager.updateCanvasCursor('move');
    } else {
      // Empty space
      dependencies.canvasManager.updateCanvasCursor('default');
    }
    
  } catch (error) {
    console.error('Error in updateCursorForHover:', error);
  }
}

// Helper function for line handle detection
function getLineHandleAt(element, x, y) {
  if (element.type !== 'Line') return null;

  const startX = element.x;
  const startY = element.y;
  const endX = element.x + element.width;
  const endY = element.y + element.height;

  if (isPointInLineHandle(x, y, startX, startY)) {
    return 'start';
  }
  if (isPointInLineHandle(x, y, endX, endY)) {
    return 'end';
  }
  return null;
}

function isPointInLineHandle(x, y, handleX, handleY) {
  const distance = Math.sqrt((x - handleX) ** 2 + (y - handleY) ** 2);
  return distance <= 15; // 15 unit radius for handles
}

// Get element selection rectangle in screen coordinates
export function getElementSelectionRect(element) {
  if (!element) return null;
  
  try {
    const topLeft = dependencies.canvasManager.worldToScreen(element.x, element.y);
    const bottomRight = dependencies.canvasManager.worldToScreen(
      element.x + (element.width || 0), 
      element.y + (element.height || 0)
    );
    
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  } catch (error) {
    console.error('Error getting element selection rect:', error);
    return null;
  }
}

// Reset all interaction state
export function resetInteractionState() {
  isDragging = false;
  draggedElementId = null;
  dragStartX = 0;
  dragStartY = 0;
  elementStartX = 0;
  elementStartY = 0;
  elementHasMoved = false;
  undoStateSaved = false;
  
  isDraggingLineHandle = false;
  draggedLineHandle = null;
  lineOriginalStart = { x: 0, y: 0 };
  lineOriginalEnd = { x: 0, y: 0 };
  
  selectedElementIds.clear();
  isResizing = false;
  isSelectionDragging = false;
  
  if (longTouchTimer) {
    clearTimeout(longTouchTimer);
    longTouchTimer = null;
  }
}

// Update global state setters for external access
export function setDragging(value) { isDragging = value; }
export function setDraggedElementId(value) { draggedElementId = value; }
export function setDragStartX(value) { dragStartX = value; }
export function setDragStartY(value) { dragStartY = value; }
export function setElementStartX(value) { elementStartX = value; }
export function setElementStartY(value) { elementStartY = value; }
export function setElementHasMoved(value) { elementHasMoved = value; }
export function setUndoStateSaved(value) { undoStateSaved = value; }
export function setResizing(value) { isResizing = value; }
export function setDraggingLineHandle(value) { isDraggingLineHandle = value; }
export function setDraggedLineHandle(value) { draggedLineHandle = value; }
export function setLineOriginalStart(value) { lineOriginalStart = value; }
export function setLineOriginalEnd(value) { lineOriginalEnd = value; }
export function setLongTouchTimer(value) { longTouchTimer = value; }
export function setSelectionDragging(value) { isSelectionDragging = value; }