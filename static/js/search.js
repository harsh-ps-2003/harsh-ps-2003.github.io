(function() {
    const input = document.getElementById('search-input');
    const list = document.getElementById('posts-list');
    
    if (!input || !list) return;
    
    const items = list.querySelectorAll('li');
    let debounceTimer;
    
    function filterPosts(query) {
        const q = query.toLowerCase().trim();
        
        items.forEach(function(item) {
            const title = item.getAttribute('data-title') || '';
            const visible = q === '' || title.includes(q);
            item.style.display = visible ? '' : 'none';
        });
    }
    
    input.addEventListener('input', function(e) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
            filterPosts(e.target.value);
        }, 150);
    });
    
    // Handle initial value (e.g., browser back button)
    if (input.value) {
        filterPosts(input.value);
    }
})();
