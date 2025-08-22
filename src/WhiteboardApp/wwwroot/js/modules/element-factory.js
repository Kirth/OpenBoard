// Element Factory Module - Handles all element creation, management, and operations
// This is the largest module, containing element CRUD operations, selection, editing,
// resizing, dragging, copy/paste, and undo/redo functionality

// Core element storage
export let elements = new Map();
export let selectedElementId = null;
export let elementsToSelect = new Set();

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

// Constants
const LINE_SELECTION_TOLERANCE = 8;

// Dependencies that will be injected from other modules
let dependencies = {
    canvas: null,
    ctx: null,
    tempCanvas: null,
    tempCtx: null,
    viewportX: 0,
    viewportY: 0,
    zoomLevel: 1,
    screenToWorld: null,
    worldToScreen: null,
    redrawCanvas: null,
    signalRConnection: null,
    currentBoardId: null,
    sendElement: null,
    sendElementMove: null,
    sendElementSelect: null,
    sendElementDeselect: null,
    sendElementResize: null,
    updateStickyNoteContent: null,
    updateTextElementContent: null,
    blazorReference: null,
    showNotification: null
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
            data: {
                content: content,
                color: color,
                fontSize: 14,
                isEditing: false
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
            data: {
                content: content,
                fontSize: fontSize,
                fontFamily: 'Arial',
                color: color,
                isEditing: false
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
            data: {
                color: style.color || '#000000',
                fillColor: style.fillColor || 'transparent',
                strokeWidth: style.strokeWidth || 2
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
            data: {
                color: style.color || '#000000',
                strokeWidth: style.strokeWidth || 2
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
            data: {
                imageData: imageData
            }
        };
    }

    static createPathElement(path, style = {}) {
        const bounds = this.calculatePathBounds(path);
        return {
            id: this.createTempId(),
            type: 'Path',
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            data: {
                path: path,
                color: style.color || '#000000',
                strokeWidth: style.strokeWidth || 2
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
        this.onToolSwitchRequest = null;
        this.onStateChange = null;
    }
    
    canStartEditing() {
        return this.state === 'IDLE';
    }
    
    canStopEditing() {
        return this.state === 'EDITING';
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
            
            await this.cleanup();
            
            this.editingElementId = elementId;
            this.element = element;
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
                
                if (dependencies.signalRConnection && dependencies.signalRConnection.state === signalR.HubConnectionState.Connected) {
                    if (!this.editingElementId.startsWith('temp-')) {
                        if (this.element.type === 'StickyNote') {
                            dependencies.updateStickyNoteContent?.(this.editingElementId, newContent);
                        } else if (this.element.type === 'Text') {
                            dependencies.updateTextElementContent?.(this.editingElementId, newContent);
                        }
                    } else {
                        this.element.data.pendingUpdate = true;
                    }
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
            this.editInput.style.width = (this.element.width * dependencies.zoomLevel - 20) + 'px';
            this.editInput.style.height = (this.element.height * dependencies.zoomLevel - 20) + 'px';
            this.editInput.style.fontSize = ((this.element.data.fontSize || 14) * dependencies.zoomLevel) + 'px';
            this.editInput.style.fontFamily = 'Arial';
            this.editInput.style.backgroundColor = this.element.data.color || '#ffeb3b';
        } else if (elementType === 'Text') {
            this.editInput.style.left = (rect.left + screenPos.x) + 'px';
            this.editInput.style.top = (rect.top + screenPos.y) + 'px';
            this.editInput.style.width = (this.element.width * dependencies.zoomLevel) + 'px';
            this.editInput.style.height = (this.element.height * dependencies.zoomLevel) + 'px';
            this.editInput.style.fontSize = ((this.element.data.fontSize || 16) * dependencies.zoomLevel) + 'px';
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
    const width = endX - startX;
    const height = endY - startY;
    const element = ElementFactory.createShapeElement(shapeType, startX, startY, width, height);
    elements.set(element.id, element);
    saveCanvasState('Create ' + shapeType);
    return element;
}

export function createLineElement(startX, startY, endX, endY) {
    const element = ElementFactory.createLineElement(startX, startY, endX, endY);
    elements.set(element.id, element);
    saveCanvasState('Create Line');
    return element;
}

export function createImageElement(x, y, imageData) {
    const element = ElementFactory.createImageElement(x, y, 200, 200, imageData);
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

// Element management functions
export function drawElement(id, x, y, type, data, width, height) {
    const element = {
        id: id,
        type: type,
        x: x,
        y: y,
        width: width,
        height: height,
        data: data
    };
    
    elements.set(id, element);
    
    if (elementsToSelect.has(id)) {
        selectedElementId = id;
        elementsToSelect.delete(id);
    }
    
    if (dependencies.redrawCanvas) {
        dependencies.redrawCanvas();
    }
}

export function getElementAtPoint(x, y) {
    // Search in reverse order to get topmost element
    const elementArray = Array.from(elements.values()).reverse();
    
    for (const element of elementArray) {
        if (isPointInElement(x, y, element)) {
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
    selectedElementId = id;
    if (dependencies.redrawCanvas) {
        dependencies.redrawCanvas();
    }
}

export function clearSelection() {
    selectedElementId = null;
    if (dependencies.redrawCanvas) {
        dependencies.redrawCanvas();
    }
}

export function showElementSelection(elementId, userName, connectionId) {
    // Implementation for showing collaborative selections
    console.log(`${userName} selected element ${elementId}`);
}

export function hideElementSelection(elementId, connectionId) {
    // Implementation for hiding collaborative selections
    console.log(`Element ${elementId} deselected by ${connectionId}`);
}

export function drawCollaborativeSelections() {
    // Implementation for drawing collaborative selection indicators
    if (!dependencies.ctx) return;
    
    // This would draw selection indicators for other users
    // For now, just a placeholder
}

// Element operations
export function updateElementPosition(id, newX, newY) {
    const element = elements.get(id);
    if (element) {
        element.x = newX;
        element.y = newY;
        
        if (dependencies.sendElementMove && dependencies.currentBoardId) {
            dependencies.sendElementMove(dependencies.currentBoardId, id, newX, newY);
        }
        
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
    }
}

export function deleteSelectedElement() {
    if (!selectedElementId) return;
    
    elements.delete(selectedElementId);
    saveCanvasState('Delete Element');
    selectedElementId = null;
    
    if (dependencies.redrawCanvas) {
        dependencies.redrawCanvas();
    }
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

// Element interaction helpers
export function isPointInElement(x, y, element) {
    if (!element) return false;
    
    switch (element.type) {
        case 'Line':
            return pointToLineDistance(x, y, element.x, element.y, 
                element.x + element.width, element.y + element.height) <= LINE_SELECTION_TOLERANCE;
        default:
            return x >= element.x && x <= element.x + element.width &&
                   y >= element.y && y <= element.y + element.height;
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
    return element && ['Rectangle', 'Circle', 'StickyNote', 'Text', 'Image'].includes(element.type);
}

// Resize handles and dragging
export function drawResizeHandles(selectionRect) {
    if (!dependencies.ctx) return;
    
    const handleSize = 8;
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
    
    dependencies.ctx.fillStyle = '#ffffff';
    dependencies.ctx.strokeStyle = '#007bff';
    dependencies.ctx.lineWidth = 1;
    
    for (const handle of handles) {
        dependencies.ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        dependencies.ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    }
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
    
    if (dependencies.redrawCanvas) {
        dependencies.redrawCanvas();
    }
    
    if (dependencies.showNotification) {
        dependencies.showNotification('Element pasted', 'success');
    }
}

// Undo/redo system
export function saveCanvasState(action) {
    if (isUndoRedoOperation) return;
    
    try {
        const state = {
            elements: Array.from(elements.entries()),
            selectedElementId: selectedElementId,
            timestamp: Date.now(),
            action: action
        };
        
        undoStack.push(state);
        
        if (undoStack.length > maxUndoSteps) {
            undoStack.shift();
        }
        
        redoStack.length = 0;
        
    } catch (error) {
        console.error('Failed to save canvas state:', error);
    }
}

export function undo() {
    if (undoStack.length === 0) return;
    
    try {
        isUndoRedoOperation = true;
        
        const currentState = {
            elements: Array.from(elements.entries()),
            selectedElementId: selectedElementId,
            timestamp: Date.now(),
            action: 'Current State'
        };
        
        redoStack.push(currentState);
        
        const previousState = undoStack.pop();
        
        elements.clear();
        for (const [id, element] of previousState.elements) {
            elements.set(id, element);
        }
        
        selectedElementId = previousState.selectedElementId;
        
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

export function redo() {
    if (redoStack.length === 0) return;
    
    try {
        isUndoRedoOperation = true;
        
        const currentState = {
            elements: Array.from(elements.entries()),
            selectedElementId: selectedElementId,
            timestamp: Date.now(),
            action: 'Current State'
        };
        
        undoStack.push(currentState);
        
        const nextState = redoStack.pop();
        
        elements.clear();
        for (const [id, element] of nextState.elements) {
            elements.set(id, element);
        }
        
        selectedElementId = nextState.selectedElementId;
        
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

// Utility functions
export function getSelectedElement() {
    return selectedElementId ? elements.get(selectedElementId) : null;
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

// Initialize the module
export function init() {
    console.log('Element Factory module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
    window.ElementFactory = ElementFactory;
    window.editorManager = editorManager;
    window.elements = elements;
    window.selectedElementId = selectedElementId;
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
    window.updateElementPosition = updateElementPosition;
    window.deleteSelectedElement = deleteSelectedElement;
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
}