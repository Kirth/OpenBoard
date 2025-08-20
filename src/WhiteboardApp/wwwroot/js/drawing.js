let canvas;
let ctx;
let cursors = new Map();
let signalRConnection;
let tempCanvas;
let tempCtx;
let isDrawingShape = false;
let elements = new Map();
let selectedElementId = null;
let editingElement = null;
let editInput = null;
let currentBoardId = null;
let currentTool = 'pen';
let isDrawing = false;
let currentPath = [];
let startX = 0, startY = 0;
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

window.initializeCanvas = () => {
    canvas = document.getElementById('drawingCanvas');
    if (canvas) {
        // Add all mouse event listeners
        canvas.addEventListener('dblclick', handleCanvasDoubleClick);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        
        // Create temporary canvas for shape preview
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.style.position = 'absolute';
        tempCanvas.style.top = '0';
        tempCanvas.style.left = '0';
        tempCanvas.style.pointerEvents = 'none';
        tempCanvas.style.zIndex = '10';
        
        canvas.parentNode.appendChild(tempCanvas);
        tempCtx = tempCanvas.getContext('2d');
        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';
    }
};

window.startNewPath = (x, y) => {
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
};

window.drawLine = (x, y) => {
    if (!ctx) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
};

window.clearCanvas = () => {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (tempCtx && tempCanvas) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
};

window.updateCanvasCursor = (cursorStyle) => {
    if (canvas) {
        canvas.style.cursor = cursorStyle;
    }
};

window.promptForText = (message) => {
    return prompt(message) || '';
};

window.startShape = (shapeType, x, y) => {
    isDrawingShape = true;
    window.shapeStartX = x;
    window.shapeStartY = y;
    window.currentShapeType = shapeType;
};

window.updateShape = (shapeType, startX, startY, currentX, currentY) => {
    if (!tempCtx || !isDrawingShape) return;
    
    // Clear temporary canvas
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Set style
    tempCtx.strokeStyle = '#000000';
    tempCtx.lineWidth = 2;
    tempCtx.fillStyle = 'transparent';
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    tempCtx.beginPath();
    
    if (shapeType === 'rectangle') {
        tempCtx.rect(startX, startY, width, height);
    } else if (shapeType === 'circle') {
        const radius = Math.sqrt(width * width + height * height) / 2;
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        tempCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    }
    
    tempCtx.stroke();
};

window.finishShape = () => {
    isDrawingShape = false;
    if (tempCtx) {
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
};

window.drawElement = (id, x, y, type, data, width, height) => {
    if (!ctx || !data) return;
    
    console.log("Drawing element:", { id, x, y, type, data, width, height });
    
    // Store element info for selection
    elements.set(id, { x, y, width, height, type, data });
    
    switch (type) {
        case "Drawing":
            if (data.paths) {
                data.paths.forEach(path => {
                    if (path.points && path.points.length > 0) {
                        ctx.beginPath();
                        ctx.strokeStyle = path.strokeColor || '#000000';
                        ctx.lineWidth = path.strokeWidth || 2;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        
                        ctx.moveTo(path.points[0].x, path.points[0].y);
                        for (let i = 1; i < path.points.length; i++) {
                            ctx.lineTo(path.points[i].x, path.points[i].y);
                        }
                        ctx.stroke();
                    }
                });
            }
            break;
            
        case "Text":
            // Don't draw text if currently editing
            if (!data.isEditing) {
                ctx.save();
                ctx.fillStyle = data.color || '#000000';
                ctx.font = `${data.bold ? 'bold ' : ''}${data.italic ? 'italic ' : ''}${data.fontSize || 16}px ${data.fontFamily || 'Arial'}`;
                ctx.fillText(data.content || '', x, y + (data.fontSize || 16));
                ctx.restore();
            }
            break;
            
        case "Shape":
            ctx.save();
            ctx.strokeStyle = data.strokeColor || '#000000';
            ctx.lineWidth = data.strokeWidth || 2;
            if (data.fillColor && data.fillColor !== 'transparent') {
                ctx.fillStyle = data.fillColor;
            }
            
            ctx.beginPath();
            if (data.shapeType === 'rectangle') {
                ctx.rect(x, y, width || 100, height || 100);
            } else if (data.shapeType === 'circle') {
                const radius = Math.max(width || 100, height || 100) / 2;
                const centerX = x + (width || 100) / 2;
                const centerY = y + (height || 100) / 2;
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            }
            
            if (data.fillColor && data.fillColor !== 'transparent') {
                ctx.fill();
            }
            ctx.stroke();
            ctx.restore();
            break;
            
        case "StickyNote":
            ctx.save();
            // Draw sticky note background
            ctx.fillStyle = data.color || '#ffff88';
            ctx.fillRect(x, y, width || 200, height || 150);
            
            // Draw border
            ctx.strokeStyle = '#cccc00';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, width || 200, height || 150);
            
            // Don't draw text if currently editing
            if (!data.isEditing) {
                // Draw text
                ctx.fillStyle = '#000000';
                ctx.font = `${data.fontSize || 14}px Arial`;
                
                // Word wrap text
                const words = (data.content || '').split(' ');
                const lineHeight = (data.fontSize || 14) * 1.2;
                const maxWidth = (width || 200) - 20;
                let line = '';
                let yPos = y + 25;
                
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    
                    if (testWidth > maxWidth && n > 0) {
                        ctx.fillText(line, x + 10, yPos);
                        line = words[n] + ' ';
                        yPos += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, x + 10, yPos);
            }
            ctx.restore();
            break;
    }
};

window.renderExistingElement = (elementData) => {
    if (!ctx || !elementData) return;
    
    console.log("Rendering existing element:", elementData);
    
    try {
        // Parse the JSON data if it's a string
        let data = elementData.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        // Store element info for selection
        elements.set(elementData.id, { 
            x: elementData.x, 
            y: elementData.y, 
            width: elementData.width, 
            height: elementData.height, 
            type: elementData.type, 
            data: data 
        });
        
        drawElement(elementData.id, elementData.x, elementData.y, elementData.type, data, elementData.width, elementData.height);
    } catch (error) {
        console.error("Error rendering existing element:", error, elementData);
    }
};

window.updateCursor = (connectionId, x, y) => {
    let cursor = cursors.get(connectionId);
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.style.backgroundColor = `hsl(${Math.abs(connectionId.hashCode()) % 360}, 70%, 50%)`;
        document.body.appendChild(cursor);
        cursors.set(connectionId, cursor);
    }
    
    const canvasRect = canvas?.getBoundingClientRect();
    if (canvasRect) {
        cursor.style.left = (canvasRect.left + x) + 'px';
        cursor.style.top = (canvasRect.top + y) + 'px';
    }
};

// Hash function for connection ID colors
String.prototype.hashCode = function() {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
};

// Initialize SignalR connection
window.initializeSignalR = async (boardId) => {
    try {
        currentBoardId = boardId; // Store boardId globally
        signalRConnection = new signalR.HubConnectionBuilder()
            .withUrl("/collaborationhub")
            .withAutomaticReconnect()
            .build();

        signalRConnection.on("ElementAdded", (elementData) => {
            console.log("ElementAdded received:", elementData);
            drawElement(elementData.id, elementData.x, elementData.y, elementData.type, elementData.data, elementData.width, elementData.height);
        });

        signalRConnection.on("CursorUpdated", (connectionId, x, y) => {
            updateCursor(connectionId, x, y);
        });

        signalRConnection.on("BoardCleared", () => {
            clearCanvas();
            elements.clear();
        });
        
        signalRConnection.on("ElementMoved", (elementId, newX, newY) => {
            updateElementPosition(elementId, newX, newY);
        });
        
        signalRConnection.on("StickyNoteUpdated", (elementId, updatedData) => {
            const element = elements.get(elementId);
            if (element) {
                element.data = updatedData;
                redrawCanvas();
            }
        });
        
        signalRConnection.on("TextElementUpdated", (elementId, updatedData) => {
            const element = elements.get(elementId);
            if (element) {
                element.data = updatedData;
                redrawCanvas();
            }
        });

        await signalRConnection.start();
        await signalRConnection.invoke("JoinBoard", boardId, "Anonymous");
        
        console.log("SignalR connected successfully");
        return "Connected";
    } catch (error) {
        console.log("SignalR connection failed:", error.message);
        return "Local Mode";
    }
};

window.sendDrawingPath = async (boardId, pathData) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("AddDrawingPath", boardId, pathData);
        } catch (error) {
            console.log("Failed to send drawing path:", error);
        }
    }
};

window.sendCursorUpdate = async (boardId, x, y) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("UpdateCursor", boardId, x, y);
        } catch (error) {
            // Ignore cursor update errors
        }
    }
};

window.sendBoardCleared = async (boardId) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("ClearBoard", boardId);
        } catch (error) {
            console.log("Failed to send board clear:", error);
        }
    }
};

window.sendElement = async (boardId, elementData) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("AddElement", boardId, elementData);
        } catch (error) {
            console.log("Failed to send element:", error);
        }
    }
};

// Element selection and movement functions
window.getElementAtPoint = (x, y) => {
    console.log('getElementAtPoint called with:', x, y);
    console.log('Available elements:', elements.size);
    
    // Check elements in reverse order (top to bottom)
    const elementIds = Array.from(elements.keys()).reverse();
    
    for (const id of elementIds) {
        const element = elements.get(id);
        if (!element) continue;
        
        console.log('Checking element:', id, element.type, element.x, element.y, element.width, element.height);
        
        // Special case for text elements (use text metrics) - check this first
        if (element.type === 'Text' && element.data && element.data.content) {
            ctx.save();
            ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
            const textMetrics = ctx.measureText(element.data.content);
            const textWidth = textMetrics.width;
            const textHeight = element.data.fontSize || 16;
            
            // Text is rendered at y + fontSize, so the clickable area should be there too
            const textY = element.y + textHeight;
            console.log('Text element check:', {
                content: element.data.content,
                textWidth, textHeight, textY,
                clickX: x, clickY: y,
                elementX: element.x, elementY: element.y,
                xInRange: x >= element.x && x <= element.x + textWidth,
                yInRange: y >= element.y && y <= textY
            });
            
            if (x >= element.x && x <= element.x + textWidth &&
                y >= element.y && y <= textY) {
                console.log('Text element HIT!', id);
                ctx.restore();
                return id;
            }
            ctx.restore();
        }
        
        // Check if point is within element bounds (for other element types)
        if (x >= element.x && x <= element.x + (element.width || 0) &&
            y >= element.y && y <= element.y + (element.height || 0)) {
            return id;
        }
    }
    
    return null;
};

window.getElementInfo = (id) => {
    return elements.get(id) || null;
};

window.highlightElement = (id) => {
    const element = elements.get(id);
    if (!element || !ctx) return;
    
    selectedElementId = id;
    
    // Draw selection border
    ctx.save();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    const padding = 5;
    let width = element.width || 0;
    let height = element.height || 0;
    
    // Special handling for text elements
    if (element.type === 'Text' && element.data && element.data.content) {
        ctx.font = `${element.data.bold ? 'bold ' : ''}${element.data.italic ? 'italic ' : ''}${element.data.fontSize || 16}px ${element.data.fontFamily || 'Arial'}`;
        const textMetrics = ctx.measureText(element.data.content);
        width = textMetrics.width;
        height = element.data.fontSize || 16;
    }
    
    ctx.strokeRect(
        element.x - padding,
        element.y - padding,
        width + (2 * padding),
        height + (2 * padding)
    );
    
    ctx.restore();
};

window.clearSelection = () => {
    selectedElementId = null;
    redrawCanvas();
};

window.updateElementPosition = (id, newX, newY) => {
    const element = elements.get(id);
    if (!element) return;
    
    element.x = newX;
    element.y = newY;
    
    // Redraw canvas with new position
    redrawCanvas();
    
    // Highlight the moved element
    if (selectedElementId === id) {
        highlightElement(id);
    }
};

window.sendElementMove = async (boardId, elementId, newX, newY) => {
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        try {
            await signalRConnection.invoke("MoveElement", boardId, elementId, newX, newY);
        } catch (error) {
            console.log("Failed to send element move:", error);
        }
    }
};

// Handle double-click on canvas for editing text elements and sticky notes
function handleCanvasDoubleClick(event) {
    console.log('Double-click detected');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find element at click point
    const elementId = getElementAtPoint(x, y);
    const element = elementId ? elements.get(elementId) : null;
    
    console.log('Element found at double-click:', elementId, element);
    
    if (element && element.type === 'StickyNote') {
        console.log('Starting sticky note editing');
        startEditingStickyNote(elementId, element);
    } else if (element && element.type === 'Text') {
        console.log('Starting text element editing');
        startEditingTextElement(elementId, element);
    } else {
        console.log('No editable element found, stopping any current editing');
        // Stop editing if clicking elsewhere
        stopEditingStickyNote();
        stopEditingTextElement();
    }
}

// Start editing a sticky note
function startEditingStickyNote(elementId, element) {
    // Stop any current editing
    stopEditingStickyNote();
    
    editingElement = elementId;
    
    // Mark element as editing
    element.data.isEditing = true;
    
    // Create text area overlay
    const rect = canvas.getBoundingClientRect();
    editInput = document.createElement('textarea');
    editInput.style.position = 'absolute';
    editInput.style.left = (rect.left + element.x + 10) + 'px';
    editInput.style.top = (rect.top + element.y + 10) + 'px';
    editInput.style.width = (element.width - 20) + 'px';
    editInput.style.height = (element.height - 20) + 'px';
    editInput.style.fontSize = (element.data.fontSize || 14) + 'px';
    editInput.style.fontFamily = 'Arial';
    editInput.style.border = '2px solid #007bff';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '5px';
    editInput.style.backgroundColor = element.data.color || '#ffff88';
    editInput.style.resize = 'none';
    editInput.style.zIndex = '1000';
    editInput.value = element.data.content || '';
    
    document.body.appendChild(editInput);
    editInput.focus();
    editInput.select();
    
    // Handle finishing edit
    editInput.addEventListener('blur', () => stopEditingStickyNote());
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            stopEditingStickyNote();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            stopEditingStickyNote();
        }
    });
    
    // Redraw canvas to hide the text while editing
    redrawCanvas();
}

// Stop editing sticky note
function stopEditingStickyNote() {
    console.log('stopEditingStickyNote called', editingElement, editInput);
    if (!editingElement || !editInput) return;
    
    const element = elements.get(editingElement);
    if (element) {
        // Update element content
        const newContent = editInput.value.trim();
        console.log('Updating sticky content from:', element.data.content, 'to:', newContent);
        element.data.content = newContent;
        element.data.isEditing = false;
        
        // Send update via SignalR
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            console.log('SignalR connected, sending sticky update');
            updateStickyNoteContent(editingElement, newContent);
        } else {
            console.log('SignalR not connected');
        }
    }
    
    // Remove input element
    if (editInput && editInput.parentNode) {
        editInput.parentNode.removeChild(editInput);
    }
    
    editInput = null;
    editingElement = null;
    
    // Redraw canvas
    redrawCanvas();
}

// Start editing a text element
function startEditingTextElement(elementId, element) {
    // Stop any current editing
    stopEditingTextElement();
    stopEditingStickyNote();
    
    editingElement = elementId;
    
    // Mark element as editing
    element.data.isEditing = true;
    
    // Create text input overlay
    const rect = canvas.getBoundingClientRect();
    editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.style.position = 'absolute';
    editInput.style.left = (rect.left + element.x) + 'px';
    editInput.style.top = (rect.top + element.y) + 'px';
    editInput.style.fontSize = (element.data.fontSize || 16) + 'px';
    editInput.style.fontFamily = element.data.fontFamily || 'Arial';
    editInput.style.color = element.data.color || '#000000';
    editInput.style.fontWeight = element.data.bold ? 'bold' : 'normal';
    editInput.style.fontStyle = element.data.italic ? 'italic' : 'normal';
    editInput.style.border = '2px solid #007bff';
    editInput.style.borderRadius = '4px';
    editInput.style.padding = '2px 5px';
    editInput.style.backgroundColor = '#ffffff';
    editInput.style.zIndex = '1000';
    editInput.style.minWidth = '100px';
    editInput.value = element.data.content || '';
    
    document.body.appendChild(editInput);
    editInput.focus();
    editInput.select();
    
    // Handle finishing edit
    editInput.addEventListener('blur', () => stopEditingTextElement());
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            stopEditingTextElement();
        } else if (e.key === 'Enter') {
            stopEditingTextElement();
        }
    });
    
    // Redraw canvas to hide the text while editing
    redrawCanvas();
}

// Stop editing text element
function stopEditingTextElement() {
    console.log('stopEditingTextElement called', editingElement, editInput);
    if (!editingElement || !editInput) return;
    
    const element = elements.get(editingElement);
    if (element && element.type === 'Text') {
        // Update element content
        const newContent = editInput.value.trim();
        console.log('Updating text content from:', element.data.content, 'to:', newContent);
        element.data.content = newContent;
        element.data.isEditing = false;
        
        // Send update via SignalR
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            console.log('SignalR connected, sending update');
            updateTextElementContent(editingElement, newContent);
        } else {
            console.log('SignalR not connected');
        }
    }
    
    // Remove input element
    if (editInput && editInput.parentNode) {
        editInput.parentNode.removeChild(editInput);
    }
    
    editInput = null;
    editingElement = null;
    
    // Redraw canvas
    redrawCanvas();
}

// Send text element update via SignalR
function updateTextElementContent(elementId, newContent) {
    const element = elements.get(elementId);
    if (!element || element.type !== 'Text') return;
    
    const updatedData = { ...element.data, content: newContent };
    
    console.log('Sending text element update:', currentBoardId, elementId, updatedData);
    console.log('SignalR connection state:', signalRConnection.state);
    signalRConnection.invoke('UpdateTextElement', currentBoardId, elementId, updatedData)
        .then(() => console.log('Text element update sent successfully'))
        .catch(err => console.log('Failed to update text element:', err));
}

// Send sticky note update via SignalR
function updateStickyNoteContent(elementId, newContent) {
    const element = elements.get(elementId);
    if (!element || element.type !== 'StickyNote') return;
    
    const updatedData = { ...element.data, content: newContent };
    
    console.log('Sending sticky note update:', currentBoardId, elementId, updatedData);
    console.log('SignalR connection state:', signalRConnection.state);
    signalRConnection.invoke('UpdateStickyNote', currentBoardId, elementId, updatedData)
        .then(() => console.log('Sticky note update sent successfully'))
        .catch(err => console.log('Failed to update sticky note:', err));
}

// Redraw entire canvas
function redrawCanvas() {
    if (!ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw all elements
    for (const [id, element] of elements.entries()) {
        drawElement(id, element.x, element.y, element.type, element.data, element.width, element.height);
    }
}

// Tool management
window.setCurrentTool = (tool) => {
    currentTool = tool;
    console.log('Tool set to:', currentTool);
    
    // Update cursor style
    const cursorStyle = tool === 'pen' ? 'crosshair' :
                       tool === 'text' ? 'text' :
                       (tool === 'rectangle' || tool === 'circle') ? 'crosshair' :
                       tool === 'sticky' ? 'pointer' :
                       tool === 'select' ? 'default' : 'default';
    
    if (canvas) {
        canvas.style.cursor = cursorStyle;
    }
};

// Mouse event handlers
function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    startX = x;
    startY = y;
    
    console.log('Mouse down:', currentTool, x, y);
    
    switch (currentTool) {
        case 'pen':
            isDrawing = true;
            currentPath = [{ x, y }];
            startNewPath(x, y);
            break;
            
        case 'text':
            createTextElement(x, y);
            break;
            
        case 'sticky':
            createStickyNote(x, y);
            break;
            
        case 'rectangle':
        case 'circle':
            isDrawing = true;
            startShape(currentTool, x, y);
            break;
            
        case 'select':
            handleSelectClick(x, y);
            break;
    }
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (isDrawing) {
        switch (currentTool) {
            case 'pen':
                currentPath.push({ x, y });
                drawLine(x, y);
                break;
                
            case 'rectangle':
            case 'circle':
                updateShape(currentTool, startX, startY, x, y);
                break;
        }
    }
    
    // Handle select tool dragging separately (doesn't use isDrawing)
    if (currentTool === 'select' && isDragging && selectedElementId) {
        handleElementDrag(x, y);
    }
    
    // Send cursor updates
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        sendCursorUpdate(currentBoardId, x, y).catch(() => {});
    }
}

function handleMouseUp(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    console.log('Mouse up:', currentTool, 'isDrawing:', isDrawing, 'isDragging:', isDragging);
    
    if (isDrawing) {
        isDrawing = false;
        
        switch (currentTool) {
        case 'pen':
            if (currentPath.length > 0) {
                const pathData = {
                    paths: [{
                        points: currentPath.map(p => ({ x: p.x, y: p.y })),
                        strokeColor: '#000000',
                        strokeWidth: 2
                    }]
                };
                
                if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                    sendDrawingPath(currentBoardId, pathData).catch(() => {});
                }
                currentPath = [];
            }
            break;
            
        case 'rectangle':
        case 'circle':
            createShapeElement(startX, startY, x, y);
            finishShape();
            break;
        }
    }
    
    // Handle select tool drag end separately (doesn't use isDrawing)
    if (currentTool === 'select' && isDragging) {
        console.log('Finishing element drag');
        finishElementDrag();
    }
}

// Element creation functions
function createTextElement(x, y) {
    const text = prompt('Enter text:');
    if (text && text.trim()) {
        const textData = {
            content: text.trim(),
            fontSize: 16,
            fontFamily: 'Arial',
            color: '#000000',
            bold: false,
            italic: false,
            isEditing: false
        };
        
        sendElement(currentBoardId, {
            type: 'Text',
            x: x,
            y: y,
            width: 0,
            height: 0,
            data: textData
        });
    }
}

function createStickyNote(x, y) {
    const text = prompt('Enter sticky note text:');
    if (text && text.trim()) {
        const stickyData = {
            content: text.trim(),
            color: '#ffff88',
            fontSize: 14,
            isEditing: false
        };
        
        sendElement(currentBoardId, {
            type: 'StickyNote',
            x: x,
            y: y,
            width: 200,
            height: 150,
            data: stickyData
        });
    }
}

function createShapeElement(startX, startY, endX, endY) {
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    
    const shapeData = {
        shapeType: currentTool,
        fillColor: 'transparent',
        strokeColor: '#000000',
        strokeWidth: 2
    };
    
    sendElement(currentBoardId, {
        type: 'Shape',
        x: x,
        y: y,
        width: width,
        height: height,
        data: shapeData
    });
}

// Selection functions
function handleSelectClick(x, y) {
    console.log('handleSelectClick called:', x, y);
    const elementId = getElementAtPoint(x, y);
    const element = elementId ? elements.get(elementId) : null;
    
    console.log('Element found for selection:', elementId, element);
    
    if (element) {
        selectedElementId = elementId;
        isDragging = true;
        
        dragOffsetX = x - element.x;
        dragOffsetY = y - element.y;
        
        console.log('Element selected:', elementId, 'dragOffset:', dragOffsetX, dragOffsetY);
        highlightElement(elementId);
    } else {
        if (selectedElementId) {
            console.log('Deselecting element:', selectedElementId);
            clearSelection();
            selectedElementId = null;
        } else {
            console.log('No element found to select');
        }
    }
}

function handleElementDrag(x, y) {
    if (selectedElementId) {
        const newX = x - dragOffsetX;
        const newY = y - dragOffsetY;
        console.log('Dragging element:', selectedElementId, 'to:', newX, newY);
        updateElementPosition(selectedElementId, newX, newY);
    }
}

function finishElementDrag() {
    console.log('finishElementDrag called:', selectedElementId, isDragging);
    if (selectedElementId && isDragging) {
        const element = elements.get(selectedElementId);
        console.log('Element for drag finish:', element);
        if (element) {
            console.log('Sending element move to:', element.x, element.y);
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                sendElementMove(currentBoardId, selectedElementId, element.x, element.y)
                    .then(() => console.log('Element move sent successfully'))
                    .catch((err) => console.log('Element move failed:', err));
            } else {
                console.log('SignalR not connected for element move');
            }
        }
        isDragging = false;
        console.log('isDragging set to false');
    }
}

// Board management
window.clearCanvasFromBlazor = () => {
    clearCanvas();
    elements.clear();
    if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
        sendBoardCleared(currentBoardId).catch(() => {});
    }
};

// Test function to check SignalR connection
window.testSignalRConnection = () => {
    console.log('SignalR Connection State:', signalRConnection ? signalRConnection.state : 'null');
    console.log('Current Board ID:', currentBoardId);
    console.log('Elements Count:', elements.size);
    console.log('Available Elements:', Array.from(elements.keys()));
};

// Initialize canvas when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initializeCanvas();
    }, 100);
});