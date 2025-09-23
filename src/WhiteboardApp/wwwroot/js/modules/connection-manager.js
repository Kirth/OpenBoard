// Connection Manager Module - Handles connection points for lines to shapes, stickies, and images
// This module provides connection point detection, visual indicators, and auto-updating line positions

// Dependencies that will be injected from other modules
let dependencies = {
  elements: null,           // Map<string, Element>
  getZoomLevel: null,       // () => number
  worldToScreen: null,      // (x, y) => {x, y}
  screenToWorld: null,      // (x, y) => {x, y}
  redrawCanvas: null,       // () => void
  ctx: null,               // CanvasRenderingContext2D
  tempCtx: null            // CanvasRenderingContext2D for previews
};

// Connection point configuration
const CONNECTION_SNAP_DISTANCE = 25; // pixels in screen space
const CONNECTION_POINT_SIZE = 8;     // pixels in screen space
const CONNECTION_POINT_COLOR = '#007bff';
const CONNECTION_POINT_HOVER_COLOR = '#0056b3';

// Connection point types
export const CONNECTION_POINTS = {
  TOP: 'top',
  RIGHT: 'right', 
  BOTTOM: 'bottom',
  LEFT: 'left',
  CENTER: 'center'
};

// Set dependencies from other modules
export function setDependencies(deps) {
  Object.assign(dependencies, deps);
}

// Get all connection points for an element
export function getElementConnectionPoints(element) {
  if (!element) return [];
  
  // Only provide connection points for connectable elements
  if (!isElementConnectable(element)) return [];

  const points = [];
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;

  // Standard connection points: top, right, bottom, left, center
  points.push({
    id: CONNECTION_POINTS.TOP,
    x: centerX,
    y: element.y,
    element: element
  });

  points.push({
    id: CONNECTION_POINTS.RIGHT,
    x: element.x + element.width,
    y: centerY,
    element: element
  });

  points.push({
    id: CONNECTION_POINTS.BOTTOM,
    x: centerX,
    y: element.y + element.height,
    element: element
  });

  points.push({
    id: CONNECTION_POINTS.LEFT,
    x: element.x,
    y: centerY,
    element: element
  });

  points.push({
    id: CONNECTION_POINTS.CENTER,
    x: centerX,
    y: centerY,
    element: element
  });

  return points;
}

// Check if an element type supports connections
export function isElementConnectable(element) {
  if (!element) return false;
  
  const connectableTypes = [
    'Rectangle', 'rectangle',
    'Circle', 'circle', 
    'Triangle', 'triangle',
    'Diamond', 'diamond',
    'Ellipse', 'ellipse',
    'Star', 'star',
    'StickyNote',
    'Text',
    'Image'
  ];
  
  return connectableTypes.includes(element.type);
}

// Find the nearest connection point to a given world coordinate
export function findNearestConnectionPoint(worldX, worldY) {
  if (!dependencies.elements || !dependencies.worldToScreen) return null;

  let nearestPoint = null;
  let minDistance = CONNECTION_SNAP_DISTANCE;

  // Convert world coordinates to screen for distance calculation
  const screenPos = dependencies.worldToScreen(worldX, worldY);

  // Check all elements for nearby connection points
  for (const element of dependencies.elements.values()) {
    if (!isElementConnectable(element)) continue;

    const connectionPoints = getElementConnectionPoints(element);
    
    for (const point of connectionPoints) {
      // Convert connection point to screen coordinates
      const pointScreen = dependencies.worldToScreen(point.x, point.y);
      
      // Calculate distance in screen space
      const dx = screenPos.x - pointScreen.x;
      const dy = screenPos.y - pointScreen.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }
  }

  return nearestPoint;
}

// Draw connection point indicators for an element
export function drawConnectionPointIndicators(element, highlightPoint = null) {
  if (!dependencies.ctx || !dependencies.worldToScreen || !isElementConnectable(element)) return;

  const ctx = dependencies.ctx;
  const zoom = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;
  const pointSize = CONNECTION_POINT_SIZE / zoom;

  const connectionPoints = getElementConnectionPoints(element);

  // Draw in world coordinates
  ctx.save();

  for (const point of connectionPoints) {
    // Determine if this point should be highlighted
    const isHighlighted = highlightPoint && 
      highlightPoint.element === element && 
      highlightPoint.id === point.id;

    // Set colors
    const fillColor = isHighlighted ? CONNECTION_POINT_HOVER_COLOR : CONNECTION_POINT_COLOR;
    const strokeColor = '#ffffff';

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2 / zoom;

    // Draw connection point circle
    ctx.beginPath();
    ctx.arc(point.x, point.y, pointSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// Draw all visible connection points (when in line drawing mode)
export function drawAllConnectionPoints(nearestPoint = null) {
  if (!dependencies.elements) return;

  for (const element of dependencies.elements.values()) {
    if (isElementConnectable(element)) {
      drawConnectionPointIndicators(element, nearestPoint);
    }
  }
}

// Draw connection point preview during line drawing
export function drawConnectionPointPreview(worldX, worldY) {
  const nearestPoint = findNearestConnectionPoint(worldX, worldY);
  
  if (nearestPoint && dependencies.tempCtx) {
    const ctx = dependencies.tempCtx;
    const zoom = dependencies.getZoomLevel ? dependencies.getZoomLevel() : 1;
    const pointSize = (CONNECTION_POINT_SIZE + 4) / zoom; // Slightly larger for preview

    ctx.save();
    
    // Draw highlighted preview point
    ctx.fillStyle = CONNECTION_POINT_HOVER_COLOR;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 / zoom;

    ctx.beginPath();
    ctx.arc(nearestPoint.x, nearestPoint.y, pointSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw small indicator showing snap area
    ctx.setLineDash([5 / zoom, 3 / zoom]);
    ctx.strokeStyle = CONNECTION_POINT_HOVER_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(nearestPoint.x, nearestPoint.y, CONNECTION_SNAP_DISTANCE / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  return nearestPoint;
}

// Check if a line should snap to a connection point
export function getConnectionSnapPoint(worldX, worldY) {
  const nearestPoint = findNearestConnectionPoint(worldX, worldY);
  
  if (nearestPoint) {
    return {
      x: nearestPoint.x,
      y: nearestPoint.y,
      connection: {
        elementId: nearestPoint.element.id,
        pointId: nearestPoint.id
      }
    };
  }
  
  return null;
}

// Create a connection object for storing in line data
export function createConnection(elementId, pointId) {
  return {
    elementId: elementId,
    pointId: pointId
  };
}

// Get the world coordinates of a connection point
export function getConnectionPointCoordinates(connection) {
  if (!connection || !dependencies.elements) return null;

  const element = dependencies.elements.get(connection.elementId);
  if (!element) return null;

  const connectionPoints = getElementConnectionPoints(element);
  const point = connectionPoints.find(p => p.id === connection.pointId);
  
  return point ? { x: point.x, y: point.y } : null;
}

// Update a line's endpoint positions based on its connections
export function updateLineConnections(lineElement) {
  if (!lineElement || lineElement.type !== 'Line') return false;

  let updated = false;
  const data = lineElement.data || {};
  
  // Store original positions for comparison
  const originalStartX = data.startX || lineElement.x;
  const originalStartY = data.startY || lineElement.y;
  const originalEndX = data.endX || (lineElement.x + lineElement.width);
  const originalEndY = data.endY || (lineElement.y + lineElement.height);

  let newStartX = originalStartX;
  let newStartY = originalStartY;
  let newEndX = originalEndX;
  let newEndY = originalEndY;

  // Update start connection
  if (data.startConnection) {
    const startPos = getConnectionPointCoordinates(data.startConnection);
    if (startPos) {
      newStartX = startPos.x;
      newStartY = startPos.y;
      updated = true;
    }
  }

  // Update end connection
  if (data.endConnection) {
    const endPos = getConnectionPointCoordinates(data.endConnection);
    if (endPos) {
      newEndX = endPos.x;
      newEndY = endPos.y;
      updated = true;
    }
  }

  // Only update if there were actual changes
  if (updated) {
    // Update line element properties
    lineElement.x = newStartX;
    lineElement.y = newStartY;
    lineElement.width = newEndX - newStartX;
    lineElement.height = newEndY - newStartY;
    
    // Update data properties for server sync
    data.startX = newStartX;
    data.startY = newStartY;
    data.endX = newEndX;
    data.endY = newEndY;
    
    console.log(`Updated connected line ${lineElement.id}: start(${newStartX.toFixed(1)},${newStartY.toFixed(1)}) end(${newEndX.toFixed(1)},${newEndY.toFixed(1)})`);
  }

  return updated;
}

// Update all lines connected to a specific element
export function updateConnectedLines(elementId) {
  console.log(`[CONNECTION] Checking for lines connected to element ${elementId}`);
  
  if (!dependencies.elements) {
    console.warn('[CONNECTION] No elements dependency available');
    return;
  }

  const updatedLines = [];

  for (const element of dependencies.elements.values()) {
    if (element.type === 'Line' && element.data) {
      const data = element.data;
      let shouldUpdate = false;

      // Check if this line is connected to the moved element
      if (data.startConnection?.elementId === elementId) {
        console.log(`[CONNECTION] Found line ${element.id} connected at start to element ${elementId}`);
        shouldUpdate = true;
      }
      if (data.endConnection?.elementId === elementId) {
        console.log(`[CONNECTION] Found line ${element.id} connected at end to element ${elementId}`);
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        console.log(`[CONNECTION] Updating line ${element.id} position`);
        const wasUpdated = updateLineConnections(element);
        if (wasUpdated) {
          updatedLines.push(element.id);
          
          // Send line endpoint update to server for synchronization
          if (dependencies.signalrClient && dependencies.signalrClient.sendLineEndpointUpdate) {
            const currentBoardId = dependencies.signalrClient.getCurrentBoardId ? dependencies.signalrClient.getCurrentBoardId() : null;
            if (currentBoardId) {
              const endX = element.x + element.width;
              const endY = element.y + element.height;
              dependencies.signalrClient.sendLineEndpointUpdate(
                currentBoardId,
                element.id,
                element.x, element.y,
                endX, endY
              ).catch(error => {
                console.warn('Failed to sync connected line update to server:', error);
              });
            }
          }
        }
      }
    }
  }

  // Trigger redraw if any lines were updated
  if (updatedLines.length > 0 && dependencies.redrawCanvas) {
    dependencies.redrawCanvas();
  }

  return updatedLines;
}

// Remove connections to a deleted element
export function removeConnectionsToElement(elementId) {
  if (!dependencies.elements) return;

  const affectedLines = [];

  for (const element of dependencies.elements.values()) {
    if (element.type === 'Line' && element.data) {
      const data = element.data;
      let changed = false;

      // Remove start connection if it points to the deleted element
      if (data.startConnection?.elementId === elementId) {
        delete data.startConnection;
        changed = true;
      }

      // Remove end connection if it points to the deleted element
      if (data.endConnection?.elementId === elementId) {
        delete data.endConnection;
        changed = true;
      }

      if (changed) {
        affectedLines.push(element.id);
      }
    }
  }

  return affectedLines;
}

// Check if a line has any connections
export function hasConnections(lineElement) {
  if (!lineElement || lineElement.type !== 'Line' || !lineElement.data) return false;
  
  return !!(lineElement.data.startConnection || lineElement.data.endConnection);
}

// Get connection info for a line
export function getLineConnections(lineElement) {
  if (!lineElement || lineElement.type !== 'Line' || !lineElement.data) return null;

  return {
    startConnection: lineElement.data.startConnection || null,
    endConnection: lineElement.data.endConnection || null
  };
}

// Restore all line connections after elements are loaded (e.g., after page reload)
export function restoreAllConnections() {
  if (!dependencies.elements) return;

  console.log('[CONNECTION] Restoring all line connections after page load');
  let restoredCount = 0;

  for (const element of dependencies.elements.values()) {
    if (element.type === 'Line' && element.data) {
      const data = element.data;
      
      // Check if this line has any connections
      if (data.startConnection || data.endConnection) {
        console.log(`[CONNECTION] Restoring connections for line ${element.id}`);
        const wasUpdated = updateLineConnections(element);
        if (wasUpdated) {
          restoredCount++;
        }
      }
    }
  }

  if (restoredCount > 0) {
    console.log(`[CONNECTION] Restored ${restoredCount} line connections`);
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }
}

// Initialize the connection manager
export function init() {
  console.log('Connection Manager module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
  window.connectionManager = {
    getElementConnectionPoints,
    isElementConnectable,
    findNearestConnectionPoint,
    drawConnectionPointIndicators,
    drawAllConnectionPoints,
    drawConnectionPointPreview,
    getConnectionSnapPoint,
    createConnection,
    getConnectionPointCoordinates,
    updateLineConnections,
    updateConnectedLines,
    removeConnectionsToElement,
    hasConnections,
    getLineConnections,
    restoreAllConnections,
    CONNECTION_POINTS
  };
}