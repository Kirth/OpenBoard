// Theme management for OpenBoard
(function() {
    'use strict';

    // Theme management
    function initTheme() {
        const html = document.documentElement;
        const themeToggle = document.getElementById('themeToggle');
        
        // Get saved theme or default to dark
        const savedTheme = localStorage.getItem('openboard-theme') || 'dark';
        
        // Apply theme
        html.setAttribute('data-theme', savedTheme);
        updateThemeToggle(savedTheme);
        
        // Add theme toggle listener
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
    }

    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // Apply new theme
        html.setAttribute('data-theme', newTheme);
        
        // Save to localStorage
        localStorage.setItem('openboard-theme', newTheme);
        
        // Update toggle button
        updateThemeToggle(newTheme);
    }

    function updateThemeToggle(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
            themeToggle.setAttribute('aria-pressed', theme === 'dark');
            themeToggle.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
        }
    }

    // Initialize theme management
    function init() {
        initTheme();
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K for search focus
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                const searchInput = document.querySelector('.input[placeholder*="Search"]');
                if (searchInput) {
                    searchInput.focus();
                    e.preventDefault();
                }
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            // Close template dropdown
            const templateMenu = document.getElementById('templateMenu');
            const templateButton = document.querySelector('[aria-controls="templateMenu"]');
            if (templateMenu && !templateMenu.contains(e.target) && e.target !== templateButton) {
                // This will be handled by Blazor
            }
            
            // Close user dropdown
            const userDropdown = document.querySelector('.user-dropdown');
            const userAvatar = document.querySelector('.avatar');
            if (userDropdown && !userDropdown.contains(e.target) && e.target !== userAvatar) {
                // This will be handled by Blazor
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-initialize theme when navigating (for SPA)
    window.addEventListener('pageshow', () => {
        setTimeout(initTheme, 100);
    });

    // Expose functions globally for Blazor integration
    window.OpenBoardTheme = {
        toggle: toggleTheme,
        set: (theme) => {
            const html = document.documentElement;
            html.setAttribute('data-theme', theme);
            localStorage.setItem('openboard-theme', theme);
            updateThemeToggle(theme);
        },
        get: () => {
            return document.documentElement.getAttribute('data-theme') || 'dark';
        }
    };
})();