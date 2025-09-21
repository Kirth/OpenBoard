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

// Group dragging state
let isDraggingGroup = false;
let groupInitialPositions = new Map(); // Store initial positions of all selected elements

// Resize state
let isResizing = false;

// Rotation state
let isRotating = false;
let rotationStartAngle = 0;
let rotationElementStartAngle = 0;

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
export function getIsRotating() { return isRotating; }
export function getRotationStartAngle() { return rotationStartAngle; }
export function getRotationElementStartAngle() { return rotationElementStartAngle; }
export function getIsSelectionDragging() { return isSelectionDragging; }
export function getLongTouchTimer() { return longTouchTimer; }
export function getIsDraggingGroup() { return isDraggingGroup; }
export function getGroupInitialPositions() { return groupInitialPositions; }
export function getDragStart() { return { x: dragStartX, y: dragStartY }; }

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
  
  // Broadcast selection state to other clients (handles both selection and clear)
  console.log(`[DEBUG] Broadcasting selection from finishSelectionRectangle: ${selectedElementIds.size} elements`);
  broadcastSelectionState();
  
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
    console.log(`[DEBUG] selectedElementIds before processing: ${selectedElementIds.size} elements:`, Array.from(selectedElementIds));

    // A) First, rotation handle on already selected elements
    if (selectedElementIds.size > 0) {
      const ids = Array.from(selectedElementIds);
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = dependencies.elementFactory.getElementById(ids[i]);
        if (!el) continue;
        if (dependencies.elementFactory.getRotationHandleAt(x, y, el) === 'rotate') {
          console.log('[ROTATION] start on selected', el.id);
          isRotating = true;
          dependencies.setRotating?.(true);
          draggedElementId = el.id;
          dependencies.setDraggedElementId?.(el.id);
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          rotationStartAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
          rotationElementStartAngle = el.data?.rotation || 0;
          dependencies.setRotationStartAngle?.(rotationStartAngle);
          dependencies.setRotationElementStartAngle?.(rotationElementStartAngle);
          return; // start rotation; do not fall through
        }
      }
    }

    // Don't pre-clear - only clear when truly replacing selection

    // B) Otherwise hover element under pointer as usual
    const element = dependencies.elementFactory.getElementAtPoint(x, y);

    if (element) {
      console.log(`[SELECT MOUSE] Found element: ${element.id} (${element.type})`);

      // Check if element is part of a group
      const isInGroup = dependencies.groupManager && dependencies.groupManager.isElementInGroup(element.id);
      const groupId = isInGroup ? dependencies.groupManager.getElementGroupId(element.id) : null;

      // Handle selection logic based on current state and modifiers
      if (event.shiftKey) {
        // Shift-clicking: toggle element in/out of selection
        if (selectedElementIds.has(element.id)) {
          // Remove from selection
          selectedElementIds.delete(element.id);
          if (dependencies.elementFactory.getSelectedElementId() === element.id) {
            // If this was the primary selection, clear it
            dependencies.elementFactory.clearSelection();
            // If there are other selected elements, make one of them primary
            if (selectedElementIds.size > 0) {
              const newPrimary = Array.from(selectedElementIds)[0];
              dependencies.elementFactory.selectElement(newPrimary);
            }
          }
        } else {
          // Add to selection (do NOT call legacy selectElement here)
          selectedElementIds.add(element.id);
          // Optional: set a primary without clearing, if you implement it:
          // dependencies.elementFactory?.setPrimarySelection?.(element.id);
        }
      } else {
        // Regular clicking
        if (isInGroup && !event.ctrlKey) {
          // Clicking on grouped element without Ctrl - select entire group
          console.log(`[DEBUG] Selecting entire group: ${groupId}`);
          const groupElements = dependencies.groupManager.getGroupElements(groupId);
          
          // Clear current selection
          dependencies.elementFactory.clearSelection();
          selectedElementIds.clear();
          
          // Select all elements in the group
          groupElements.forEach(groupElement => {
            selectedElementIds.add(groupElement.id);
          });
          
          // Set primary selection to the clicked element
          if (groupElements.length > 0) {
            dependencies.elementFactory.selectElement(element.id);
          }
        } else if (selectedElementIds.has(element.id) && selectedElementIds.size > 1) {
          // Clicking on an element that's part of multi-selection - keep all selections
          // This will trigger group drag, don't change selections
          // Note: Don't call elementFactory.selectElement() as it would clear the multi-selection
          console.log(`[DEBUG] Preserving multi-selection (${selectedElementIds.size} elements) - clicked on selected element`);
        } else {
          // Single element or clicking outside multi-selection - replace selection
          console.log(`[DEBUG] Replacing selection with single element: ${element.id}`);
          // Clear legacy + multi ONLY here:
          dependencies.elementFactory.clearSelection();
          selectedElementIds.clear();
          selectedElementIds.add(element.id);
          dependencies.elementFactory.selectElement(element.id);
          console.log(`[DEBUG] selectedElementIds after single select: ${selectedElementIds.size} elements`);
        }
      }

      // Broadcast selection state after all selection logic is complete
      console.log(`[DEBUG] About to broadcast selection state after selection logic`);
      broadcastSelectionState();

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

      // Rotation handle for this hovered element (still useful)
      if (dependencies.elementFactory.getRotationHandleAt(x, y, element) === 'rotate') {
        console.log('[ROTATION] start on hovered element', element.id);
        isRotating = true;
        dependencies.setRotating?.(true);
        draggedElementId = element.id;
        dependencies.setDraggedElementId?.(element.id);
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        rotationStartAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
        rotationElementStartAngle = element.data?.rotation || 0;
        dependencies.setRotationStartAngle?.(rotationStartAngle);
        dependencies.setRotationElementStartAngle?.(rotationElementStartAngle);
        return;
      }

      // Resize / drag fallbacks...
      const resizeHandle = dependencies.elementFactory.getResizeHandleAt(x, y, element);
      if (resizeHandle) {
        console.log(`[SELECT MOUSE] Starting resize with handle: ${resizeHandle}`);
        isResizing = true;
        dependencies.elementFactory.startElementResize(element.id, resizeHandle, x, y);
        return;
      }

      // Start drag of element body (single or group)
      if (selectedElementIds.size > 1 && selectedElementIds.has(element.id)) {
        // Start group drag operation
        console.log(`[SELECT MOUSE] Starting group drag for ${selectedElementIds.size} elements`);
        console.log(`[DEBUG] Final selectedElementIds for group drag:`, Array.from(selectedElementIds));
        isDraggingGroup = true;
        dragStartX = x;
        dragStartY = y;
        elementHasMoved = false;
        undoStateSaved = false;
        
        // Store initial positions for all selected elements
        groupInitialPositions.clear();
        for (const id of selectedElementIds) {
          const el = dependencies.elementFactory.getElementById(id);
          if (el) {
            groupInitialPositions.set(id, { x: el.x, y: el.y });
          }
        }
        
        // Broadcast final selection state after determining group drag
        broadcastSelectionState();
      } else {
        // Start single element drag
        console.log(`[SELECT MOUSE] Starting element drag for: ${element.id}`);
        isDragging = true;
        draggedElementId = element.id;
        dragStartX = x;
        dragStartY = y;
        elementStartX = element.x;
        elementStartY = element.y;
        elementHasMoved = false;
        undoStateSaved = false;
        
        // Broadcast final selection state after determining single drag
        broadcastSelectionState();
      }

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
    
    if (currentTool === 'hand') {
      // Hand tool always shows grab cursor when hovering
      dependencies.canvasManager.updateCanvasCursor('grab');
      return;
    }
    
    if (currentTool !== 'select') {
      // For non-select tools, use tool-specific cursors
      dependencies.canvasManager.updateCanvasCursor(currentTool);
      return;
    }

    // 1) If we have selected elements, check their rotation handles first (topmost selection first)
    if (selectedElementIds.size > 0) {
      const ids = Array.from(selectedElementIds);
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = dependencies.elementFactory.getElementById(ids[i]);
        if (!el) continue;
        if (dependencies.elementFactory.getRotationHandleAt(worldX, worldY, el) === 'rotate') {
          dependencies.canvasManager.updateCanvasCursor('alias'); // curved-arrow-ish
          return;
        }
      }
    }

    // 2) Then do normal hit test for an element under pointer
    const element = dependencies.elementFactory.getElementAtPoint(worldX, worldY);
    if (element) {
      // Rotation handle (for the hovered element)
      if (dependencies.elementFactory.getRotationHandleAt(worldX, worldY, element) === 'rotate') {
        dependencies.canvasManager.updateCanvasCursor('alias');
        return;
      }
      // Resize handles
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
      return;
    }

    // 3) Nothing
    dependencies.canvasManager.updateCanvasCursor('default');
    
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

// Rotation handling functions
export function updateElementRotation(x, y) {
  if (!isRotating || !draggedElementId) return false;
  
  const element = dependencies.elementFactory.getElementById(draggedElementId);
  if (!element) return false;
  
  // Calculate current angle from element center to mouse position
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const currentAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
  
  // Calculate rotation delta
  const angleDelta = currentAngle - rotationStartAngle;
  let newRotation = rotationElementStartAngle + angleDelta;
  
  // Optional: Snap to 15-degree increments if shift is held
  // TODO: Add shift key detection
  // if (shiftKeyPressed) {
  //   newRotation = Math.round(newRotation / 15) * 15;
  // }
  
  // Normalize to 0-360 degrees
  newRotation = ((newRotation % 360) + 360) % 360;
  
  console.log('[ROTATION] update angle ->', newRotation);
  
  // Update element rotation
  dependencies.elementFactory.rotateElement(element.id, newRotation);
  
  return true;
}

export function finishElementRotation() {
  if (!isRotating) return false;
  
  const wasRotating = isRotating;
  const elementId = draggedElementId;
  
  // Reset rotation state
  isRotating = false;
  draggedElementId = null;
  rotationStartAngle = 0;
  rotationElementStartAngle = 0;
  
  if (wasRotating && elementId) {
    // Save state for undo/redo
    dependencies.elementFactory.saveCanvasState('Rotate Element');
    console.log(`Finished rotating element ${elementId}`);
  }
  
  return wasRotating;
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
  
  isDraggingGroup = false;
  groupInitialPositions.clear();
  
  selectedElementIds.clear();
  isResizing = false;
  isRotating = false;
  rotationStartAngle = 0;
  rotationElementStartAngle = 0;
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
export function setRotating(value) { isRotating = value; }
export function setRotationStartAngle(value) { rotationStartAngle = value; }
export function setRotationElementStartAngle(value) { rotationElementStartAngle = value; }
export function setDraggingGroup(value) { isDraggingGroup = value; }
export function setGroupInitialPositions(value) { 
  groupInitialPositions.clear();
  if (value instanceof Map) {
    for (const [key, val] of value) {
      groupInitialPositions.set(key, val);
    }
  }
}
export function getSelectedElementIds() { return selectedElementIds; }

// Helper function to broadcast selection state to other clients
function broadcastSelectionState() {
  try {
    console.log(`[DEBUG BROADCAST] Broadcasting selection state: ${selectedElementIds.size} elements:`, Array.from(selectedElementIds));
    if (dependencies.signalrClient) {
      console.log(`[DEBUG BROADCAST] signalrClient exists, checking board ID...`);
      const boardId = dependencies.signalrClient.getCurrentBoardId();
      console.log(`[DEBUG BROADCAST] boardId: ${boardId}`);
      if (boardId) {
        if (selectedElementIds.size > 0) {
          console.log(`[DEBUG BROADCAST] Sending selection update for ${selectedElementIds.size} elements`);
          dependencies.signalrClient.sendSelectionUpdate(boardId, selectedElementIds);
        } else {
          console.log(`[DEBUG BROADCAST] Sending selection clear`);
          dependencies.signalrClient.sendSelectionClear(boardId);
        }
      } else {
        console.log(`[DEBUG BROADCAST] No board ID available`);
      }
    } else {
      console.log(`[DEBUG BROADCAST] No signalrClient available`);
    }
  } catch (error) {
    console.error('Error broadcasting selection state:', error);
  }
}

// Expose to window for global access
if (typeof window !== 'undefined') {
  window.getSelectedElementIds = getSelectedElementIds;
}