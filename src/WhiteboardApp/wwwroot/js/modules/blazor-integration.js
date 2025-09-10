// Blazor Integration Module - Handles communication with Blazor/.NET backend
// Manages Blazor interop functions and global window exposure

// Dependencies will be injected by main coordinator
let dependencies = {};

export function setDependencies(deps) {
  dependencies = deps;
}

// Blazor integration functions
export function setBlazorReference(dotNetRef) {
  // Set global reference for easy access
  if (typeof window !== 'undefined') {
    window.blazorReference = dotNetRef;
  }

  dependencies.signalrClient.setBlazorReference(dotNetRef);

  // Update dependencies that need Blazor reference
  const blazorRef = dotNetRef;

  dependencies.toolManager.setDependencies({ blazorReference: blazorRef });
  dependencies.elementFactory.setDependencies({ blazorReference: blazorRef });
  dependencies.viewportManager.setDependencies({ blazorReference: blazorRef });

  console.log('Blazor reference set across all modules');
}

export async function initializeSignalRConnection(boardId) {
  const result = await dependencies.signalrClient.initializeSignalR(boardId);

  // Update dependencies after SignalR connection is established
  if (result) {
    console.log('SignalR connection established, updating dependencies...');

    // Update element factory dependencies with the actual connection
    dependencies.elementFactory.setDependencies({
      signalRConnection: dependencies.signalrClient.getConnection(),
      currentBoardId: dependencies.signalrClient.getCurrentBoardId(),
      updateStickyNoteContent: dependencies.signalrClient.updateStickyNoteContent,
      updateTextElementContent: dependencies.signalrClient.updateTextElementContent
    });

    console.log('Dependencies updated with SignalR connection');
  }

  return result;
}

export function clearCanvasFromBlazor() {
  dependencies.elementFactory.elements.clear();
  dependencies.elementFactory.clearSelection();
  dependencies.canvasManager.redrawCanvas();
  dependencies.viewportManager.updateMinimapImmediate();

  if (dependencies.signalrClient.isConnected() && dependencies.signalrClient.getCurrentBoardId()) {
    dependencies.signalrClient.sendBoardCleared(dependencies.signalrClient.getCurrentBoardId());
  }
}

// Tool functions for Blazor
export function setCurrentTool(tool) {
  return dependencies.toolManager.setCurrentTool(tool);
}

export function updateCurrentTool(tool) {
  return dependencies.toolManager.updateBlazorCurrentTool(tool);
}

// Main initialization for window/global access
export function init() {
  return dependencies.appCoordinator.initializeApplication();
}

// Setup global window exposure for Blazor interop
export function setupGlobalExposure() {
  if (typeof window === 'undefined') return;

  // Main functions
  window.initializeApplication = dependencies.appCoordinator.initializeApplication;
  window.initializeCanvas = () => dependencies.canvasManager.initializeCanvas();
  window.initializeSignalR = initializeSignalRConnection;
  window.setBlazorReference = setBlazorReference;
  window.clearCanvasFromBlazor = clearCanvasFromBlazor;
  window.setCurrentTool = setCurrentTool;

  // Utility functions
  window.showContextMenu = dependencies.uiFeatures.showContextMenu;
  window.hideContextMenu = dependencies.uiFeatures.hideContextMenu;
  window.showNotification = dependencies.uiFeatures.showNotification;
  window.triggerImageUpload = dependencies.interactionManager.triggerImageUpload;
  window.handleImageUpload = dependencies.interactionManager.handleImageUpload;

  // Context menu action functions
  window.bringElementToFront = dependencies.uiFeatures.bringElementToFront;
  window.sendElementToBack = dependencies.uiFeatures.sendElementToBack;
  window.deleteElement = dependencies.uiFeatures.deleteElement;
  window.updateElementFillColor = dependencies.uiFeatures.updateElementFillColor;
  window.removeElementFill = dependencies.uiFeatures.removeElementFill;
  window.toggleElementFill = dependencies.uiFeatures.toggleElementFill;
  window.updateElementBorderColor = dependencies.uiFeatures.updateElementBorderColor;
  window.updateElementBorderWidth = dependencies.uiFeatures.updateElementBorderWidth;
  window.updateStickyNoteColor = dependencies.uiFeatures.updateStickyNoteColor;
  window.toggleElementLockAction = dependencies.uiFeatures.toggleElementLockAction;
  window.undoAction = dependencies.uiFeatures.undoAction;
  window.redoAction = dependencies.uiFeatures.redoAction;
  window.pasteElementHere = dependencies.uiFeatures.pasteElementHere;

  // Grid system
  window.toggleGrid = dependencies.uiFeatures.toggleGrid;
  window.toggleSnapToGrid = dependencies.uiFeatures.toggleSnapToGrid;
  window.updateGridSize = dependencies.uiFeatures.updateGridSize;

  // Dark mode functions
  window.initializeDarkMode = dependencies.uiFeatures.initializeDarkMode;
  window.toggleDarkMode = dependencies.uiFeatures.toggleDarkMode;
  window.getCurrentTheme = dependencies.uiFeatures.getCurrentTheme;
  window.setTheme = dependencies.uiFeatures.setTheme;

  // Color inversion functions
  window.isDarkModeActive = dependencies.uiFeatures.isDarkModeActive;
  window.isBlackColor = dependencies.uiFeatures.isBlackColor;
  window.invertBlackToWhite = dependencies.uiFeatures.invertBlackToWhite;

  // Interaction functions
  window.createTextAtPosition = dependencies.interactionManager.createTextAtPosition;
  window.createStickyNoteAtPosition = dependencies.interactionManager.createStickyNoteAtPosition;
  window.handleSelectMouseDown = dependencies.interactionManager.handleSelectMouseDown;
  window.updateCursorForHover = dependencies.interactionManager.updateCursorForHover;
  window.getElementSelectionRect = dependencies.interactionManager.getElementSelectionRect;

  // Event handling
  window.setupEventHandlers = dependencies.eventHandler.setupEventHandlers;

  // Export module references for debugging
  window.modules = {
    canvasManager: dependencies.canvasManager,
    toolManager: dependencies.toolManager,
    elementFactory: dependencies.elementFactory,
    signalrClient: dependencies.signalrClient,
    viewportManager: dependencies.viewportManager,
    appCoordinator: dependencies.appCoordinator,
    eventHandler: dependencies.eventHandler,
    interactionManager: dependencies.interactionManager,
    uiFeatures: dependencies.uiFeatures,
    blazorIntegration: {
      setBlazorReference,
      initializeSignalRConnection,
      clearCanvasFromBlazor,
      setCurrentTool,
      updateCurrentTool,
      init,
      setupGlobalExposure
    }
  };

  // Expose element factory functions for backward compatibility
  window.elements = dependencies.elementFactory.elements;
  window.getSelectedElementId = dependencies.elementFactory.getSelectedElementId;
  window.clearSelection = dependencies.elementFactory.clearSelection;
  window.selectElement = dependencies.elementFactory.selectElement;
  window.deleteSelectedElement = dependencies.elementFactory.deleteSelectedElement;
  window.copySelectedElement = dependencies.elementFactory.copySelectedElement;
  window.pasteElement = dependencies.elementFactory.pasteElement;
  window.duplicateSelectedElement = dependencies.elementFactory.duplicateSelectedElement;
  window.undo = dependencies.elementFactory.undo;
  window.redo = dependencies.elementFactory.redo;

  // Expose canvas manager functions
  window.redrawCanvas = dependencies.canvasManager.redrawCanvas;
  window.clearCanvas = dependencies.canvasManager.clearCanvas;
  window.resizeCanvas = dependencies.canvasManager.resizeCanvas;
  window.getCanvas = dependencies.canvasManager.getCanvas;
  window.getContext = dependencies.canvasManager.getContext;

  // Expose viewport functions
  window.zoomIn = () => dependencies.viewportManager.zoomAtCenter(1.1);
  window.zoomOut = () => dependencies.viewportManager.zoomAtCenter(1 / 1.1);
  window.resetZoom = dependencies.viewportManager.resetZoom;
  window.getViewportInfo = dependencies.viewportManager.getViewportInfo;

  // Expose tool manager functions
  window.getCurrentTool = dependencies.toolManager.getCurrentTool;
  window.setTool = dependencies.toolManager.setCurrentTool;

  // Expose SignalR functions
  window.isConnected = dependencies.signalrClient.isConnected;
  window.getCurrentBoardId = dependencies.signalrClient.getCurrentBoardId;
  window.getConnection = dependencies.signalrClient.getConnection;

  console.log('Global window exposure configured for Blazor integration');
}

// Helper function to update specific dependency across modules
export function updateGlobalDependency(dependencyName, value) {
  // Update the dependency across all modules that need it
  if (dependencies.elementFactory && typeof dependencies.elementFactory.updateDependency === 'function') {
    dependencies.elementFactory.updateDependency(dependencyName, value);
  }
  
  if (dependencies.signalrClient && typeof dependencies.signalrClient.updateDependency === 'function') {
    dependencies.signalrClient.updateDependency(dependencyName, value);
  }
  
  if (dependencies.toolManager && typeof dependencies.toolManager.updateDependency === 'function') {
    dependencies.toolManager.updateDependency(dependencyName, value);
  }
  
  if (dependencies.viewportManager && typeof dependencies.viewportManager.updateDependency === 'function') {
    dependencies.viewportManager.updateDependency(dependencyName, value);
  }

  // Update global window object if needed
  if (typeof window !== 'undefined' && dependencyName === 'blazorReference') {
    window.blazorReference = value;
  }
  
  console.log(`Global dependency ${dependencyName} updated across all modules`);
}

// Error handling for Blazor interop
export function handleBlazorError(error, context = 'Unknown') {
  console.error(`Blazor integration error in ${context}:`, error);
  
  if (dependencies.uiFeatures && dependencies.uiFeatures.showNotification) {
    dependencies.uiFeatures.showNotification(
      `Error in ${context}: ${error.message || error}`, 
      'error', 
      5000
    );
  }
}

// Utility function to safely call Blazor methods
export async function safeBlazorInvoke(methodName, ...args) {
  try {
    const blazorRef = window.blazorReference;
    if (!blazorRef) {
      throw new Error('Blazor reference not available');
    }
    
    return await blazorRef.invokeMethodAsync(methodName, ...args);
  } catch (error) {
    handleBlazorError(error, `Blazor method call: ${methodName}`);
    throw error;
  }
}

// Check if Blazor is ready
export function isBlazorReady() {
  return typeof window !== 'undefined' && 
         window.blazorReference !== null && 
         window.blazorReference !== undefined;
}

// Wait for Blazor to be ready (with timeout)
export function waitForBlazor(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (isBlazorReady()) {
      resolve(true);
      return;
    }
    
    const checkInterval = 100;
    const maxChecks = timeout / checkInterval;
    let checks = 0;
    
    const interval = setInterval(() => {
      checks++;
      
      if (isBlazorReady()) {
        clearInterval(interval);
        resolve(true);
      } else if (checks >= maxChecks) {
        clearInterval(interval);
        reject(new Error('Blazor reference not available within timeout'));
      }
    }, checkInterval);
  });
}