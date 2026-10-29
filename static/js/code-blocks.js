document.addEventListener('DOMContentLoaded', function() {
    const codeBlocks = document.querySelectorAll('pre.giallo');
    
    codeBlocks.forEach(function(pre) {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        
        const code = pre.querySelector('code');
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'copy';
        copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
        
        copyBtn.addEventListener('click', function() {
            const codeText = code ? code.textContent : pre.textContent;
            navigator.clipboard.writeText(codeText).then(function() {
                copyBtn.textContent = 'copied!';
                copyBtn.classList.add('copied');
                setTimeout(function() {
                    copyBtn.textContent = 'copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(function(err) {
                copyBtn.textContent = 'failed';
                setTimeout(function() {
                    copyBtn.textContent = 'copy';
                }, 2000);
            });
        });
        
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(copyBtn);
        wrapper.appendChild(pre);
    });
});
