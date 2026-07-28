(function() {
    const STORAGE_KEY = 'theme';
    
    function getPreferredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        return 'light';
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
        localStorage.setItem(STORAGE_KEY, theme);
        updateIcon(theme);
        updateCodeBlocks(theme);
    }
    
    function updateIcon(theme) {
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = theme === 'dark' ? 'light' : 'dark';
    }
    
    function updateCodeBlocks(theme) {
        const codeBlocks = document.querySelectorAll('pre.giallo');
        codeBlocks.forEach(function(block) {
            block.style.colorScheme = theme;
        });
    }
    
    // Set theme immediately to prevent flash
    setTheme(getPreferredTheme());
    
    // Also update code blocks after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            updateCodeBlocks(getPreferredTheme());
        });
    }
    
    // Expose toggle function globally
    window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    };
})();
