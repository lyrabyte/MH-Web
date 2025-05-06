import * as THREE from 'three';
import * as Config from './config.js';
import * as TWEEN from 'three/addons/libs/tween.module.min.js';

let isDragging = false;
let dragData = { type: null, previewMesh: null, lastValidX: null, lastValidY: null, isValidTarget: false };
let isPanning = false;
let panStartX = 0, panStartY = 0;
let panStartCameraX = 0, panStartCameraY = 0;
let isDraggingExistingBlock = false;
let draggedBlock = null;
let draggedBlockOriginalKey = null;
let dragPreviewMesh = null;
let draggedBlockLastValidX = null, draggedBlockLastValidY = null;
let draggedBlockIsValidTarget = false;
let currentlyHoveredBlock = null;
let contextMenuTarget = null;
let lastPointerX, lastPointerY;

let _renderer, _camera, _scene, _cursor, _container, _contextMenu;

let _blockRegistry, _addBlock, _removeBlock, _getPlacedBlocksMap;
let _getPointerNdc, _screenToWorld, _getIntersectedBlock, _isOccupied, _getGridKeyFromWorld;
let _startSimulation, _stopSimulation, _isSimulationRunning, _forceStopSimulation;
let _showContextMenu, _hideContextMenu;

export function initializeInputHandler(dependencies) {
    _renderer = dependencies.renderer;
    _camera = dependencies.camera; 
    _scene = dependencies.scene;
    _cursor = dependencies.cursor;
    _container = dependencies.container;
    _contextMenu = dependencies.contextMenu;

    _blockRegistry = dependencies.blockRegistry;
    _addBlock = dependencies.addBlock;
    _removeBlock = dependencies.removeBlock;

    _getPlacedBlocksMap = dependencies.getPlacedBlocksMap;

    _getPointerNdc = dependencies.getPointerNdc;
    _screenToWorld = dependencies.screenToWorld;
    _getIntersectedBlock = dependencies.getIntersectedBlock;
    _isOccupied = dependencies.isOccupied;
    _getGridKeyFromWorld = dependencies.getGridKeyFromWorld;

    _startSimulation = dependencies.startSimulation;
    _stopSimulation = dependencies.stopSimulation;
    _isSimulationRunning = dependencies.isSimulationRunning;
    _forceStopSimulation = dependencies.forceStopSimulation;

    _showContextMenu = dependencies.showContextMenu;
    _hideContextMenu = dependencies.hideContextMenu;

    if (typeof _getPlacedBlocksMap !== 'function') { 
        console.error("InputHandler FATAL ERROR: getPlacedBlocksMap dependency not provided or is not a function!");

         return;
    }
    if (!_renderer || !_renderer.domElement) {
         console.error("InputHandler FATAL ERROR: Renderer or renderer.domElement not provided!");
         return;
    }
    if (!_camera) { 
         console.error("InputHandler FATAL ERROR: Camera dependency not provided!");
         return;
    }

    _renderer.domElement.addEventListener('pointerdown', onPointerDownCanvas);
    _renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    _renderer.domElement.addEventListener('contextmenu', onContextMenu);

    _renderer.domElement.addEventListener('pointermove', onPointerMoveCanvas);
    _renderer.domElement.addEventListener('pointerleave', onPointerLeaveCanvas);

    window.addEventListener('keydown', handleKeyDown);
    console.log("InputHandler initialized correctly."); 
}

function addGlobalDragListeners() {

    window.addEventListener('pointermove', onPointerMoveWindow, { capture: true });
    window.addEventListener('pointerup', onPointerUpWindow, { capture: true });
    window.addEventListener('pointerleave', onPointerLeaveWindow, { capture: true });
}

function removeGlobalDragListeners() {

    window.removeEventListener('pointermove', onPointerMoveWindow, { capture: true });
    window.removeEventListener('pointerup', onPointerUpWindow, { capture: true });
    window.removeEventListener('pointerleave', onPointerLeaveWindow, { capture: true });
}

export function startSidebarDrag(event, typeName) {
    if (_isSimulationRunning() || isDragging || isPanning || isDraggingExistingBlock || (_contextMenu && _contextMenu.classList.contains('active'))) {
        return;
    }
    event.stopPropagation();
    if(_contextMenu) _hideContextMenu(updateHoverState);

    isDragging = true;
    dragData.type = typeName;
    dragData.previewMesh = _blockRegistry.createPreview(typeName);

    if (!dragData.previewMesh) {
        console.error(`Failed to create preview mesh for type: ${typeName}`);
        isDragging = false; 
        return;
    }

    dragData.isValidTarget = false;
    if (dragData.previewMesh.material) {
        dragData.previewMesh.material.transparent = true;
        dragData.previewMesh.material.opacity = Config.invalidDropOpacity;
    } else {
        console.warn(`Preview mesh for ${typeName} has no material.`);
    }

    dragData.previewMesh.position.set(10000, 10000, 0);
    dragData.previewMesh.visible = false;
    _scene.add(dragData.previewMesh);

    document.body.style.cursor = 'grabbing';
    if (_renderer) _renderer.domElement.style.cursor = 'grabbing';

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    handleSidebarDragMove(event); 

    addGlobalDragListeners(); 
}

function onPointerDownCanvas(event) {

    if (_contextMenu && _contextMenu.classList.contains('active')) {
        if (event.button !== 2) {
            _hideContextMenu(updateHoverState);
        }
    }

    if (event.button === 1 && !isDragging && !isDraggingExistingBlock && !isPanning) {
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panStartCameraX = _camera.position.x; 
        panStartCameraY = _camera.position.y; 
        if (_renderer) _renderer.domElement.style.cursor = 'grabbing';
        event.preventDefault();
        addGlobalDragListeners();
        return;
    }

    if (event.button === 0 && !isDragging && !isPanning && !isDraggingExistingBlock && !_isSimulationRunning()) {
        const ndc = _getPointerNdc(event);
        const clickedBlock = _getIntersectedBlock(ndc);
        if (clickedBlock) {
            startExistingBlockDrag(clickedBlock, event);
            event.preventDefault();
            addGlobalDragListeners();
        }
    }
}

function onPointerMoveWindow(event) {
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    if (isPanning) {
         event.preventDefault();
        handlePanMove(event);
        currentlyHoveredBlock = null;
        return;
    }

    if (isDraggingExistingBlock) {
         event.preventDefault();
        handleExistingBlockDragMove(event);
        currentlyHoveredBlock = null;
        return;
    }

    if (isDragging) {
         event.preventDefault();
        handleSidebarDragMove(event);
        currentlyHoveredBlock = null;
        return;
    }
}

function onPointerUpWindow(event) {

    let wasInteracting = false;

    if (isPanning && event.button === 1) {
        isPanning = false;
        if (_renderer) _renderer.domElement.style.cursor = 'default';
        wasInteracting = true;
    }
    else if (isDraggingExistingBlock && event.button === 0) {
        handleExistingBlockDragEnd(event); 
        wasInteracting = true;
    }
    else if (isDragging && event.button === 0) {
        handleSidebarDragEnd(event); 
        wasInteracting = true;
    }

    if (wasInteracting) {
        removeGlobalDragListeners();
        updateHoverState(); 
    }
}

function onPointerLeaveWindow(event) {
     if (event.relatedTarget === null || event.relatedTarget === document.documentElement) {

          let interactionCancelled = false;
          if (isPanning) {
               isPanning = false;
               if (_renderer) _renderer.domElement.style.cursor = 'default';
               interactionCancelled = true;
          }
          if (isDragging) {
               handleSidebarDragEnd({ clientX: -1, clientY: -1 }); 
               interactionCancelled = true;
          }
          if (isDraggingExistingBlock) {
               cancelExistingBlockDrag(); 
               interactionCancelled = true;
          }
          if(interactionCancelled) {
              removeGlobalDragListeners(); 
              updateHoverState();
          }
     }
}

function onPointerMoveCanvas(event) { 
     if (!isDragging && !isPanning && !isDraggingExistingBlock) {
          lastPointerX = event.clientX;
          lastPointerY = event.clientY;
          updateHoverState();
     }
}

function onPointerLeaveCanvas(event) { 
     if (!isDragging && !isPanning && !isDraggingExistingBlock) {
          currentlyHoveredBlock = null;
          lastPointerX = undefined;
          lastPointerY = undefined;

     }
}

function onWheel(event) {
    event.preventDefault();
    if (isDragging || isDraggingExistingBlock || isPanning || !_camera) return; 

    const zoomFactor = 0.9;
    const scale = (event.deltaY < 0) ? zoomFactor : 1 / zoomFactor;

    const currentVisibleHeight = _camera.top - _camera.bottom;
    let newVisibleHeight = currentVisibleHeight * scale;
    newVisibleHeight = Math.max(Config.minZoom, Math.min(Config.maxZoom, newVisibleHeight));

    if (Math.abs(newVisibleHeight - currentVisibleHeight) < 0.001) return;

    const pointerWorldBefore = _screenToWorld(event.clientX, event.clientY);

    const aspect = (_camera.right - _camera.left) / (_camera.top - _camera.bottom);
    _camera.top = newVisibleHeight / 2;
    _camera.bottom = -newVisibleHeight / 2;
    _camera.left = -_camera.top * aspect;
    _camera.right = _camera.top * aspect;
    _camera.updateProjectionMatrix(); 

    const pointerWorldAfter = _screenToWorld(event.clientX, event.clientY);

    if (pointerWorldBefore && pointerWorldAfter) {
        const dx = pointerWorldBefore.x - pointerWorldAfter.x;
        const dy = pointerWorldBefore.y - pointerWorldAfter.y;

        _camera.position.x += dx;
        _camera.position.y += dy;
    }

    updateParticleZoomScale(); 
}

function onContextMenu(event) {
    event.preventDefault();
    if (isDragging || _isSimulationRunning() || isPanning || isDraggingExistingBlock) return;

    const ndc = _getPointerNdc(event);
    const block = _getIntersectedBlock(ndc);

    if (block) {
        contextMenuTarget = _showContextMenu(event, block, updateHoverState);
        if (contextMenuTarget) {
            currentlyHoveredBlock = null;
        } else {
            updateHoverState();
        }
    } else {
        if(_contextMenu) _hideContextMenu(updateHoverState);
        contextMenuTarget = null;
    }
}

function handleKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
    }

    if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !isDragging && !isPanning && !isDraggingExistingBlock) {
        event.preventDefault();
        if (_isSimulationRunning()) {
            _stopSimulation();
        } else if (currentlyHoveredBlock) {
            const startPos = { x: currentlyHoveredBlock.position.x, y: currentlyHoveredBlock.position.y };
            currentlyHoveredBlock = null;
            _startSimulation(startPos);
        } else {
            console.log("Press 'F' while hovering over a block to start the simulation.");
        }
    }

    if (event.key === 'Escape') {
        let handled = false;
        if (_isSimulationRunning()) {
            _stopSimulation(); handled = true;
        } else if (isDragging) {

            handleSidebarDragEnd({ clientX: -1, clientY: -1 }); 
            removeGlobalDragListeners(); 
            handled = true;
        } else if (isDraggingExistingBlock) {

            cancelExistingBlockDrag(); 
            removeGlobalDragListeners(); 
            handled = true;
        } else if (isPanning) {

            isPanning = false;
            if (_renderer) _renderer.domElement.style.cursor = 'default';
            removeGlobalDragListeners(); 
            updateHoverState();
            handled = true;
        } else if (_contextMenu && _contextMenu.classList.contains('active')) {
            _hideContextMenu(updateHoverState);
            handled = true;
        }
        if (handled) event.preventDefault();
    }
}

function handlePanMove(event) {
     if (!_camera || !_renderer || !_renderer.domElement) return; 
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;

    const clientWidth = _renderer.domElement.clientWidth;
    const clientHeight = _renderer.domElement.clientHeight;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const worldWidth = _camera.right - _camera.left;
    const worldHeight = _camera.top - _camera.bottom;
    const deltaXWorld = -(dx / clientWidth) * worldWidth;
    const deltaYWorld = (dy / clientHeight) * worldHeight;

    _camera.position.x = panStartCameraX + deltaXWorld;
    _camera.position.y = panStartCameraY + deltaYWorld;
}

function handleSidebarDragMove(event) {
    if (!isDragging || !dragData.previewMesh) return;
    const worldPos = _screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
        const gridX_center = Math.floor(worldPos.x + 0.5) + 0.5;
        const gridY_center = Math.floor(worldPos.y + 0.5) + 0.5;
        const occupied = _isOccupied(gridX_center, gridY_center);
        dragData.isValidTarget = !occupied;
        dragData.lastValidX = gridX_center;
        dragData.lastValidY = gridY_center;
        dragData.previewMesh.position.set(gridX_center, gridY_center, 0.1);
        if (dragData.previewMesh.material) {
            dragData.previewMesh.material.opacity = dragData.isValidTarget ? Config.validDropOpacity : Config.invalidDropOpacity;
        }
        dragData.previewMesh.visible = true;
    } else {
        dragData.isValidTarget = false;
        dragData.previewMesh.visible = false;
    }
}

function handleSidebarDragEnd(event) {
    if (!isDragging) return;

    if (dragData.previewMesh) {
        _scene.remove(dragData.previewMesh);
        dragData.previewMesh.geometry?.dispose();
        if (dragData.previewMesh.material) {
             if (Array.isArray(dragData.previewMesh.material)) { dragData.previewMesh.material.forEach(m => { m.map?.dispose(); m.dispose(); }); }
             else { dragData.previewMesh.material.map?.dispose(); dragData.previewMesh.material.dispose(); }
        }

         dragData.previewMesh = null;
    }

    const worldPos = _screenToWorld(event.clientX, event.clientY);
    if (dragData.isValidTarget && worldPos && dragData.type && dragData.lastValidX !== null && dragData.lastValidY !== null) {
        const gridX_int = Math.round(dragData.lastValidX - 0.5);
        const gridY_int = Math.round(dragData.lastValidY - 0.5);
        _addBlock(dragData.type, gridX_int, gridY_int);
    } else {

    }

    resetSidebarDragState();

}

function resetSidebarDragState() {
    isDragging = false;
    document.body.style.cursor = 'default';
    if (_renderer) _renderer.domElement.style.cursor = 'default';

    dragData = { type: null, previewMesh: null, lastValidX: null, lastValidY: null, isValidTarget: false };
}

function startExistingBlockDrag(blockInstance, event) {

    isDraggingExistingBlock = true;
    draggedBlock = blockInstance;
    draggedBlockOriginalKey = _getGridKeyFromWorld(blockInstance.position.x, blockInstance.position.y);
    const type = blockInstance.userData.blockType;

    dragPreviewMesh = _blockRegistry.createPreview(type);
    if (!dragPreviewMesh) {
        console.error(`Failed to create preview for existing block type ${type}`);
        resetExistingBlockDragState(); 
        return;
    }
    dragPreviewMesh.position.copy(blockInstance.position).z += 0.1;
    dragPreviewMesh.rotation.copy(blockInstance.rotation);
    dragPreviewMesh.visible = false;
    if (dragPreviewMesh.material) dragPreviewMesh.material.transparent = true;
    _scene.add(dragPreviewMesh);

    draggedBlock.traverse(child => {
        if (child instanceof THREE.Mesh && child.material) {

            child.material.transparent = true;
            child.material.opacity = 0.3;
            child.material.needsUpdate = true;
        }
    });

    document.body.style.cursor = 'grabbing';
    if (_renderer) _renderer.domElement.style.cursor = 'grabbing';

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    handleExistingBlockDragMove(event);

}

function handleExistingBlockDragMove(event) {
    if (!isDraggingExistingBlock || !dragPreviewMesh) return;
    const worldPos = _screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
        const gx_center = Math.floor(worldPos.x + 0.5) + 0.5;
        const gy_center = Math.floor(worldPos.y + 0.5) + 0.5;
        const occupied = _isOccupied(gx_center, gy_center, draggedBlockOriginalKey);
        draggedBlockIsValidTarget = !occupied;
        draggedBlockLastValidX = gx_center;
        draggedBlockLastValidY = gy_center;
        dragPreviewMesh.position.set(gx_center, gy_center, 0.1);
        if (dragPreviewMesh.material) {
            dragPreviewMesh.material.opacity = draggedBlockIsValidTarget ? Config.validDropOpacity : Config.invalidDropOpacity;
        }
        dragPreviewMesh.visible = true;
    } else {
        draggedBlockIsValidTarget = false;
        dragPreviewMesh.visible = false;
    }
}

function handleExistingBlockDragEnd(event) {
    if (!isDraggingExistingBlock) return;

    restoreDraggedBlockAppearance();

    cleanupDragPreviewMesh(); 

    const worldPos = _screenToWorld(event.clientX, event.clientY);

    if (draggedBlockIsValidTarget && worldPos && draggedBlock && draggedBlockOriginalKey && draggedBlockLastValidX !== null && draggedBlockLastValidY !== null) {
        const newGridX = Math.round(draggedBlockLastValidX - 0.5);
        const newGridY = Math.round(draggedBlockLastValidY - 0.5);
        const newKey = `${newGridX},${newGridY}`;

        if (newKey !== draggedBlockOriginalKey) {

            const map = _getPlacedBlocksMap(); 
            if (!map) {
                 console.error("InputHandler Error: Cannot get placedBlocksMap during drag end.");
                 resetExistingBlockDragState();
                 return; 
            }

            if (map.get(draggedBlockOriginalKey) === draggedBlock) {
                map.delete(draggedBlockOriginalKey);
            } else {
                 console.warn("Mismatch during block move: Original key/block pair not found in map. Trying to remove by instance.");
                 let foundKey = null;
                 for (const [k, v] of map.entries()) { if (v === draggedBlock) { foundKey = k; break; } }
                 if (foundKey) { map.delete(foundKey); console.warn(`Removed block instance found at key ${foundKey}`); }
                 else { console.error("Could not find block instance in map to remove."); }
            }

            if (!map.has(newKey)) {
                draggedBlock.position.set(draggedBlockLastValidX, draggedBlockLastValidY, 0);
                map.set(newKey, draggedBlock);
                console.log(`Block moved from ${draggedBlockOriginalKey} to ${newKey}`);
            } else {
                console.error(`Failed to move block: Target cell ${newKey} became occupied. Snapping back.`);
                if (!map.has(draggedBlockOriginalKey)) map.set(draggedBlockOriginalKey, draggedBlock);
            }
        } else {

            const map = _getPlacedBlocksMap();
            if (map && !map.has(draggedBlockOriginalKey)) map.set(draggedBlockOriginalKey, draggedBlock);
        }
    } else {

        if (draggedBlock && draggedBlockOriginalKey) {
            const map = _getPlacedBlocksMap();
            if (map && !map.has(draggedBlockOriginalKey)) {
                 map.set(draggedBlockOriginalKey, draggedBlock);

             }
        }
    }

    resetExistingBlockDragState();

}

function cancelExistingBlockDrag() {
    if (!isDraggingExistingBlock) return;

    restoreDraggedBlockAppearance();
    if (draggedBlock && draggedBlockOriginalKey) {

        const map = _getPlacedBlocksMap(); 
        if (map && !map.has(draggedBlockOriginalKey)) {
             map.set(draggedBlockOriginalKey, draggedBlock);

        }
    }

    cleanupDragPreviewMesh();

    resetExistingBlockDragState();
    updateHoverState(); 
}

function restoreDraggedBlockAppearance() {
    if (draggedBlock) {
        draggedBlock.traverse(child => {
            if (child instanceof THREE.Mesh && child.material) {

                child.material.opacity = 1.0;
                child.material.transparent = false; 
                child.material.needsUpdate = true;
            }
        });
    }
}

function cleanupDragPreviewMesh() {
     if (dragPreviewMesh) {
         _scene.remove(dragPreviewMesh);
         dragPreviewMesh.geometry?.dispose();
         if (dragPreviewMesh.material) {
             if (Array.isArray(dragPreviewMesh.material)) { dragPreviewMesh.material.forEach(m => { m.map?.dispose(); m.dispose(); }); }
             else { dragPreviewMesh.material.map?.dispose(); dragPreviewMesh.material.dispose(); }
         }
         dragPreviewMesh = null; 
     }
}

function resetExistingBlockDragState() {
    isDraggingExistingBlock = false;
    draggedBlock = null;
    draggedBlockOriginalKey = null;

    draggedBlockIsValidTarget = false;
    draggedBlockLastValidX = null;
    draggedBlockLastValidY = null;
    document.body.style.cursor = 'default';
    if (_renderer) _renderer.domElement.style.cursor = 'default';
}

export function updateHoverState() {
     if (!isDragging && !isPanning && !isDraggingExistingBlock && !(_contextMenu && _contextMenu.classList.contains('active')) && !_isSimulationRunning()) {
        if (lastPointerX === undefined || lastPointerY === undefined) {
            currentlyHoveredBlock = null;
            return;
        }
        try {
            const ndc = _getPointerNdc({ clientX: lastPointerX, clientY: lastPointerY });
            currentlyHoveredBlock = _getIntersectedBlock(ndc);
        } catch (e) {
            console.error("Error during hover check:", e);
            currentlyHoveredBlock = null;
        }
     } else {
         currentlyHoveredBlock = null;
     }
}

function updateParticleZoomScale() {
    if (!_cursor || !_cursor.particleMaterial || !_camera) return; 
    const currentVisibleHeight = _camera.top - _camera.bottom; 
    const rawZoomScale = Config.initialVisibleHeight / currentVisibleHeight;
    const clampedZoomScale = Math.max(Config.minParticleZoomScale, Math.min(Config.maxParticleZoomScale, rawZoomScale));

    if (_cursor.particleMaterial.uniforms && _cursor.particleMaterial.uniforms.uZoomScale) {
        _cursor.particleMaterial.uniforms.uZoomScale.value = clampedZoomScale;
    }
}

export function handleDeleteBlockEvent(event) {
    const blockToDelete = event.detail?.blockGroup;
    if (!blockToDelete || !blockToDelete.position) {
        console.error("Delete block event missing valid block instance.");
        return;
    }
    const key = _getGridKeyFromWorld(blockToDelete.position.x, blockToDelete.position.y);
    if (key !== null) {
        if (_removeBlock(key, blockToDelete)) {
            if (_isSimulationRunning()) {
                 console.log("Stopping simulation due to block deletion.");
                 _forceStopSimulation();
            }
        } else {
            console.warn("Failed to remove block via context menu action.");
        }
    } else {
        console.warn(`Failed to get grid key for deleting block at ${blockToDelete.position.x}, ${blockToDelete.position.y}`);
    }
}

export function isInteracting() {
    return isDragging || isPanning || isDraggingExistingBlock || (_contextMenu && _contextMenu.classList.contains('active'));
}