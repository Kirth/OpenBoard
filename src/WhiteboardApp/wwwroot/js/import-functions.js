// Import Functions - Utilities for JSON board import functionality

// File drag and drop utilities
window.setupFileDragDrop = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove('drag-over');
    });

    element.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                // Trigger file input change event
                const fileInput = element.querySelector('input[type="file"]');
                if (fileInput) {
                    // Create a new FileList with the dropped file
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                    
                    // Trigger change event
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                showNotification('Please drop a JSON file', 'error');
            }
        }
    });
};

// JSON validation utilities
window.validateJsonStructure = function(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        
        // Check required top-level structure
        if (!data.metadata || !data.boardData) {
            return { isValid: false, error: 'Missing required sections (metadata, boardData)' };
        }

        // Check metadata structure
        const metadata = data.metadata;
        if (!metadata.boardId || !metadata.boardName || !metadata.exportVersion) {
            return { isValid: false, error: 'Missing required metadata fields' };
        }

        // Check board data structure
        const boardData = data.boardData;
        if (!boardData.board || !Array.isArray(boardData.elements)) {
            return { isValid: false, error: 'Missing or invalid board data structure' };
        }

        return { isValid: true };
    } catch (e) {
        return { isValid: false, error: 'Invalid JSON format: ' + e.message };
    }
};

// File size formatting utility
window.formatFileSize = function(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Show import progress indicator
window.showImportProgress = function(show) {
    const progressIndicator = document.querySelector('.import-progress');
    if (progressIndicator) {
        progressIndicator.style.display = show ? 'block' : 'none';
    }
};

// Hash validation utility (client-side verification)
window.validateImportHash = async function(boardDataJson, expectedHash) {
    try {
        // Encode the board data JSON
        const encoder = new TextEncoder();
        const data = encoder.encode(boardDataJson);
        
        // Calculate SHA-256 hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
        
        return hashBase64 === expectedHash;
    } catch (e) {
        console.warn('Client-side hash validation failed:', e);
        return false;
    }
};

// Import preview utilities
window.generateImportPreview = function(jsonData) {
    try {
        const data = JSON.parse(jsonData);
        
        return {
            boardName: data.boardData?.board?.name || 'Unknown Board',
            elementCount: data.boardData?.elements?.length || 0,
            imageCount: Object.keys(data.boardData?.images || {}).length,
            exportedAt: data.metadata?.exportedAt,
            exportedBy: data.metadata?.exportedBy,
            exportVersion: data.metadata?.exportVersion,
            fileSizeBytes: data.metadata?.fileSizeBytes
        };
    } catch (e) {
        return null;
    }
};

// Cleanup utilities for import process
window.cleanupImportState = function() {
    // Remove any drag-over classes
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    
    // Hide progress indicators
    document.querySelectorAll('.import-progress').forEach(el => {
        el.style.display = 'none';
    });
    
    // Clear any temporary data
    if (window.tempImportData) {
        delete window.tempImportData;
    }
};

// Initialize import functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Setup drag and drop for file input areas
    const fileInputAreas = document.querySelectorAll('.file-input-area, .import-section');
    fileInputAreas.forEach(area => {
        if (area.id) {
            setupFileDragDrop(area.id);
        }
    });
});

console.log('Import functions loaded successfully');