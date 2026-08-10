(function () {
    const input = document.getElementById("search");
    const list = document.getElementById("posts-list");
    const status = document.getElementById("search-status");
    if (!input || !list) return;

    const items = Array.prototype.slice.call(list.querySelectorAll("li"));
    const cfg = window.ZOLA_SEARCH || {};
    let indexPromise = null;
    let currentTerm = "";
    let visibleItems = items.slice();

    function debounce(fn, wait) {
        let timeout;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                fn.apply(context, args);
            }, wait);
        };
    }

    function normalizeUrl(url) {
        try {
            const parsed = new URL(url, window.location.origin);
            let path = parsed.pathname;
            if (!path.endsWith("/")) path += "/";
            return path;
        } catch (err) {
            return url;
        }
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                if (existing.dataset.loaded === "true") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", function () {
                    resolve();
                });
                existing.addEventListener("error", reject);
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = function () {
                script.dataset.loaded = "true";
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function getIndex() {
        if (!indexPromise) {
            indexPromise = loadScript(cfg.elasticlunrUrl)
                .then(function () {
                    return loadScript(cfg.indexUrl);
                })
                .then(function () {
                    if (!window.elasticlunr || !window.searchIndex) {
                        throw new Error("Search index failed to load");
                    }
                    return window.elasticlunr.Index.load(window.searchIndex);
                })
                .catch(function (err) {
                    indexPromise = null;
                    throw err;
                });
        }
        return indexPromise;
    }

    function firstLink(item) {
        const link = item.querySelector("a");
        return link ? link.getAttribute("href") : null;
    }

    function setStatus(count) {
        if (!status) return;
        if (!count && count !== 0) {
            status.hidden = true;
            status.textContent = "";
            return;
        }
        status.hidden = false;
        if (count === 0) {
            status.textContent = "no matches";
            return;
        }
        if (count === 1 && visibleItems[0]) {
            const href = firstLink(visibleItems[0]);
            const title = visibleItems[0].querySelector("a");
            status.innerHTML =
                '1 match · <a href="' +
                href +
                '">open ' +
                (title ? title.textContent : "post") +
                "</a> · enter";
            return;
        }
        status.textContent = count + " matches · enter opens first";
    }

    function applyVisibility(matcher) {
        visibleItems = [];
        items.forEach(function (item) {
            const match = matcher(item);
            item.classList.toggle("is-hidden", !match);
            if (match) visibleItems.push(item);
        });
        setStatus(visibleItems.length);
    }

    function showAll() {
        visibleItems = items.slice();
        items.forEach(function (item) {
            item.classList.remove("is-hidden");
        });
        setStatus(null);
    }

    function filterByTitle(term) {
        const q = term.toLowerCase();
        applyVisibility(function (item) {
            const title = item.getAttribute("data-title") || "";
            return title.indexOf(q) !== -1;
        });
    }

    async function filterPosts(term) {
        const trimmed = term.trim();
        if (trimmed === currentTerm) return;
        currentTerm = trimmed;

        if (!trimmed) {
            showAll();
            return;
        }

        try {
            const index = await getIndex();
            const found = index.search(trimmed, {
                bool: "AND",
                expand: true,
                fields: {
                    title: { boost: 3 },
                    description: { boost: 2 },
                    body: { boost: 1 },
                },
            });

            const matched = {};
            found.forEach(function (hit) {
                matched[normalizeUrl(hit.ref)] = true;
            });

            applyVisibility(function (item) {
                const url = normalizeUrl(item.getAttribute("data-url") || "");
                const title = item.getAttribute("data-title") || "";
                return matched[url] || title.indexOf(trimmed.toLowerCase()) !== -1;
            });
        } catch (err) {
            filterByTitle(trimmed);
        }
    }

    function openFirstMatch() {
        if (!visibleItems.length) return;
        const href = firstLink(visibleItems[0]);
        if (href) window.location.href = href;
    }

    const onInput = debounce(function (event) {
        filterPosts(event.target.value);
    }, 140);

    input.addEventListener("focus", function () {
        getIndex().catch(function () {});
    });

    input.addEventListener("input", onInput);

    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            openFirstMatch();
            return;
        }
        if (event.key === "Escape") {
            input.value = "";
            currentTerm = " ";
            filterPosts("");
            input.blur();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (
            event.key === "/" &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            document.activeElement !== input &&
            document.activeElement.tagName !== "INPUT" &&
            document.activeElement.tagName !== "TEXTAREA"
        ) {
            event.preventDefault();
            input.focus();
        }
    });

    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q");
    if (initial) {
        input.value = initial;
        filterPosts(initial);
    }
})();
