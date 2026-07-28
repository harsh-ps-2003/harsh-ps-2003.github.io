document.addEventListener('DOMContentLoaded', function() {
    const codeBlocks = document.querySelectorAll('pre.giallo');
    
    codeBlocks.forEach(function(pre) {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        
        const header = document.createElement('div');
        header.className = 'code-block-header';
        
        const code = pre.querySelector('code');
        const lang = code ? code.getAttribute('data-lang') : null;
        
        const langLabel = document.createElement('span');
        langLabel.className = 'code-lang';
        langLabel.textContent = formatLanguage(lang);
        
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
        
        header.appendChild(langLabel);
        header.appendChild(copyBtn);
        
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });
});

function formatLanguage(lang) {
    if (!lang || lang === 'plain' || lang === 'text') return '';
    
    const langMap = {
        'go': 'Go',
        'rust': 'Rust',
        'rs': 'Rust',
        'python': 'Python',
        'py': 'Python',
        'javascript': 'JavaScript',
        'js': 'JavaScript',
        'typescript': 'TypeScript',
        'ts': 'TypeScript',
        'yaml': 'YAML',
        'yml': 'YAML',
        'json': 'JSON',
        'toml': 'TOML',
        'bash': 'Bash',
        'sh': 'Shell',
        'shell': 'Shell',
        'zsh': 'Zsh',
        'sql': 'SQL',
        'html': 'HTML',
        'css': 'CSS',
        'scss': 'SCSS',
        'sass': 'Sass',
        'markdown': 'Markdown',
        'md': 'Markdown',
        'c': 'C',
        'cpp': 'C++',
        'c++': 'C++',
        'java': 'Java',
        'kotlin': 'Kotlin',
        'swift': 'Swift',
        'ruby': 'Ruby',
        'rb': 'Ruby',
        'php': 'PHP',
        'lua': 'Lua',
        'r': 'R',
        'scala': 'Scala',
        'haskell': 'Haskell',
        'hs': 'Haskell',
        'elixir': 'Elixir',
        'ex': 'Elixir',
        'erlang': 'Erlang',
        'erl': 'Erlang',
        'clojure': 'Clojure',
        'clj': 'Clojure',
        'dockerfile': 'Dockerfile',
        'docker': 'Docker',
        'makefile': 'Makefile',
        'make': 'Makefile',
        'nginx': 'Nginx',
        'apache': 'Apache',
        'graphql': 'GraphQL',
        'gql': 'GraphQL',
        'protobuf': 'Protobuf',
        'proto': 'Protobuf',
        'terraform': 'Terraform',
        'tf': 'Terraform',
        'hcl': 'HCL',
        'zig': 'Zig',
        'nim': 'Nim',
        'v': 'V',
        'odin': 'Odin',
        'ocaml': 'OCaml',
        'ml': 'ML',
        'fsharp': 'F#',
        'csharp': 'C#',
        'cs': 'C#',
        'powershell': 'PowerShell',
        'ps1': 'PowerShell',
        'vim': 'Vim',
        'viml': 'VimL',
        'diff': 'Diff',
        'ini': 'INI',
        'xml': 'XML',
        'svg': 'SVG',
        'latex': 'LaTeX',
        'tex': 'LaTeX',
        'asm': 'Assembly',
        'assembly': 'Assembly',
        'wasm': 'WebAssembly',
        'solidity': 'Solidity',
        'sol': 'Solidity',
        'move': 'Move',
        'cairo': 'Cairo'
    };
    
    return langMap[lang.toLowerCase()] || lang.toUpperCase();
}
