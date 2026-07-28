(function() {
    const STORAGE_KEY = 'theme';
    
    function getPreferredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        return 'light';
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateIcon(theme);
        updateSyntaxStylesheets(theme);
    }
    
    function updateIcon(theme) {
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = theme === 'dark' ? 'light' : 'dark';
    }
    
    function updateSyntaxStylesheets(theme) {
        const lightSheet = document.getElementById('giallo-light');
        const darkSheet = document.getElementById('giallo-dark');
        
        if (lightSheet && darkSheet) {
            if (theme === 'dark') {
                lightSheet.disabled = true;
                darkSheet.disabled = false;
            } else {
                lightSheet.disabled = false;
                darkSheet.disabled = true;
            }
        }
    }
    
    // Set theme on documentElement immediately (prevents flash)
    const initialTheme = getPreferredTheme();
    document.documentElement.setAttribute('data-theme', initialTheme);
    localStorage.setItem(STORAGE_KEY, initialTheme);
    
    // Update icon and stylesheets after DOM is ready
    function onReady() {
        const theme = getPreferredTheme();
        updateIcon(theme);
        updateSyntaxStylesheets(theme);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
    
    // Expose toggle function globally
    window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    };
})();
