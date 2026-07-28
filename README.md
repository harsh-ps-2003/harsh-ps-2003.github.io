# HARSH PRATAP SINGH

Personal blog built with [Zola](https://www.getzola.org/) - a fast static site generator written in Rust.

**Live at:** https://harsh-ps-2003.github.io

## Architecture

```mermaid
flowchart TB
    subgraph content ["Content Layer"]
        home["_index.md<br/>(Home page)"]
        
        subgraph writes ["writes/"]
            writes_index["_index.md<br/>(sort_by: date, paginate: 20)"]
            post1["post-slug/index.md"]
            post2["another-post/index.md"]
        end
        
        subgraph reads ["reads/"]
            reads_index["_index.md<br/>(Section intro)"]
            cs["cs/index.md"]
            philosophy["philosophy/index.md"]
            startups["startups/index.md"]
            finance["finance/index.md"]
        end
        
        resume["resume/_index.md<br/>(Single page)"]
    end
    
    subgraph templates ["Template Layer"]
        base["base.html<br/>(Layout, nav, dark mode)"]
        index_tpl["index.html"]
        section_tpl["section.html"]
        page_tpl["page.html"]
        single_section["single_section.html"]
        taxonomy["taxonomy_*.html"]
        
        base --> index_tpl
        base --> section_tpl
        base --> page_tpl
        base --> single_section
        base --> taxonomy
    end
    
    subgraph assets ["Static Assets"]
        scss["sass/style.scss<br/>(Light/dark themes)"]
        theme_js["static/js/theme.js<br/>(Dark mode toggle)"]
        search_js["static/js/search.js<br/>(Client-side filter)"]
    end
    
    subgraph build ["Build & Deploy"]
        config["config.toml"]
        zola["Zola Build"]
        public["public/"]
        gh_actions["GitHub Actions"]
        gh_pages["GitHub Pages"]
    end
    
    content --> zola
    templates --> zola
    assets --> zola
    config --> zola
    zola --> public
    public --> gh_actions
    gh_actions --> gh_pages
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CDN as GitHub Pages CDN
    participant HTML as Static HTML
    participant JS as theme.js
    participant Storage as localStorage

    User->>CDN: Request page
    CDN->>HTML: Serve static files
    HTML->>User: Render content + CSS
    
    JS->>Storage: Check theme preference
    alt Has saved preference
        Storage->>JS: Return "dark" or "light"
    else No preference
        JS->>JS: Check system preference
    end
    JS->>HTML: Apply data-theme attribute
    
    User->>JS: Click toggle button
    JS->>Storage: Save new preference
    JS->>HTML: Update data-theme
```

## Template Inheritance

```mermaid
graph TD
    base["base.html<br/>├ head (meta, CSS, JS)<br/>├ header (title, nav)<br/>├ main (content block)<br/>└ footer"]
    
    base --> index["index.html<br/>Home page content"]
    base --> section["section.html<br/>Post list + search + pagination"]
    base --> page["page.html<br/>Single post + back link + tags"]
    base --> single["single_section.html<br/>Resume page"]
    base --> tax_list["taxonomy_list.html<br/>All tags"]
    base --> tax_single["taxonomy_single.html<br/>Posts per tag"]
```

## Local Development

```bash
# Install Zola (macOS)
brew install zola

# Install Node dependencies (for diagram export)
pnpm install

# Run dev server with live reload
zola serve

# Build for production
zola build
```

## Diagrams with Excalidraw

This blog supports Excalidraw diagrams for system design and architecture illustrations.

### Creating Diagrams

**Method 1: Using Excalidraw MCP (Recommended)**

With the Excalidraw MCP server, you can create diagrams directly from Cursor:

```
# Create a diagram using MCP tools
1. Use batch_create_elements to create shapes and arrows
2. Use export_scene to save as .excalidraw file
3. Use export_to_image to export as SVG
```

**Method 2: Manual Export**

```bash
# Export a single diagram to SVG
pnpm exec excalidraw-export content/writes/my-post/diagram.excalidraw --svg

# Export all diagrams in the project
pnpm run diagram:export
```

### Diagram Workflow

1. **Create**: Use Excalidraw MCP or the VS Code extension to create `.excalidraw` files
2. **Save**: Place `.excalidraw` files next to your blog post or in `static/diagrams/`
3. **Export**: Run `pnpm run diagram:export` to convert all to SVG
4. **Use**: Reference in markdown: `![Architecture](architecture.svg)`

### File Locations

- **Post-specific diagrams**: `content/writes/my-post/diagram.excalidraw` → `diagram.svg`
- **Shared diagrams**: `static/diagrams/architecture.excalidraw` → `architecture.svg`

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm run diagram:export` | Export all `.excalidraw` files to SVG |
| `pnpm run diagram:svg <file>` | Export single file to SVG |
| `pnpm run diagram:png <file>` | Export single file to PNG (2x scale) |

## Adding Content

### New Blog Post

```bash
mkdir content/writes/my-new-post
```

Create `content/writes/my-new-post/index.md`:

```toml
+++
title = "My Post Title"
date = 2026-07-28
[taxonomies]
tags = ["ai", "systems"]
+++

Your content here...

![diagram](diagram.png)  # colocated image
```

### New Reading List Entry

Add to existing category in `content/reads/cs/index.md`, `content/reads/philosophy/index.md`, etc.

### New Navigation Section

1. Create `content/new-section/_index.md`
2. Add to `config.toml`:
   ```toml
   main_menu = [
       { name = "home", url = "/" },
       { name = "writes", url = "/writes/" },
       { name = "reads", url = "/reads/" },
       { name = "resume", url = "/resume/" },
       { name = "new-section", url = "/new-section/" },
   ]
   ```

## File Structure

```
harsh-ps-2003/
├── config.toml              # Site configuration
├── content/
│   ├── _index.md            # Home page
│   ├── writes/
│   │   ├── _index.md        # Section config
│   │   └── */index.md       # Blog posts (24 posts)
│   ├── reads/
│   │   ├── _index.md        # Section intro
│   │   ├── cs/index.md
│   │   ├── philosophy/index.md
│   │   ├── startups/index.md
│   │   └── finance/index.md
│   └── resume/_index.md     # Resume page
├── templates/
│   ├── base.html
│   ├── index.html
│   ├── section.html
│   ├── page.html
│   ├── single_section.html
│   ├── taxonomy_list.html
│   └── taxonomy_single.html
├── sass/style.scss
├── static/js/
│   ├── theme.js
│   └── search.js
└── .github/workflows/deploy.yml
```

## Features

| Feature | Implementation |
|---------|---------------|
| Dark mode | CSS custom properties + `[data-theme]` + localStorage |
| Search | Client-side filtering with debounced input |
| Tags | Zola taxonomies with dedicated pages |
| Pagination | 20 posts per page on writes section |
| Performance | Static HTML, no frameworks, ~5KB CSS |
| SEO | Meta descriptions, sitemap.xml, robots.txt |

## Deployment

Push to `main` branch → GitHub Actions builds → Deploys to GitHub Pages

> **Note:** Repository must be named `harsh-ps-2003.github.io` for the site to be served at the root URL.
