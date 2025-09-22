// Event Handler Module - Mouse, touch, and keyboard event handling
// Handles all user input events and coordinates with appropriate modules

// Dependencies will be injected by main coordinator
let dependencies = {};

// Shift key state tracking for rotation snapping
let shiftKeyPressed = false;

export function setDependencies(deps) {
  dependencies = deps;
}

// Set up main event handlers
export function setupEventHandlers() {
  const canvas = dependencies.canvasManager.getCanvas();
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
  canvas.addEventListener('wheel', dependencies.viewportManager.handleMouseWheel, { passive: false });

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
      dependencies.canvasManager.resizeCanvas();
      dependencies.viewportManager.updateMinimapImmediate();

      // Redraw canvas to ensure elements are visible
      dependencies.canvasManager.redrawCanvas();
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
  
  // Track shift key state for rotation snapping
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
      shiftKeyPressed = true;
    }
  });
  
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      shiftKeyPressed = false;
    }
  });

  // Set up image upload handler
  const imageInput = document.getElementById('imageUpload');
  if (imageInput) {
    imageInput.addEventListener('change', dependencies.handleImageUpload);
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
    dependencies.toggleDarkMode();
    return;
  }

  // Lock/unlock element: Ctrl/Cmd + L
  if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
    event.preventDefault();
    const selectedElementId = dependencies.elementFactory.getSelectedElementId();
    if (selectedElementId) {
      dependencies.toggleElementLockAction(selectedElementId);
    }
    return;
  }

  // Note: Undo/Redo shortcuts are handled by tool-manager.js to avoid conflicts
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

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    // Calculate precise mouse coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (event.clientX - rect.left) / scaleX;
    const screenY = (event.clientY - rect.top) / scaleY;

    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    // DEBUG: Log coordinate conversion chain
    console.log(`[MOUSEDOWN] event:(${event.clientX},${event.clientY}) rect:(${rect.left.toFixed(1)},${rect.top.toFixed(1)}) screen:(${screenX.toFixed(1)},${screenY.toFixed(1)}) world:(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)})`);

    dependencies.startX = worldPos.x;
    dependencies.startY = worldPos.y;
    dependencies.startScreenX = screenX;
    dependencies.startScreenY = screenY;

    const currentTool = dependencies.toolManager.getCurrentTool();

    // Check for link clicks before any other interactions
    const linkHandled = dependencies.canvasManager.handleLinkClick(screenX, screenY);
    if (linkHandled) {
      return; // Stop further processing if link was clicked
    }

    // Handle hand tool - always pan regardless of what's under cursor
    if (currentTool === 'hand') {
      // Always start panning when using hand tool
      dependencies.viewportManager.startPan(screenX, screenY);
      dependencies.toolManager.setHandToolMode('panning');
      // Update cursor to grabbing state during pan
      dependencies.canvasManager.updateCanvasCursor('grabbing');
      return;
    }

    // Handle different tools (only for left-click)
    switch (currentTool) {
      case 'select':
        dependencies.handleSelectMouseDown(worldPos.x, worldPos.y, event);
        break;
      case 'pen':
        console.log('Starting pen drawing...');
        dependencies.toolManager.startNewPath(worldPos.x, worldPos.y);
        break;
      case 'rectangle':
      case 'circle':
      case 'triangle':
      case 'diamond':
      case 'ellipse':
      case 'star':
      // Flowchart shapes
      case 'process':
      case 'decision':
      case 'startend':
      case 'database':
      case 'document':
      // UML shapes
      case 'class':
      case 'actor':
      case 'package':
        dependencies.toolManager.startShape(currentTool, worldPos.x, worldPos.y);
        break;
      case 'line':
        dependencies.toolManager.startLine(worldPos.x, worldPos.y);
        break;
      case 'text':
        dependencies.createTextAtPosition(worldPos.x, worldPos.y);
        break;
      case 'stickynote':
        dependencies.createStickyNoteAtPosition(worldPos.x, worldPos.y);
        break;
      case 'image':
        dependencies.triggerImageUpload(worldPos.x, worldPos.y);
        break;
      case 'hand':
        // Hand tool is handled above for panning
        break;
    }

  } catch (error) {
    console.error('Error in handleMouseDown:', error);
  }
}

function handleMouseMove(event) {
  try {
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    // Calculate precise mouse coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (event.clientX - rect.left) / scaleX;
    const screenY = (event.clientY - rect.top) / scaleY;

    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    // Handle viewport panning
    if (dependencies.viewportManager.getViewportInfo().isPanning) {
      dependencies.viewportManager.updatePan(screenX, screenY);
      return;
    }

    const currentTool = dependencies.toolManager.getCurrentTool();
    
    // Handle hand tool selection mode
    if (currentTool === 'hand' && dependencies.toolManager.getHandToolState().mode === 'selecting') {
      const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);
      dependencies.interactionManager.updateSelectionRectangle(worldPos.x, worldPos.y);
      return;
    }

    // Handle line handle dragging in select mode
    if (dependencies.isDraggingLineHandle && dependencies.draggedElementId && currentTool === 'select') {
      const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
      if (element && element.type === 'Line') {
        // Update the specific handle position
        if (dependencies.draggedLineHandle === 'start') {
          // Moving start point - update element.x and element.y
          element.x = worldPos.x;
          element.y = worldPos.y;
          // Update width and height to maintain end point
          element.width = dependencies.lineOriginalEnd.x - worldPos.x;
          element.height = dependencies.lineOriginalEnd.y - worldPos.y;

          // Update absolute coordinates in data for backend compatibility
          if (element.data) {
            element.data.startX = worldPos.x;
            element.data.startY = worldPos.y;
            element.data.endX = dependencies.lineOriginalEnd.x;
            element.data.endY = dependencies.lineOriginalEnd.y;
          }
        } else if (dependencies.draggedLineHandle === 'end') {
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

        dependencies.canvasManager.redrawCanvas();
        return;
      }
    }

    // Handle element resizing in select mode
    if (dependencies.isResizing && dependencies.elementFactory.isCurrentlyResizing()) {
      dependencies.elementFactory.updateElementResize(worldPos.x, worldPos.y);
      // Redraw is handled inside updateElementResize
      return;
    }

    // Handle element rotation in select mode
    if (dependencies.isRotating && currentTool === 'select') {
      console.log('[MOVE] isRotating=', dependencies.isRotating, 'tool=', currentTool);
      dependencies.updateElementRotation(worldPos.x, worldPos.y, shiftKeyPressed);
      return;
    }

    // Handle element dragging in select mode
    if (dependencies.isDragging && dependencies.draggedElementId && currentTool === 'select') {
      const deltaX = worldPos.x - dependencies.dragStartX;
      const deltaY = worldPos.y - dependencies.dragStartY;
      let newX = dependencies.elementStartX + deltaX;
      let newY = dependencies.elementStartY + deltaY;

      // Check if element has moved significantly (threshold of 3 world units)
      const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (moveDistance > 3 && !dependencies.elementHasMoved) {
        console.log('MOVEMENT DETECTED: Distance', moveDistance, 'elementId:', dependencies.draggedElementId);
        dependencies.setElementHasMoved(true);
        // Save undo state when significant movement is first detected
        if (!dependencies.undoStateSaved) {
          console.log('SAVING UNDO STATE for movement');
          // Temporarily restore original position to save correct state
          const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
          if (element) {
            console.log('Element found, current pos:', element.x, element.y, 'original pos:', dependencies.elementStartX, dependencies.elementStartY);
            // Set element to original position for state saving
            element.x = dependencies.elementStartX;
            element.y = dependencies.elementStartY;

            dependencies.elementFactory.saveCanvasState('Move Element');
            dependencies.setUndoStateSaved(true);

            console.log('UNDO STATE SAVED with element at original position:', element.x, element.y);
            // Don't restore current position here - let updateElementPositionLocal handle it
          }
        }
      }

      // Apply snap-to-grid if enabled
      if (dependencies.canvasManager.isSnapToGridEnabled()) {
        const snapped = dependencies.canvasManager.snapToGridPoint(newX, newY);
        newX = snapped.x;
        newY = snapped.y;
      }

      dependencies.elementFactory.updateElementPositionLocal(dependencies.draggedElementId, newX, newY);
      dependencies.canvasManager.redrawCanvas();
      return;
    }

    // Handle group dragging in select mode or hand mode (when not panning)
    if (dependencies.isDraggingGroup && (currentTool === 'select' || (currentTool === 'hand' && dependencies.toolManager.getHandToolState().mode !== 'panning'))) {
      const { x: startX, y: startY } = dependencies.getDragStart();
      const deltaX = worldPos.x - startX;
      const deltaY = worldPos.y - startY;

      // Check if elements have moved significantly (threshold of 3 world units)
      const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (moveDistance > 3 && !dependencies.elementHasMoved) {
        console.log('GROUP MOVEMENT DETECTED: Distance', moveDistance, 'elements:', dependencies.groupInitialPositions.size);
        dependencies.setElementHasMoved(true);
        // Save undo state when significant movement is first detected
        if (!dependencies.undoStateSaved) {
          console.log('SAVING UNDO STATE for group movement');
          dependencies.elementFactory.saveCanvasState('Move Group');
          dependencies.setUndoStateSaved(true);
        }
      }

      // Move all selected elements
      if (dependencies.canvasManager.isSnapToGridEnabled() && dependencies.groupInitialPositions.size > 0) {
        // Snap-to-grid enabled: use first element as reference and apply same snap to all
        const firstId = Array.from(dependencies.groupInitialPositions.keys())[0];
        const firstInitialPos = dependencies.groupInitialPositions.get(firstId);
        const firstNewX = firstInitialPos.x + deltaX;
        const firstNewY = firstInitialPos.y + deltaY;
        const snapped = dependencies.canvasManager.snapToGridPoint(firstNewX, firstNewY);
        const snapDeltaX = snapped.x - firstNewX;
        const snapDeltaY = snapped.y - firstNewY;
        
        // Apply the same snap delta to all elements
        for (const [id, initialPos] of dependencies.groupInitialPositions) {
          const newX = initialPos.x + deltaX + snapDeltaX;
          const newY = initialPos.y + deltaY + snapDeltaY;
          dependencies.elementFactory.updateElementPositionLocal(id, newX, newY);
        }
      } else {
        // No snapping: move all elements by exact delta
        for (const [id, initialPos] of dependencies.groupInitialPositions) {
          const newX = initialPos.x + deltaX;
          const newY = initialPos.y + deltaY;
          dependencies.elementFactory.updateElementPositionLocal(id, newX, newY);
        }
      }
      
      dependencies.canvasManager.redrawCanvas();
      return;
    }

    // Handle selection dragging
    if (dependencies.isSelectionDragging && currentTool === 'select') {
      dependencies.updateSelectionRectangle(worldPos.x, worldPos.y);
      return;
    }

    // Update cursor for hover states
    dependencies.updateCursorForHover(worldPos.x, worldPos.y);

    // Handle normal tool behavior
    switch (currentTool) {
      case 'pen':
        if (dependencies.toolManager.isCurrentlyDrawing()) {
          dependencies.toolManager.drawLine(worldPos.x, worldPos.y);
        }
        break;
      case 'rectangle':
      case 'circle':
      case 'triangle':
      case 'diamond':
      case 'ellipse':
      case 'star':
      case 'process':
      case 'decision':
      case 'startend':
      case 'database':
      case 'document':
      case 'class':
      case 'actor':
      case 'package':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          dependencies.toolManager.updateShape(currentTool, dependencies.startX, dependencies.startY, worldPos.x, worldPos.y);
        }
        break;
      case 'line':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          dependencies.toolManager.updateLine(dependencies.startX, dependencies.startY, worldPos.x, worldPos.y);
        }
        break;
    }

    // Send cursor position for collaborative features
    if (dependencies.signalrClient.getConnection() && dependencies.signalrClient.getConnection().state === 'Connected') {
      dependencies.signalrClient.sendCursorUpdate(dependencies.signalrClient.getCurrentBoardId(), worldPos.x, worldPos.y);
    }

  } catch (error) {
    console.error('Error in handleMouseMove:', error);
  }
}

function handleMouseUp(event) {
  try {
    event.preventDefault();

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    // Calculate precise mouse coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (event.clientX - rect.left) / scaleX;
    const screenY = (event.clientY - rect.top) / scaleY;

    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    console.log(`[MOUSEUP] screen:(${screenX.toFixed(1)},${screenY.toFixed(1)}) world:(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)})`);

    const currentTool = dependencies.toolManager.getCurrentTool();

    // Handle hand tool mode end
    if (currentTool === 'hand') {
      const handToolState = dependencies.toolManager.getHandToolState();
      
      if (handToolState.mode === 'selecting') {
        dependencies.interactionManager.finishSelectionRectangle();
        dependencies.toolManager.clearHandToolState();
      } else if (handToolState.mode === 'panning') {
        dependencies.viewportManager.endPan();
        dependencies.toolManager.clearHandToolState();
        // Restore cursor
        dependencies.canvasManager.updateCanvasCursor('grab');
      }
      return;
    }

    // Handle viewport panning end (for other tools using temporary hand mode)
    if (dependencies.viewportManager.getViewportInfo().isPanning) {
      dependencies.viewportManager.endPan();
      return;
    }

    // Handle line handle dragging end
    if (dependencies.isDraggingLineHandle && dependencies.draggedElementId && currentTool === 'select') {
      const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
      if (element && element.type === 'Line') {
        // Send line endpoint update to server
        if (dependencies.signalrClient.getConnection() && dependencies.signalrClient.getCurrentBoardId()) {
          dependencies.signalrClient.sendLineEndpointUpdate(
            dependencies.signalrClient.getCurrentBoardId(),
            dependencies.draggedElementId,
            element.x, element.y,
            element.x + element.width, element.y + element.height
          );
        }
      }

      // Reset line handle dragging state
      dependencies.setDraggingLineHandle(false);
      dependencies.setDraggedElementId(null);
      dependencies.setDraggedLineHandle(null);
      dependencies.setLineOriginalStart({ x: 0, y: 0 });
      dependencies.setLineOriginalEnd({ x: 0, y: 0 });
      return;
    }

    // Handle element resizing end
    if (dependencies.isResizing && dependencies.elementFactory.isCurrentlyResizing()) {
      dependencies.elementFactory.finishElementResize();
      dependencies.setResizing(false);
      return;
    }

    // Handle element rotation end
    if (dependencies.isRotating && currentTool === 'select') {
      dependencies.finishElementRotation();
      return;
    }

    // Handle group dragging end
    if (dependencies.isDraggingGroup && (currentTool === 'select' || (currentTool === 'hand' && dependencies.toolManager.getHandToolState().mode !== 'panning'))) {
      console.log('ENDING GROUP DRAG for elements:', dependencies.groupInitialPositions.size, 'moved:', dependencies.elementHasMoved);

      if (dependencies.elementHasMoved) {
        // Send group move to the server
        for (const [id, initialPos] of dependencies.groupInitialPositions) {
          const element = dependencies.elementFactory.getElementById(id);
          if (element) {
            console.log('SENDING GROUP ELEMENT MOVE to server:', id, element.x, element.y);
            dependencies.signalrClient.sendElementMove(
              dependencies.signalrClient.getCurrentBoardId(),
              id,
              element.x,
              element.y
            );
          }
        }
      }

      // Reset group dragging state
      dependencies.setDraggingGroup(false);
      dependencies.setGroupInitialPositions(new Map());
      dependencies.setElementHasMoved(false);
      dependencies.setUndoStateSaved(false);
      return;
    }

    // Handle element dragging end
    if (dependencies.isDragging && dependencies.draggedElementId && currentTool === 'select') {
      console.log('ENDING DRAG for element:', dependencies.draggedElementId, 'moved:', dependencies.elementHasMoved);

      if (dependencies.elementHasMoved) {
        // Send the move to the server
        const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
        if (element) {
          console.log('SENDING ELEMENT MOVE to server:', element.x, element.y);
          dependencies.signalrClient.sendElementMove(
            dependencies.signalrClient.getCurrentBoardId(),
            dependencies.draggedElementId,
            element.x,
            element.y
          );
        }
      }

      // Reset dragging state
      dependencies.setDragging(false);
      dependencies.setDraggedElementId(null);
      dependencies.setElementHasMoved(false);
      dependencies.setUndoStateSaved(false);
      return;
    }

    // Handle selection rectangle end
    if (dependencies.isSelectionDragging && currentTool === 'select') {
      dependencies.finishSelectionRectangle();
      return;
    }

    // Handle normal tool behavior
    switch (currentTool) {
      case 'pen':
        if (dependencies.toolManager.isCurrentlyDrawing()) {
          // Finish pen/drawing tool
          const path = dependencies.toolManager.getCurrentPath();
          if (path.length > 1) {
            const element = dependencies.elementFactory.createPathElement(path);
            if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
              dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
            }

            // Auto-select the newly created drawing and switch to select tool
            if (element) {
              dependencies.elementFactory.highlightElement(element.id);
              dependencies.toolManager.setCurrentTool('select');
              dependencies.canvasManager.redrawCanvas();
            }
          }
          dependencies.toolManager.finishDrawing();
        }
        break;
      case 'rectangle':
      case 'circle':
      case 'triangle':
      case 'diamond':
      case 'ellipse':
      case 'star':
      case 'process':
      case 'decision':
      case 'startend':
      case 'database':
      case 'document':
      case 'class':
      case 'actor':
      case 'package':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          // Calculate end coordinates (not dimensions)
          const endX = worldPos.x;
          const endY = worldPos.y;
          
          // Only create shape if it has meaningful size (at least 5 units in any dimension)
          const width = Math.abs(endX - dependencies.startX);
          const height = Math.abs(endY - dependencies.startY);
          if (width > 5 || height > 5) {
            // Create the shape element with correct parameters (endX, endY not width, height)
            const element = dependencies.elementFactory.createShapeElement(
              currentTool,
              dependencies.startX,
              dependencies.startY,
              endX,
              endY
            );
            
            // Send to server
            if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
              dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
            }
            
            // Auto-select the newly created shape and switch to select tool
            if (element) {
              dependencies.elementFactory.highlightElement(element.id);
              dependencies.toolManager.setCurrentTool('select');
              dependencies.canvasManager.redrawCanvas();
            }
          }
          dependencies.toolManager.finishShape();
        }
        break;
      case 'line':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          // Calculate line endpoints
          let endX = worldPos.x;
          let endY = worldPos.y;
          
          // Apply shift-key snapping (same logic as preview)
          if (window.isShiftHeld) {
            const snapped = dependencies.toolManager.snapLineToAngle(
              dependencies.startX, 
              dependencies.startY, 
              worldPos.x, 
              worldPos.y
            );
            endX = snapped.x;
            endY = snapped.y;
          }
          
          // Only create line if it has meaningful length (at least 5 units)
          const length = Math.sqrt(Math.pow(endX - dependencies.startX, 2) + Math.pow(endY - dependencies.startY, 2));
          if (length > 5) {
            // Create the line element
            const element = dependencies.elementFactory.createLineElement(
              dependencies.startX,
              dependencies.startY,
              endX,
              endY
            );
            
            // Send to server
            if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
              dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
            }
            
            // Auto-select the newly created line and switch to select tool
            if (element) {
              dependencies.elementFactory.highlightElement(element.id);
              dependencies.toolManager.setCurrentTool('select');
              dependencies.canvasManager.redrawCanvas();
            }
          }
          dependencies.toolManager.finishLine();
        }
        break;
    }

  } catch (error) {
    console.error('Error in handleMouseUp:', error);
  }
}

function handleCanvasDoubleClick(event) {
  try {
    event.preventDefault();

    const currentTool = dependencies.toolManager.getCurrentTool();
    if (currentTool !== 'select') return;

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    // Calculate precise mouse coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (event.clientX - rect.left) / scaleX;
    const screenY = (event.clientY - rect.top) / scaleY;

    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    const element = dependencies.elementFactory.getElementAtPoint(worldPos.x, worldPos.y);
    if (element) {
      dependencies.elementFactory.startEditingElement(element.id);
    }

  } catch (error) {
    console.error('Error in handleCanvasDoubleClick:', error);
  }
}

function handleCanvasRightClick(event) {
  try {
    event.preventDefault();

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    // Calculate precise mouse coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (event.clientX - rect.left) / scaleX;
    const screenY = (event.clientY - rect.top) / scaleY;

    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    console.log('Right-click at:', worldPos.x, worldPos.y);

    // Check if we clicked on an element (include locked elements for right-click context menu)
    const element = dependencies.elementFactory.getElementAtPoint(worldPos.x, worldPos.y, true);
    console.log('Right-click detected element:', element ? element.type : 'none', element);

    if (element) {
      // Check if this element is already in the current selection
      const currentSelectedId = dependencies.elementFactory.getSelectedElementId?.();
      const selectedElements = dependencies.elementFactory.getSelectedElements?.() || [];
      const isAlreadySelected = selectedElements.some(el => el.id === element.id);
      
      console.log('Right-click selection check:', {
        elementId: element.id,
        currentSelectedId,
        selectedElementsCount: selectedElements.length,
        isAlreadySelected,
        selectedElements: selectedElements.map(el => el.id)
      });
      
      // If not selected, select it (this will clear other selections unless it's part of a multi-select scenario)
      if (!isAlreadySelected) {
        dependencies.elementFactory.selectElement(element.id);
      }
    } else {
      // Clear selection if clicking on empty space
      dependencies.elementFactory.clearSelection();
    }

    // Show context menu
    dependencies.showContextMenu(event.clientX, event.clientY, element);

  } catch (error) {
    console.error('Error in handleCanvasRightClick:', error);
  }
}

// Touch event handlers
function handleTouchStart(event) {
  try {
    event.preventDefault();

    const touchCount = getTouchCount(event);
    console.log(`Touch start with ${touchCount} touch(es)`);

    if (touchCount === 1) {
      const coordinates = getEventCoordinates(event);
      const screenX = coordinates.screenX;
      const screenY = coordinates.screenY;
      const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

      dependencies.startX = worldPos.x;
      dependencies.startY = worldPos.y;
      dependencies.startScreenX = screenX;
      dependencies.startScreenY = screenY;

      const currentTool = dependencies.toolManager.getCurrentTool();

      // Handle different tools
      switch (currentTool) {
        case 'select':
          handleSelectTouchStart(worldPos.x, worldPos.y, event);
          break;
        case 'pen':
          console.log('Starting pen drawing...');
          dependencies.toolManager.startNewPath(worldPos.x, worldPos.y);
          break;
        case 'rectangle':
        case 'circle':
        case 'triangle':
        case 'diamond':
        case 'ellipse':
        case 'star':
        case 'process':
        case 'decision':
        case 'startend':
        case 'database':
        case 'document':
        case 'class':
        case 'actor':
        case 'package':
          dependencies.toolManager.startShape(currentTool, worldPos.x, worldPos.y);
          break;
        case 'line':
          dependencies.toolManager.startLine(worldPos.x, worldPos.y);
          break;
        case 'text':
          dependencies.createTextAtPosition(worldPos.x, worldPos.y);
          break;
        case 'stickynote':
          dependencies.createStickyNoteAtPosition(worldPos.x, worldPos.y);
          break;
        case 'image':
          dependencies.triggerImageUpload(worldPos.x, worldPos.y);
          break;
        case 'hand':
          // Hand tool panning for touch
          dependencies.viewportManager.startPan(screenX, screenY);
          break;
      }

      // Set up long touch for context menu
      dependencies.setLongTouchTimer(setTimeout(() => {
        handleLongTouch(screenX, screenY, worldPos.x, worldPos.y);
      }, 500));

    } else if (touchCount === 2) {
      // Two-finger touch - start zoom/pan
      dependencies.viewportManager.handleTouchStart(event);
    }

  } catch (error) {
    console.error('Error in handleTouchStart:', error);
  }
}

function handleTouchMove(event) {
  try {
    event.preventDefault();

    // Clear long touch timer on move
    if (dependencies.longTouchTimer) {
      clearTimeout(dependencies.longTouchTimer);
      dependencies.setLongTouchTimer(null);
    }

    const touchCount = getTouchCount(event);

    if (touchCount === 1) {
      const coordinates = getEventCoordinates(event);
      const screenX = coordinates.screenX;
      const screenY = coordinates.screenY;
      const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

      const currentTool = dependencies.toolManager.getCurrentTool();

      // Handle line handle dragging in select mode
      if (dependencies.isDraggingLineHandle && dependencies.draggedElementId && currentTool === 'select') {
        const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
        if (element && element.type === 'Line') {
          // Update the specific handle position
          if (dependencies.draggedLineHandle === 'start') {
            element.x = worldPos.x;
            element.y = worldPos.y;
            element.width = dependencies.lineOriginalEnd.x - worldPos.x;
            element.height = dependencies.lineOriginalEnd.y - worldPos.y;

            if (element.data) {
              element.data.startX = worldPos.x;
              element.data.startY = worldPos.y;
              element.data.endX = dependencies.lineOriginalEnd.x;
              element.data.endY = dependencies.lineOriginalEnd.y;
            }
          } else if (dependencies.draggedLineHandle === 'end') {
            element.width = worldPos.x - element.x;
            element.height = worldPos.y - element.y;

            if (element.data) {
              element.data.startX = element.x;
              element.data.startY = element.y;
              element.data.endX = worldPos.x;
              element.data.endY = worldPos.y;
            }
          }

          dependencies.canvasManager.redrawCanvas();
          return;
        }
      }

      // Handle element resizing
      if (dependencies.isResizing && dependencies.elementFactory.isCurrentlyResizing()) {
        dependencies.elementFactory.updateElementResize(worldPos.x, worldPos.y);
        return;
      }

      // Handle element rotation
      if (dependencies.isRotating && currentTool === 'select') {
        dependencies.updateElementRotation(worldPos.x, worldPos.y, shiftKeyPressed);
        return;
      }

      // Handle element dragging
      if (dependencies.isDragging && dependencies.draggedElementId && currentTool === 'select') {
        const deltaX = worldPos.x - dependencies.dragStartX;
        const deltaY = worldPos.y - dependencies.dragStartY;
        let newX = dependencies.elementStartX + deltaX;
        let newY = dependencies.elementStartY + deltaY;

        // Check if element has moved significantly
        const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (moveDistance > 3 && !dependencies.elementHasMoved) {
          dependencies.setElementHasMoved(true);
          if (!dependencies.undoStateSaved) {
            const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
            if (element) {
              element.x = dependencies.elementStartX;
              element.y = dependencies.elementStartY;
              dependencies.elementFactory.saveCanvasState('Move Element');
              dependencies.setUndoStateSaved(true);
            }
          }
        }

        // Apply snap-to-grid if enabled
        if (dependencies.canvasManager.isSnapToGridEnabled()) {
          const snapped = dependencies.canvasManager.snapToGridPoint(newX, newY);
          newX = snapped.x;
          newY = snapped.y;
        }

        dependencies.elementFactory.updateElementPositionLocal(dependencies.draggedElementId, newX, newY);
        dependencies.canvasManager.redrawCanvas();
        return;
      }

      // Handle selection dragging
      if (dependencies.isSelectionDragging && currentTool === 'select') {
        dependencies.updateSelectionRectangle(worldPos.x, worldPos.y);
        return;
      }

      // Handle normal tool behavior
      switch (currentTool) {
        case 'pen':
          if (dependencies.toolManager.isCurrentlyDrawing()) {
            dependencies.toolManager.addPointToPath(worldPos.x, worldPos.y);
          }
          break;
        case 'rectangle':
        case 'circle':
        case 'triangle':
        case 'diamond':
        case 'ellipse':
        case 'star':
        case 'process':
        case 'decision':
        case 'startend':
        case 'database':
        case 'document':
        case 'class':
        case 'actor':
        case 'package':
          if (dependencies.toolManager.isCurrentlyDrawingShape()) {
            dependencies.toolManager.updateShape(currentTool, dependencies.startX, dependencies.startY, worldPos.x, worldPos.y);
          }
          break;
        case 'line':
          if (dependencies.toolManager.isCurrentlyDrawingShape()) {
            dependencies.toolManager.updateLine(dependencies.startX, dependencies.startY, worldPos.x, worldPos.y);
          }
          break;
      }

    } else if (touchCount === 2) {
      // Two-finger touch - handle zoom/pan
      dependencies.viewportManager.handleTouchMove(event);
    }

  } catch (error) {
    console.error('Error in handleTouchMove:', error);
  }
}

function handleTouchEnd(event) {
  try {
    event.preventDefault();

    // Clear long touch timer
    if (dependencies.longTouchTimer) {
      clearTimeout(dependencies.longTouchTimer);
      dependencies.setLongTouchTimer(null);
    }

    const touchCount = getTouchCount(event);
    console.log(`Touch end with ${touchCount} remaining touch(es)`);

    if (touchCount === 0) {
      handleSingleTouchEnd(event);
    } else if (touchCount === 1) {
      // One finger remaining - might be transitioning from multi-touch
      dependencies.viewportManager.handleTouchEnd(event);
    } else {
      // Multiple fingers - continue multi-touch handling
      dependencies.viewportManager.handleTouchEnd(event);
    }

  } catch (error) {
    console.error('Error in handleTouchEnd:', error);
  }
}

function handleSingleTouchEnd(event) {
  try {
    const coordinates = getEventCoordinates(event.changedTouches ? event.changedTouches[0] : event.touches[0]);
    const screenX = coordinates.screenX;
    const screenY = coordinates.screenY;
    const worldPos = dependencies.canvasManager.screenToWorld(screenX, screenY);

    console.log(`[TOUCH END] screen:(${screenX.toFixed(1)},${screenY.toFixed(1)}) world:(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)})`);

    const currentTool = dependencies.toolManager.getCurrentTool();

    // Handle line handle dragging end
    if (dependencies.isDraggingLineHandle && dependencies.draggedElementId && currentTool === 'select') {
      const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
      if (element && element.type === 'Line') {
        if (dependencies.signalrClient.getConnection() && dependencies.signalrClient.getCurrentBoardId()) {
          dependencies.signalrClient.sendLineEndpointUpdate(
            dependencies.signalrClient.getCurrentBoardId(),
            dependencies.draggedElementId,
            element.x, element.y,
            element.x + element.width, element.y + element.height
          );
        }
      }

      dependencies.setDraggingLineHandle(false);
      dependencies.setDraggedElementId(null);
      dependencies.setDraggedLineHandle(null);
      dependencies.setLineOriginalStart({ x: 0, y: 0 });
      dependencies.setLineOriginalEnd({ x: 0, y: 0 });
      return;
    }

    // Handle element resizing end
    if (dependencies.isResizing && dependencies.elementFactory.isCurrentlyResizing()) {
      dependencies.elementFactory.finishElementResize();
      dependencies.setResizing(false);
      return;
    }

    // Handle element dragging end
    if (dependencies.isDragging && dependencies.draggedElementId && currentTool === 'select') {
      if (dependencies.elementHasMoved) {
        const element = dependencies.elementFactory.getElementById(dependencies.draggedElementId);
        if (element) {
          dependencies.signalrClient.sendElementMove(
            dependencies.signalrClient.getCurrentBoardId(),
            dependencies.draggedElementId,
            element.x,
            element.y
          );
        }
      }

      dependencies.setDragging(false);
      dependencies.setDraggedElementId(null);
      dependencies.setElementHasMoved(false);
      dependencies.setUndoStateSaved(false);
      return;
    }

    // Handle selection rectangle end
    if (dependencies.isSelectionDragging && currentTool === 'select') {
      dependencies.finishSelectionRectangle();
      return;
    }

    // Handle normal tool behavior
    switch (currentTool) {
      case 'pen':
        if (dependencies.toolManager.isCurrentlyDrawing()) {
          // Finish pen/drawing tool
          const path = dependencies.toolManager.getCurrentPath();
          if (path.length > 1) {
            const element = dependencies.elementFactory.createPathElement(path);
            if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
              dependencies.signalrClient.sendElement(dependencies.signalrClient.getCurrentBoardId(), element, element.id);
            }

            // Auto-select the newly created drawing and switch to select tool
            if (element) {
              dependencies.elementFactory.highlightElement(element.id);
              dependencies.toolManager.setCurrentTool('select');
              dependencies.canvasManager.redrawCanvas();
            }
          }
          dependencies.toolManager.finishDrawing();
        }
        break;
      case 'rectangle':
      case 'circle':
      case 'triangle':
      case 'diamond':
      case 'ellipse':
      case 'star':
      case 'process':
      case 'decision':
      case 'startend':
      case 'database':
      case 'document':
      case 'class':
      case 'actor':
      case 'package':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          dependencies.toolManager.finishShape();
        }
        break;
      case 'line':
        if (dependencies.toolManager.isCurrentlyDrawingShape()) {
          dependencies.toolManager.finishLine();
        }
        break;
    }

  } catch (error) {
    console.error('Error in handleSingleTouchEnd:', error);
  }
}

function handleSelectTouchStart(x, y, event) {
  try {
    console.log(`[SELECT TOUCH] Starting select touch at (${x}, ${y})`);

    // A) First, rotation handle on already selected elements
    const selectedElementIds = dependencies.selectedElementIds || new Set();
    if (selectedElementIds.size > 0) {
      const ids = Array.from(selectedElementIds);
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = dependencies.elementFactory.getElementById(ids[i]);
        if (!el) continue;
        if (dependencies.elementFactory.getRotationHandleAt(x, y, el) === 'rotate') {
          console.log(`[SELECT TOUCH] Starting rotation for selected element: ${el.id}`);
          dependencies.setRotating(true);
          dependencies.setDraggedElementId(el.id);
          
          // Calculate initial angle from element center to touch position
          const centerX = el.x + el.width / 2;
          const centerY = el.y + el.height / 2;
          dependencies.setRotationStartAngle(Math.atan2(y - centerY, x - centerX) * 180 / Math.PI);
          dependencies.setRotationElementStartAngle(el.data?.rotation || 0);
          
          return; // start rotation; do not fall through
        }
      }
    }

    // Clear any existing selection first
    dependencies.elementFactory.clearSelection();

    // B) Otherwise hover element under pointer as usual
    const element = dependencies.elementFactory.getElementAtPoint(x, y);

    if (element) {
      console.log(`[SELECT TOUCH] Found element: ${element.id} (${element.type})`);

      // Select the element
      dependencies.elementFactory.selectElement(element.id);

      // Check for line handles if it's a line
      if (element.type === 'Line') {
        const lineHandle = getLineHandleAt(element, x, y);
        if (lineHandle) {
          console.log(`[SELECT TOUCH] Starting line handle drag: ${lineHandle}`);
          dependencies.setDraggingLineHandle(true);
          dependencies.setDraggedElementId(element.id);
          dependencies.setDraggedLineHandle(lineHandle);
          dependencies.setLineOriginalStart({ x: element.x, y: element.y });
          dependencies.setLineOriginalEnd({ x: element.x + element.width, y: element.y + element.height });
          return;
        }
      }

      // Rotation handle for this hovered element (still useful)
      if (dependencies.elementFactory.getRotationHandleAt(x, y, element) === 'rotate') {
        console.log(`[SELECT TOUCH] Starting rotation for element: ${element.id}`);
        dependencies.setRotating(true);
        dependencies.setDraggedElementId(element.id);
        
        // Calculate initial angle from element center to touch position
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        dependencies.setRotationStartAngle(Math.atan2(y - centerY, x - centerX) * 180 / Math.PI);
        dependencies.setRotationElementStartAngle(element.data?.rotation || 0);
        
        return;
      }

      // Check for resize handles
      const resizeHandle = dependencies.elementFactory.getResizeHandleAt(x, y, element);
      if (resizeHandle) {
        console.log(`[SELECT TOUCH] Starting resize with handle: ${resizeHandle}`);
        dependencies.setResizing(true);
        dependencies.elementFactory.startElementResize(element.id, resizeHandle, x, y);
        return;
      }

      // Start dragging the element
      console.log(`[SELECT TOUCH] Starting element drag for: ${element.id}`);
      dependencies.setDragging(true);
      dependencies.setDraggedElementId(element.id);
      dependencies.setDragStartX(x);
      dependencies.setDragStartY(y);
      dependencies.setElementStartX(element.x);
      dependencies.setElementStartY(element.y);
      dependencies.setElementHasMoved(false);
      dependencies.setUndoStateSaved(false);

    } else {
      console.log(`[SELECT TOUCH] No element found, starting selection rectangle`);
      // Start selection rectangle
      dependencies.setSelectionDragging(true);
      dependencies.startSelectionRectangle(x, y);
    }

  } catch (error) {
    console.error('Error in handleSelectTouchStart:', error);
  }
}

function handleLongTouch(screenX, screenY, worldX, worldY) {
  try {
    console.log('Long touch detected at:', worldX, worldY);

    // Check if we touched an element
    const element = dependencies.elementFactory.getElementAtPoint(worldX, worldY);

    if (element) {
      // If not selected, select it first
      if (dependencies.elementFactory.getSelectedElementId() !== element.id) {
        dependencies.elementFactory.selectElement(element.id);
      }
    } else {
      // Clear selection if touching empty space
      dependencies.elementFactory.clearSelection();
    }

    // Show context menu at screen coordinates
    dependencies.showContextMenu(screenX, screenY, element);

  } catch (error) {
    console.error('Error in handleLongTouch:', error);
  }
}

// Touch/Mouse utility functions
function getEventCoordinates(event) {
  try {
    const canvas = dependencies.canvasManager.getCanvas();
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;

    if (event.touches && event.touches.length > 0) {
      // Touch event
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      // Touch end event
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }

    // Calculate precise coordinates accounting for DPR and canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const scaleX = rect.width / (canvas.width / dpr);
    const scaleY = rect.height / (canvas.height / dpr);
    const screenX = (clientX - rect.left) / scaleX;
    const screenY = (clientY - rect.top) / scaleY;

    return { screenX, screenY };
  } catch (error) {
    console.error('Error in getEventCoordinates:', error);
    return { screenX: 0, screenY: 0 };
  }
}

function getTouchCount(event) {
  return event.touches ? event.touches.length : 0;
}

function isPointInLineHandle(x, y, handleX, handleY) {
  const distance = Math.sqrt((x - handleX) ** 2 + (y - handleY) ** 2);
  return distance <= 15; // 15 unit radius for handles
}

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