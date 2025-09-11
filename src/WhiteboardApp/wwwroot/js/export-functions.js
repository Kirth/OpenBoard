// Export Functions - Global functions for canvas export
// These functions must be available immediately for Blazor interop

// Global export functions that can be called directly by Blazor
window.exportCanvasAsPng = async function(filename = null) {
  try {
    const canvas = document.querySelector('#whiteboard-canvas');
    if (!canvas) {
      throw new Error('Canvas not available for export');
    }

    // Create filename if not provided
    if (!filename) {
      filename = `board_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    }

    // Ensure filename has .png extension
    if (!filename.toLowerCase().endsWith('.png')) {
      filename += '.png';
    }

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob'));
          return;
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        resolve(filename);
      }, 'image/png', 1.0);
    });
  } catch (error) {
    console.error('Error exporting PNG:', error);
    throw error;
  }
};

window.exportCanvasAsPdf = async function(filename = null) {
  try {
    const canvas = document.querySelector('#whiteboard-canvas');
    if (!canvas) {
      throw new Error('Canvas not available for export');
    }

    // Create filename if not provided
    if (!filename) {
      filename = `board_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
    }

    // Ensure filename has .pdf extension
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename += '.pdf';
    }

    // Get canvas dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Convert canvas to image data URL
    const imgDataUrl = canvas.toDataURL('image/png', 1.0);

    // Check if jsPDF is available
    if (typeof window.jsPDF === 'undefined') {
      throw new Error('jsPDF library not available. Please reload the page.');
    }

    const { jsPDF } = window;
    
    // Calculate PDF dimensions (A4 landscape or fit to content)
    const a4Width = 297; // A4 width in mm (landscape)
    const a4Height = 210; // A4 height in mm (landscape)
    
    // Calculate scale to fit canvas on A4
    const scaleX = a4Width / (canvasWidth / 96 * 25.4); // Convert px to mm
    const scaleY = a4Height / (canvasHeight / 96 * 25.4);
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
    
    const pdfWidth = (canvasWidth / 96 * 25.4) * scale;
    const pdfHeight = (canvasHeight / 96 * 25.4) * scale;
    
    // Create PDF with appropriate dimensions
    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [Math.max(pdfWidth, a4Width), Math.max(pdfHeight, a4Height)]
    });

    // Add the canvas image to PDF
    const x = (pdf.internal.pageSize.getWidth() - pdfWidth) / 2;
    const y = (pdf.internal.pageSize.getHeight() - pdfHeight) / 2;
    
    pdf.addImage(imgDataUrl, 'PNG', x, y, pdfWidth, pdfHeight);
    
    // Add metadata
    pdf.setProperties({
      title: filename.replace('.pdf', ''),
      creator: 'OpenBoard Whiteboard',
      producer: 'OpenBoard Export System'
    });

    // Save the PDF
    pdf.save(filename);
    
    return filename;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  }
};

window.exportHighResPng = async function(filename = null, scaleFactor = 2) {
  try {
    const originalCanvas = document.querySelector('#whiteboard-canvas');
    if (!originalCanvas) {
      throw new Error('Canvas not available for export');
    }

    // Create a high-resolution canvas
    const highResCanvas = document.createElement('canvas');
    const ctx = highResCanvas.getContext('2d');
    
    // Scale up the canvas
    highResCanvas.width = originalCanvas.width * scaleFactor;
    highResCanvas.height = originalCanvas.height * scaleFactor;
    
    // Scale the context and draw the original canvas
    ctx.scale(scaleFactor, scaleFactor);
    ctx.drawImage(originalCanvas, 0, 0);
    
    // Create filename if not provided
    if (!filename) {
      filename = `board_${scaleFactor}x_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    }

    // Export the high-res canvas
    return new Promise((resolve, reject) => {
      highResCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create high-res PNG blob'));
          return;
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        resolve(filename);
      }, 'image/png', 1.0);
    });
  } catch (error) {
    console.error('Error exporting high-res PNG:', error);
    throw error;
  }
};

window.getCanvasInfo = function() {
  try {
    const canvas = document.querySelector('#whiteboard-canvas');
    if (!canvas) {
      return { width: 0, height: 0, scale: 1 };
    }

    return {
      width: canvas.width,
      height: canvas.height,
      scale: 1 // We'll get this from the viewport manager if needed
    };
  } catch (error) {
    console.error('Error getting canvas info:', error);
    return { width: 0, height: 0, scale: 1 };
  }
};


// Debug: Check if jsPDF is available
if (typeof window.jsPDF !== 'undefined') {
  console.log('Export functions loaded with jsPDF available');
} else {
  console.warn('Export functions loaded but jsPDF not available');
}

console.log('Export functions loaded and available globally');