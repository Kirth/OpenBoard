// UI Features Module - Dark mode, context menu, notifications, and grid system
// Handles all user interface features and visual enhancements

// Dependencies will be injected by main coordinator
let dependencies = {};

export function setDependencies(deps) {
  dependencies = deps;
}

// Dark mode functionality
let currentTheme = 'auto'; // 'light', 'dark', 'auto'

export function initializeDarkMode() {
  // Get saved theme preference or default to auto
  currentTheme = localStorage.getItem('theme') || 'auto';
  console.log('Initializing dark mode with theme:', currentTheme);
  console.log('System prefers dark mode:', window.matchMedia('(prefers-color-scheme: dark)').matches);

  applyTheme(currentTheme);

  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', handleSystemThemeChange);

  console.log('Dark mode initialized with theme:', currentTheme);
}

function handleSystemThemeChange(e) {
  if (currentTheme === 'auto') {
    applyTheme('auto');
  }
}

export function applyTheme(theme) {
  const html = document.documentElement;
  console.log('applyTheme called with:', theme);
  console.log('Current data-theme attribute:', html.getAttribute('data-theme'));

  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    console.log('Set data-theme to dark');
  } else if (theme === 'light') {
    html.removeAttribute('data-theme');
    console.log('Removed data-theme attribute (light mode)');
  } else if (theme === 'auto') {
    // For auto mode, check system preference and apply accordingly
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      html.setAttribute('data-theme', 'dark');
      console.log('Auto mode: Set data-theme to dark (system prefers dark)');
    } else {
      html.removeAttribute('data-theme');
      console.log('Auto mode: Removed data-theme attribute (system prefers light)');
    }
  }

  console.log('New data-theme attribute:', html.getAttribute('data-theme'));

  // Update theme icon
  updateThemeIcon();

  // Update canvas background if canvas exists
  updateCanvasBackground();
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    if (currentTheme === 'dark') {
      themeIcon.textContent = '☀️';
    } else if (currentTheme === 'light') {
      themeIcon.textContent = '🔄';
    } else {
      themeIcon.textContent = '🌙';
    }
  }
}

function updateCanvasBackground() {
  const canvas = dependencies.canvasManager?.getCanvas();
  if (canvas) {
    // Force a redraw to apply new background color and color inversions
    setTimeout(() => {
      dependencies.canvasManager.redrawCanvas();
    }, 100);
  }
}

export function toggleDarkMode() {
  console.log('toggleDarkMode called, current theme:', currentTheme);

  if (currentTheme === 'light') {
    currentTheme = 'dark';
  } else if (currentTheme === 'dark') {
    currentTheme = 'auto';
  } else {
    currentTheme = 'light';
  }

  localStorage.setItem('theme', currentTheme);
  console.log('About to apply theme:', currentTheme);
  applyTheme(currentTheme);

  showNotification(`Theme set to ${currentTheme}`, 'success', 2000);
  console.log('Theme changed to:', currentTheme);
}

export function getCurrentTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  if (['light', 'dark', 'auto'].includes(theme)) {
    currentTheme = theme;
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
    console.log('Theme set to:', currentTheme);
  }
}

// Color inversion utilities for dark mode
export function isDarkModeActive() {
  const html = document.documentElement;
  const hasDataThemeDark = html.getAttribute('data-theme') === 'dark';

  if (currentTheme === 'dark') {
    return true;
  } else if (currentTheme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Also check the actual DOM state as a fallback
  console.log('isDarkModeActive check - theme:', currentTheme, 'hasDataThemeDark:', hasDataThemeDark);
  return hasDataThemeDark;
}

export function isBlackColor(color) {
  if (!color) return false;

  // Handle hex colors
  if (color === '#000000' || color === '#000' || color.toLowerCase() === '#000000') return true;
  if (color === '#333333' || color === '#333' || color.toLowerCase() === '#333333') return true;

  // Handle rgb colors
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return r === 0 && g === 0 && b === 0;
    }
  }

  // Handle named color
  if (color.toLowerCase() === 'black') return true;

  return false;
}

export function invertBlackToWhite(color) {
  if (!isDarkModeActive() || !isBlackColor(color)) {
    return color;
  }

  // Convert black to white in dark mode
  return '#ffffff';
}

// Context menu functionality
let currentContextMenu = null;
let contextMenuElement = null;

export function showContextMenu(x, y, element = null) {
  try {
    // Hide any existing context menu
    hideContextMenu();

    console.log(`Context menu requested at (${x}, ${y})`, element);

    // Create context menu element
    contextMenuElement = document.createElement('div');
    contextMenuElement.className = 'context-menu';
    contextMenuElement.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            min-width: 180px;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

    if (element) {
      // Element-specific context menu
      contextMenuElement.innerHTML = createElementContextMenu(element);
    } else {
      // General context menu
      contextMenuElement.innerHTML = createGeneralContextMenu();
    }

    document.body.appendChild(contextMenuElement);
    currentContextMenu = element;

    // Add click listener to hide menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', handleContextMenuOutsideClick);
    }, 0);

  } catch (error) {
    console.error('Error showing context menu:', error);
  }
}

export function hideContextMenu() {
  if (contextMenuElement && contextMenuElement.parentNode) {
    contextMenuElement.parentNode.removeChild(contextMenuElement);
    contextMenuElement = null;
    currentContextMenu = null;
    document.removeEventListener('click', handleContextMenuOutsideClick);
  }
}

function handleContextMenuOutsideClick(event) {
  if (contextMenuElement && !contextMenuElement.contains(event.target)) {
    hideContextMenu();
  }
}

// Helper function to get lock button text with browser compatibility
function getLockButtonText(element) {
  try {
    // Try multiple sources for the isElementLocked function to handle browser timing differences
    const isElementLockedFn = window.isElementLocked || dependencies.elementFactory.isElementLocked;

    if (isElementLockedFn) {
      return isElementLockedFn(element) ? '🔓 Unlock' : '🔒 Lock';
    } else {
      // Debug and fallback if functions aren't available yet
      console.warn('isElementLocked function not available, using default');
      return '🔒 Lock';
    }
  } catch (error) {
    console.warn('Error checking lock state for context menu:', error);
    return '🔒 Lock';
  }
}

// Helper function to ensure valid hex color for HTML color inputs
function getValidHexColor(color, defaultColor) {
  if (!color || color === 'transparent' || color === 'none' || color === null || color === undefined) {
    return defaultColor;
  }

  // Check if it's already a valid hex color
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  // Try to handle other color formats or return default
  return defaultColor;
}

function createElementContextMenu(element) {
  console.log('Creating context menu for element:', element.type, element);
  const isShape = ['rectangle', 'circle', 'triangle', 'diamond', 'ellipse', 'star'].includes(element.type);
  const isLine = element.type === 'Line';
  const isPath = element.type === 'Path' || element.type === 'Drawing';
  const isStickyNote = element.type === 'StickyNote';
  const hasStylng = isShape || isLine || isPath;
  console.log('isPath:', isPath, 'hasStylng:', hasStylng);

  let menuHTML = `
        <div class="context-menu-section">
            <div class="context-menu-title">Element: ${element.type}</div>
        </div>
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="toggleElementLockAction('${element.id}')">
                ${getLockButtonText(element)}
            </button>
            <button class="context-menu-item" onclick="bringElementToFront('${element.id}')">
                📤 Bring to Front
            </button>
            <button class="context-menu-item" onclick="sendElementToBack('${element.id}')">
                📥 Send to Back
            </button>
        </div>
    `;

  if (hasStylng) { // TODO: hasBorder? 
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Styling</div>
                ${isShape ? `
                    <div class="context-menu-color-row">
                        <label>Fill Color:</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="color-input-wrapper" style="position: relative;">
                                <input type="color" id="fillColorInput_${element.id}" 
                                       style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                                       value="${getValidHexColor(element.data?.fillColor, '#ffffff')}"
                                       onchange="updateElementFillColor('${element.id}', this.value); hideContextMenu();"
                                       oninput="updateElementFillColor('${element.id}', this.value);">
                                <button class="color-preview-btn" 
                                        onclick="document.getElementById('fillColorInput_${element.id}').click()"
                                        style="width: 32px; height: 24px; border: 2px solid #ccc; border-radius: 4px; cursor: pointer; background-color: ${!element.data?.fillColor || element.data?.fillColor === 'transparent' || element.data?.fillColor === 'none' ? 'transparent' : getValidHexColor(element.data?.fillColor, '#ffffff')}; ${!element.data?.fillColor || element.data?.fillColor === 'transparent' || element.data?.fillColor === 'none' ? 'background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 8px 8px; background-position: 0 0, 0 4px, 4px -4px, -4px 0px;' : ''}"
                                        title="${!element.data?.fillColor || element.data?.fillColor === 'transparent' || element.data?.fillColor === 'none' ? 'Click to add fill color' : 'Current fill color - click to change'}">
                                </button>
                            </div>
                            <button class="context-menu-btn ${!element.data?.fillColor || element.data?.fillColor === 'transparent' || element.data?.fillColor === 'none' ? 'active' : ''}" onclick="toggleElementFill('${element.id}')">
                                ${!element.data?.fillColor || element.data?.fillColor === 'transparent' || element.data?.fillColor === 'none' ? 'Add Fill' : 'No Fill'}
                            </button>
                        </div>
                    </div>
                ` : ''}
                <div class="context-menu-color-row">
                    <label>Border Color:</label>
                    <div class="color-input-wrapper" style="position: relative; display: inline-block;">
                        <input type="color" id="borderColorInput_${element.id}" 
                               style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                               value="${getValidHexColor(element.data?.color, '#000000')}"
                               onchange="updateElementBorderColor('${element.id}', this.value); hideContextMenu();"
                               oninput="updateElementBorderColor('${element.id}', this.value);">
                        <button class="color-preview-btn" 
                                onclick="document.getElementById('borderColorInput_${element.id}').click()"
                                style="width: 32px; height: 24px; border: 2px solid #ccc; border-radius: 4px; cursor: pointer; background-color: ${getValidHexColor(element.data?.color, '#000000')};"
                                title="Current border color - click to change">
                        </button>
                    </div>
                </div>
                <div class="context-menu-range-row">
                    <label>Border Width:</label>
                    <input type="range" min="1" max="10" value="${element.data?.strokeWidth || 2}" 
                           class="context-menu-range" onchange="updateElementBorderWidth('${element.id}', this.value)">
                    <span class="range-value">${element.data?.strokeWidth || 2}px</span>
                </div>
            </div>
        `;
  }

  // Arrow controls for lines
  if (isLine) {
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Arrow Heads</div>
                <div class="context-menu-color-row">
                    <label>Start Arrow:</label>
                    <select onchange="updateLineArrow('${element.id}', 'startArrow', this.value)" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="none" ${!element.data?.startArrow || element.data.startArrow === 'none' ? 'selected' : ''}>None</option>
                        <option value="outline" ${element.data?.startArrow === 'outline' ? 'selected' : ''}>Arrow ➤</option>
                        <option value="filled" ${element.data?.startArrow === 'filled' ? 'selected' : ''}>Filled ➤</option>
                    </select>
                </div>
                <div class="context-menu-color-row">
                    <label>End Arrow:</label>
                    <select onchange="updateLineArrow('${element.id}', 'endArrow', this.value)" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="none" ${!element.data?.endArrow || element.data.endArrow === 'none' ? 'selected' : ''}>None</option>
                        <option value="outline" ${element.data?.endArrow === 'outline' ? 'selected' : ''}>Arrow ➤</option>
                        <option value="filled" ${element.data?.endArrow === 'filled' ? 'selected' : ''}>Filled ➤</option>
                    </select>
                </div>
                <div class="context-menu-range-row">
                    <label>Arrow Size:</label>
                    <input type="range" min="5" max="20" value="${element.data?.arrowSize || 10}" 
                           class="context-menu-range" onchange="updateLineArrowSize('${element.id}', this.value)">
                    <span class="range-value">${element.data?.arrowSize || 10}px</span>
                </div>
            </div>
        `;
  }

  // Path styling controls
  if (isPath) {
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Path Styling</div>
                <div class="context-menu-color-row">
                    <label>Stroke Color:</label>
                    <div class="color-input-wrapper" style="position: relative; display: inline-block;">
                        <input type="color" id="pathColorInput_${element.id}" 
                               style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                               value="${getValidHexColor(element.data?.color, '#000000')}"
                               onchange="updateElementBorderColor('${element.id}', this.value); hideContextMenu();"
                               oninput="updateElementBorderColor('${element.id}', this.value);">
                        <button class="color-preview-btn" 
                                onclick="document.getElementById('pathColorInput_${element.id}').click()"
                                style="width: 32px; height: 24px; border: 2px solid #ccc; border-radius: 4px; cursor: pointer; background-color: ${getValidHexColor(element.data?.color, '#000000')};"
                                title="Current stroke color - click to change">
                        </button>
                    </div>
                </div>
                <div class="context-menu-range-row">
                    <label>Stroke Width:</label>
                    <input type="range" min="1" max="10" value="${element.data?.strokeWidth || 2}" 
                           class="context-menu-range" onchange="updateElementBorderWidth('${element.id}', this.value)">
                    <span class="range-value">${element.data?.strokeWidth || 2}px</span>
                </div>
            </div>
        `;
  }

  // Sticky note color picker section
  if (isStickyNote) {
    menuHTML += `
            <div class="context-menu-section">
                <div class="context-menu-subtitle">Sticky Color</div>
                <div class="context-menu-color-row">
                    <label>Background:</label>
                    <div class="color-input-wrapper" style="position: relative; display: inline-block;">
                        <input type="color" id="stickyColorInput_${element.id}" 
                               style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;"
                               value="${getValidHexColor(element.data?.color, '#ffeb3b')}"
                               onchange="updateStickyNoteColor('${element.id}', this.value); hideContextMenu();"
                               oninput="updateStickyNoteColor('${element.id}', this.value);">
                        <button class="color-preview-btn" 
                                onclick="document.getElementById('stickyColorInput_${element.id}').click()"
                                style="width: 32px; height: 24px; border: 2px solid #ccc; border-radius: 4px; cursor: pointer; background-color: ${getValidHexColor(element.data?.color, '#ffeb3b')};"
                                title="Current background color - click to change">
                        </button>
                    </div>
                </div>
                <div class="context-menu-color-presets">
                    <button class="color-preset" style="background-color: #ffeb3b" onclick="updateStickyNoteColor('${element.id}', '#ffeb3b')" title="Yellow"></button>
                    <button class="color-preset" style="background-color: #ff9800" onclick="updateStickyNoteColor('${element.id}', '#ff9800')" title="Orange"></button>
                    <button class="color-preset" style="background-color: #4caf50" onclick="updateStickyNoteColor('${element.id}', '#4caf50')" title="Green"></button>
                    <button class="color-preset" style="background-color: #2196f3" onclick="updateStickyNoteColor('${element.id}', '#2196f3')" title="Blue"></button>
                    <button class="color-preset" style="background-color: #e91e63" onclick="updateStickyNoteColor('${element.id}', '#e91e63')" title="Pink"></button>
                    <button class="color-preset" style="background-color: #9c27b0" onclick="updateStickyNoteColor('${element.id}', '#9c27b0')" title="Purple"></button>
                    <button class="color-preset" style="background-color: #ffffff" onclick="updateStickyNoteColor('${element.id}', '#ffffff')" title="White"></button>
                    <button class="color-preset" style="background-color: #f44336" onclick="updateStickyNoteColor('${element.id}', '#f44336')" title="Red"></button>
                </div>
            </div>
        `;
  }

  menuHTML += `
        <div class="context-menu-section">
            <button class="context-menu-item context-menu-delete" onclick="deleteElement('${element.id}')">
                🗑️ Delete
            </button>
        </div>
    `;

  return menuHTML + getContextMenuStyles();
}

function createGeneralContextMenu() {
  const themeIcon = getCurrentTheme() === 'dark' ? '☀️' : getCurrentTheme() === 'light' ? '🌙' : '🔄';
  const themeName = getCurrentTheme() === 'dark' ? 'Light Mode' : getCurrentTheme() === 'light' ? 'Auto Mode' : 'Dark Mode';

  // Get grid states for display
  const gridEnabled = dependencies.canvasManager.isGridEnabled();
  const snapEnabled = dependencies.canvasManager.isSnapToGridEnabled();
  const gridSize = dependencies.canvasManager.getGridSize();

  const gridIcon = gridEnabled ? '✓ 🔲' : '🔲';
  const snapIcon = snapEnabled ? '✓ 🧲' : '🧲';

  return `
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="pasteElementHere()">
                📋 Paste
            </button>
            <button class="context-menu-item" onclick="toggleDarkMode()">
                ${themeIcon} ${themeName}
            </button>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-subtitle">Grid System</div>
            <button class="context-menu-item" onclick="toggleGrid()">
                ${gridIcon} Grid (${gridSize}px)
            </button>
            <button class="context-menu-item" onclick="toggleSnapToGrid()">
                ${snapIcon} Snap to Grid
            </button>
            <div class="context-menu-range-row">
                <label>Grid Size:</label>
                <input type="range" min="10" max="50" step="5" value="${gridSize}" 
                       class="context-menu-range" onchange="updateGridSize(this.value)">
                <span class="range-value">${gridSize}px</span>
            </div>
        </div>
        <div class="context-menu-section">
            <button class="context-menu-item" onclick="undoAction()">
                ↶ Undo
            </button>
            <button class="context-menu-item" onclick="redoAction()">
                ↷ Redo
            </button>
        </div>
    ` + getContextMenuStyles();
}

function getContextMenuStyles() {
  return `
    <style>
        .context-menu {
            border: 1px solid #ccc;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            background: var(--bg-color, white);
            color: var(--text-color, black);
        }
        
        .context-menu-section {
            border-bottom: 1px solid #eee;
            padding: 8px 0;
        }
        
        .context-menu-section:last-child {
            border-bottom: none;
        }
        
        .context-menu-title {
            font-weight: bold;
            padding: 4px 12px;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .context-menu-subtitle {
            font-weight: bold;
            padding: 4px 12px;
            color: #888;
            font-size: 11px;
            text-transform: uppercase;
        }
        
        .context-menu-item {
            display: block;
            width: 100%;
            padding: 8px 12px;
            border: none;
            background: none;
            text-align: left;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        
        .context-menu-item:hover {
            background-color: #f0f0f0;
        }
        
        .context-menu-delete {
            color: #dc3545;
        }
        
        .context-menu-delete:hover {
            background-color: #f8d7da;
        }
        
        .context-menu-color-row {
            display: flex;
            align-items: center;
            padding: 4px 12px;
            gap: 8px;
        }
        
        .context-menu-color-row label {
            flex: 1;
            font-size: 12px;
        }
        
        .context-menu-color {
            width: 30px;
            height: 25px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
        }
        
        .context-menu-btn {
            padding: 2px 6px;
            border: 1px solid #ccc;
            background: white;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .context-menu-range-row {
            display: flex;
            align-items: center;
            padding: 4px 12px;
            gap: 8px;
        }
        
        .context-menu-range-row label {
            flex: 1;
            font-size: 12px;
        }
        
        .context-menu-range {
            flex: 2;
        }
        
        .range-value {
            font-size: 11px;
            color: #666;
            min-width: 30px;
        }
        
        .context-menu-color-presets {
            display: flex;
            gap: 4px;
            padding: 4px 12px;
            flex-wrap: wrap;
        }
        
        .color-preset {
            width: 20px;
            height: 20px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            transition: transform 0.1s;
        }
        
        .color-preset:hover {
            transform: scale(1.1);
        }
        
        /* Dark mode support */
        [data-theme="dark"] .context-menu {
            background: #2d2d2d;
            color: white;
            border-color: #555;
        }
        
        [data-theme="dark"] .context-menu-item:hover {
            background-color: #404040;
        }
        
        [data-theme="dark"] .context-menu-delete:hover {
            background-color: #4a2c2c;
        }
        
        [data-theme="dark"] .context-menu-section {
            border-bottom-color: #555;
        }
    </style>
    `;
}

// Enhanced notification system
let notificationContainer = null;
let activeNotifications = new Map();
let notificationIdCounter = 0;

export function showNotification(message, type = 'info', duration = null) {
  console.log(`Notification [${type}]: ${message}`);

  // Create notification container if it doesn't exist
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            max-width: 350px;
        `;
    document.body.appendChild(notificationContainer);
  }

  // Create notification element
  const notificationId = ++notificationIdCounter;
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
        background: white;
        border-left: 4px solid ${getNotificationColor(type)};
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 12px 16px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        word-wrap: break-word;
        max-width: 100%;
    `;

  // Dark mode support for notifications
  if (isDarkModeActive()) {
    notification.style.background = '#2d2d2d';
    notification.style.color = 'white';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  }

  notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${getNotificationIcon(type)}</span>
            <span style="flex: 1;">${message}</span>
            <button onclick="hideNotification(${notificationId})" style="
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
                opacity: 0.6;
                font-size: 18px;
                line-height: 1;
            ">×</button>
        </div>
    `;

  notificationContainer.appendChild(notification);
  activeNotifications.set(notificationId, notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  });

  // Auto-hide after specified duration
  const autoHideDuration = duration !== null ? duration : getDefaultDuration(type);
  if (autoHideDuration > 0) {
    setTimeout(() => {
      hideNotificationById(notificationId);
    }, autoHideDuration);
  }

  // Make hideNotification globally available for the close button
  window.hideNotification = hideNotificationById;

  return notificationId;
}

function hideNotificationById(notificationId) {
  const notification = activeNotifications.get(notificationId);
  if (!notification) return;

  // Animate out
  notification.style.opacity = '0';
  notification.style.transform = 'translateX(100%)';

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
    activeNotifications.delete(notificationId);

    // Remove container if no notifications remain
    if (activeNotifications.size === 0 && notificationContainer && notificationContainer.parentNode) {
      notificationContainer.parentNode.removeChild(notificationContainer);
      notificationContainer = null;
    }
  }, 300);
}

function getNotificationColor(type) {
  const colors = {
    'success': '#4caf50',
    'error': '#f44336',
    'warning': '#ff9800',
    'info': '#2196f3'
  };
  return colors[type] || colors.info;
}

function getNotificationIcon(type) {
  const icons = {
    'success': '✓',
    'error': '✗',
    'warning': '⚠',
    'info': 'ℹ'
  };
  return icons[type] || icons.info;
}

function getDefaultDuration(type) {
  const durations = {
    'success': 3000,
    'error': 5000,
    'warning': 4000,
    'info': 3000
  };
  return durations[type] || 3000;
}

// Grid system functions
export function toggleGrid() {
  console.log('ui-features toggleGrid called');
  console.log('dependencies.canvasManager:', dependencies.canvasManager);
  console.log('toggleGrid function exists:', typeof dependencies.canvasManager?.toggleGrid);

  if (dependencies.canvasManager) {
    if (typeof dependencies.canvasManager.toggleGrid === 'function') {
      dependencies.canvasManager.toggleGrid();
      const isEnabled = dependencies.canvasManager.isGridEnabled();
      showNotification(`Grid ${isEnabled ? 'enabled' : 'disabled'}`, 'info', 2000);
    } else {
      console.error('toggleGrid is not a function. Available functions:', Object.keys(dependencies.canvasManager));
    }
  } else {
    console.error('dependencies.canvasManager is not available');
  }
}

export function toggleSnapToGrid() {
  console.log('ui-features toggleSnapToGrid called');
  console.log('toggleSnapToGrid function exists:', typeof dependencies.canvasManager?.toggleSnapToGrid);

  if (dependencies.canvasManager) {
    if (typeof dependencies.canvasManager.toggleSnapToGrid === 'function') {
      dependencies.canvasManager.toggleSnapToGrid();
      const isEnabled = dependencies.canvasManager.isSnapToGridEnabled();
      showNotification(`Snap to grid ${isEnabled ? 'enabled' : 'disabled'}`, 'info', 2000);
    } else {
      console.error('toggleSnapToGrid is not a function. Available functions:', Object.keys(dependencies.canvasManager));
    }
  } else {
    console.error('dependencies.canvasManager is not available');
  }
}

export function updateGridSize(size) {
  if (dependencies.canvasManager) {
    dependencies.canvasManager.setGridSize(parseInt(size));
    showNotification(`Grid size set to ${size}px`, 'info', 2000);
  }
}

// Context menu action functions
export function pasteElementHere() {
  hideContextMenu();
  if (dependencies.elementFactory) {
    dependencies.elementFactory.pasteElement();
  }
}

export function undoAction() {
  hideContextMenu();
  if (dependencies.elementFactory) {
    dependencies.elementFactory.undo();
  }
}

export function redoAction() {
  hideContextMenu();
  if (dependencies.elementFactory) {
    dependencies.elementFactory.redo();
  }
}

export function toggleElementLockAction(elementId) {
  hideContextMenu();
  if (dependencies.elementFactory && dependencies.elementFactory.toggleElementLock) {
    dependencies.elementFactory.toggleElementLock(elementId);
  }
}

export function bringElementToFront(elementId) {
  hideContextMenu();
  if (dependencies.elementFactory && dependencies.elementFactory.bringElementToFront) {
    dependencies.elementFactory.bringElementToFront(elementId);
  }
}

export function sendElementToBack(elementId) {
  hideContextMenu();
  if (dependencies.elementFactory && dependencies.elementFactory.sendElementToBack) {
    dependencies.elementFactory.sendElementToBack(elementId);
  }
}

export function deleteElement(elementId) {
  hideContextMenu();
  if (dependencies.elementFactory) {
    dependencies.elementFactory.deleteElement(elementId);
  }
}

export function updateElementFillColor(elementId, color) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'fillColor', color);
  }
}

export function updateElementBorderColor(elementId, color) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'color', color);
  }
}

export function updateElementBorderWidth(elementId, width) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'strokeWidth', parseInt(width));
  }
}

export function toggleElementFill(elementId) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    // Get current element to check fill state
    const element = dependencies.elementFactory.getElementById ? dependencies.elementFactory.getElementById(elementId) : null;

    if (element) {
      const currentFill = element.data?.fillColor;

      if (!currentFill || currentFill === 'transparent' || currentFill === 'none') {
        // Add fill - set to white as default
        dependencies.elementFactory.updateElementStyle(elementId, 'fillColor', '#ffffff');
      } else {
        // Remove fill - set to transparent
        dependencies.elementFactory.updateElementStyle(elementId, 'fillColor', 'transparent');
      }
    }
  }
}

// Keep the old function for backward compatibility
export function removeElementFill(elementId) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'fillColor', 'transparent');
  }
}

export function updateStickyNoteColor(elementId, color) {
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'color', color);
  }
}

// Arrow control handlers
export function updateLineArrow(elementId, arrowProperty, value) {
  console.log('updateLineArrow called:', elementId, arrowProperty, value);
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, arrowProperty, value);
  }
}

export function updateLineArrowSize(elementId, size) {
  console.log('updateLineArrowSize called:', elementId, size);
  if (dependencies.elementFactory && dependencies.elementFactory.updateElementStyle) {
    dependencies.elementFactory.updateElementStyle(elementId, 'arrowSize', parseInt(size));
  }

  // Update the range value display
  const rangeElement = event.target;
  const valueSpan = rangeElement.nextElementSibling;
  if (valueSpan && valueSpan.classList.contains('range-value')) {
    valueSpan.textContent = `${size}px`;
  }
}

console.log('UI Features module loaded with grid toggle debugging v1.1');
