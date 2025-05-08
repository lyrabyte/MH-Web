let sidebar, contextMenu, tooltipElement, container, loadingIndicator;
let indexDisplayElement, indexContentElement, indexValuesElement;
let _blockRegistry, _cursor; 
let _startSidebarDragCallback, _handleDeleteBlockCallback; 
let _isSimulationRunningChecker = () => false; 

export function initializeUI(
    blockRegistry,
    cursor,
    startSidebarDragCb,
    handleDeleteBlockCb,
    isSimulationRunningChecker 
) {
    _blockRegistry = blockRegistry;
    _cursor = cursor;
    _startSidebarDragCallback = startSidebarDragCb;
    _handleDeleteBlockCallback = handleDeleteBlockCb;

    if (typeof isSimulationRunningChecker === 'function') {
        _isSimulationRunningChecker = isSimulationRunningChecker;
    } else {
         console.error("UIManager Warning: Invalid isSimulationRunningChecker provided. Using default (false).");

    }

    container = document.getElementById('container');
    sidebar = document.getElementById('sidebar');
    contextMenu = document.getElementById('context-menu');
    tooltipElement = document.getElementById('tooltip');
    loadingIndicator = document.getElementById('loading-indicator');
    indexDisplayElement = document.getElementById('index-display');
    indexContentElement = document.getElementById('index-content');
    indexValuesElement = document.getElementById('index-values');

    const elements = { container, sidebar, contextMenu, tooltipElement, loadingIndicator, indexDisplayElement, indexContentElement, indexValuesElement };
    for (const [name, el] of Object.entries(elements)) {
        if (!el) {
            console.error(`UIManager Error: Failed to find essential UI element: #${name}!`);

        }
    }

    if (container && sidebar && indexDisplayElement && indexValuesElement) { 

        setLoading(true); 

        populateSidebar();
        updateIndexDisplay(); 

        if(contextMenu) { 
            contextMenu.addEventListener('closemenu', handleCloseMenuEvent);
            contextMenu.addEventListener('deleteblock', (event) => {
                if (_handleDeleteBlockCallback) {
                    try {
                        _handleDeleteBlockCallback(event); 
                    } catch(e) {
                        console.error("Error executing handleDeleteBlockCallback:", e);
                    }
                } else {
                    console.warn("No delete block callback registered with UIManager");
                }
                hideContextMenu(); 
            });
        } else {
            console.warn("UIManager: Context menu element not found, listeners not added.");
        }

        const indexHeight = indexDisplayElement.offsetHeight;
        container.style.top = `${indexHeight}px`;
        sidebar.style.top = `${indexHeight}px`;
    } else {
         console.error("UIManager Error: Cannot proceed with initialization due to missing essential elements (container, sidebar, indexDisplayElement, or indexValuesElement).");

    }

    console.log("UIManager initialized.");

    return { sidebar, contextMenu, tooltipElement, container, loadingIndicator, indexDisplayElement };
}

export function setLoading(isLoading) {
    if (loadingIndicator) {
        loadingIndicator.classList.toggle('visible', !!isLoading); 
    }
}

function populateSidebar() {
    try {
        if (!_blockRegistry || !sidebar) return;

        const typeNames = _blockRegistry.getTypeNames();
        typeNames.forEach(typeName => {
            const sidebarElement = _blockRegistry.createSidebarElement(typeName);
            if (sidebarElement) {
                const BlockClass = _blockRegistry.getBlockClass(typeName);
                const label = BlockClass?.label || typeName;

                sidebarElement.addEventListener('mousedown', (e) => {
                    if (_startSidebarDragCallback) {
                        _startSidebarDragCallback(e, typeName);
                    }
                });

                sidebarElement.addEventListener('mouseenter', (e) => {
                    if (tooltipElement) {

                        const description = BlockClass?.description || '';

                        tooltipElement.innerHTML = '';

                        const titleElement = document.createElement('div');
                        titleElement.className = 'tooltip-title';
                        titleElement.textContent = label;
                        tooltipElement.appendChild(titleElement);

                        if (description) {
                            const descElement = document.createElement('div');
                            descElement.className = 'tooltip-description';
                            descElement.textContent = description;
                            tooltipElement.appendChild(descElement);
                        }

                        tooltipElement.style.display = 'block';

                        const itemRect = sidebarElement.getBoundingClientRect();
                        const tooltipRect = tooltipElement.getBoundingClientRect();
                        let top = itemRect.top + (itemRect.height / 2) - (tooltipRect.height / 2);
                        let left = itemRect.left - tooltipRect.width - 10; 

                        top = Math.max(5, Math.min(top, window.innerHeight - tooltipRect.height - 5));
                        left = Math.max(5, left); 
                        tooltipElement.style.top = `${top}px`;
                        tooltipElement.style.left = `${left}px`;
                    }
                });

                sidebarElement.addEventListener('mouseleave', (e) => {
                    if (tooltipElement) tooltipElement.style.display = 'none';
                });

                sidebar.appendChild(sidebarElement);
            } else {
                console.warn(`UIManager: Failed to create sidebar element for block type: ${typeName}`);
            }
        });
    } catch (error) {
        console.error("UIManager Error populating sidebar:", error);
    }
}

export function showContextMenu(event, blockInstance, updateHoverStateCallback) {

    hideContextMenu(null); 

    if (!blockInstance?.userData?.blockType || !contextMenu || !_blockRegistry) {
        return null; 
    }

    const type = blockInstance.userData.blockType;
    const BlockClass = _blockRegistry.getBlockClass(type);

    if (BlockClass?.populateContextMenu && typeof BlockClass.populateContextMenu === 'function') {
        contextMenu.innerHTML = ''; 
        try {
            BlockClass.populateContextMenu(contextMenu, blockInstance); 
        } catch(e) {
            console.error(`Error calling populateContextMenu for block type ${type}:`, e);
            contextMenu.innerHTML = ''; 
            return null;
        }

        if (contextMenu.childElementCount > 0) { 
            positionContextMenu(event.clientX, event.clientY);
            contextMenu.classList.add('active');

            return blockInstance; 
        } else {
            console.log(`UIManager: Block type ${type} populateContextMenu added no items.`);
            return null; 
        }
    } else {
        console.warn(`UIManager: Block type ${type} has no populateContextMenu method.`);
        return null; 
    }
}

function positionContextMenu(x, y) {
    if (!contextMenu) return;
    const menuRect = contextMenu.getBoundingClientRect();

    let left = x;
    let top = y;

    if (left + menuRect.width > window.innerWidth - 10) { 
        left = window.innerWidth - menuRect.width - 10;
    }
    if (top + menuRect.height > window.innerHeight - 10) {
        top = window.innerHeight - menuRect.height - 10;
    }

    left = Math.max(10, left);
    top = Math.max(10, top);

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
}

export function hideContextMenu(updateHoverStateCallback) {
    let menuWasHidden = false;
    if (contextMenu && contextMenu.classList.contains('active')) {
        contextMenu.classList.remove('active');
        contextMenu.innerHTML = ''; 
        menuWasHidden = true; 
    }

    if (updateHoverStateCallback && typeof updateHoverStateCallback === 'function') {
         try {
             updateHoverStateCallback();
         } catch(e) {
             console.error("Error executing updateHoverStateCallback in hideContextMenu:", e);
         }
    } else if (updateHoverStateCallback) {
         console.warn("UIManager: hideContextMenu received non-function updateHoverStateCallback.");
    }
    return menuWasHidden; 
}

export function setupContextMenuListeners(updateHoverStateCallback) {

     window.addEventListener('pointerdown', (event) => {

         if (contextMenu && contextMenu.contains(event.target)) {
              return;
         }

         if (contextMenu && contextMenu.classList.contains('active')) {

              hideContextMenu(updateHoverStateCallback);
         }
     }, true); 
     console.log("Global context menu listener setup.");
}

function handleCloseMenuEvent() {

    console.log("Context menu 'closemenu' event triggered.");

}

export function updateIndexDisplay() {

    if (!_cursor || !indexValuesElement || !indexDisplayElement || typeof _cursor.getIndexDisplayData !== 'function') {

        if (indexValuesElement) indexValuesElement.innerHTML = '<span class="index-value">---</span>'; 
        return;
    }

    let data;
    try {
        data = _cursor.getIndexDisplayData();
    } catch (e) {
        console.error("UIManager Error calling cursor.getIndexDisplayData():", e);
        if (indexValuesElement) indexValuesElement.innerHTML = '<span class="index-value">Error</span>';
        return;
    }

    if (!data || typeof data !== 'object' || !data.array || typeof data.array.length !== 'number' || typeof data.pointer !== 'number') {
        console.warn(`UIManager: Invalid data structure received from cursor.getIndexDisplayData(). Received:`, data);

        indexValuesElement.innerHTML = '<span class="index-value">Error</span>';
        return;
    }

    const { array, pointer } = data;

    indexValuesElement.innerHTML = ''; 

    if (array.length > 0) {

        const safePointer = Math.max(0, Math.min(pointer, array.length - 1));

        for (let i = 0; i < array.length; i++) {
            const valueSpan = document.createElement('span');
            valueSpan.className = 'index-value';

            valueSpan.textContent = (array[i] !== null && array[i] !== undefined) ? array[i] : '?';

            if (i === safePointer) {
                valueSpan.classList.add('active-index');
            }
            indexValuesElement.appendChild(valueSpan);
        }

        const activeElement = indexValuesElement.querySelector('.active-index');
        if (activeElement && typeof activeElement.scrollIntoView === 'function') {
            try {

                const behavior = _isSimulationRunningChecker() ? 'auto' : 'smooth';
                activeElement.scrollIntoView({ behavior: behavior, block: 'nearest', inline: 'nearest' });
            } catch (scrollError) {
                console.warn("UIManager: Error scrolling index into view:", scrollError);
            }
        }
    } else {

        const zeroSpan = document.createElement('span');
        zeroSpan.className = 'index-value active-index'; 
        zeroSpan.textContent = '0'; 
        indexValuesElement.appendChild(zeroSpan);
    }
}

export function getSidebarElement() {

    if (!sidebar) {
        console.warn("UIManager: getSidebarElement called before sidebar was initialized or found.");
        sidebar = document.getElementById('sidebar'); 
    }
    return sidebar;
}