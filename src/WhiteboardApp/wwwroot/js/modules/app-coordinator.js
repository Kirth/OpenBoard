// App Coordinator Module - Application initialization and dependency management
// Handles module bootstrapping, dependency injection, and orchestration

// Import all modules
import * as canvasManager from './canvas-manager.js';
import * as toolManager from './tool-manager.js';
import * as elementFactory from './element-factory.js';
import * as signalrClient from './signalr-client.js';
import * as viewportManager from './viewport-manager.js';
import * as uiFeatures from './ui-features.js';
import * as sparkleEffects from './sparkle-effects.js';

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
    sparkleEffects.init();

    // Initialize core functionality first
    const canvasInitialized = canvasManager.initializeCanvas();
    if (!canvasInitialized) {
      throw new Error('Canvas initialization failed');
    }

    viewportManager.initializeViewport();
    toolManager.initializeToolManager();

    // Set up cross-module dependencies after initialization
    setupDependencies();

    // Set up keyboard handlers AFTER dependencies are configured
    toolManager.setupKeyboardHandlers();

    console.log('OpenBoard application initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    return false;
  }
}

// Set up dependencies between modules
export function setupDependencies() {
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
    getZoomLevel: viewportManager.getZoomLevel,
    renderSparkleEffects: sparkleEffects.renderSparkleEffects,
    requestRedraw: canvasManager.requestRedraw // expose a throttled version
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
    requestRedraw: canvasManager.requestRedraw,
    signalRConnection: signalrClient.getConnection(),
    currentBoardId: signalrClient.getCurrentBoardId(),
    sendElement: signalrClient.sendElement,
    sendElementMove: signalrClient.sendElementMove,
    sendElementSelect: signalrClient.sendElementSelect,
    sendElementDeselect: signalrClient.sendElementDeselect,
    sendElementDelete: signalrClient.sendElementDelete,
    sendElementResize: signalrClient.sendElementResize,
    sendLineEndpointUpdate: signalrClient.sendLineEndpointUpdate,
    sendElementLock: signalrClient.sendElementLock,
    sendBringToFront: signalrClient.sendBringToFront,
    sendElementToBack: signalrClient.sendElementToBack,
    updateElementStyle: signalrClient.updateElementStyle,
    updateStickyNoteContent: signalrClient.updateStickyNoteContent,
    updateTextElementContent: signalrClient.updateTextElementContent,
    blazorReference: null, // Will be set by Blazor
    showNotification: uiFeatures.showNotification,
    addSparkleEffectsToElements: sparkleEffects.addSparkleEffectsToElements,
    addPoofEffectToElement: sparkleEffects.addPoofEffectToElement
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
    requestRedraw: canvasManager.requestRedraw,
    clearCanvas: canvasManager.clearCanvas,
    highlightElement: elementFactory.highlightElement,
    clearSelection: elementFactory.clearSelection,
    showElementSelection: elementFactory.showElementSelection,
    hideElementSelection: elementFactory.hideElementSelection,
    updateMinimapImmediate: viewportManager.updateMinimapImmediate,
    showNotification: uiFeatures.showNotification,
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

  // Sparkle Effects Dependencies
  sparkleEffects.setDependencies({
    redrawCanvas: canvasManager.redrawCanvas
  });

  console.log('Cross-module dependencies configured');
}

// Update specific dependencies after they become available
export function updateDependency(moduleName, dependencyName, value) {
  switch (moduleName) {
    case 'elementFactory':
      elementFactory.updateDependency(dependencyName, value);
      break;
    case 'signalrClient':
      signalrClient.updateDependency(dependencyName, value);
      break;
    case 'toolManager':
      toolManager.updateDependency(dependencyName, value);
      break;
    case 'viewportManager':
      viewportManager.updateDependency(dependencyName, value);
      break;
    default:
      console.warn(`Unknown module for dependency update: ${moduleName}`);
  }
}

// Get module references for external use
export function getModules() {
  return {
    canvasManager,
    toolManager,
    elementFactory,
    signalrClient,
    viewportManager,
    sparkleEffects
  };
}