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

  // Check if dependencies are available before using them
  if (dependencies.signalrClient && typeof dependencies.signalrClient.setBlazorReference === 'function') {
    dependencies.signalrClient.setBlazorReference(dotNetRef);
  } else {
    console.warn('SignalR client not available yet, storing Blazor reference for later');
  }

  // Update dependencies that need Blazor reference
  const blazorRef = dotNetRef;

  if (dependencies.toolManager && typeof dependencies.toolManager.setDependencies === 'function') {
    dependencies.toolManager.setDependencies({ blazorReference: blazorRef });
  }
  
  if (dependencies.elementFactory && typeof dependencies.elementFactory.setDependencies === 'function') {
    dependencies.elementFactory.setDependencies({ blazorReference: blazorRef });
  }
  
  if (dependencies.viewportManager && typeof dependencies.viewportManager.setDependencies === 'function') {
    dependencies.viewportManager.setDependencies({ blazorReference: blazorRef });
  }

  console.log('Blazor reference set across all modules');
}

export async function initializeSignalRConnection(boardId) {
  if (!dependencies.signalrClient || typeof dependencies.signalrClient.initializeSignalR !== 'function') {
    console.error('SignalR client not available for initialization');
    return false;
  }

  const result = await dependencies.signalrClient.initializeSignalR(boardId);

  // Update dependencies after SignalR connection is established
  if (result) {
    console.log('SignalR connection established, updating dependencies...');

    // Update element factory dependencies with the actual connection
    if (dependencies.elementFactory && typeof dependencies.elementFactory.setDependencies === 'function') {
      dependencies.elementFactory.setDependencies({
        signalRConnection: dependencies.signalrClient.getConnection(),
        currentBoardId: dependencies.signalrClient.getCurrentBoardId,
        updateStickyNoteContent: dependencies.signalrClient.updateStickyNoteContent,
        updateTextElementContent: dependencies.signalrClient.updateTextElementContent
      });
    }

    console.log('Dependencies updated with SignalR connection');
  }

  return result;
}

export function clearCanvasFromBlazor() {
  if (dependencies.elementFactory && dependencies.elementFactory.elements) {
    dependencies.elementFactory.elements.clear();
  }
  if (dependencies.elementFactory && typeof dependencies.elementFactory.clearSelection === 'function') {
    dependencies.elementFactory.clearSelection();
  }
  if (dependencies.canvasManager && typeof dependencies.canvasManager.redrawCanvas === 'function') {
    dependencies.canvasManager.redrawCanvas();
  }
  if (dependencies.viewportManager && typeof dependencies.viewportManager.updateMinimapImmediate === 'function') {
    dependencies.viewportManager.updateMinimapImmediate();
  }

  if (dependencies.signalrClient && 
      typeof dependencies.signalrClient.isConnected === 'function' && 
      dependencies.signalrClient.isConnected() && 
      dependencies.signalrClient.getCurrentBoardId()) {
    dependencies.signalrClient.sendBoardCleared(dependencies.signalrClient.getCurrentBoardId());
  }
}


export async function disconnectFromBoard() {
  try {
    console.log('Disconnecting from current board');
    
    // 1. Clear canvas elements and selection
    if (dependencies.elementFactory && dependencies.elementFactory.elements) {
      dependencies.elementFactory.elements.clear();
    }
    if (dependencies.elementFactory && typeof dependencies.elementFactory.clearSelection === 'function') {
      dependencies.elementFactory.clearSelection();
    }
    
    // 2. Clear collaborative cursors and selections
    if (dependencies.signalrClient && dependencies.signalrClient.cursors) {
      dependencies.signalrClient.cursors.clear();
    }
    if (dependencies.signalrClient && dependencies.signalrClient.collaborativeSelections) {
      dependencies.signalrClient.collaborativeSelections.clear();
    }
    
    // 3. Clear canvas drawing
    if (dependencies.canvasManager && typeof dependencies.canvasManager.clearCanvas === 'function') {
      dependencies.canvasManager.clearCanvas();
    }
    
    // 4. Disconnect SignalR
    if (dependencies.signalrClient && typeof dependencies.signalrClient.disconnect === 'function') {
      await dependencies.signalrClient.disconnect();
    }
    
    // 5. Update minimap after clearing
    if (dependencies.viewportManager && typeof dependencies.viewportManager.updateMinimapImmediate === 'function') {
      dependencies.viewportManager.updateMinimapImmediate();
    }
    
    console.log('Successfully disconnected from board');
  } catch (error) {
    console.error('Error disconnecting from board:', error);
  }
}

// Tool functions for Blazor
export function setCurrentTool(tool) {
  if (dependencies.toolManager && typeof dependencies.toolManager.setCurrentTool === 'function') {
    return dependencies.toolManager.setCurrentTool(tool);
  }
  console.warn('Tool manager not available, cannot set current tool');
  return false;
}

export function updateCurrentTool(tool) {
  if (dependencies.toolManager && typeof dependencies.toolManager.updateBlazorCurrentTool === 'function') {
    return dependencies.toolManager.updateBlazorCurrentTool(tool);
  }
  console.warn('Tool manager not available, cannot update current tool');
  return false;
}

// Main initialization for window/global access
export function init() {
  if (dependencies.appCoordinator && typeof dependencies.appCoordinator.initializeApplication === 'function') {
    return dependencies.appCoordinator.initializeApplication();
  }
  console.error('App coordinator not available for initialization');
  return false;
}

// Setup global window exposure for Blazor interop
export function setupGlobalExposure() {
  if (typeof window === 'undefined') return;

  // Main functions
  window.initializeApplication = dependencies.appCoordinator?.initializeApplication || (() => {
    console.error('App coordinator not available');
    return false;
  });
  window.initializeCanvas = () => {
    if (dependencies.canvasManager && typeof dependencies.canvasManager.initializeCanvas === 'function') {
      return dependencies.canvasManager.initializeCanvas();
    }
    console.error('Canvas manager not available');
    return false;
  };
  window.initializeSignalR = initializeSignalRConnection;
  window.setBlazorReference = setBlazorReference;
  window.clearCanvasFromBlazor = clearCanvasFromBlazor;
  window.disconnectFromBoard = disconnectFromBoard;
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
  // Arrow control functions
  window.updateLineArrow = dependencies.uiFeatures.updateLineArrow;
  window.updateLineArrowSize = dependencies.uiFeatures.updateLineArrowSize;
  
  // Export functions are now loaded globally via export-functions.js
  // No need to expose them here as they're already available on window
  
  // Debug: Verify functions are exposed
  console.log('Arrow functions exposed:', {
    updateLineArrow: typeof window.updateLineArrow,
    updateLineArrowSize: typeof window.updateLineArrowSize
  });
  
  console.log('Export functions available:', {
    exportCanvasAsPng: typeof window.exportCanvasAsPng,
    exportCanvasAsPdf: typeof window.exportCanvasAsPdf,
    exportHighResPng: typeof window.exportHighResPng,
    getCanvasInfo: typeof window.getCanvasInfo
  });

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

  // Expose group management functions
  window.groupSelected = () => {
    if (dependencies.groupManager) {
      return dependencies.groupManager.createGroupFromSelection();
    }
    console.warn('GroupManager not available');
  };
  window.ungroupSelected = () => {
    if (dependencies.groupManager) {
      return dependencies.groupManager.ungroupSelected();
    }
    console.warn('GroupManager not available');
  };
  window.selectGroup = () => {
    const selectedElements = dependencies.elementFactory.getSelectedElements();
    if (selectedElements.length === 1 && dependencies.groupManager) {
      const groupId = dependencies.groupManager.getElementGroupId(selectedElements[0].id);
      if (groupId) {
        return dependencies.groupManager.selectGroup(groupId);
      }
    }
    console.warn('No group to select or GroupManager not available');
  };

  // Context menu visibility functions
  window.updateContextMenuForSelection = (selectedElements) => {
    const groupSelectedItem = document.getElementById('groupSelected');
    const ungroupSelectedItem = document.getElementById('ungroupSelected');
    const selectGroupItem = document.getElementById('selectGroup');
    const groupDivider = document.getElementById('groupDivider');
    
    let showGroupDivider = false;

    if (groupSelectedItem && ungroupSelectedItem && selectGroupItem) {
      // Show "Group Selected" if multiple elements are selected and all are ungrouped
      if (selectedElements.length >= 2 && dependencies.groupManager) {
        const allUngrouped = selectedElements.every(el => !dependencies.groupManager.isElementInGroup(el.id));
        groupSelectedItem.style.display = allUngrouped ? 'block' : 'none';
        if (allUngrouped) showGroupDivider = true;
      } else {
        groupSelectedItem.style.display = 'none';
      }

      // Show "Ungroup" if any selected elements are in groups
      if (selectedElements.length >= 1 && dependencies.groupManager) {
        const hasGroupedElements = selectedElements.some(el => dependencies.groupManager.isElementInGroup(el.id));
        ungroupSelectedItem.style.display = hasGroupedElements ? 'block' : 'none';
        if (hasGroupedElements) showGroupDivider = true;
      } else {
        ungroupSelectedItem.style.display = 'none';
      }

      // Show "Select Group" if single element is part of a group
      if (selectedElements.length === 1 && dependencies.groupManager) {
        const isInGroup = dependencies.groupManager.isElementInGroup(selectedElements[0].id);
        selectGroupItem.style.display = isInGroup ? 'block' : 'none';
        if (isInGroup) showGroupDivider = true;
      } else {
        selectGroupItem.style.display = 'none';
      }
    }

    // Show/hide divider based on whether any group options are visible
    if (groupDivider) {
      groupDivider.style.display = showGroupDivider ? 'block' : 'none';
    }
  };

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