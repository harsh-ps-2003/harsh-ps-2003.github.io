(function() {
    const STORAGE_KEY = 'theme';
    
    function getPreferredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        // Default to light mode
        return 'light';
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateIcon(theme);
    }
    
    function updateIcon(theme) {
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = theme === 'dark' ? 'light' : 'dark';
    }
    
    // Set theme immediately to prevent flash
    setTheme(getPreferredTheme());
    
    // Expose toggle function globally
    window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    };
})();
