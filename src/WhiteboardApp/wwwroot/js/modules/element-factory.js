// Element Factory Module - Handles all element creation, management, and operations
// This is the largest module, containing element CRUD operations, selection, editing,
// resizing, dragging, copy/paste, and undo/redo functionality

// Core element storage
export let elements = new Map();
export let selectedElementId = null;
export let elementsToSelect = new Set();

// Collaborative selections tracking - Map<elementId, Map<connectionId, {userName, color}>>
export let collaborativeSelections = new Map();

// Element editing state
let editingElement = null; // Legacy compatibility
let editInput = null; // Legacy compatibility

// Element interaction state
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let hasMoved = false;

// Element resizing state
let isResizing = false;
let activeResizeHandle = null;
let resizeStartBounds = null;
let hasResized = false;

// Copy/paste system
let copiedElement = null;

// Undo/redo system
let undoStack = [];
let redoStack = [];
let maxUndoSteps = 50;
let isUndoRedoOperation = false;

// Style update debouncing system
let styleUpdateTimeouts = new Map(); // elementId -> timeout
const STYLE_UPDATE_DEBOUNCE_MS = 200; // 200ms debounce delay

// Helper function to sync element changes to server after undo/redo
async function syncElementChangesToServer(oldElements, newElements) {
  console.log('[UNDO-SYNC] Starting sync to server with', newElements.length, 'new elements and', oldElements.length, 'old elements');
  
  if (!dependencies.currentBoardId) {
    console.error('[UNDO-SYNC] No currentBoardId function available in dependencies');
    return;
  }
  
  const boardId = dependencies.currentBoardId();
  if (!boardId) {
    console.warn('[UNDO-SYNC] No current board ID available for undo/redo sync');
    return;
  }
  
  console.log('[UNDO-SYNC] Using board ID:', boardId);

  try {
    // Compare old and new states to find changes
    const oldElementsMap = new Map(oldElements);
    const newElementsMap = new Map(newElements);

    // Find elements that were added, modified, or deleted
    const promises = [];

    // Check for new or modified elements
    for (const [id, newElement] of newElementsMap) {
      const oldElement = oldElementsMap.get(id);

      if (!oldElement) {
        // Element was added/restored - send to server
        console.log('[UNDO-SYNC] Detected restored element:', id, 'type:', newElement.type);
        if (dependencies.sendElement) {
          console.log('[UNDO-SYNC] Sending restored element to server:', id);
          promises.push(dependencies.sendElement(boardId, newElement, id));
        } else {
          console.error('[UNDO-SYNC] sendElement function not available in dependencies');
        }
      } else {
        // Check for changes and sync accordingly

        // Check lock state change
        const oldLocked = oldElement.data?.locked || false;
        const newLocked = newElement.data?.locked || false;
        if (oldLocked !== newLocked && dependencies.sendElementLock) {
          promises.push(dependencies.sendElementLock(boardId, id, newLocked));
        }

        // Check position change
        if (oldElement.x !== newElement.x || oldElement.y !== newElement.y) {
          if (dependencies.sendElementMove) {
            promises.push(dependencies.sendElementMove(boardId, id, newElement.x, newElement.y));
          }
        }

        // Check size change
        if (oldElement.width !== newElement.width || oldElement.height !== newElement.height) {
          if (dependencies.sendElementResize) {
            promises.push(dependencies.sendElementResize(boardId, id, newElement.x, newElement.y, newElement.width, newElement.height));
          }
        }

        // Check for content/style changes
        const oldData = JSON.stringify(oldElement.data || {});
        const newData = JSON.stringify(newElement.data || {});
        if (oldData !== newData) {
          // Handle content updates based on element type
          if (newElement.type === 'StickyNote' && dependencies.updateStickyNoteContent) {
            promises.push(dependencies.updateStickyNoteContent(id, newElement.data));
          } else if (newElement.type === 'Text' && dependencies.updateTextElementContent) {
            promises.push(dependencies.updateTextElementContent(id, newElement.data));
          } else if (dependencies.updateElementStyle) {
            promises.push(dependencies.updateElementStyle(id, newElement.data));
          }
        }
      }
    }

    // Check for deleted elements
    for (const [id] of oldElementsMap) {
      if (!newElementsMap.has(id)) {
        // Element was deleted - send to server
        if (dependencies.sendElementDelete) {
          promises.push(dependencies.sendElementDelete(boardId, id));
        }
      }
    }

    // Wait for all sync operations to complete
    if (promises.length > 0) {
      console.log(`[UNDO-SYNC] Executing ${promises.length} sync operations...`);
      await Promise.all(promises);
      console.log(`[UNDO-SYNC] Successfully synced ${promises.length} element changes to server after undo/redo`);
    } else {
      console.log('[UNDO-SYNC] No sync operations needed');
    }

  } catch (error) {
    console.error('[UNDO-SYNC] Failed to sync undo/redo changes to server:', error);
    
    // Add user notification for sync failures
    if (dependencies.showNotification) {
      dependencies.showNotification('Failed to sync changes to server. Other users may not see your restored elements.', 'error');
    }
  }
}

// Constants
const LINE_TOLERANCE_PX = 8; // constant in *screen* pixels

// Dependencies that will be injected from other modules
let dependencies = {
  canvas: null,
  ctx: null,
  tempCanvas: null,
  tempCtx: null,
  getViewportX: null,
  getViewportY: null,
  getZoomLevel: null,
  screenToWorld: null,
  worldToScreen: null,
  applyViewportTransform: null,
  redrawCanvas: null,
  signalRConnection: null,
  currentBoardId: null,
  sendElement: null,
  sendElementMove: null,
  sendElementSelect: null,
  sendElementDeselect: null,
  sendElementDelete: null,
  sendElementResize: null,
  sendElementLock: null,
  sendBringToFront: null,
  sendElementToBack: null,
  updateElementStyle: null,
  updateStickyNoteContent: null,
  updateTextElementContent: null,
  blazorReference: null,
  showNotification: null,
  groupManager: null,
  addSparkleEffectsToElements: null
};

// Set dependencies from other modules
export function setDependencies(deps) {
  Object.assign(dependencies, deps);
}

// ElementFactory class for creating new elements
export class ElementFactory {
  static createTempId() {
    return 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  static createStickyNote(x, y, content = '', color = '#ffeb3b') {
    return {
      id: this.createTempId(),
      type: 'StickyNote',
      x: x,
      y: y,
      width: 200,
      height: 150,
      z: 0,
      createdAt: Date.now(),
      data: {
        content: content,
        color: color,
        fontSize: 14,
        isEditing: false,
        locked: false,
        rotation: 0
      }
    };
  }

  static createTextElement(x, y, content = '', fontSize = 16, color = '#000000') {
    return {
      id: this.createTempId(),
      type: 'Text',
      x: x,
      y: y,
      width: Math.max(content.length * fontSize * 0.6, 100),
      height: fontSize * 1.2,
      z: 0,
      createdAt: Date.now(),
      data: {
        content: content,
        fontSize: fontSize,
        fontFamily: 'Arial',
        color: color,
        isEditing: false,
        locked: false,
        rotation: 0
      }
    };
  }

  static createShapeElement(type, x, y, width, height, style = {}) {
    return {
      id: this.createTempId(),
      type: type,
      x: x,
      y: y,
      width: width,
      height: height,
      z: 0,
      createdAt: Date.now(),
      data: {
        color: style.color || '#000000',
        fillColor: style.fillColor || 'transparent',
        strokeWidth: style.strokeWidth || 2,
        locked: false,
        rotation: 0
      }
    };
  }

  static createLineElement(x1, y1, x2, y2, style = {}) {
    return {
      id: this.createTempId(),
      type: 'Line',
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      z: 0,
      createdAt: Date.now(),
      data: {
        color: style.color || '#000000',
        strokeWidth: style.strokeWidth || 2,
        // Store absolute coordinates for backend compatibility
        startX: x1,
        startY: y1,
        endX: x2,
        endY: y2,
        locked: false,
        // Lines don't need rotation property - endpoints define the line direction
        // Arrow head properties
        startArrow: style.startArrow || 'none',
        endArrow: style.endArrow || 'none',
        arrowSize: style.arrowSize || 10,
        // Connection point properties
        startConnection: style.startConnection || null,
        endConnection: style.endConnection || null
      }
    };
  }

  static createImageElement(x, y, width, height, imageData) {
    return {
      id: this.createTempId(),
      type: 'Image',
      x: x,
      y: y,
      width: width,
      height: height,
      z: 0,
      createdAt: Date.now(),
      data: {
        imageData: imageData,
        locked: false,
        rotation: 0
      }
    };
  }

  static createPathElement(path, style = {}) {
    const bounds = this.calculatePathBounds(path);

    // Convert absolute path coordinates to relative coordinates
    // (relative to the bounding box origin)
    const relativePath = path.map(point => ({
      x: point.x - bounds.minX,
      y: point.y - bounds.minY
    }));

    return {
      id: this.createTempId(),
      type: 'Path',
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      z: 0,
      createdAt: Date.now(),
      data: {
        path: relativePath, // Store relative coordinates
        color: style.color || '#000000',
        strokeWidth: style.strokeWidth || 2,
        locked: false,
        rotation: 0
      }
    };
  }

  static calculatePathBounds(path) {
    if (!path || path.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = path[0].x;
    let maxX = path[0].x;
    let minY = path[0].y;
    let maxY = path[0].y;

    for (const point of path) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, minY, maxX, maxY };
  }
}

// EditorManager class for handling element editing
export class EditorManager {
  constructor() {
    this.state = 'IDLE'; // IDLE, CREATING, EDITING, SAVING, ERROR
    this.editingElementId = null;
    this.editInput = null;
    this.element = null;
    this.originalContent = null; // Store original content for undo/redo comparison
    this.onToolSwitchRequest = null;
    this.onStateChange = null;
  }

  canStartEditing() {
    return this.state === 'IDLE';
  }

  canStopEditing() {
    return this.state === 'EDITING';
  }

  getCurrentEditingElementId() {
    return this.editingElementId;
  }

  updateEditingElementId(newId) {
    if (this.editingElementId && this.state === 'EDITING') {
      console.log(`Updating editing element ID from ${this.editingElementId} to ${newId}`);
      this.editingElementId = newId;
      return true;
    }
    return false;
  }

  isEditing() {
    return this.state === 'EDITING' && this.editingElementId !== null;
  }

  async startEditing(elementId, element, elementType) {
    // If already editing something else, stop that first
    if (this.state === 'EDITING') {
      console.log('Stopping previous editing session before starting new one');
      await this.stopEditing(false); // Don't save previous edit
    }

    if (!this.canStartEditing()) {
      console.warn('Cannot start editing: invalid state', this.state);
      return false;
    }

    try {
      this.setState('CREATING');

      if (!elementId || !element || !elements.has(elementId)) {
        throw new Error('Invalid element for editing');
      }

      if (elementType !== 'StickyNote' && elementType !== 'Text') {
        throw new Error('Unsupported element type for editing: ' + elementType);
      }

      // Check if element is locked
      if (isElementLocked(element)) {
        if (dependencies.showNotification) {
          dependencies.showNotification('Cannot edit locked element', 'warning');
        }
        this.setState('IDLE');
        return false;
      }

      await this.cleanup();

      this.editingElementId = elementId;
      this.element = element;

      // Store original content for undo/redo comparison
      this.originalContent = element.data?.content || '';

      // Handle corrupted data structure - ensure element.data is an object
      if (typeof element.data !== 'object' || element.data === null) {
        console.warn('Element data is not an object, attempting to fix:', element.data);
        // If data is a string (corrupted), try to create a proper data object
        const content = typeof element.data === 'string' ? element.data : '';
        element.data = {
          content: content,
          color: elementType === 'StickyNote' ? '#ffeb3b' : '#ffffff',
          fontSize: elementType === 'StickyNote' ? 14 : 16,
          isEditing: false
        };
      }

      element.data.isEditing = true;

      this.createInputElement(elementType);

      this.setState('EDITING');
      return true;

    } catch (error) {
      console.error('Failed to start editing:', error);
      this.setState('ERROR');
      await this.cleanup();
      return false;
    }
  }

  async stopEditing() {
    if (!this.canStopEditing()) {
      console.warn('Cannot stop editing: invalid state', this.state);
      return false;
    }

    try {
      this.setState('SAVING');

      if (this.element && this.editInput) {
        const newContent = this.editInput.value.trim();
        this.element.data.content = newContent;
        this.element.data.isEditing = false;

        // Save undo state only if content actually changed
        if (newContent !== this.originalContent) {
          const actionType = this.element.type === 'StickyNote' ? 'Edit Sticky Note' : 'Edit Text';
          saveCanvasState(actionType);
        }

        console.log('Debugging sticky note update dependencies:', {
          signalRConnection: dependencies.signalRConnection,
          connectionState: dependencies.signalRConnection?.state,
          expectedState: window.signalR?.HubConnectionState?.Connected,
          updateStickyNoteContent: dependencies.updateStickyNoteContent,
          updateTextElementContent: dependencies.updateTextElementContent,
          elementId: this.editingElementId,
          elementType: this.element.type,
          content: newContent
        });

        if (dependencies.signalRConnection && dependencies.signalRConnection.state === window.signalR.HubConnectionState.Connected) {
          console.log(`Attempting to update element ${this.editingElementId} (${this.element.type}) with content: "${newContent}"`);
          if (!this.editingElementId.startsWith('temp-')) {
            if (this.element.type === 'StickyNote') {
              console.log('Calling updateStickyNoteContent via SignalR');
              if (dependencies.updateStickyNoteContent) {
                // Send the complete data object, not just the content
                const updatedData = {
                  ...this.element.data,
                  content: newContent
                };
                dependencies.updateStickyNoteContent(this.editingElementId, updatedData);
              } else {
                console.error('updateStickyNoteContent function not available in dependencies');
              }
            } else if (this.element.type === 'Text') {
              console.log('Calling updateTextElementContent via SignalR');
              if (dependencies.updateTextElementContent) {
                // Send the complete data object, not just the content
                const updatedData = {
                  ...this.element.data,
                  content: newContent
                };
                dependencies.updateTextElementContent(this.editingElementId, updatedData);
              } else {
                console.error('updateTextElementContent function not available in dependencies');
              }
            }
          } else {
            console.log('Element has temp ID, marking for pending update');
            this.element.data.pendingUpdate = true;
          }
        } else {
          console.warn('SignalR not connected or dependencies not available:', {
            signalRConnection: dependencies.signalRConnection,
            connectionState: dependencies.signalRConnection?.state,
            expectedState: window.signalR?.HubConnectionState?.Connected
          });
        }
      }

      await this.cleanup();

      if (this.onToolSwitchRequest) {
        this.onToolSwitchRequest('select');
      }

      this.setState('IDLE');
      return true;

    } catch (error) {
      console.error('Failed to stop editing:', error);
      this.setState('ERROR');
      await this.cleanup();
      return false;
    }
  }

  createInputElement(elementType) {
    if (!dependencies.canvas || !dependencies.worldToScreen) return;

    const rect = dependencies.canvas.getBoundingClientRect();
    const screenPos = dependencies.worldToScreen(this.element.x, this.element.y);
    const z = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;

    this.editInput = document.createElement('textarea');
    this.editInput.style.position = 'absolute';
    this.editInput.style.zIndex = '1000';
    this.editInput.style.border = '2px solid #007bff';
    this.editInput.style.borderRadius = '4px';
    this.editInput.style.padding = '5px';
    this.editInput.style.resize = 'none';
    this.editInput.value = this.element.data.content || '';

    if (elementType === 'StickyNote') {
      this.editInput.style.left = (rect.left + screenPos.x + 10) + 'px';
      this.editInput.style.top = (rect.top + screenPos.y + 10) + 'px';
      this.editInput.style.width = (this.element.width * z - 20) + 'px';
      this.editInput.style.height = (this.element.height * z - 20) + 'px';
      this.editInput.style.fontSize = ((this.element.data.fontSize || 14) * z) + 'px';
      this.editInput.style.fontFamily = 'Arial';
      this.editInput.style.backgroundColor = this.element.data.color || '#ffeb3b';
    } else if (elementType === 'Text') {
      this.editInput.style.left = (rect.left + screenPos.x) + 'px';
      this.editInput.style.top = (rect.top + screenPos.y) + 'px';
      this.editInput.style.width = (this.element.width * z) + 'px';
      this.editInput.style.height = (this.element.height * z) + 'px';
      this.editInput.style.fontSize = ((this.element.data.fontSize || 16) * z) + 'px';
      this.editInput.style.fontFamily = this.element.data.fontFamily || 'Arial';
      this.editInput.style.color = this.element.data.color || '#000000';
      this.editInput.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    }

    document.body.appendChild(this.editInput);
    this.editInput.focus();
    this.editInput.select();

    // Set up event handlers
    this.editInput.addEventListener('blur', () => this.stopEditing());
    this.editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.stopEditing();
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: Allow newline (default behavior)
          return;
        } else {
          // Enter: Finish editing
          e.preventDefault();
          this.stopEditing();
        }
      }
      e.stopPropagation();
    });
  }

  async cleanup() {
    if (this.editInput && this.editInput.parentNode) {
      this.editInput.parentNode.removeChild(this.editInput);
    }
    this.editInput = null;
    this.editingElementId = null;
    this.originalContent = null; // Reset original content for undo/redo

    if (this.element) {
      this.element.data.isEditing = false;
      this.element = null;
    }

    // Update legacy variables
    editingElement = null;
    editInput = null;
  }

  setState(newState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }
}

// Global editor manager instance
export const editorManager = new EditorManager();

// Element creation functions
export function createTextElement(x, y) {
  const element = ElementFactory.createTextElement(x, y, 'Text');
  elements.set(element.id, element);
  saveCanvasState('Create Text Element');
  return element;
}

export function createStickyNote(x, y) {
  const element = ElementFactory.createStickyNote(x, y, 'Note');
  elements.set(element.id, element);
  saveCanvasState('Create Sticky Note');
  return element;
}

export function createShapeElement(shapeType, startX, startY, endX, endY) {
  // DEBUG: Log final element creation coordinates
  console.log(`[FINAL] ${shapeType} creating element start:(${startX.toFixed(1)},${startY.toFixed(1)}) end:(${endX.toFixed(1)},${endY.toFixed(1)})`);

  // Handle negative dimensions by normalizing coordinates
  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const maxX = Math.max(startX, endX);
  const maxY = Math.max(startY, endY);

  const width = maxX - minX;
  const height = maxY - minY;

  // Ensure minimum dimensions
  const finalWidth = Math.max(width, 1);
  const finalHeight = Math.max(height, 1);

  console.log(`[FINAL] ${shapeType} normalized bounds: (${minX.toFixed(1)},${minY.toFixed(1)}) ${finalWidth.toFixed(1)}x${finalHeight.toFixed(1)}`);

  const element = ElementFactory.createShapeElement(shapeType, minX, minY, finalWidth, finalHeight);
  elements.set(element.id, element);
  saveCanvasState('Create ' + shapeType);
  return element;
}

export function createLineElement(startX, startY, endX, endY, style = {}) {
  const element = ElementFactory.createLineElement(startX, startY, endX, endY, style);
  elements.set(element.id, element);
  saveCanvasState('Create Line');
  return element;
}

export function createImageElement(x, y, width, height, imageData) {
  // Handle both old (3 params) and new (5 params) calling conventions
  if (typeof width === 'string') {
    // Old calling convention: createImageElement(x, y, imageData)
    if (width.startsWith('data:image/') || width.startsWith('/uploads/') || width.startsWith('http')) {
      imageData = width;
      width = 200;
      height = 200;
    }
  } else if (typeof height === 'string') {
    // Mixed calling: createImageElement(x, y, width, imageData)
    if (height.startsWith('data:image/') || height.startsWith('/uploads/') || height.startsWith('http')) {
      imageData = height;
      height = width; // width becomes height
      width = 200;    // default width
    }
  }

  // Validate imageData
  if (!imageData || typeof imageData !== 'string') {
    console.error('Invalid imageData provided to createImageElement:', imageData);
    return null;
  }

  const element = ElementFactory.createImageElement(x, y, width || 200, height || 200, imageData);
  elements.set(element.id, element);
  saveCanvasState('Create Image');
  return element;
}

export function createPathElement(path) {
  const element = ElementFactory.createPathElement(path);
  elements.set(element.id, element);
  saveCanvasState('Create Drawing');
  return element;
}

// Image data validation helper
function validateImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    return false;
  }

  // Accept base64 data URLs and server URL paths
  const isValidImageSrc =
    imageData.startsWith('data:image/') ||
    imageData.startsWith('/uploads/') ||
    imageData.startsWith('http://') ||
    imageData.startsWith('https://');

  return isValidImageSrc;
}

// Element management functions
export function drawElement(id, x, y, type, data, width, height) {
  // Check if element already exists (to prevent duplicates from SignalR)
  if (elements.has(id)) {
    console.log('Element already exists, skipping duplicate:', id);
    return;
  }

  // Validate and sanitize image data when received via SignalR
  if (type === 'Image' && data && data.imageData) {
    if (!validateImageData(data.imageData)) {
      console.warn(`Invalid image data received for element ${id}, imageData:`, data.imageData);
      // Don't add the element to prevent rendering errors
      return;
    }
    
    // For image elements, trigger preloading to improve display
    console.log(`Preloading image for element ${id}: ${data.imageData.substring(0, 50)}...`);
    
    // Create temporary image to trigger loading
    const preloadImg = new Image();
    preloadImg.onload = () => {
      console.log(`Image preloaded successfully for element ${id}`);
      // Trigger a redraw after image loads
      dependencies.requestRedraw?.();
    };
    preloadImg.onerror = () => {
      console.warn(`Failed to preload image for element ${id}:`, data.imageData);
    };
    preloadImg.src = data.imageData;
  }

  const element = {
    id: id,
    type: type,
    x: x,
    y: y,
    width: width,
    height: height,
    data: data,
    z: (data && typeof data.z === 'number') ? data.z : (data && typeof data.zIndex === 'number') ? data.zIndex : 0,
    createdAt: Date.now()
  };

  elements.set(id, element);

  // Restore line connections for real-time elements (not during bulk page load)
  // The bulk restoration after page load is handled separately in signalr-client.js
  if (type === 'Line' && data && (data.startConnection || data.endConnection)) {
    console.log(`[DRAW-ELEMENT] Restoring connections for real-time line ${id}`, {
      startConnection: data.startConnection,
      endConnection: data.endConnection
    });
    
    // Small delay to ensure connected elements exist
    setTimeout(() => {
      if (window.connectionManager && window.connectionManager.updateLineConnections) {
        window.connectionManager.updateLineConnections(element);
      }
    }, 10);
  }

  if (elementsToSelect.has(id)) {
    selectedElementId = id;
    elementsToSelect.delete(id);
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function getElementAtPoint(x, y, includeLockedElements = false) {
  // Search by z-order, highest z first (topmost element)
  const elementArray = Array.from(elements.values()).sort((a, b) => {
    const za = (a.z ?? a.data?.z ?? 0);
    const zb = (b.z ?? b.data?.z ?? 0);
    if (za !== zb) return zb - za; // reverse sort for hit testing
    // tie-breaker: creation time/id to keep determinism  
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });

  // DEBUG: Log viewport state used for hit testing
  const vx = dependencies.getViewportX ? dependencies.getViewportX() : (dependencies.viewportX ?? 0);
  const vy = dependencies.getViewportY ? dependencies.getViewportY() : (dependencies.viewportY ?? 0);
  const z = dependencies.getZoomLevel ? dependencies.getZoomLevel() : (dependencies.zoomLevel ?? 1);
  //console.log(`[hit-test] using viewport state: vx=${vx?.toFixed?.(1) ?? vx} vy=${vy?.toFixed?.(1) ?? vy} z=${z?.toFixed?.(2) ?? z}`);

  for (const element of elementArray) {
    // Skip locked elements unless specifically requested
    if (!includeLockedElements && isElementLocked(element)) {
      continue;
    }

    const isHit = isPointInElement(x, y, element);
    // console.log(`HIT TEST: point(${x.toFixed(1)},${y.toFixed(1)}) vs ${element.type}(${element.x.toFixed(1)},${element.y.toFixed(1)},${element.width}x${element.height}) z=${element.z ?? 0} = ${isHit}`);
    if (isHit) {
      return element;
    }
  }

  return null;
}

export function getElementInfo(id) {
  return elements.get(id) || null;
}

export function markElementForSelection(tempId) {
  elementsToSelect.add(tempId);
}

// Element selection and highlighting
export function highlightElement(id) {
  // Deselect previous element first if there was one
  if (selectedElementId && selectedElementId !== id) {
    if (dependencies.sendElementDeselect && dependencies.currentBoardId) {
      // OPTIMIZATION: Make deselect async and non-blocking for better performance
      dependencies.sendElementDeselect(selectedElementId).catch(error => {
        console.warn('Failed to send element deselect to server:', error);
        // Continue with local state update regardless of server response
      });
    }
  }

  // OPTIMIZATION: Update local selection state immediately for instant visual feedback
  selectedElementId = id;

  // Trigger immediate canvas redraw for instant visual response
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  // OPTIMIZATION: Send selection notification to server asynchronously (optimistic UI)
  if (id && dependencies.sendElementSelect && dependencies.currentBoardId) {
    dependencies.sendElementSelect(id).catch(error => {
      console.warn('Failed to send element select to server:', error);
      // Consider implementing retry logic or user notification for critical failures
    });
  }
}

// Note: selectElement and clearSelection functions are defined below with multi-selection support

export function showElementSelection(elementId, userName, connectionId) {
  // Add this selection to collaborative selections
  if (!collaborativeSelections.has(elementId)) {
    collaborativeSelections.set(elementId, new Map());
  }

  const elementSelections = collaborativeSelections.get(elementId);
  elementSelections.set(connectionId, {
    userName: userName,
    color: getColorForConnection(connectionId)
  });

  console.log(`${userName} selected element ${elementId}`);

  // Trigger redraw to show the collaborative selection
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function hideElementSelection(elementId, connectionId) {
  // Remove this selection from collaborative selections
  if (collaborativeSelections.has(elementId)) {
    const elementSelections = collaborativeSelections.get(elementId);
    elementSelections.delete(connectionId);

    // If no more selections for this element, remove the element entry
    if (elementSelections.size === 0) {
      collaborativeSelections.delete(elementId);
    }
  }

  console.log(`Element ${elementId} deselected by ${connectionId}`);

  // Trigger redraw to hide the collaborative selection
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

// Multi-selection support for grouping
export let multiSelection = new Set();

export function getSelectedElements() {
  const selected = [];
  
  // Check if interaction manager has multi-selection (for selection rectangles)
  const interactionSelectedIds = dependencies.interactionManager?.getSelectedElementIds?.() || new Set();
  
  if (interactionSelectedIds.size > 0) {
    // Use interaction manager's selection if it has multiple elements
    interactionSelectedIds.forEach(id => {
      if (elements.has(id)) {
        selected.push(elements.get(id));
      }
    });
  } else {
    // Fall back to element factory's own selection system
    // Add currently selected single element
    if (selectedElementId && elements.has(selectedElementId)) {
      selected.push(elements.get(selectedElementId));
    }
    
    // Add multi-selected elements
    multiSelection.forEach(id => {
      if (elements.has(id) && id !== selectedElementId) {
        selected.push(elements.get(id));
      }
    });
  }
  
  // console.log('getSelectedElements() returning:', selected.map(el => el.id));
  return selected;
}

export function selectElement(id, addToSelection = false) {
  // Check if element is part of a group and handle group selection
  if (dependencies.groupManager && dependencies.groupManager.isElementInGroup(id)) {
    return dependencies.groupManager.handleElementSelection(id, addToSelection);
  }

  if (addToSelection) {
    // Add to multi-selection
    multiSelection.add(id);
  } else {
    // Clear previous selection and select this element
    clearSelection();
    selectedElementId = id;
  }
  
  highlightElement(id);
  
  // Send selection to server
  if (dependencies.sendElementSelect && dependencies.currentBoardId) {
    dependencies.sendElementSelect(id).catch(error => {
      console.error('Failed to send element select:', error);
    });
  }
}

export function clearSelection() {
  // Deselect current element if there is one
  if (selectedElementId && dependencies.sendElementDeselect && dependencies.currentBoardId) {
    dependencies.sendElementDeselect(selectedElementId);
  }

  selectedElementId = null;
  multiSelection.clear();
  
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function addToSelection(id) {
  if (elements.has(id)) {
    multiSelection.add(id);
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }
}

export function removeFromSelection(id) {
  multiSelection.delete(id);
  if (selectedElementId === id) {
    selectedElementId = null;
  }
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function isSelected(id) {
  return selectedElementId === id || multiSelection.has(id);
}

export function drawCollaborativeSelections() {
  // Implementation for drawing collaborative selection indicators
  if (!dependencies.ctx || !dependencies.applyViewportTransform) return;

  const ctx = dependencies.ctx;

  // Draw collaborative selections in world space
  ctx.save();
  dependencies.applyViewportTransform();

  const zoom = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;

  for (const [elementId, selections] of collaborativeSelections) {
    const element = elements.get(elementId);
    if (!element) continue;

    // Don't show collaborative selection for our own selected element
    if (elementId === selectedElementId) continue;

    let colorIndex = 0;
    for (const [connectionId, { userName, color }] of selections) {
      // Draw selection outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([8 / zoom, 4 / zoom]);

      if (element.type === 'Line') {
        // For lines, draw the collaborative selection line
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.stroke();
      } else {
        // For other elements, draw a border around the element
        const padding = 4 / zoom;
        ctx.strokeRect(
          element.x - padding,
          element.y - padding,
          element.width + 2 * padding,
          element.height + 2 * padding
        );
      }

      ctx.setLineDash([]); // Reset line dash

      // Draw user name label
      ctx.fillStyle = color;
      ctx.font = `${12 / zoom}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const labelX = element.x;
      const labelY = element.y - (20 / zoom) - (colorIndex * 16 / zoom);

      // Background for text
      const textMetrics = ctx.measureText(userName);
      const textWidth = textMetrics.width;
      const textHeight = 12 / zoom;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(labelX - 2 / zoom, labelY - 2 / zoom, textWidth + 4 / zoom, textHeight + 4 / zoom);

      // Text
      ctx.fillStyle = color;
      ctx.fillText(userName, labelX, labelY);

      colorIndex++;
    }
  }

  ctx.restore();
}

// Generate consistent color for connection
function getColorForConnection(connectionId) {
  const hash = connectionId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f',
    '#bb8fce', '#85c1e9', '#f8c471', '#82e0aa',
    '#f1948a', '#85c1e9', '#d7dbdd', '#fadbd8'
  ];

  return colors[Math.abs(hash) % colors.length];
}

// Element operations
export function updateElementPosition(id, newX, newY) {
  const element = elements.get(id);
  if (!element) return;

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot move locked element', 'warning');
    }
    return;
  }

  // Apply snap-to-grid if enabled
  if (window.canvasManager && window.canvasManager.isSnapToGridEnabled()) {
    const snapped = window.canvasManager.snapToGridPoint(newX, newY);
    newX = snapped.x;
    newY = snapped.y;
  }

  element.x = newX;
  element.y = newY;

  // Path elements now use relative coordinates, so no need to update path data
  // Line elements use x,y,width,height so they move correctly by default

  // Update any lines connected to this element
  if (window.connectionManager && window.connectionManager.updateConnectedLines) {
    console.log(`[ELEMENT-FACTORY] Calling updateConnectedLines for element ${id}`);
    window.connectionManager.updateConnectedLines(id);
  } else {
    console.warn(`[ELEMENT-FACTORY] connectionManager not available for element ${id}`);
  }

  if (dependencies.sendElementMove && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElementMove(boardId, id, newX, newY);
    }
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function updateElementPositionLocal(id, newX, newY) {
  const element = elements.get(id);
  if (element) {
    element.x = newX;
    element.y = newY;

    // Path elements now use relative coordinates, so no need to update path data
  }
}

// Move selected elements by specified offset (for arrow key nudging)
export function moveSelectedElements(deltaX, deltaY) {
  // Get selected element IDs from interaction manager
  let selectedIds = new Set();
  
  // Try to get selected IDs from the global function if available
  if (typeof window !== 'undefined' && window.getSelectedElementIds) {
    selectedIds = window.getSelectedElementIds();
  }
  
  if (selectedIds.size === 0) {
    console.log('No elements selected for movement');
    return;
  }
  
  console.log(`Moving ${selectedIds.size} selected elements by (${deltaX}, ${deltaY})`);
  
  // Create undo state before moving elements
  if (dependencies.saveUndoState) {
    dependencies.saveUndoState();
  }
  
  // Move each selected element
  for (const elementId of selectedIds) {
    const element = elements.get(elementId);
    if (!element) continue;
    
    // Check if element is locked
    if (isElementLocked(element)) {
      if (dependencies.showNotification) {
        dependencies.showNotification('Cannot move locked element', 'warning');
      }
      continue;
    }
    
    // Calculate new position
    const newX = element.x + deltaX;
    const newY = element.y + deltaY;
    
    // Update element position (this includes snap-to-grid and server sync)
    updateElementPosition(elementId, newX, newY);
  }
  
  console.log(`Successfully moved ${selectedIds.size} elements`);
}

export function updateElementStyle(elementId, styleProperty, styleValue) {
  console.log('updateElementStyle called:', elementId, styleProperty, styleValue);

  const element = elements.get(elementId);
  if (!element) {
    console.warn('Element not found for style update:', elementId);
    return;
  }

  // Initialize data object if it doesn't exist
  if (!element.data) {
    element.data = {};
  }

  // OPTIMIZATION: Update local style property immediately for instant visual feedback
  element.data[styleProperty] = styleValue;

  console.log('Element style updated locally:', elementId, styleProperty, styleValue);

  // OPTIMIZATION: Redraw canvas immediately for smooth user experience
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  // OPTIMIZATION: Debounce server updates to reduce network traffic during rapid changes
  debouncedStyleUpdate(elementId);
}

// Debounced function to send style updates to server
function debouncedStyleUpdate(elementId) {
  // Clear existing timeout for this element
  if (styleUpdateTimeouts.has(elementId)) {
    clearTimeout(styleUpdateTimeouts.get(elementId));
  }

  // Set new timeout to send update after debounce period
  const timeout = setTimeout(() => {
    const element = elements.get(elementId);
    
    if (element && dependencies.updateElementStyle && dependencies.currentBoardId) {
      try {
        console.log('Sending debounced style update to server:', elementId);
        dependencies.updateElementStyle(elementId, element.data).catch(error => {
          console.warn('Failed to send debounced style update to server:', error);
        });
      } catch (error) {
        console.error('Error in debounced style update:', error);
      }
    }

    // Clean up timeout reference
    styleUpdateTimeouts.delete(elementId);
  }, STYLE_UPDATE_DEBOUNCE_MS);

  // Store timeout reference
  styleUpdateTimeouts.set(elementId, timeout);
}

// Element rotation functions
export function rotateElement(elementId, rotation) {
  const element = elements.get(elementId);
  if (!element) {
    console.warn('Element not found for rotation:', elementId);
    return;
  }

  // Lines should not be rotatable - users should move endpoints instead
  if (element.type === 'Line') {
    console.log('Cannot rotate line elements - move endpoints instead');
    return;
  }

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot rotate locked element', 'warning');
    }
    return;
  }

  // Normalize rotation to 0-360 degrees
  rotation = ((rotation % 360) + 360) % 360;

  // Initialize data object if it doesn't exist
  if (!element.data) {
    element.data = {};
  }

  element.data.rotation = rotation;

  console.log(`Element ${elementId} rotated to ${rotation} degrees`);

  // Redraw canvas to show changes
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  // Send rotation update to server via SignalR
  if (dependencies.updateElementStyle && dependencies.currentBoardId) {
    try {
      dependencies.updateElementStyle(elementId, { rotation });
    } catch (error) {
      console.error('Error sending rotation update to server:', error);
    }
  }
}

export function setElementRotation(elementId, rotation) {
  rotateElement(elementId, rotation);
}

export function getElementRotation(elementId) {
  const element = elements.get(elementId);
  return element?.data?.rotation || 0;
}

export function rotateElementBy(elementId, deltaRotation) {
  const currentRotation = getElementRotation(elementId);
  rotateElement(elementId, currentRotation + deltaRotation);
}

export function deleteSelectedElement() {
  if (!selectedElementId) return;

  const element = elements.get(selectedElementId);
  if (!element) return;

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot delete locked element', 'warning');
    }
    return;
  }

  const elementIdToDelete = selectedElementId;

  // Save undo state BEFORE deleting the element
  saveCanvasState('Delete Element');

  // Add poof effect before deleting (while element still exists)
  if (dependencies.addPoofEffectToElement) {
    console.log(`Adding poof effect for deleted element ${element.id} (${element.type})`);
    dependencies.addPoofEffectToElement(element);
  }

  // Remove any connections to this element before deleting
  if (window.connectionManager && window.connectionManager.removeConnectionsToElement) {
    window.connectionManager.removeConnectionsToElement(elementIdToDelete);
  }

  // Delete locally for immediate feedback
  elements.delete(selectedElementId);
  selectedElementId = null;

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  // Send deletion to server to sync with other clients and persist to database
  if (dependencies.sendElementDelete && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElementDelete(boardId, elementIdToDelete)
        .catch(error => {
          console.error('Failed to delete element on server:', error);
          // Could optionally restore element locally if server deletion fails
          if (dependencies.showNotification) {
            dependencies.showNotification('Failed to delete element - other clients may not see the change', 'warning');
          }
        });
    }
  } else {
    console.warn('Cannot delete element on server - SignalR not available or board ID missing');
    if (dependencies.showNotification) {
      dependencies.showNotification('Element deleted locally only - may not be synced with other clients', 'warning');
    }
  }
}

export function deleteMultipleElements(elementIds) {
  if (!elementIds || elementIds.size === 0) {
    console.log('deleteMultipleElements: No elements to delete');
    return [];
  }

  console.log(`deleteMultipleElements: Deleting ${elementIds.size} elements`);
  
  // Collect elements and validate they exist and aren't locked
  const elementsToDelete = [];
  const lockedElements = [];
  const elementIdsToDelete = [];

  for (const elementId of elementIds) {
    const element = elements.get(elementId);
    if (!element) {
      console.warn(`Element ${elementId} not found for deletion`);
      continue;
    }

    // Check if element is locked
    if (isElementLocked(element)) {
      lockedElements.push(element);
      continue;
    }

    elementsToDelete.push(element);
    elementIdsToDelete.push(elementId);
  }

  // Notify about locked elements
  if (lockedElements.length > 0) {
    if (dependencies.showNotification) {
      const message = lockedElements.length === 1 
        ? 'Cannot delete locked element'
        : `Cannot delete ${lockedElements.length} locked elements`;
      dependencies.showNotification(message, 'warning');
    }
  }

  // If no elements can be deleted, return early
  if (elementsToDelete.length === 0) {
    console.log('deleteMultipleElements: No deletable elements found');
    return [];
  }

  // Save undo state BEFORE deleting the elements
  saveCanvasState(`Delete ${elementsToDelete.length} Elements`);

  // Add poof effects before deleting (while elements still exist)
  if (dependencies.addPoofEffectsToElements && elementsToDelete.length > 0) {
    console.log(`Adding poof effects for ${elementsToDelete.length} deleted elements`);
    dependencies.addPoofEffectsToElements(elementsToDelete);
  }

  // Delete locally for immediate feedback
  for (const elementId of elementIdsToDelete) {
    elements.delete(elementId);
    
    // Clear selection if this element was selected
    if (selectedElementId === elementId) {
      selectedElementId = null;
    }
  }

  // Redraw canvas to show changes
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  // Send deletions to server to sync with other clients and persist to database
  if (dependencies.sendElementDelete && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      const deletionPromises = elementIdsToDelete.map(elementId => 
        dependencies.sendElementDelete(boardId, elementId)
        .catch(error => {
          console.error(`Failed to delete element ${elementId} on server:`, error);
          return { elementId, error };
        })
    );

    Promise.all(deletionPromises)
      .then(results => {
        const failures = results.filter(result => result && result.error);
        if (failures.length > 0) {
          console.error(`Failed to delete ${failures.length} elements on server`);
          if (dependencies.showNotification) {
            const message = failures.length === 1
              ? 'Failed to delete 1 element on server - other clients may not see the change'
              : `Failed to delete ${failures.length} elements on server - other clients may not see the changes`;
            dependencies.showNotification(message, 'warning');
          }
        } else {
          console.log(`Successfully deleted ${elementIdsToDelete.length} elements on server`);
        }
      });
    }
  } else {
    console.warn('Cannot delete elements on server - SignalR not available or board ID missing');
    if (dependencies.showNotification) {
      const message = elementIdsToDelete.length === 1
        ? 'Element deleted locally only - may not be synced with other clients'
        : `${elementIdsToDelete.length} elements deleted locally only - may not be synced with other clients`;
      dependencies.showNotification(message, 'warning');
    }
  }

  return elementIdsToDelete;
}

export function duplicateSelectedElement() {
  if (!selectedElementId) return;

  const element = elements.get(selectedElementId);
  if (!element) return;

  const duplicate = JSON.parse(JSON.stringify(element));
  duplicate.id = ElementFactory.createTempId();
  duplicate.x += 20;
  duplicate.y += 20;

  elements.set(duplicate.id, duplicate);
  selectedElementId = duplicate.id;

  saveCanvasState('Duplicate Element');

  // Send to server for persistence and synchronization
  if (dependencies.sendElement && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElement(boardId, duplicate, duplicate.id)
        .catch(error => {
          console.error('Failed to save duplicated element to server:', error);
          if (dependencies.showNotification) {
            dependencies.showNotification('Failed to save duplicate - other clients may not see it', 'warning');
          }
        });
    }
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function bringSelectedToFront() {
  if (!selectedElementId) return;

  const element = elements.get(selectedElementId);
  if (!element) return;

  elements.delete(selectedElementId);
  elements.set(selectedElementId, element);

  saveCanvasState('Bring to Front');

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function sendSelectedToBack() {
  if (!selectedElementId) return;

  const element = elements.get(selectedElementId);
  if (!element) return;

  const allElements = Array.from(elements.entries());
  elements.clear();

  elements.set(selectedElementId, element);

  for (const [id, el] of allElements) {
    if (id !== selectedElementId) {
      elements.set(id, el);
    }
  }

  saveCanvasState('Send to Back');

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

// Z-index based functions for specific elements (called from context menu)
export function bringElementToFront(elementId) {
  const element = elements.get(elementId);
  if (!element) {
    console.warn(`Element ${elementId} not found for bringing to front`);
    return;
  }

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot reorder locked element', 'warning');
    }
    return;
  }

  // Find the current maximum z-index
  let maxZ = 0;
  for (const [id, el] of elements) {
    if (el.z !== undefined && el.z > maxZ) {
      maxZ = el.z;
    }
  }

  // Set element to be above the current maximum
  element.z = maxZ + 1;
  if (element.data) {
    element.data.z = element.z;
  }

  console.log(`Brought element ${elementId} to front with z-index ${element.z}`);

  // Save state for undo/redo
  saveCanvasState('Bring to Front');

  // Send to server for synchronization
  if (dependencies.sendBringToFront && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendBringToFront(boardId, elementId);
    }
  }

  // Redraw canvas to reflect new z-order
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

export function sendElementToBack(elementId) {
  const element = elements.get(elementId);
  if (!element) {
    console.warn(`Element ${elementId} not found for sending to back`);
    return;
  }

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot reorder locked element', 'warning');
    }
    return;
  }

  // Find the current minimum z-index
  let minZ = 0;
  for (const [id, el] of elements) {
    if (el.z !== undefined && el.z < minZ) {
      minZ = el.z;
    }
  }

  // Set element to be below the current minimum
  element.z = minZ - 1;
  if (element.data) {
    element.data.z = element.z;
  }

  console.log(`Sent element ${elementId} to back with z-index ${element.z}`);

  // Save state for undo/redo
  saveCanvasState('Send to Back');

  // Send to server for synchronization
  if (dependencies.sendElementToBack && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElementToBack(boardId, elementId);
    }
  }

  // Redraw canvas to reflect new z-order
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }
}

// Element interaction helpers
export function isPointInElement(x, y, element) {
  if (!element) return false;

  // Get rotation angle
  const rotation = element.data?.rotation || 0;

  // If element is rotated, transform the point to element's local coordinate system
  let localX = x;
  let localY = y;

  if (rotation !== 0) {
    // Calculate element center
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    // Translate point to origin (element center)
    const translatedX = x - centerX;
    const translatedY = y - centerY;

    // Rotate point by negative rotation angle to get local coordinates
    const cos = Math.cos((-rotation * Math.PI) / 180);
    const sin = Math.sin((-rotation * Math.PI) / 180);

    localX = centerX + translatedX * cos - translatedY * sin;
    localY = centerY + translatedX * sin + translatedY * cos;
  }

  // Always normalize possible negative sizes
  const nx1 = Math.min(element.x, element.x + element.width);
  const ny1 = Math.min(element.y, element.y + element.height);
  const nx2 = Math.max(element.x, element.x + element.width);
  const ny2 = Math.max(element.y, element.y + element.height);

  switch (element.type) {
    case 'Line': {
      // For lines, use the original coordinates since rotation is handled above
      const z = dependencies.getZoomLevel ? dependencies.getZoomLevel() : (dependencies.zoomLevel ?? 1);
      const tolWorld = LINE_TOLERANCE_PX / Math.max(z, 1e-6);
      return pointToLineDistance(
        localX, localY,
        element.x, element.y,
        element.x + element.width,
        element.y + element.height
      ) <= tolWorld;
    }
    default:
      return localX >= nx1 && localX <= nx2 && localY >= ny1 && localY <= ny2;
  }
}

export function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) return Math.sqrt(A * A + B * B);

  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param));

  const xx = x1 + param * C;
  const yy = y1 + param * D;

  const dx = px - xx;
  const dy = py - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

export function isElementResizable(element) {
  return element && [
    'Rectangle', 'rectangle',
    'Circle', 'circle',
    'Triangle', 'triangle',
    'Diamond', 'diamond',
    'Ellipse', 'ellipse',
    'Star', 'star',
    'StickyNote', 'Text', 'Image'
  ].includes(element.type);
}

// Get resize handle at point (in screen coordinates)
export function getResizeHandleAt(x, y, selectionRect) {
  if (!selectionRect) return null;

  const handleSize = 8;
  const tolerance = handleSize / 2 + 2 + 20; // Larger padding for easier targeting (21px total)

  const handles = [
    { type: 'nw', x: selectionRect.x, y: selectionRect.y }, // Top-left
    { type: 'ne', x: selectionRect.x + selectionRect.width, y: selectionRect.y }, // Top-right
    { type: 'sw', x: selectionRect.x, y: selectionRect.y + selectionRect.height }, // Bottom-left
    { type: 'se', x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height }, // Bottom-right
    { type: 'n', x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y }, // Top-center
    { type: 's', x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y + selectionRect.height }, // Bottom-center
    { type: 'w', x: selectionRect.x, y: selectionRect.y + selectionRect.height / 2 }, // Left-center
    { type: 'e', x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height / 2 } // Right-center
  ];

  for (const handle of handles) {
    const dx = x - handle.x;
    const dy = y - handle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= tolerance) {
      return handle.type;
    }
  }

  return null;
}

// Get rotation handle at point (in world coordinates)
export function getRotationHandleAt(x, y, element) {
  if (!element) return null;
  
  // Lines should not have rotation handles - users should move endpoints instead
  if (element.type === 'Line') return null;

  const zoom = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;
  const handleSize = 8 / zoom;
  const tolerance = Math.max(50 / zoom, handleSize); // Larger hitbox - at least 50 pixels

  // Calculate rotation handle position
  const rotationHandleX = element.x + element.width / 2;
  const rotationHandleY = element.y - 30 / zoom;

  // Apply rotation transform to the handle position if element is rotated
  const rotation = element.data?.rotation || 0;
  let handleX = rotationHandleX;
  let handleY = rotationHandleY;

  if (rotation !== 0) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    // Transform the handle position by the element's rotation
    const cos = Math.cos((rotation * Math.PI) / 180);
    const sin = Math.sin((rotation * Math.PI) / 180);

    const relativeX = rotationHandleX - centerX;
    const relativeY = rotationHandleY - centerY;

    handleX = centerX + relativeX * cos - relativeY * sin;
    handleY = centerY + relativeX * sin + relativeY * cos;
  }

  const dx = x - handleX;
  const dy = y - handleY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Debug logging
  //console.log(`[ROTATION] Handle check: pos(${x.toFixed(1)}, ${y.toFixed(1)}) handle(${handleX.toFixed(1)}, ${handleY.toFixed(1)}) distance=${distance.toFixed(1)} tolerance=${tolerance.toFixed(1)}`);

  if (distance <= tolerance) {
    //console.log(`[ROTATION] Handle HIT detected!`);
    return 'rotate';
  }

  return null;
}

// Get cursor style for resize handle type
export function getResizeCursor(handleType) {
  const cursors = {
    'nw': 'nw-resize',
    'ne': 'ne-resize',
    'sw': 'sw-resize',
    'se': 'se-resize',
    'n': 'n-resize',
    's': 's-resize',
    'w': 'w-resize',
    'e': 'e-resize'
  };
  return cursors[handleType] || 'default';
}

// Resize handles and dragging
export function drawResizeHandles(selectionRect) {
  if (!dependencies.ctx) return;
  const ctx = dependencies.ctx;
  const handleSize = 8;
  ctx.save();
  // draw in pure screen px; canvas-manager restores to this baseline before UI, but be robust
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const handles = [
    { x: selectionRect.x, y: selectionRect.y }, // Top-left
    { x: selectionRect.x + selectionRect.width, y: selectionRect.y }, // Top-right
    { x: selectionRect.x, y: selectionRect.y + selectionRect.height }, // Bottom-left
    { x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height }, // Bottom-right
    { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y }, // Top-center
    { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y + selectionRect.height }, // Bottom-center
    { x: selectionRect.x, y: selectionRect.y + selectionRect.height / 2 }, // Left-center
    { x: selectionRect.x + selectionRect.width, y: selectionRect.y + selectionRect.height / 2 } // Right-center
  ];

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 1;

  for (const handle of handles) {
    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  }
  ctx.restore();
}

export function drawLineEndpointHandles(element) {
  if (!dependencies.ctx || element.type !== 'Line') return;

  const ctx = dependencies.ctx;
  const handleSize = 8;

  ctx.save();
  // Draw in world coordinates for line endpoints
  if (dependencies.applyViewportTransform) {
    dependencies.applyViewportTransform();
  }

  // Calculate line endpoints from element bounds
  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;

  // Adjust handle size for zoom level
  const zoom = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;
  const adjustedHandleSize = handleSize / zoom;

  const endpoints = [
    { x: x1, y: y1 }, // Start point
    { x: x2, y: y2 }  // End point
  ];

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 2 / zoom;

  for (const endpoint of endpoints) {
    ctx.beginPath();
    ctx.arc(endpoint.x, endpoint.y, adjustedHandleSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// Element resizing operations
export function startElementResize(elementId, handleType, startX, startY) {
  const element = elements.get(elementId);
  if (!element || !isElementResizable(element)) return false;

  // Check if element is locked
  if (isElementLocked(element)) {
    if (dependencies.showNotification) {
      dependencies.showNotification('Cannot resize locked element', 'warning');
    }
    return false;
  }

  isResizing = true;
  activeResizeHandle = handleType;
  resizeStartBounds = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    mouseX: startX,
    mouseY: startY
  };
  hasResized = false;

  console.log(`Started resizing element ${elementId} with handle ${handleType}`);
  return true;
}

export function updateElementResize(currentX, currentY) {
  if (!isResizing || !activeResizeHandle || !resizeStartBounds || !selectedElementId) return false;

  const element = elements.get(selectedElementId);
  if (!element) return false;

  // Calculate mouse delta from resize start position
  const deltaX = currentX - resizeStartBounds.mouseX;
  const deltaY = currentY - resizeStartBounds.mouseY;

  // Calculate new bounds based on handle type
  const newBounds = calculateNewBounds(resizeStartBounds, activeResizeHandle, deltaX, deltaY, window.isShiftHeld);

  // Apply snap-to-grid if enabled
  if (window.canvasManager && window.canvasManager.isSnapToGridEnabled()) {
    // Snap position to grid
    const snappedPos = window.canvasManager.snapToGridPoint(newBounds.x, newBounds.y);
    newBounds.x = snappedPos.x;
    newBounds.y = snappedPos.y;

    // Snap dimensions to grid increments
    newBounds.width = window.canvasManager.snapToGridCoordinate(newBounds.width);
    newBounds.height = window.canvasManager.snapToGridCoordinate(newBounds.height);
  }

  // Apply minimum size constraints
  const minWidth = 20;
  const minHeight = 20;

  if (newBounds.width < minWidth || newBounds.height < minHeight) {
    return false;
  }

  // Update element bounds
  element.x = newBounds.x;
  element.y = newBounds.y;
  element.width = newBounds.width;
  element.height = newBounds.height;

  hasResized = true;

  // Redraw canvas to show updated element
  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  return true;
}

export function finishElementResize() {
  if (!isResizing || !selectedElementId) return false;

  const wasResizing = isResizing;
  const element = elements.get(selectedElementId);

  // Reset resize state
  isResizing = false;
  activeResizeHandle = null;
  resizeStartBounds = null;

  if (wasResizing && hasResized && element) {
    // Update any lines connected to this element after resizing
    if (window.connectionManager && window.connectionManager.updateConnectedLines) {
      window.connectionManager.updateConnectedLines(selectedElementId);
    }

    // Send resize to SignalR for network sync
    if (dependencies.sendElementResize && dependencies.currentBoardId) {
      const boardId = dependencies.currentBoardId();
      if (boardId) {
        dependencies.sendElementResize(
          boardId,
          selectedElementId,
          element.x,
          element.y,
          element.width,
          element.height
        );
      }
    }

    // Save state for undo/redo
    saveCanvasState('Resize Element');

    console.log(`Finished resizing element ${selectedElementId}`);
  }

  hasResized = false;
  return wasResizing;
}

// Calculate new bounds based on resize handle and mouse delta
function calculateNewBounds(originalBounds, handleType, deltaX, deltaY, isShiftHeld = false) {
  let { x, y, width, height } = originalBounds;

  // Calculate original aspect ratio for proportional resizing
  const originalAspectRatio = originalBounds.width / originalBounds.height;
  
  // Corner handles support proportional resizing when shift is held
  const isCornerHandle = ['nw', 'ne', 'sw', 'se'].includes(handleType);
  
  if (isShiftHeld && isCornerHandle) {
    // For proportional resizing, determine which delta is larger to drive the resize
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    let newWidth, newHeight;
    
    // Use the larger delta to determine the primary resize direction
    if (absDeltaX >= absDeltaY) {
      // X-direction drives the resize
      switch (handleType) {
        case 'nw':
        case 'sw':
          newWidth = originalBounds.width - deltaX;
          break;
        case 'ne':
        case 'se':
          newWidth = originalBounds.width + deltaX;
          break;
      }
      newHeight = newWidth / originalAspectRatio;
    } else {
      // Y-direction drives the resize
      switch (handleType) {
        case 'nw':
        case 'ne':
          newHeight = originalBounds.height - deltaY;
          break;
        case 'sw':
        case 'se':
          newHeight = originalBounds.height + deltaY;
          break;
      }
      newWidth = newHeight * originalAspectRatio;
    }
    
    // Calculate position changes based on handle type
    switch (handleType) {
      case 'nw': // Top-left
        x = originalBounds.x + (originalBounds.width - newWidth);
        y = originalBounds.y + (originalBounds.height - newHeight);
        width = newWidth;
        height = newHeight;
        break;
      case 'ne': // Top-right
        y = originalBounds.y + (originalBounds.height - newHeight);
        width = newWidth;
        height = newHeight;
        break;
      case 'sw': // Bottom-left
        x = originalBounds.x + (originalBounds.width - newWidth);
        width = newWidth;
        height = newHeight;
        break;
      case 'se': // Bottom-right
        width = newWidth;
        height = newHeight;
        break;
    }
  } else {
    // Non-proportional resizing (default behavior)
    switch (handleType) {
      case 'nw': // Top-left
        x += deltaX;
        y += deltaY;
        width -= deltaX;
        height -= deltaY;
        break;

      case 'ne': // Top-right
        y += deltaY;
        width += deltaX;
        height -= deltaY;
        break;

      case 'sw': // Bottom-left
        x += deltaX;
        width -= deltaX;
        height += deltaY;
        break;

      case 'se': // Bottom-right
        width += deltaX;
        height += deltaY;
        break;

      case 'n': // Top-center
        y += deltaY;
        height -= deltaY;
        break;

      case 's': // Bottom-center
        height += deltaY;
        break;

      case 'w': // Left-center
        x += deltaX;
        width -= deltaX;
        break;

      case 'e': // Right-center
        width += deltaX;
        break;
    }
  }

  return { x, y, width, height };
}

// Check if currently resizing
export function isCurrentlyResizing() {
  return isResizing;
}

// Get active resize handle
export function getActiveResizeHandle() {
  return activeResizeHandle;
}

// Copy/paste operations
export function copySelectedElement() {
  if (!selectedElementId) return;

  const element = elements.get(selectedElementId);
  if (element) {
    copiedElement = JSON.parse(JSON.stringify(element));
    if (dependencies.showNotification) {
      dependencies.showNotification('Element copied', 'success');
    }
  }
}

export function pasteElement() {
  if (!copiedElement) return;

  const duplicate = JSON.parse(JSON.stringify(copiedElement));
  duplicate.id = ElementFactory.createTempId();
  duplicate.x += 20;
  duplicate.y += 20;

  elements.set(duplicate.id, duplicate);
  selectedElementId = duplicate.id;

  saveCanvasState('Paste Element');

  // Send element to server for persistence and synchronization
  if (dependencies.sendElement && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElement(boardId, duplicate, duplicate.id);
      markElementForSelection(duplicate.id);
    }
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  if (dependencies.showNotification) {
    dependencies.showNotification('Element pasted', 'success');
  }
}

// Undo/redo system
// Helper function to deep clone elements
function deepCloneElements(elementsMap) {
  const result = [];
  for (const [id, element] of elementsMap.entries()) {
    try {
      // Use structuredClone if available (modern browsers), otherwise fall back to JSON
      const clonedElement = typeof structuredClone !== 'undefined'
        ? structuredClone(element)
        : JSON.parse(JSON.stringify(element));
      result.push([id, clonedElement]);
    } catch (error) {
      console.warn('Failed to clone element', id, '- using shallow copy as fallback:', error);
      result.push([id, { ...element }]); // Shallow fallback
    }
  }
  return result;
}

export function saveCanvasState(action) {
  console.log('saveCanvasState called with action:', action, 'isUndoRedoOperation:', isUndoRedoOperation);
  if (isUndoRedoOperation) {
    console.log('SAVE STATE BLOCKED: isUndoRedoOperation is true');
    return;
  }

  try {
    const state = {
      elements: deepCloneElements(elements),
      selectedElementId: selectedElementId,
      timestamp: Date.now(),
      action: action
    };

    console.log('SAVE STATE:', action, 'with', state.elements.length, 'elements');
    if (state.elements.length > 0) {
      const firstElement = state.elements[0][1];
      console.log('  First element:', firstElement.id, 'at position', firstElement.x, firstElement.y);
    }

    undoStack.push(state);

    if (undoStack.length > maxUndoSteps) {
      undoStack.shift();
    }

    redoStack.length = 0;

  } catch (error) {
    console.error('Failed to save canvas state:', error);
  }
}

export async function undo() {
  console.log('UNDO CALLED: Stack length is', undoStack.length);
  if (undoStack.length === 0) {
    console.log('UNDO ABORTED: No states in undo stack');
    return;
  }

  try {
    isUndoRedoOperation = true;

    // Capture current state for comparison using deep cloning
    const currentState = {
      elements: deepCloneElements(elements),
      selectedElementId: selectedElementId,
      timestamp: Date.now(),
      action: 'Current State'
    };

    redoStack.push(currentState);

    const previousState = undoStack.pop();

    // Clear and restore previous state with deep cloning
    console.log('UNDO: Clearing elements and restoring from state with', previousState.elements.length, 'elements');
    elements.clear();
    for (const [id, element] of previousState.elements) {
      try {
        // Deep clone the element before adding it to current state to prevent future corruption
        const clonedElement = typeof structuredClone !== 'undefined'
          ? structuredClone(element)
          : JSON.parse(JSON.stringify(element));
        console.log('UNDO: Restoring element', id, 'at position', clonedElement.x, clonedElement.y);
        elements.set(id, clonedElement);
      } catch (error) {
        console.warn('Failed to clone element during undo', id, '- using direct reference:', error);
        elements.set(id, element); // Fallback to direct reference
      }
    }

    selectedElementId = previousState.selectedElementId;

    // Detect elements that were restored (newly added) during undo
    const restoredElements = [];
    const currentElementIds = new Set(currentState.elements.map(([id, element]) => id));
    for (const [id, element] of previousState.elements) {
      if (!currentElementIds.has(id)) {
        restoredElements.push(element);
      }
    }

    // Add sparkle effects to restored elements
    if (restoredElements.length > 0 && dependencies.addSparkleEffectsToElements) {
      console.log(`Adding sparkle effects to ${restoredElements.length} restored elements`);
      dependencies.addSparkleEffectsToElements(restoredElements);
    }

    // Sync changes to server
    console.log('[UNDO] About to sync element changes to server');
    await syncElementChangesToServer(currentState.elements, previousState.elements);
    console.log('[UNDO] Completed server sync');

    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }

    if (dependencies.showNotification) {
      dependencies.showNotification(`Undone: ${previousState.action}`, 'info');
    }

  } catch (error) {
    console.error('Failed to undo:', error);
  } finally {
    isUndoRedoOperation = false;
  }
}

export async function redo() {
  if (redoStack.length === 0) return;

  try {
    isUndoRedoOperation = true;

    // Capture current state for comparison using deep cloning
    const currentState = {
      elements: deepCloneElements(elements),
      selectedElementId: selectedElementId,
      timestamp: Date.now(),
      action: 'Current State'
    };

    undoStack.push(currentState);

    const nextState = redoStack.pop();

    // Clear and restore next state with deep cloning
    elements.clear();
    for (const [id, element] of nextState.elements) {
      try {
        // Deep clone the element before adding it to current state to prevent future corruption
        const clonedElement = typeof structuredClone !== 'undefined'
          ? structuredClone(element)
          : JSON.parse(JSON.stringify(element));
        elements.set(id, clonedElement);
      } catch (error) {
        console.warn('Failed to clone element during redo', id, '- using direct reference:', error);
        elements.set(id, element); // Fallback to direct reference
      }
    }

    selectedElementId = nextState.selectedElementId;

    // Detect elements that were restored (newly added) during redo
    const restoredElements = [];
    const currentElementIds = new Set(currentState.elements.map(([id, element]) => id));
    for (const [id, element] of nextState.elements) {
      if (!currentElementIds.has(id)) {
        restoredElements.push(element);
      }
    }

    // Add sparkle effects to restored elements
    if (restoredElements.length > 0 && dependencies.addSparkleEffectsToElements) {
      console.log(`Adding sparkle effects to ${restoredElements.length} restored elements during redo`);
      dependencies.addSparkleEffectsToElements(restoredElements);
    }

    // Sync changes to server
    await syncElementChangesToServer(currentState.elements, nextState.elements);

    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }

    if (dependencies.showNotification) {
      dependencies.showNotification(`Redone: ${nextState.action}`, 'info');
    }

  } catch (error) {
    console.error('Failed to redo:', error);
  } finally {
    isUndoRedoOperation = false;
  }
}

// Element editing functions
export function startEditingStickyNote(elementId, element) {
  editingElement = element; // Legacy compatibility
  return editorManager.startEditing(elementId, element, 'StickyNote');
}

export function stopEditingStickyNote() {
  editingElement = null; // Legacy compatibility
  return editorManager.stopEditing();
}

export function startEditingTextElement(elementId, element) {
  editingElement = element; // Legacy compatibility
  return editorManager.startEditing(elementId, element, 'Text');
}

export function stopEditingTextElement() {
  editingElement = null; // Legacy compatibility
  return editorManager.stopEditing();
}

export function startEditingElement(elementId) {
  const element = elements.get(elementId);
  if (!element) {
    console.warn(`Element ${elementId} not found for editing`);
    return;
  }

  switch (element.type) {
    case 'StickyNote':
      return startEditingStickyNote(elementId, element);
    case 'Text':
      return startEditingTextElement(elementId, element);
    default:
      console.log(`Element type ${element.type} is not editable`);
      return;
  }
}

// Element locking functions
export function isElementLocked(element) {
  return element && element.data && element.data.locked === true;
}

export function lockElement(elementId) {
  const element = elements.get(elementId);
  if (!element) return false;

  if (!element.data) element.data = {};
  element.data.locked = true;

  saveCanvasState('Lock Element');

  // Send lock state to server for real-time sync
  if (dependencies.sendElementLock && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElementLock(boardId, elementId, true).catch(error => {
        console.error(`Failed to send lock state to server for element ${elementId}:`, error);
        if (dependencies.showNotification) {
          dependencies.showNotification('Failed to sync lock state with other clients', 'warning');
        }
      });
    }
  }

  // Show success notification
  if (dependencies.showNotification) {
    dependencies.showNotification(`🔒 ${element.type} element locked`, 'success');
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  return true;
}

export function unlockElement(elementId) {
  const element = elements.get(elementId);
  if (!element) return false;

  if (!element.data) element.data = {};
  element.data.locked = false;

  saveCanvasState('Unlock Element');

  // Send unlock state to server for real-time sync
  if (dependencies.sendElementLock && dependencies.currentBoardId) {
    const boardId = dependencies.currentBoardId();
    if (boardId) {
      dependencies.sendElementLock(boardId, elementId, false).catch(error => {
        console.error(`Failed to send unlock state to server for element ${elementId}:`, error);
        if (dependencies.showNotification) {
          dependencies.showNotification('Failed to sync unlock state with other clients', 'warning');
        }
      });
    }
  }

  // Show success notification
  if (dependencies.showNotification) {
    dependencies.showNotification(`🔓 ${element.type} element unlocked`, 'success');
  }

  if (dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  return true;
}

export function toggleElementLock(elementId) {
  const element = elements.get(elementId);
  if (!element) return false;

  if (isElementLocked(element)) {
    return unlockElement(elementId);
  } else {
    return lockElement(elementId);
  }
}

// Utility functions
export function getSelectedElement() {
  return selectedElementId ? elements.get(selectedElementId) : null;
}

export function getSelectedElementId() {
  return selectedElementId;
}

export function hasSelection() {
  return selectedElementId !== null;
}

export function getElementCount() {
  return elements.size;
}

export function getAllElements() {
  return Array.from(elements.values());
}

export function getElementById(id) {
  return elements.get(id);
}

// Migrate existing elements to have z-index, createdAt, locked, and rotation properties
function migrateExistingElements() {
  let migrated = 0;
  for (const [id, element] of elements) {
    if (element.z === undefined) {
      element.z = 0;
      migrated++;
    }
    if (element.createdAt === undefined) {
      element.createdAt = Date.now() + migrated; // spread them out slightly
      migrated++;
    }
    // Ensure element has data object
    if (!element.data) {
      element.data = {};
      migrated++;
    }
    // Also ensure data.z is set
    if (element.data.z === undefined) {
      element.data.z = element.z;
    }
    // Ensure locked property exists
    if (element.data.locked === undefined) {
      element.data.locked = false;
      migrated++;
    }
    // Ensure rotation property exists
    if (element.data.rotation === undefined) {
      element.data.rotation = 0;
      migrated++;
    }
  }
  if (migrated > 0) {
    console.log(`[migration] Updated ${Math.floor(migrated / 4)} existing elements with z-index, createdAt, locked, and rotation properties`);
    // Force redraw
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }
}

// Manual migration function for debugging
export function forceMigrateElements() {
  console.log('[debug] Force migrating elements...');
  migrateExistingElements();
  console.log('[debug] Current elements:', Array.from(elements.values()).map(e => ({
    id: e.id.substring(0, 8),
    type: e.type,
    z: e.z,
    createdAt: e.createdAt
  })));
}

// Clean up corrupted image elements
function cleanupCorruptedImageElements() {
  let removedCount = 0;
  const elementsToRemove = [];

  for (const [id, element] of elements) {
    if (element.type === 'Image' && element.data && element.data.imageData) {
      if (!validateImageData(element.data.imageData)) {
        console.log(`Found corrupted image element ${id} with imageData:`, element.data.imageData);
        elementsToRemove.push(id);
        removedCount++;
      }
    }
  }

  // Remove corrupted elements
  for (const id of elementsToRemove) {
    elements.delete(id);

    // Clear from selection if it was selected
    if (selectedElementId === id) {
      selectedElementId = null;
    }
  }

  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} corrupted image elements`);
    // Force redraw to update canvas
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }
}

// Initialize the module
export function init() {
  console.log('Element Factory module loaded');
  // Migrate any existing elements to have z-index
  setTimeout(() => {
    migrateExistingElements();
    // Clean up any corrupted image elements after loading
    cleanupCorruptedImageElements();
  }, 100); // delay to ensure all elements are loaded
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
  window.ElementFactory = ElementFactory;
  window.editorManager = editorManager;
  window.elements = elements;
  window.selectedElementId = selectedElementId;
  window.collaborativeSelections = collaborativeSelections;
  window.createTextElement = createTextElement;
  window.createStickyNote = createStickyNote;
  window.createShapeElement = createShapeElement;
  window.createLineElement = createLineElement;
  window.createImageElement = createImageElement;
  window.createPathElement = createPathElement;
  window.drawElement = drawElement;
  window.getElementAtPoint = getElementAtPoint;
  window.highlightElement = highlightElement;
  window.clearSelection = clearSelection;
  window.showElementSelection = showElementSelection;
  window.hideElementSelection = hideElementSelection;
  window.drawCollaborativeSelections = drawCollaborativeSelections;
  window.updateElementPosition = updateElementPosition;
  window.moveSelectedElements = moveSelectedElements;
  window.updateElementStyle = updateElementStyle;
  window.deleteSelectedElement = deleteSelectedElement;
  window.deleteMultipleElements = deleteMultipleElements;
  window.duplicateSelectedElement = duplicateSelectedElement;
  window.copySelectedElement = copySelectedElement;
  window.pasteElement = pasteElement;
  window.undo = undo;
  window.redo = redo;
  window.saveCanvasState = saveCanvasState;
  window.startEditingStickyNote = startEditingStickyNote;
  window.stopEditingStickyNote = stopEditingStickyNote;
  window.startEditingTextElement = startEditingTextElement;
  window.stopEditingTextElement = stopEditingTextElement;
  window.forceMigrateElements = forceMigrateElements;
  // Resize functionality
  window.isElementResizable = isElementResizable;
  window.getResizeHandleAt = getResizeHandleAt;
  window.getRotationHandleAt = getRotationHandleAt;
  window.getResizeCursor = getResizeCursor;
  window.startElementResize = startElementResize;
  window.updateElementResize = updateElementResize;
  window.finishElementResize = finishElementResize;
  window.isCurrentlyResizing = isCurrentlyResizing;
  window.getActiveResizeHandle = getActiveResizeHandle;
  // Lock functionality
  window.isElementLocked = isElementLocked;
  window.lockElement = lockElement;
  window.unlockElement = unlockElement;
  window.toggleElementLock = toggleElementLock;
  // Z-index functionality
  window.bringElementToFront = bringElementToFront;
  window.sendElementToBack = sendElementToBack;
  // Rotation functionality
  window.rotateElement = rotateElement;
  window.setElementRotation = setElementRotation;
  window.getElementRotation = getElementRotation;
  window.rotateElementBy = rotateElementBy;
}
