/**
 * Toolbar Manager Module
 * Handles draggable toolbar with edge snapping functionality
 */

const SNAP_DISTANCE = 80; // Distance from edge to trigger snap
const STORAGE_KEY = 'toolbar-state';
const SNAP_POSITIONS = {
    BOTTOM: 'bottom',
    TOP: 'top',
    LEFT: 'left',
    RIGHT: 'right',
    NONE: 'floating'
};

const LAYOUT_MODES = {
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical',
    BLOB: 'blob'
};

let toolbar = null;
let dragHandle = null;
let isDragging = false;
let isSnapped = false;
let currentSnapPosition = null;
let freeFloatingX = null;
let freeFloatingY = null;
let dragOffset = { x: 0, y: 0 };
let nearEdge = null; // Track which edge we're near for visual feedback
let currentLayoutMode = LAYOUT_MODES.HORIZONTAL; // Current layout mode
let lastClickTime = 0; // For double-click detection

/**
 * Initialize the toolbar manager
 */
export function initialize() {
    toolbar = document.getElementById('floating-toolbar');
    dragHandle = document.getElementById('toolbar-drag-handle');

    if (!toolbar || !dragHandle) {
        console.warn('Toolbar elements not found');
        return;
    }

    // Load saved position
    loadPosition();

    // Set up drag events
    dragHandle.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    // Set up double-click for layout mode switching
    dragHandle.addEventListener('dblclick', handleDoubleClick);

    // Touch support
    dragHandle.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    // Window resize handler to keep toolbar accessible
    window.addEventListener('resize', handleWindowResize);

    console.log('Toolbar manager initialized');
}

/**
 * Handle drag start
 */
function handleDragStart(event) {
    event.preventDefault();
    isDragging = true;

    const rect = toolbar.getBoundingClientRect();
    dragOffset.x = event.clientX - rect.left - rect.width / 2;
    dragOffset.y = event.clientY - rect.top - rect.height / 2;

    toolbar.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
}

/**
 * Handle drag move - ultra responsive, no throttling
 */
function handleDragMove(event) {
    if (!isDragging) return;

    const x = event.clientX - dragOffset.x;
    const y = event.clientY - dragOffset.y;

    // Update position immediately (free-floating)
    updateFreeFloatingPosition(x, y);

    // Check if near any edge for visual feedback
    checkSnapZone(event.clientX, event.clientY);
}

/**
 * Handle drag end
 */
function handleDragEnd(event) {
    if (!isDragging) return;

    isDragging = false;
    toolbar.classList.remove('dragging');
    toolbar.classList.remove('near-snap');
    document.body.style.cursor = '';

    // Check if should snap to edge
    const snapPosition = checkShouldSnap(event.clientX, event.clientY);

    if (snapPosition) {
        // Snap to edge (applySnapPosition handles layout mode switching)
        applySnapPosition(snapPosition);
        isSnapped = true;
        currentSnapPosition = snapPosition;
    } else {
        // Stay free-floating - switch to blob mode
        isSnapped = false;
        currentSnapPosition = null;
        freeFloatingX = parseFloat(toolbar.style.left);
        freeFloatingY = parseFloat(toolbar.style.top);

        // Auto-switch to blob mode when free-floating
        currentLayoutMode = LAYOUT_MODES.BLOB;
        applyLayoutMode(LAYOUT_MODES.BLOB);
        console.log('Toolbar free-floating, layout: blob');
    }

    nearEdge = null;
    savePosition();
}

/**
 * Handle touch start
 */
function handleTouchStart(event) {
    event.preventDefault();
    const touch = event.touches[0];
    isDragging = true;

    const rect = toolbar.getBoundingClientRect();
    dragOffset.x = touch.clientX - rect.left - rect.width / 2;
    dragOffset.y = touch.clientY - rect.top - rect.height / 2;

    toolbar.classList.add('dragging');
}

/**
 * Handle touch move
 */
function handleTouchMove(event) {
    if (!isDragging) return;
    event.preventDefault();

    const touch = event.touches[0];
    const x = touch.clientX - dragOffset.x;
    const y = touch.clientY - dragOffset.y;

    updateFreeFloatingPosition(x, y);
    checkSnapZone(touch.clientX, touch.clientY);
}

/**
 * Handle touch end
 */
function handleTouchEnd(event) {
    if (!isDragging) return;

    isDragging = false;
    toolbar.classList.remove('dragging');
    toolbar.classList.remove('near-snap');

    const touch = event.changedTouches[0];
    const snapPosition = checkShouldSnap(touch.clientX, touch.clientY);

    if (snapPosition) {
        // Snap to edge (applySnapPosition handles layout mode switching)
        applySnapPosition(snapPosition);
        isSnapped = true;
        currentSnapPosition = snapPosition;
    } else {
        // Stay free-floating - switch to blob mode
        isSnapped = false;
        currentSnapPosition = null;
        freeFloatingX = parseFloat(toolbar.style.left);
        freeFloatingY = parseFloat(toolbar.style.top);

        // Auto-switch to blob mode when free-floating
        currentLayoutMode = LAYOUT_MODES.BLOB;
        applyLayoutMode(LAYOUT_MODES.BLOB);
        console.log('Toolbar free-floating, layout: blob');
    }

    nearEdge = null;
    savePosition();
}

/**
 * Handle window resize to keep toolbar accessible
 */
function handleWindowResize() {
    // Only adjust free-floating toolbars (snapped ones adjust via CSS automatically)
    if (!isSnapped && freeFloatingX !== null && freeFloatingY !== null) {
        const rect = toolbar.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        const margin = 20; // Minimum margin from edges
        let newX = freeFloatingX;
        let newY = freeFloatingY;
        let needsUpdate = false;

        // Check if toolbar is off-screen or too close to edges
        const toolbarHalfWidth = rect.width / 2;
        const toolbarHalfHeight = rect.height / 2;

        // Clamp X position
        const minX = toolbarHalfWidth + margin;
        const maxX = windowWidth - toolbarHalfWidth - margin;
        if (newX < minX) {
            newX = minX;
            needsUpdate = true;
        } else if (newX > maxX) {
            newX = maxX;
            needsUpdate = true;
        }

        // Clamp Y position
        const minY = toolbarHalfHeight + margin;
        const maxY = windowHeight - toolbarHalfHeight - margin;
        if (newY < minY) {
            newY = minY;
            needsUpdate = true;
        } else if (newY > maxY) {
            newY = maxY;
            needsUpdate = true;
        }

        // Update position if needed
        if (needsUpdate) {
            freeFloatingX = newX;
            freeFloatingY = newY;
            updateFreeFloatingPosition(newX, newY);
            savePosition();
            console.log('Toolbar repositioned to stay accessible after resize');
        }
    }
}

/**
 * Handle double-click on drag handle to cycle layout modes
 */
function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    cycleLayoutMode();
}

/**
 * Cycle through layout modes
 */
function cycleLayoutMode() {
    const modes = [LAYOUT_MODES.HORIZONTAL, LAYOUT_MODES.VERTICAL, LAYOUT_MODES.BLOB];
    const currentIndex = modes.indexOf(currentLayoutMode);
    const nextIndex = (currentIndex + 1) % modes.length;

    currentLayoutMode = modes[nextIndex];
    applyLayoutMode(currentLayoutMode);
    savePosition();

    console.log(`Toolbar layout mode: ${currentLayoutMode}`);
}

/**
 * Apply layout mode to toolbar
 */
function applyLayoutMode(mode) {
    if (!toolbar) return;

    // Remove all layout mode classes
    toolbar.classList.remove('layout-horizontal', 'layout-vertical', 'layout-blob');

    // Add new layout mode class
    toolbar.classList.add(`layout-${mode}`);
}

/**
 * Update toolbar to free-floating position (ultra responsive)
 */
function updateFreeFloatingPosition(x, y) {
    if (!toolbar) return;

    // Remove all snap classes
    toolbar.classList.remove(
        'toolbar-bottom',
        'toolbar-top',
        'toolbar-left',
        'toolbar-right'
    );

    // Apply position directly with inline styles for instant response
    toolbar.style.left = x + 'px';
    toolbar.style.top = y + 'px';
    toolbar.style.right = 'auto';
    toolbar.style.bottom = 'auto';
    toolbar.style.transform = 'translate(-50%, -50%)';
}

/**
 * Check if near snap zone and provide visual feedback
 */
function checkSnapZone(x, y) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const distanceToLeft = x;
    const distanceToRight = windowWidth - x;
    const distanceToTop = y;
    const distanceToBottom = windowHeight - y;

    const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);

    if (minDistance <= SNAP_DISTANCE) {
        toolbar.classList.add('near-snap');

        // Track which edge we're near
        if (minDistance === distanceToLeft) nearEdge = SNAP_POSITIONS.LEFT;
        else if (minDistance === distanceToRight) nearEdge = SNAP_POSITIONS.RIGHT;
        else if (minDistance === distanceToTop) nearEdge = SNAP_POSITIONS.TOP;
        else nearEdge = SNAP_POSITIONS.BOTTOM;
    } else {
        toolbar.classList.remove('near-snap');
        nearEdge = null;
    }
}

/**
 * Check if should snap to an edge
 */
function checkShouldSnap(x, y) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const distanceToLeft = x;
    const distanceToRight = windowWidth - x;
    const distanceToTop = y;
    const distanceToBottom = windowHeight - y;

    const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);

    // Only snap if within snap distance
    if (minDistance > SNAP_DISTANCE) {
        return null;
    }

    // Return closest edge
    if (minDistance === distanceToLeft) return SNAP_POSITIONS.LEFT;
    if (minDistance === distanceToRight) return SNAP_POSITIONS.RIGHT;
    if (minDistance === distanceToTop) return SNAP_POSITIONS.TOP;
    return SNAP_POSITIONS.BOTTOM;
}

/**
 * Apply snap position with proper classes and auto-switch layout mode
 */
function applySnapPosition(position) {
    if (!toolbar) return;

    // Remove all snap classes
    toolbar.classList.remove(
        'toolbar-bottom',
        'toolbar-top',
        'toolbar-left',
        'toolbar-right'
    );

    // Reset inline styles
    toolbar.style.left = '';
    toolbar.style.top = '';
    toolbar.style.right = '';
    toolbar.style.bottom = '';
    toolbar.style.transform = '';

    // Apply snap position class
    toolbar.classList.add(`toolbar-${position}`);

    // Auto-switch layout mode based on position
    if (position === SNAP_POSITIONS.TOP || position === SNAP_POSITIONS.BOTTOM) {
        currentLayoutMode = LAYOUT_MODES.HORIZONTAL;
        applyLayoutMode(LAYOUT_MODES.HORIZONTAL);
    } else if (position === SNAP_POSITIONS.LEFT || position === SNAP_POSITIONS.RIGHT) {
        currentLayoutMode = LAYOUT_MODES.VERTICAL;
        applyLayoutMode(LAYOUT_MODES.VERTICAL);
    }

    console.log(`Toolbar snapped to: ${position}, layout: ${currentLayoutMode}`);
}

/**
 * Save position to localStorage
 */
function savePosition() {
    try {
        const state = {
            isSnapped,
            snapPosition: currentSnapPosition,
            floatingX: freeFloatingX,
            floatingY: freeFloatingY,
            layoutMode: currentLayoutMode
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('Failed to save toolbar position:', error);
    }
}

/**
 * Load position from localStorage
 */
function loadPosition() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);

            if (state.isSnapped && state.snapPosition) {
                // Restore snapped position (applySnapPosition handles layout mode)
                isSnapped = true;
                currentSnapPosition = state.snapPosition;
                applySnapPosition(state.snapPosition);
            } else if (state.floatingX !== null && state.floatingY !== null) {
                // Restore free-floating position - use blob mode
                isSnapped = false;
                currentSnapPosition = null;
                freeFloatingX = state.floatingX;
                freeFloatingY = state.floatingY;
                updateFreeFloatingPosition(freeFloatingX, freeFloatingY);

                // Apply blob mode for free-floating
                currentLayoutMode = LAYOUT_MODES.BLOB;
                applyLayoutMode(LAYOUT_MODES.BLOB);
            } else {
                // Default to bottom
                applySnapPosition(SNAP_POSITIONS.BOTTOM);
                isSnapped = true;
                currentSnapPosition = SNAP_POSITIONS.BOTTOM;
            }
            return;
        }
    } catch (error) {
        console.warn('Failed to load toolbar position:', error);
    }

    // Default to bottom if no saved state (applySnapPosition handles layout mode)
    applySnapPosition(SNAP_POSITIONS.BOTTOM);
    isSnapped = true;
    currentSnapPosition = SNAP_POSITIONS.BOTTOM;
}

/**
 * Get current toolbar state
 */
export function getCurrentState() {
    return {
        isSnapped,
        snapPosition: currentSnapPosition,
        floatingX: freeFloatingX,
        floatingY: freeFloatingY,
        layoutMode: currentLayoutMode
    };
}

/**
 * Set toolbar position programmatically
 */
export function setPosition(position) {
    if (Object.values(SNAP_POSITIONS).includes(position)) {
        if (position === SNAP_POSITIONS.NONE) {
            // Set to center for floating - use blob mode
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            isSnapped = false;
            currentSnapPosition = null;
            freeFloatingX = centerX;
            freeFloatingY = centerY;
            updateFreeFloatingPosition(centerX, centerY);

            // Apply blob mode for free-floating
            currentLayoutMode = LAYOUT_MODES.BLOB;
            applyLayoutMode(LAYOUT_MODES.BLOB);
        } else {
            // Snap to edge (applySnapPosition handles layout mode)
            isSnapped = true;
            currentSnapPosition = position;
            applySnapPosition(position);
        }
        savePosition();
    }
}

/**
 * Clean up event listeners
 */
export function cleanup() {
    if (dragHandle) {
        dragHandle.removeEventListener('mousedown', handleDragStart);
        dragHandle.removeEventListener('dblclick', handleDoubleClick);
        dragHandle.removeEventListener('touchstart', handleTouchStart);
    }
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('resize', handleWindowResize);
}
