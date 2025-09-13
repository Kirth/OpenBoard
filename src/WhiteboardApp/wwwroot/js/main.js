// Main Module - ES6 Module Entry Point and Coordinator
// Streamlined main entry point that coordinates between all modules
// This replaces the original 2600+ line main.js with a focused coordinator

// Import all core modules
import * as canvasManager from './modules/canvas-manager.js';
import * as toolManager from './modules/tool-manager.js';
import * as elementFactory from './modules/element-factory.js';
import * as signalrClient from './modules/signalr-client.js';
import * as viewportManager from './modules/viewport-manager.js';

// Import extracted modules
import * as appCoordinator from './modules/app-coordinator.js';
import * as eventHandler from './modules/event-handler.js';
import * as interactionManager from './modules/interaction-manager.js';
import * as uiFeatures from './modules/ui-features.js';
import * as blazorIntegration from './modules/blazor-integration.js';
import groupManager from './modules/group-manager.js';

// Global state variables for coordination (minimal set)
export let pendingImagePosition = null;
export let shouldSwitchToSelectAfterEditing = false;
export let startX = 0, startY = 0;
export let startScreenX = 0, startScreenY = 0;

// Main initialization function
export async function initializeApplication() {
  try {
    console.log('Initializing OpenBoard application...');

    // Initialize the app coordinator
    const success = await appCoordinator.initializeApplication();
    if (!success) {
      throw new Error('Application initialization failed');
    }

    // Set up dependencies for extracted modules
    setupModuleDependencies();

    // Set up event handlers
    eventHandler.setupEventHandlers();

    // Initialize dark mode
    uiFeatures.initializeDarkMode();

    // Setup global exposure for Blazor integration
    blazorIntegration.setupGlobalExposure();

    console.log('OpenBoard application initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    return false;
  }
}

// Set up dependencies for extracted modules
function setupModuleDependencies() {
  // Get module references
  const modules = {
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    appCoordinator,
    groupManager
  };

  // Set up event handler dependencies
  eventHandler.setDependencies({
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    // Interaction state accessors
    get isDragging() { return interactionManager.getIsDragging(); },
    get draggedElementId() { return interactionManager.getDraggedElementId(); },
    get dragStartX() { return interactionManager.getDragStartX(); },
    get dragStartY() { return interactionManager.getDragStartY(); },
    get elementStartX() { return interactionManager.getElementStartX(); },
    get elementStartY() { return interactionManager.getElementStartY(); },
    get elementHasMoved() { return interactionManager.getElementHasMoved(); },
    get undoStateSaved() { return interactionManager.getUndoStateSaved(); },
    get isDraggingLineHandle() { return interactionManager.getIsDraggingLineHandle(); },
    get draggedLineHandle() { return interactionManager.getDraggedLineHandle(); },
    get lineOriginalStart() { return interactionManager.getLineOriginalStart(); },
    get lineOriginalEnd() { return interactionManager.getLineOriginalEnd(); },
    get isResizing() { return interactionManager.getIsResizing(); },
    get isRotating() { return interactionManager.getIsRotating(); },
    get rotationStartAngle() { return interactionManager.getRotationStartAngle(); },
    get rotationElementStartAngle() { return interactionManager.getRotationElementStartAngle(); },
    get isSelectionDragging() { return interactionManager.getIsSelectionDragging(); },
    get longTouchTimer() { return interactionManager.getLongTouchTimer(); },
    get isDraggingGroup() { return interactionManager.getIsDraggingGroup(); },
    get groupInitialPositions() { return interactionManager.getGroupInitialPositions(); },
    getDragStart: interactionManager.getDragStart,
    // Interaction state setters
    setDragging: interactionManager.setDragging,
    setDraggedElementId: interactionManager.setDraggedElementId,
    setDragStartX: interactionManager.setDragStartX,
    setDragStartY: interactionManager.setDragStartY,
    setElementStartX: interactionManager.setElementStartX,
    setElementStartY: interactionManager.setElementStartY,
    setElementHasMoved: interactionManager.setElementHasMoved,
    setUndoStateSaved: interactionManager.setUndoStateSaved,
    setResizing: interactionManager.setResizing,
    setDraggingLineHandle: interactionManager.setDraggingLineHandle,
    setDraggedLineHandle: interactionManager.setDraggedLineHandle,
    setLineOriginalStart: interactionManager.setLineOriginalStart,
    setLineOriginalEnd: interactionManager.setLineOriginalEnd,
    setLongTouchTimer: interactionManager.setLongTouchTimer,
    setSelectionDragging: interactionManager.setSelectionDragging,
    setRotating: interactionManager.setRotating,
    setRotationStartAngle: interactionManager.setRotationStartAngle,
    setRotationElementStartAngle: interactionManager.setRotationElementStartAngle,
    setDraggingGroup: interactionManager.setDraggingGroup,
    setGroupInitialPositions: interactionManager.setGroupInitialPositions,
    // State variables
    get startX() { return startX; },
    get startY() { return startY; },
    get startScreenX() { return startScreenX; },
    get startScreenY() { return startScreenY; },
    set startX(value) { startX = value; },
    set startY(value) { startY = value; },
    set startScreenX(value) { startScreenX = value; },
    set startScreenY(value) { startScreenY = value; },
    // Function references
    handleSelectMouseDown: interactionManager.handleSelectMouseDown,
    createTextAtPosition: interactionManager.createTextAtPosition,
    createStickyNoteAtPosition: interactionManager.createStickyNoteAtPosition,
    triggerImageUpload: interactionManager.triggerImageUpload,
    handleImageUpload: interactionManager.handleImageUpload,
    updateCursorForHover: interactionManager.updateCursorForHover,
    startSelectionRectangle: interactionManager.startSelectionRectangle,
    updateSelectionRectangle: interactionManager.updateSelectionRectangle,
    finishSelectionRectangle: interactionManager.finishSelectionRectangle,
    updateElementRotation: interactionManager.updateElementRotation,
    finishElementRotation: interactionManager.finishElementRotation,
    get selectedElementIds() { return interactionManager.getSelectedElementIds(); },
    toggleDarkMode: uiFeatures.toggleDarkMode,
    toggleElementLockAction: uiFeatures.toggleElementLockAction,
    showContextMenu: uiFeatures.showContextMenu
  });

  // Set up interaction manager dependencies
  interactionManager.setDependencies({
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    groupManager,
    showNotification: uiFeatures.showNotification,
    get pendingImagePosition() { return pendingImagePosition; },
    set pendingImagePosition(value) { pendingImagePosition = value; }
  });

  // Set up group manager dependencies
  groupManager.setDependencies({
    canvasManager,
    elementFactory,
    signalrClient,
    viewportManager
  });

  // Update canvas manager dependencies (add groupManager)
  canvasManager.setDependencies({
    groupManager,
    elementFactory
  });

  // Set up element factory dependencies (add groupManager and interactionManager)
  elementFactory.setDependencies({
    groupManager,
    interactionManager,
    addSparkleEffectsToElements: uiFeatures.addSparkleEffectsToElements
  });

  // Set up SignalR client dependencies (add groupManager)
  signalrClient.setDependencies({
    groupManager
  });

  // Set up UI features dependencies
  uiFeatures.setDependencies({
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    groupManager
  });

  // Set up Blazor integration dependencies
  blazorIntegration.setDependencies({
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    groupManager,
    appCoordinator,
    eventHandler,
    interactionManager,
    uiFeatures
  });

  console.log('Module dependencies configured');
}

// Utility functions that need to remain in main for global access
export function showNotification(message, type = 'info', duration = null) {
  return uiFeatures.showNotification(message, type, duration);
}

// Forward key functions for backward compatibility
export function setBlazorReference(dotNetRef) {
  return blazorIntegration.setBlazorReference(dotNetRef);
}

export async function initializeSignalRConnection(boardId) {
  return await blazorIntegration.initializeSignalRConnection(boardId);
}

export function clearCanvasFromBlazor() {
  return blazorIntegration.clearCanvasFromBlazor();
}

export function setCurrentTool(tool) {
  return blazorIntegration.setCurrentTool(tool);
}

export function updateCurrentTool(tool) {
  return blazorIntegration.updateCurrentTool(tool);
}

// Main initialization for window/global access
export function init() {
  return initializeApplication();
}

// Update global state setters for external modules
export function setPendingImagePosition(position) {
  pendingImagePosition = position;
}

export function setShouldSwitchToSelectAfterEditing(value) {
  shouldSwitchToSelectAfterEditing = value;
}

export function setStartCoordinates(x, y, screenX, screenY) {
  startX = x;
  startY = y;
  startScreenX = screenX;
  startScreenY = screenY;
}

// Expose modules for debugging and external access
export const modules = {
  canvasManager,
  toolManager,
  elementFactory,
  signalrClient,
  viewportManager,
  appCoordinator,
  eventHandler,
  interactionManager,
  uiFeatures,
  blazorIntegration
};

console.log('Main module loaded - streamlined coordination layer');