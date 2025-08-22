// SignalR Client Module - Handles all real-time communication
// This module manages SignalR connection, event handlers, and real-time synchronization

// SignalR connection state
let signalRConnection = null;
let currentBoardId = null;

// Cursor tracking
export let cursors = new Map();

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

// Initialize SignalR connection
export async function initializeSignalR(boardId) {
    try {
        currentBoardId = boardId;
        
        // Create connection
        signalRConnection = new signalR.HubConnectionBuilder()
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
            if (dependencies.drawElement) {
                dependencies.drawElement(
                    elementData.id,
                    elementData.x,
                    elementData.y,
                    elementData.type,
                    elementData.data,
                    elementData.width,
                    elementData.height
                );
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
            if (dependencies.updateElementPosition) {
                dependencies.updateElementPosition(elementId, newX, newY);
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
    signalRConnection.on("StickyNoteUpdated", (elementId, newContent) => {
        try {
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element && element.type === 'StickyNote') {
                    element.data.content = newContent;
                    if (dependencies.redrawCanvas) {
                        dependencies.redrawCanvas();
                    }
                }
            }

            console.log(`Sticky note ${elementId} updated`);
        } catch (error) {
            console.error('Error handling StickyNoteUpdated:', error);
        }
    });

    // Text element updated handler
    signalRConnection.on("TextElementUpdated", (elementId, newContent) => {
        try {
            if (dependencies.elements) {
                const element = dependencies.elements.get(elementId);
                if (element && element.type === 'Text') {
                    element.data.content = newContent;
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

    // Connection events
    signalRConnection.onreconnecting(() => {
        console.log("SignalR reconnecting...");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection lost, reconnecting...", "warning");
        }
    });

    signalRConnection.onreconnected(() => {
        console.log("SignalR reconnected");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection restored", "success");
        }
        
        // Rejoin board if we have one
        if (currentBoardId) {
            signalRConnection.invoke("JoinBoard", currentBoardId, "Anonymous User");
        }
    });

    signalRConnection.onclose(() => {
        console.log("SignalR connection closed");
        if (dependencies.showNotification) {
            dependencies.showNotification("Connection lost", "error");
        }
    });
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
            console.warn('Blazor reference not available, cannot load board elements');
            return;
        }

        // Call Blazor method to load board elements
        const elementsJson = await blazorRef.invokeMethodAsync('LoadBoardElements');
        const elements = JSON.parse(elementsJson);

        console.log(`Loading ${elements.length} existing elements`);

        // Add each element to the canvas
        for (const element of elements) {
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

        // Redraw canvas to show all elements
        if (dependencies.redrawCanvas) {
            dependencies.redrawCanvas();
        }

        // Update minimap
        if (dependencies.updateMinimapImmediate) {
            dependencies.updateMinimapImmediate();
        }

    } catch (error) {
        console.error('Failed to load existing board elements:', error);
    }
}

// Test SignalR connection
export async function testSignalRConnection() {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
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
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            console.warn("SignalR not connected, cannot send element");
            return false;
        }

        // Include tempId in elementData if provided
        const elementDataWithTempId = tempId ? { ...elementData, tempId: tempId } : elementData;
        await signalRConnection.invoke("AddElement", boardId, elementDataWithTempId);
        return true;
    } catch (error) {
        console.error("Failed to send element:", error);
        return false;
    }
}

export async function sendElementMove(boardId, elementId, newX, newY) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("MoveElement", boardId, elementId, newX, newY);
        return true;
    } catch (error) {
        console.error("Failed to send element move:", error);
        return false;
    }
}

export async function sendDrawingPath(boardId, pathData) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
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
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
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
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
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
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("SelectElement", elementId);
        return true;
    } catch (error) {
        console.error("Failed to send element select:", error);
        return false;
    }
}

export async function sendElementDeselect(elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("DeselectElement", elementId);
        return true;
    } catch (error) {
        console.error("Failed to send element deselect:", error);
        return false;
    }
}

export async function sendElementToBack(elementId) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("SendElementToBack", elementId);
        return true;
    } catch (error) {
        console.error("Failed to send element to back:", error);
        return false;
    }
}

export async function sendElementResize(boardId, elementId, x, y, width, height) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("ResizeElement", boardId, elementId, x, y, width, height);
        return true;
    } catch (error) {
        console.error("Failed to send element resize:", error);
        return false;
    }
}

// Content update functions
export async function updateStickyNoteContent(elementId, newContent) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("UpdateStickyNote", elementId, newContent);
        return true;
    } catch (error) {
        console.error("Failed to update sticky note content:", error);
        return false;
    }
}

export async function updateTextElementContent(elementId, newContent) {
    try {
        if (!signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected) {
            return false;
        }

        await signalRConnection.invoke("UpdateTextElement", elementId, newContent);
        return true;
    } catch (error) {
        console.error("Failed to update text element content:", error);
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
function getColorForConnection(connectionId) {
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
    return signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected;
}

export function getCurrentBoardId() {
    return currentBoardId;
}

export function getConnectionState() {
    if (!signalRConnection) return 'Disconnected';
    
    switch (signalRConnection.state) {
        case signalR.HubConnectionState.Disconnected:
            return 'Disconnected';
        case signalR.HubConnectionState.Connecting:
            return 'Connecting';
        case signalR.HubConnectionState.Connected:
            return 'Connected';
        case signalR.HubConnectionState.Disconnecting:
            return 'Disconnecting';
        case signalR.HubConnectionState.Reconnecting:
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
    window.sendElementResize = sendElementResize;
    window.updateStickyNoteContent = updateStickyNoteContent;
    window.updateTextElementContent = updateTextElementContent;
    window.updateCursor = updateCursor;
    window.cursors = cursors;
    window.setBlazorReference = setBlazorReference;
    window.addMouseMoveListener = addMouseMoveListener;
}