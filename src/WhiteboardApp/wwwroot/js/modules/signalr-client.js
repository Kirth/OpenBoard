// SignalR Client Module - Handles all real-time communication
// This module manages SignalR connection, event handlers, and real-time synchronization

// SignalR connection state
let signalRConnection = null;
let currentBoardId = null;

// Cursor tracking
export let cursors = new Map();

// Collaborative selections tracking
export let collaborativeSelections = new Map();

// Blazor integration
let blazorReference = null;

// Dependencies that will be injected from other modules
let dependencies = {
    elements: null,
    selectedElementId: null,
    drawElement: null,
    updateElementPosition: null,
    redrawCanvas: null,
    clearCanvas: null,
    highlightElement: null,
    clearSelection: null,
    showElementSelection: null,
    hideElementSelection: null,
    updateMinimapImmediate: null,
    showNotification: null,
    screenToWorld: null
};

// Set dependencies from other modules
export function setDependencies(deps) {
    Object.assign(dependencies, deps);
}

// Wait for SignalR to be available
function waitForSignalR() {
    return new Promise((resolve) => {
        const checkSignalR = () => {
            if (window.signalR) {
                resolve();
            } else {
                setTimeout(checkSignalR, 100);
            }
        };
        checkSignalR();
    });
}

// Initialize SignalR connection
export async function initializeSignalR(boardId) {
    try {
        currentBoardId = boardId;
        
        // Wait for SignalR to be available
        if (!window.signalR) {
            console.log('Waiting for SignalR to load...');
            await waitForSignalR();
        }
        
        // Create connection
        signalRConnection = new window.signalR.HubConnectionBuilder()
            .withUrl("/collaborationhub")
            .withAutomaticReconnect()
            .build();

        // Set up event handlers
        setupEventHandlers();

        // Start connection
        await signalRConnection.start();
        console.log("SignalR Connected successfully");

        // Join board group
        if (boardId) {
            await signalRConnection.invoke("JoinBoard", boardId, "Anonymous User");
            console.log(`Joined board: ${boardId}`);
            
            // Load existing board elements
            console.log("About to load existing elements...");
            await loadExistingElements(boardId);
            console.log("Finished loading existing elements");
        }

        console.log("SignalR initialization completed successfully");
        return true;
    } catch (error) {
        console.error("SignalR Connection failed:", error);
        return false;
    }
}


// Set up SignalR event handlers
function setupEventHandlers() {
    if (!signalRConnection) return;

    // Element added handler
    signalRConnection.on("ElementAdded", (elementData, tempId) => {
        try {
            // Extract tempId from elementData if not provided as separate parameter
            const actualTempId = tempId || elementData.tempId;
            console.log('Received element via SignalR:', elementData, 'tempId parameter:', tempId, 'tempId in data:', elementData.tempId);
            
            // Handle ID remapping if tempId is provided
            if (actualTempId && dependencies.elements && dependencies.elements.has(actualTempId)) {
                console.log(`Remapping element ID from ${actualTempId} to ${elementData.id}`);
                
                // Remove the temporary element
                dependencies.elements.delete(actualTempId);
                
                // Update editor manager if it's editing this element
                if (dependencies.editorManager && dependencies.editorManager.getCurrentEditingElementId() === actualTempId) {
                    console.log('Updating editor manager with new element ID');
                    dependencies.editorManager.updateEditingElementId(elementData.id);
                }
            }
            
            if (dependencies.drawElement) {
                console.log('Calling drawElement with:', {
                    id: elementData.id,
                    x: elementData.x,
                    y: elementData.y,
                    type: elementData.type,
                    width: elementData.width,
                    height: elementData.height
                });
                dependencies.drawElement(
                    elementData.id,
                    elementData.x,
                    elementData.y,
                    elementData.type,
                    elementData.data,
                    elementData.width,
                    elementData.height
                );
            } else {
                console.warn('drawElement dependency not available');
            }

            if (dependencies.updateMinimapImmediate) {
                dependencies.updateMinimapImmediate();
            }

            console.log('Element added via SignalR:', elementData.id);
        } catch (error) {
            console.error('Error handling ElementAdded:', error);
        }
    });

    // Cursor updated handler
    signalRConnection.on("CursorUpdated", (connectionId, x, y) => {
        try {
            updateCursor(connectionId, x, y);
        } catch (error) {
            console.error('Error handling CursorUpdated:', error);
        }
    });

    // Board cleared handler
    signalRConnection.on("BoardCleared", () => {
        try {
            if (dependencies.elements) {
                dependencies.elements.clear();
            }
            
            if (dependencies.clearSelection) {
                dependencies.clearSelection();
            }

            if (dependencies.redrawCanvas) {
                dependencies.redrawCanvas();
            }

            if (dependencies.updateMinimapImmediate) {
                dependencies.updateMinimapImmediate();
            }

            console.log('Board cleared via SignalR');
        } catch (error) {
            console.error('Error handling BoardCleared:', error);
        }
    });

    // Element moved handler
    signalRConnection.on("ElementMoved", (elementId, newX, newY) => {
        try {
            // Use updateElementPositionLocal to avoid infinite loop
            // (updateElementPosition would call sendElementMove again)
            if (dependencies.updateElementPositionLocal) {
                dependencies.updateElementPositionLocal(elementId, newX, newY);
            }

            if (dependencies.redrawCanvas) {
                dependencies.redrawCanvas();
            }

            if (dependencies.updateMinimapImmediate) {
                dependencies.updateMinimapImmediate();
            }

            console.log(`Element ${elementId} moved to (${newX}, ${newY})`);
        } catch (error) {
            console.error('Error handling ElementMoved:', error);
        }
    });

    // Sticky note updated handler
    signalRConnection.on("StickyNoteUpdated", (elementId, updatedData) => {
        try {
            console.log(`Received StickyNoteUpdated via SignalR: ${elementId}`, updatedData);
            
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element && element.type === 'StickyNote') {
                    console.log('Updating local sticky note data');
                    // Merge the updated data with existing data
                    element.data = { ...element.data, ...updatedData };
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                } else {
                    console.warn('Sticky note element not found or wrong type:', element);
                }
            } else {
                console.warn('Elements collection not available');
            }

            console.log(`Sticky note ${elementId} updated`);
        } catch (error) {
            console.error('Error handling StickyNoteUpdated:', error);
        }
    });

    // Text element updated handler
    signalRConnection.on("TextElementUpdated", (elementId, updatedData) => {
        try {
            console.log(`Received TextElementUpdated via SignalR: ${elementId}`, updatedData);
            
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element && element.type === 'Text') {
                    console.log('Updating local text element data');
                    // Merge the updated data with existing data
                    element.data = { ...element.data, ...updatedData };
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                }
            }

            console.log(`Text element ${elementId} updated`);
        } catch (error) {
            console.error('Error handling TextElementUpdated:', error);
        }
    });

    // Element selected handler
    signalRConnection.on("ElementSelected", (elementId, userName, connectionId) => {
        try {
            if (dependencies.showElementSelection) {
                dependencies.showElementSelection(elementId, userName, connectionId);
            }

            console.log(`${userName} selected element ${elementId}`);
        } catch (error) {
            console.error('Error handling ElementSelected:', error);
        }
    });

    // Element deselected handler
    signalRConnection.on("ElementDeselected", (elementId, connectionId) => {
        try {
            if (dependencies.hideElementSelection) {
                dependencies.hideElementSelection(elementId, connectionId);
            }

            console.log(`Element ${elementId} deselected`);
        } catch (error) {
            console.error('Error handling ElementDeselected:', error);
        }
    });

    // Element deleted handler
    signalRConnection.on("ElementDeleted", (elementId) => {
        try {
            if (dependencies.elements) {
                dependencies.elements.delete(elementId);
            }

            if (dependencies.selectedElementId === elementId) {
                if (dependencies.clearSelection) {
                    dependencies.clearSelection();
                }
            }

            if (dependencies.redrawCanvas) {
                dependencies.redrawCanvas();
            }

            if (dependencies.updateMinimapImmediate) {
                dependencies.updateMinimapImmediate();
            }

            console.log(`Element ${elementId} deleted`);
        } catch (error) {
            console.error('Error handling ElementDeleted:', error);
        }
    });

    // Element resized handler
    signalRConnection.on("ElementResized", (elementId, x, y, width, height) => {
        try {
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element) {
                    element.x = x;
                    element.y = y;
                    element.width = width;
                    element.height = height;
                    
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                }
            }

            if (dependencies.updateMinimapImmediate) {
                dependencies.updateMinimapImmediate();
            }

            console.log(`Element ${elementId} resized`);
        } catch (error) {
            console.error('Error handling ElementResized:', error);
        }
    });

    // Element style updated handler
    signalRConnection.on("ElementStyleUpdated", (elementId, styleData) => {
        try {
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element) {
                    Object.assign(element.data, styleData);
                    
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                }
            }

            console.log(`Element ${elementId} style updated`);
        } catch (error) {
            console.error('Error handling ElementStyleUpdated:', error);
        }
    });

    // Element lock state updated handler
    signalRConnection.on("ElementLockUpdated", (elementId, locked) => {
        try {
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element) {
                    if (!element.data) element.data = {};
                    element.data.locked = locked;
                    
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                }
            }

            console.log(`Element ${elementId} lock state updated to: ${locked}`);
        } catch (error) {
            console.error('Error handling ElementLockUpdated:', error);
        }
    });

    // Element brought to front handler
    signalRConnection.on("ElementBroughtToFront", (payload) => {
        // payload could be { elementId, z } OR (legacy) just elementId
        try {
            console.log('[DEBUG] ElementBroughtToFront received:', payload);
            const elementId = typeof payload === 'string' ? payload : payload.elementId;
            const z = typeof payload === 'object' && payload && 'z' in payload ? payload.z : null;

            const el = dependencies.elements?.get(elementId);
            if (!el) {
                console.warn('[DEBUG] Element not found for bring to front:', elementId);
                return;
            }

            console.log('[DEBUG] Element before z update:', {id: elementId, oldZ: el.z, newZ: z});

            if (z != null) {
                el.z = z;                // canonical z from server
                el.data = el.data || {};
                el.data.z = z;
                console.log('[DEBUG] Used server-provided z:', z);
            } else {
                // Fallback (not ideal): bump locally with a monotonic counter
                // WARNING: only safe if server makes the same decision and broadcasts the same z later.
                const maxZ = Math.max(0, ...Array.from(dependencies.elements.values()).map(e => e.z ?? e.data?.z ?? 0));
                el.z = maxZ + 1;
                el.data = el.data || {};
                el.data.z = el.z;
                console.log('[DEBUG] Computed fallback z:', el.z, 'from maxZ:', maxZ);
            }

            dependencies.redrawCanvas?.();
            console.log(`Element ${elementId} brought to front (z=${el.z})`);
        } catch (err) {
            console.error('ElementBroughtToFront handler error', err);
        }
    });

    signalRConnection.on("ElementSentToBack", (payload) => {
        try {
            const elementId = typeof payload === 'string' ? payload : payload.elementId;
            const z = typeof payload === 'object' && payload && 'z' in payload ? payload.z : null;

            const el = dependencies.elements?.get(elementId);
            if (!el) return;

            if (z != null) {
                el.z = z;
                el.data = el.data || {};
                el.data.z = z;
            } else {
                // Fallback: compute min z and go below
                const minZ = Math.min(0, ...Array.from(dependencies.elements.values()).map(e => e.z ?? e.data?.z ?? 0));
                el.z = minZ - 1;
                el.data = el.data || {};
                el.data.z = el.z;
            }

            dependencies.redrawCanvas?.();
            console.log(`Element ${elementId} sent to back (z=${el.z})`);
        } catch (err) {
            console.error('ElementSentToBack handler error', err);
        }
    });

    // (Preferred) Server sends the full order to make all clients consistent
    // payload: { order: [elementIdLowestZ, ..., elementIdHighestZ] }
    signalRConnection.on("ElementsOrderUpdated", (payload) => {
        try {
            if (!payload || !Array.isArray(payload.order)) return;
            const order = payload.order;
            // Assign 0..N-1 as z based on order; or use provided z array if included.
            for (let i = 0; i < order.length; i++) {
                const id = order[i];
                const el = dependencies.elements?.get(id);
                if (el) {
                    el.z = i;
                    el.data = el.data || {};
                    el.data.z = i;
                }
            }
            dependencies.redrawCanvas?.();
            console.log('[ElementsOrderUpdated] applied order of', order.length, 'elements');
        } catch (err) {
            console.error('ElementsOrderUpdated handler error', err);
        }
    });

    // Element Z-Index updated handler (missing handler for ElementZIndexUpdated event)
    signalRConnection.on("ElementZIndexUpdated", (elementId, zIndex) => {
        try {
            console.log(`Received ElementZIndexUpdated: ${elementId} -> z=${zIndex}`);
            
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element) {
                    // Update z-index in both locations for consistency
                    element.z = zIndex;
                    if (!element.data) {
                        element.data = {};
                    }
                    element.data.z = zIndex;
                    
                    // Trigger redraw to apply new z-ordering
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                    
                    console.log(`Element ${elementId} z-index updated to ${zIndex}`);
                } else {
                    console.warn(`Element ${elementId} not found for z-index update`);
                }
            }
        } catch (error) {
            console.error('Error handling ElementZIndexUpdated:', error);
        }
    });

    // Line endpoints updated handler
    signalRConnection.on("LineEndpointsUpdated", (elementId, startX, startY, endX, endY) => {
        try {
            console.log(`Received LineEndpointsUpdated: ${elementId} -> (${startX},${startY}) to (${endX},${endY})`);
            
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element && element.type === 'Line') {
                    // Update coordinates using canonical representation: x/y = start, width/height = delta
                    element.x = startX;
                    element.y = startY;
                    element.width = endX - startX;
                    element.height = endY - startY;
                    
                    // Update absolute coordinates in data
                    if (!element.data) {
                        element.data = {};
                    }
                    element.data.startX = startX;
                    element.data.startY = startY;
                    element.data.endX = endX;
                    element.data.endY = endY;
                    
                    // Trigger redraw to show the updated line
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                    
                    console.log(`Line ${elementId} endpoints updated successfully`);
                } else {
                    console.warn(`Line element ${elementId} not found for endpoint update`);
                }
            }
        } catch (error) {
            console.error('Error handling LineEndpointsUpdated:', error);
        }
    });

    // User disconnected handler
    signalRConnection.on("UserLeft", (userData) => {
        try {
            const { connectionId, userName } = userData;
            console.log(`User ${userName} left`);
            
            // Clean up collaborative selections for this user
            if (dependencies.collaborativeSelections) {
                for (const [elementId, selections] of dependencies.collaborativeSelections) {
                    if (selections.has(connectionId)) {
                        selections.delete(connectionId);
                        console.log(`Removed collaborative selection for ${userName} on element ${elementId}`);
                    }
                    // If no more selections for this element, remove the element entry
                    if (selections.size === 0) {
                        dependencies.collaborativeSelections.delete(elementId);
                    }
                }
                
                // Redraw to update collaborative selections
                if (dependencies.redrawCanvas) {
                    dependencies.redrawCanvas();
                }
            }
        } catch (error) {
            console.error('Error handling UserLeft:', error);
        }
    });

    // Connection events
    signalRConnection.onreconnecting(() => {
        console.log("SignalR reconnecting...");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection lost, reconnecting...", "warning");
        }
    });

    signalRConnection.onreconnected(async () => {
        console.log("SignalR reconnected");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection restored", "success");
        }
        
        // Rejoin board if we have one
        if (currentBoardId) {
            try {
                await signalRConnection.invoke("JoinBoard", currentBoardId, "Anonymous User");
                console.log("Rejoined board after reconnection");
                
                // Wait a moment for Blazor connection to stabilize before reloading elements
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Reload board state to ensure consistency (with retry logic)
                console.log("Reloading board elements after reconnection...");
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                    try {
                        await loadExistingElements(currentBoardId);
                        console.log("Board state reloaded successfully");
                        
                        if (dependencies.showNotification) {
                            dependencies.showNotification("Board synchronized", "info");
                        }
                        break; // Success, exit retry loop
                    } catch (error) {
                        retryCount++;
                        console.warn(`Failed to reload elements (attempt ${retryCount}/${maxRetries}):`, error);
                        
                        if (retryCount < maxRetries) {
                            // Wait before retry
                            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                        } else {
                            // Final failure
                            console.error("Failed to reload board elements after all retries:", error);
                            if (dependencies.showNotification) {
                                dependencies.showNotification("Could not synchronize board state. Please refresh the page if elements are missing.", "warning");
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to rejoin board:", error);
                if (dependencies.showNotification) {
                    dependencies.showNotification("Failed to rejoin board. Please refresh the page.", "warning");
                }
            }
        }
    });

    signalRConnection.onclose(() => {
        console.log("SignalR connection closed");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection lost", "error");
        }
    });

    // Handle reconnection failure - using try/catch since method name may vary by SignalR version
    try {
        // Try the newer method name first
        if (typeof signalRConnection.onreconnectionfailed === 'function') {
            signalRConnection.onreconnectionfailed(() => {
                console.log("SignalR reconnection failed permanently");
                if (dependencies.showNotification) {
                    dependencies.showNotification("Reconnection failed. Try reloading the page if you're unable to reconnect.", "error");
                }
            });
        } else {
            console.log("onreconnectionfailed not available in this SignalR version");
            // For older versions, we can't detect permanent failure, but the onclose event will handle it
        }
    } catch (error) {
        console.log("Could not set up reconnection failed handler:", error);
    }
}

// Load existing board elements from the server
async function loadExistingElements(boardId) {
    try {
        // Set blazor reference if not set yet
        let blazorRef = dependencies.blazorReference;
        if (!blazorRef && typeof window !== 'undefined' && window.blazorReference) {
            blazorRef = window.blazorReference;
        }

        if (!blazorRef) {
            const error = new Error('Blazor reference not available, cannot load board elements');
            console.warn(error.message);
            throw error;
        }

        // Call Blazor method to load board elements
        const elementsJson = await blazorRef.invokeMethodAsync('LoadBoardElements');
        
        if (!elementsJson) {
            throw new Error('No response from Blazor LoadBoardElements method');
        }
        
        const elements = JSON.parse(elementsJson);

        console.log(`Loading ${elements.length} existing elements`);

        // Track image elements for loading awareness
        let imageElements = [];
        let totalElements = elements.length;

        // Add each element to the canvas
        for (const element of elements) {
            console.log('Loading element:', {
                id: element.id,
                type: element.type,
                data: element.data,
                dataType: typeof element.data,
                dataConstructor: element.data?.constructor?.name
            });
            
            // Track image elements
            if (element.type === 'image' && element.data?.imageData) {
                imageElements.push(element);
            }
            
            if (dependencies.drawElement) {
                dependencies.drawElement(
                    element.id,
                    element.x,
                    element.y,
                    element.type,
                    element.data,
                    element.width,
                    element.height
                );
            }
        }

        // Immediate redraw to show non-image elements
        dependencies.requestRedraw?.();

        // One more nudge after initial batch load; images fire their own onload invalidations
        if (imageElements.length > 0) {
            console.log(`Detected ${imageElements.length} image elements, images will trigger redraws when loaded`);
            setTimeout(() => dependencies.requestRedraw?.(), 100);
        }

        // Update minimap
        if (dependencies.updateMinimapImmediate) {
            dependencies.updateMinimapImmediate();
        }

        // Migrate existing elements to have z-index (for elements loaded from server without z)
        if (dependencies.elements) {
            let migrated = 0;
            for (const [id, element] of dependencies.elements) {
                if (element.z === undefined) {
                    element.z = 0;
                    migrated++;
                }
                if (element.createdAt === undefined) {
                    element.createdAt = Date.now() + migrated; // spread them out slightly
                }
                // Also ensure data.z is set
                if (element.data && element.data.z === undefined) {
                    element.data.z = element.z;
                }
            }
            if (migrated > 0) {
                console.log(`[z-migration] Updated ${migrated} loaded elements with z-index`);
                // Force redraw to apply new z-order
                setTimeout(() => {
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                        console.log('[z-migration] Forced redraw after z-index migration');
                    }
                }, 50);
            }
        }

    } catch (error) {
        console.error('Failed to load existing board elements:', error);
    }
}

// Test SignalR connection
export async function testSignalRConnection() {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.log("SignalR not connected");
            return false;
        }

        await signalRConnection.invoke("Ping");
        console.log("SignalR connection test successful");
        return true;
    } catch (error) {
        console.error("SignalR connection test failed:", error);
        return false;
    }
}

// Sending functions
export async function sendElement(boardId, elementData, tempId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot send element");
            return false;
        }

        // Include tempId in elementData if provided
        const elementDataWithTempId = tempId ? { ...elementData, tempId: tempId } : elementData;
        console.log('Sending element to server:', elementDataWithTempId);
        await signalRConnection.invoke("AddElement", boardId, elementDataWithTempId);
        console.log('Element sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to send element:", error);
        return false;
    }
}

export async function sendElementMove(boardId, elementId, newX, newY) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        console.log(`Sending element move: ${elementId} to (${newX}, ${newY})`);
        await signalRConnection.invoke("MoveElement", boardId, elementId, newX, newY);
        console.log('Element move sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to send element move:", error);
        return false;
    }
}

export async function sendDrawingPath(boardId, pathData) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("AddDrawingPath", boardId, pathData);
        return true;
    } catch (error) {
        console.error("Failed to send drawing path:", error);
        return false;
    }
}

export async function sendCursorUpdate(boardId, x, y) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("UpdateCursor", boardId, x, y);
        return true;
    } catch (error) {
        console.error("Failed to send cursor update:", error);
        return false;
    }
}

export async function sendBoardCleared(boardId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("ClearBoard", boardId);
        return true;
    } catch (error) {
        console.error("Failed to send board clear:", error);
        return false;
    }
}

export async function sendElementSelect(elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("SelectElement", currentBoardId, elementId);
        return true;
    } catch (error) {
        console.error("Failed to send element select:", error);
        return false;
    }
}

export async function sendElementDeselect(elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("DeselectElement", currentBoardId, elementId);
        return true;
    } catch (error) {
        console.error("Failed to send element deselect:", error);
        return false;
    }
}

export async function sendBringToFront(boardId, elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        console.log(`Bringing element ${elementId} to front`);
        await signalRConnection.invoke("BringToFront", boardId, elementId);
        console.log('Element brought to front successfully');
        return true;
    } catch (error) {
        console.error("Failed to bring element to front:", error);
        return false;
    }
}

export async function sendElementToBack(boardId, elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        console.log(`Sending element ${elementId} to back`);
        await signalRConnection.invoke("SendToBack", boardId, elementId);
        console.log('Element sent to back successfully');
        return true;
    } catch (error) {
        console.error("Failed to send element to back:", error);
        return false;
    }
}

export async function sendElementDelete(boardId, elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot delete element");
            return false;
        }

        console.log(`Deleting element ${elementId} from board ${boardId}`);
        await signalRConnection.invoke("DeleteElement", boardId, elementId);
        console.log('Element deletion sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to send element deletion:", error);
        return false;
    }
}

export async function sendElementResize(boardId, elementId, x, y, width, height) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("ResizeElement", boardId, elementId, x, y, width, height);
        return true;
    } catch (error) {
        console.error("Failed to send element resize:", error);
        return false;
    }
}

export async function sendLineEndpointUpdate(boardId, elementId, startX, startY, endX, endY) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot update line endpoints");
            return false;
        }

        console.log(`Updating line endpoints for ${elementId}: (${startX},${startY}) to (${endX},${endY})`);
        await signalRConnection.invoke("UpdateLineEndpoints", boardId, elementId, startX, startY, endX, endY);
        console.log('Line endpoint update sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to send line endpoint update:", error);
        return false;
    }
}

// Content update functions
export async function updateStickyNoteContent(elementId, updatedData) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot update sticky note");
            return false;
        }

        if (!currentBoardId) {
            console.warn("No current board ID available for sticky note update");
            return false;
        }

        console.log(`Updating sticky note ${elementId} with data:`, updatedData);
        await signalRConnection.invoke("UpdateStickyNote", currentBoardId, elementId, updatedData);
        console.log('Sticky note update sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to update sticky note content:", error);
        return false;
    }
}

export async function updateTextElementContent(elementId, updatedData) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot update text element");
            return false;
        }

        if (!currentBoardId) {
            console.warn("No current board ID available for text element update");
            return false;
        }

        console.log(`Updating text element ${elementId} with data:`, updatedData);
        await signalRConnection.invoke("UpdateTextElement", currentBoardId, elementId, updatedData);
        console.log('Text element update sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to update text element content:", error);
        return false;
    }
}

export async function updateElementStyle(elementId, styleData) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot update element style");
            return false;
        }

        if (!currentBoardId) {
            console.warn("No current board ID available for element style update");
            return false;
        }

        console.log(`Updating element ${elementId} style:`, styleData);
        await signalRConnection.invoke("UpdateElementStyle", currentBoardId, elementId, styleData);
        console.log('Element style update sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to update element style:", error);
        return false;
    }
}

// Element lock/unlock functions
export async function sendElementLock(boardId, elementId, locked) {
    try {
        if (!signalRConnection || signalRConnection.state !== window.signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot update element lock state");
            return false;
        }

        console.log(`Updating element ${elementId} lock state to: ${locked}`);
        await signalRConnection.invoke("UpdateElementLock", boardId, elementId, locked);
        console.log('Element lock state update sent successfully');
        return true;
    } catch (error) {
        console.error("Failed to update element lock state:", error);
        return false;
    }
}

// Cursor management
export function updateCursor(connectionId, x, y) {
    try {
        if (!connectionId) return;

        // Convert to world coordinates if needed
        let worldX = x;
        let worldY = y;
        
        if (dependencies.screenToWorld) {
            const worldPos = dependencies.screenToWorld(x, y);
            worldX = worldPos.x;
            worldY = worldPos.y;
        }

        const cursor = {
            x: worldX,
            y: worldY,
            connectionId: connectionId,
            userName: `User ${connectionId.substring(0, 8)}`,
            color: getColorForConnection(connectionId),
            lastUpdate: Date.now()
        };

        cursors.set(connectionId, cursor);

        // Remove old cursors (older than 10 seconds)
        const now = Date.now();
        for (const [id, cursor] of cursors.entries()) {
            if (now - cursor.lastUpdate > 10000) {
                cursors.delete(id);
            }
        }

        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }
    } catch (error) {
        console.error('Error updating cursor:', error);
    }
}

// Generate consistent color for connection
export function getColorForConnection(connectionId) {
    const hash = connectionId.hashCode();
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', 
        '#bb8fce', '#85c1e9', '#f8c471', '#82e0aa',
        '#f1948a', '#85c1e9', '#d7dbdd', '#fadbd8'
    ];
    
    return colors[Math.abs(hash) % colors.length];
}

// String hash function for consistent colors
if (!String.prototype.hashCode) {
    String.prototype.hashCode = function() {
        let hash = 0;
        if (this.length === 0) return hash;
        
        for (let i = 0; i < this.length; i++) {
            const char = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return hash;
    };
}

// Blazor integration
export function setBlazorReference(dotNetRef) {
    blazorReference = dotNetRef;
    console.log('Blazor reference set');
}

export function addMouseMoveListener(dotNetRef) {
    blazorReference = dotNetRef;
    console.log('Mouse move listener added for Blazor');
}

// Connection utilities
export function getConnection() {
    return signalRConnection;
}

export function isConnected() {
    return signalRConnection && signalRConnection.state === window.signalR.HubConnectionState.Connected;
}

export function getCurrentBoardId() {
    return currentBoardId;
}

export function getConnectionState() {
    if (!signalRConnection) return 'Disconnected';
    
    switch (signalRConnection.state) {
        case window.signalR.HubConnectionState.Disconnected:
            return 'Disconnected';
        case window.signalR.HubConnectionState.Connecting:
            return 'Connecting';
        case window.signalR.HubConnectionState.Connected:
            return 'Connected';
        case window.signalR.HubConnectionState.Disconnecting:
            return 'Disconnecting';
        case window.signalR.HubConnectionState.Reconnecting:
            return 'Reconnecting';
        default:
            return 'Unknown';
    }
}

// Disconnect
export async function disconnect() {
    try {
        if (signalRConnection) {
            await signalRConnection.stop();
            console.log('SignalR disconnected');
        }
    } catch (error) {
        console.error('Failed to disconnect SignalR:', error);
    }
}

// Initialize the module
export function init() {
    console.log('SignalR Client module loaded');
}

// Backward compatibility - expose to window
if (typeof window !== 'undefined') {
    window.signalRConnection = signalRConnection;
    window.initializeSignalR = initializeSignalR;
    window.testSignalRConnection = testSignalRConnection;
    window.sendElement = sendElement;
    window.sendElementMove = sendElementMove;
    window.sendDrawingPath = sendDrawingPath;
    window.sendCursorUpdate = sendCursorUpdate;
    window.sendBoardCleared = sendBoardCleared;
    window.sendElementSelect = sendElementSelect;
    window.sendElementDeselect = sendElementDeselect;
    window.sendElementToBack = sendElementToBack;
    window.sendElementDelete = sendElementDelete;
    window.sendElementResize = sendElementResize;
    window.sendLineEndpointUpdate = sendLineEndpointUpdate;
    window.updateStickyNoteContent = updateStickyNoteContent;
    window.updateTextElementContent = updateTextElementContent;
    window.updateCursor = updateCursor;
    window.cursors = cursors;
    window.setBlazorReference = setBlazorReference;
    window.addMouseMoveListener = addMouseMoveListener;
    window.updateElementStyle = updateElementStyle;
}