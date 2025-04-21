import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as TWEEN from 'three/addons/libs/tween.module.min.js';

import { BlockRegistry } from './squares/BlockRegistry.js';
import { AllBlockClasses } from './squares/allBlocks.js';
import { Cursor } from './cursor.js';

const sidebarWidth = 140; const gridColor = 0x434c5e; const backgroundColor = 0x2e3440;
const validDropOpacity = 0.7; const invalidDropOpacity = 0.3; const simulationSpeed = 400;
let clock; const bloomParams = { threshold: 0.85, strength: 0.35, radius: 0.4 };

const initialVisibleHeight = 20; const minZoom = 5; const maxZoom = 100;
const gridRenderSize = 1000; const interactionPlaneSize = 10000;
const minParticleZoomScale = 0.3; const maxParticleZoomScale = 1.5;

let scene, camera, renderer, composer, raycaster, planeMesh, cursor, gridLinesHelper;
let contextMenuTarget = null; const placedBlocksMap = new Map(); const blockRegistry = new BlockRegistry();
let isDragging = false; let dragData = { type: null, previewMesh: null, lastValidX: null, lastValidY: null, isValidTarget: false };
let isPanning = false; let panStartX = 0, panStartY = 0; let panStartCameraX = 0, panStartCameraY = 0;
let isDraggingExistingBlock = false; let draggedBlock = null; let draggedBlockOriginalKey = null; let dragPreviewMesh = null; let draggedBlockLastValidX = null, draggedBlockLastValidY = null; let draggedBlockIsValidTarget = false;
let simulationInterval = null; let currentlyHoveredBlock = null;
let tooltipElement; let container, sidebar, contextMenu, loadingIndicator; let lastPointerX, lastPointerY;
let indexDisplayElement, indexContentElement, indexValuesElement;

init();

async function init() {
  container = document.getElementById('container'); sidebar = document.getElementById('sidebar');
  contextMenu = document.getElementById('context-menu'); tooltipElement = document.getElementById('tooltip');
  loadingIndicator = document.getElementById('loading-indicator'); loadingIndicator.classList.add('visible'); clock = new THREE.Clock();

  indexDisplayElement = document.getElementById('index-display'); indexContentElement = document.getElementById('index-content'); indexValuesElement = document.getElementById('index-values');
  if (!indexDisplayElement || !indexContentElement || !indexValuesElement) { console.error("Failed to find Index Display UI elements!"); }

  try { console.log("Registering blocks..."); AllBlockClasses.forEach(BlockClass => { if (BlockClass?.blockType) { blockRegistry.register(BlockClass); } else { console.warn("Invalid item in AllBlockClasses.", BlockClass); } }); console.log(`Registered ${blockRegistry.getTypeNames().length} types.`); blockRegistry.loadAllTextures(); } catch (error) { console.error("Error during block registration:", error); }

  scene = new THREE.Scene(); scene.background = new THREE.Color(backgroundColor);
  scene.add(new THREE.AmbientLight(0xd8dee9, 0.45));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); dirLight.position.set(8, 15, 10); scene.add(dirLight);
  initCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(window.devicePixelRatio); renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomParams.strength, bloomParams.radius, bloomParams.threshold);
  composer.addPass(bloomPass); composer.addPass(new OutputPass());

  gridLinesHelper = createGridLines(gridRenderSize); scene.add(gridLinesHelper);
  planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(interactionPlaneSize, interactionPlaneSize), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  planeMesh.position.z = -0.01; scene.add(planeMesh); raycaster = new THREE.Raycaster();

  populateSidebar(); cursor = new Cursor(scene, placedBlocksMap, blockRegistry); updateIndexDisplay();

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  contextMenu.addEventListener('closemenu', handleCloseMenuEvent); contextMenu.addEventListener('deleteblock', handleDeleteBlockEvent);
  window.addEventListener('pointerdown', hideContextMenuOnClickOutside, true); window.addEventListener('resize', onWindowResize); window.addEventListener('keydown', handleKeyDown);

  onWindowResize(); updateParticleZoomScale();
  loadingIndicator.classList.remove('visible');
  animate();
}

function initCamera() { const indexHeight = indexDisplayElement ? indexDisplayElement.offsetHeight : 0; const w = window.innerWidth - sidebarWidth; const h = window.innerHeight - indexHeight; const aspect = w / Math.max(1, h); const halfH = initialVisibleHeight / 2; const halfW = halfH * aspect; camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); }

function createGridLines(renderSize) { const g = new THREE.BufferGeometry(), v = [], h = renderSize / 2; for (let i = -h; i <= h; i++) { v.push(-h, i, 0, h, i, 0); v.push(i, -h, 0, i, h, 0); } g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); const gridLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.6 })); gridLines.position.z = -0.02; return gridLines; }

function populateSidebar() { sidebar.innerHTML = ''; const h = document.createElement('div'); h.className = 'sidebar-header'; h.textContent = 'Blocks'; sidebar.appendChild(h); blockRegistry.getTypeNames().forEach(typeName => { const item = blockRegistry.createSidebarElement(typeName); if (item) { const BlockClass = blockRegistry.getBlockClass(typeName); const label = BlockClass?.label || typeName; item.dataset.label = label; item.addEventListener('pointerdown', (e) => { if (contextMenu.classList.contains('active') || isDragging || isPanning || isDraggingExistingBlock) return; e.stopPropagation(); hideContextMenu(); startSidebarDrag(e, typeName); }); const img = item.querySelector('img'); if (img) img.addEventListener('dragstart', (e) => e.preventDefault()); item.addEventListener('mouseenter', (e) => { if (!tooltipElement) return; tooltipElement.textContent = label; tooltipElement.style.display = 'block'; const iR = item.getBoundingClientRect(), tR = tooltipElement.getBoundingClientRect(); let t = iR.top + (iR.height / 2) - (tR.height / 2), l = iR.left - tR.width - 10; t = Math.max(5, Math.min(t, window.innerHeight - tR.height - 5)); l = Math.max(5, l); tooltipElement.style.top = `${t}px`; tooltipElement.style.left = `${l}px`; }); item.addEventListener('mouseleave', (e) => { if (tooltipElement) tooltipElement.style.display = 'none'; }); sidebar.appendChild(item); } else { console.warn(`Failed sidebar element for ${typeName}`); } }); }

function getPointerNdc(e) { const indexHeight = indexDisplayElement ? indexDisplayElement.offsetHeight : 0; const r = renderer.domElement.getBoundingClientRect(); if (e.clientY < indexHeight) return { x: -999, y: -999 }; const clientYAdjusted = e.clientY - r.top; return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((clientYAdjusted) / r.height) * 2 + 1 }; }
function screenToWorld(screenX, screenY) { const ndc = getPointerNdc({ clientX: screenX, clientY: screenY }); if (ndc.x === -999) return null; raycaster.setFromCamera(ndc, camera); const intersects = raycaster.intersectObject(planeMesh); return intersects.length > 0 ? intersects[0].point : null; }
function getIntersectedBlock(ndc) { if (ndc.x === -999) return null; raycaster.setFromCamera(ndc, camera); const blocks = Array.from(placedBlocksMap.values()); if (blocks.length === 0) return null; const hits = raycaster.intersectObjects(blocks, true); if (hits.length > 0) { let hO = hits[0].object; while (hO && (!hO.userData?.blockType || !(hO instanceof THREE.Group))) { hO = hO.parent; } return (hO instanceof THREE.Group && hO.userData?.blockType) ? hO : null; } return null; }
function _getGridKey(wx, wy) { if (typeof wx !== 'number' || typeof wy !== 'number' || isNaN(wx) || isNaN(wy)) return null; return `${Math.round(wx - .5)},${Math.round(wy - .5)}`; }
function isOccupied(wx, wy, excludeKey = null) { const k = _getGridKey(wx, wy); return k !== null && k !== excludeKey && placedBlocksMap.has(k); }

function addBlock(typeName, gridX, gridY) { const k = `${gridX},${gridY}`; if (isOccupied(gridX + 0.5, gridY + 0.5)) { console.warn(`Cannot add block: cell ${k} is occupied.`); return null; } const instance = blockRegistry.createInstance(typeName, new THREE.Vector3(gridX + .5, gridY + .5, 0)); if (instance) { if (!instance.userData?.blockType) { console.error(`${typeName} instance missing blockType! Fixing.`); if (!instance.userData) instance.userData = {}; instance.userData.blockType = typeName; } scene.add(instance); placedBlocksMap.set(k, instance); return instance; } else { console.error(`Failed instance for ${typeName}`); return null; } }
function removeBlock(key, block) { if (!block) return; if (placedBlocksMap.get(key) === block) { scene.remove(block); block.traverse(c => { if (c instanceof THREE.Mesh) { c.geometry?.dispose(); if (c.material) { if (Array.isArray(c.material)) { c.material.forEach(m => { m.map?.dispose(); m.dispose(); }); } else { c.material.map?.dispose(); c.material.dispose(); } } } }); placedBlocksMap.delete(key); } else { console.warn(`Remove failed: ${key}`); } }

function startSidebarDrag(e, typeName) { if (simulationInterval || isDragging || isPanning || isDraggingExistingBlock) return; isDragging = true; dragData.type = typeName; dragData.previewMesh = blockRegistry.createPreview(typeName); if (!dragData.previewMesh) { console.error(`No preview for ${typeName}`); isDragging = false; return; } dragData.isValidTarget = false; if (dragData.previewMesh.material) dragData.previewMesh.material.opacity = invalidDropOpacity; dragData.previewMesh.position.set(1e4, 1e4, 0); dragData.previewMesh.visible = false; scene.add(dragData.previewMesh); document.body.style.cursor = 'grabbing'; renderer.domElement.style.cursor = 'grabbing'; handleSidebarDragMove(e); }
function handleSidebarDragMove(e) { if (!isDragging || !dragData.previewMesh) return; const worldPos = screenToWorld(e.clientX, e.clientY); if (worldPos) { const gx_center = Math.floor(worldPos.x + .5) + .5; const gy_center = Math.floor(worldPos.y + .5) + .5; const occupied = isOccupied(gx_center, gy_center); dragData.isValidTarget = !occupied; dragData.lastValidX = gx_center; dragData.lastValidY = gy_center; dragData.previewMesh.position.set(gx_center, gy_center, .1); if (dragData.previewMesh.material) dragData.previewMesh.material.opacity = dragData.isValidTarget ? validDropOpacity : invalidDropOpacity; dragData.previewMesh.visible = true; } else { dragData.isValidTarget = false; dragData.previewMesh.visible = false; } }
function handleSidebarDragEnd(e) { if (!isDragging) return; if (dragData.isValidTarget && dragData.type && dragData.lastValidX !== null && dragData.lastValidY !== null) { const gX_int = Math.round(dragData.lastValidX - .5), gY_int = Math.round(dragData.lastValidY - .5); addBlock(dragData.type, gX_int, gY_int); } if (dragData.previewMesh) { scene.remove(dragData.previewMesh); dragData.previewMesh.geometry?.dispose(); if (dragData.previewMesh.material) { if (Array.isArray(dragData.previewMesh.material)) { dragData.previewMesh.material.forEach(m => m.dispose()); } else { dragData.previewMesh.material.dispose(); } } } isDragging = false; document.body.style.cursor = 'default'; renderer.domElement.style.cursor = 'default'; dragData = { type: null, previewMesh: null, lastValidX: null, lastValidY: null, isValidTarget: false }; }

function startExistingBlockDrag(blockInstance, event) {
  if (simulationInterval || isDragging || isPanning || isDraggingExistingBlock) return;
  isDraggingExistingBlock = true;
  draggedBlock = blockInstance;
  draggedBlockOriginalKey = _getGridKey(blockInstance.position.x, blockInstance.position.y);
  const type = blockInstance.userData.blockType;
  dragPreviewMesh = blockRegistry.createPreview(type);
  if (!dragPreviewMesh) { console.error(`Failed to create preview for existing block type ${type}`); isDraggingExistingBlock = false; draggedBlock = null; draggedBlockOriginalKey = null; return; }
  dragPreviewMesh.position.copy(blockInstance.position).z += 0.1;
  dragPreviewMesh.visible = false;
  scene.add(dragPreviewMesh);

  draggedBlock.traverse(child => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material.opacity = 0.3;
      child.material.needsUpdate = true;
    }
  });

  document.body.style.cursor = 'grabbing'; renderer.domElement.style.cursor = 'grabbing';
  handleExistingBlockDragMove(event);
}

function handleExistingBlockDragMove(e) {
  if (!isDraggingExistingBlock || !dragPreviewMesh) return;
  const worldPos = screenToWorld(e.clientX, e.clientY);
  if (worldPos) {
    const gx_center = Math.floor(worldPos.x + .5) + .5;
    const gy_center = Math.floor(worldPos.y + .5) + .5;
    const occupied = isOccupied(gx_center, gy_center, draggedBlockOriginalKey);
    draggedBlockIsValidTarget = !occupied;
    draggedBlockLastValidX = gx_center;
    draggedBlockLastValidY = gy_center;
    dragPreviewMesh.position.set(gx_center, gy_center, .1);
    if (dragPreviewMesh.material) dragPreviewMesh.material.opacity = draggedBlockIsValidTarget ? validDropOpacity : invalidDropOpacity;
    dragPreviewMesh.visible = true;
  } else {
    draggedBlockIsValidTarget = false;
    dragPreviewMesh.visible = false;
  }
}

function handleExistingBlockDragEnd(e) {
  if (!isDraggingExistingBlock) return;

  if (draggedBlock) {
    draggedBlock.traverse(child => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material.opacity = 1.0;
        child.material.needsUpdate = true;
      }
    });
  }

  if (dragPreviewMesh) { scene.remove(dragPreviewMesh); dragPreviewMesh.geometry?.dispose(); dragPreviewMesh = null; }

  if (draggedBlockIsValidTarget && draggedBlock && draggedBlockOriginalKey && draggedBlockLastValidX !== null && draggedBlockLastValidY !== null) {
    const newGridX = Math.round(draggedBlockLastValidX - .5);
    const newGridY = Math.round(draggedBlockLastValidY - .5);
    const newKey = `${newGridX},${newGridY}`;
    if (newKey !== draggedBlockOriginalKey) {
      if (placedBlocksMap.get(draggedBlockOriginalKey) === draggedBlock) { placedBlocksMap.delete(draggedBlockOriginalKey); }
      else { console.warn("Mismatch during block move - original key not found or block doesn't match."); }
      draggedBlock.position.set(draggedBlockLastValidX, draggedBlockLastValidY, 0);
      if (!placedBlocksMap.has(newKey)) { placedBlocksMap.set(newKey, draggedBlock); console.log(`Block moved from ${draggedBlockOriginalKey} to ${newKey}`); }
      else { console.error(`Failed to move block: Target cell ${newKey} became occupied.`); const origCoords = draggedBlockOriginalKey.split(','); draggedBlock.position.set(parseFloat(origCoords[0]) + 0.5, parseFloat(origCoords[1]) + 0.5, 0); placedBlocksMap.set(draggedBlockOriginalKey, draggedBlock); }
    } else { console.log("Block dropped back in original position."); }
  } else if (draggedBlock) { console.log("Invalid drop location or drag cancelled, block snapped back."); }

  isDraggingExistingBlock = false; draggedBlock = null; draggedBlockOriginalKey = null; draggedBlockIsValidTarget = false; draggedBlockLastValidX = null; draggedBlockLastValidY = null;
  document.body.style.cursor = 'default'; renderer.domElement.style.cursor = 'default';
}

function cancelExistingBlockDrag() {
  if (!isDraggingExistingBlock) return;
  console.log("Cancelling existing block drag (Escape).");

  if (draggedBlock && draggedBlockOriginalKey) {
    draggedBlock.traverse(child => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material.opacity = 1.0;
        child.material.needsUpdate = true;
      }
    });
  }

  if (dragPreviewMesh) { scene.remove(dragPreviewMesh); dragPreviewMesh.geometry?.dispose(); dragPreviewMesh = null; }

  isDraggingExistingBlock = false; draggedBlock = null; draggedBlockOriginalKey = null; draggedBlockIsValidTarget = false; draggedBlockLastValidX = null; draggedBlockLastValidY = null;
  document.body.style.cursor = 'default'; renderer.domElement.style.cursor = 'default';
}

function onPointerDown(e) { if (contextMenu.contains(e.target)) return; if (e.target !== renderer.domElement) { if (contextMenu.classList.contains('active')) hideContextMenu(); return; } if (contextMenu.classList.contains('active')) hideContextMenu(); if (e.button === 1 && !isDragging && !isDraggingExistingBlock) { isPanning = true; panStartX = e.clientX; panStartY = e.clientY; panStartCameraX = camera.position.x; panStartCameraY = camera.position.y; renderer.domElement.style.cursor = 'grabbing'; e.preventDefault(); return; } if (e.button === 0 && !isDragging && !isPanning && !isDraggingExistingBlock && !simulationInterval) { const ndc = getPointerNdc(e); const clickedBlock = getIntersectedBlock(ndc); if (clickedBlock) { startExistingBlockDrag(clickedBlock, e); e.preventDefault(); } } }
function onPointerMove(e) { if (isPanning) { const dx = e.clientX - panStartX; const dy = e.clientY - panStartY; const clientWidth = renderer.domElement.clientWidth; const clientHeight = renderer.domElement.clientHeight; if (clientWidth <= 0 || clientHeight <= 0) return; const worldWidth = camera.right - camera.left; const worldHeight = camera.top - camera.bottom; const deltaXWorld = -(dx / clientWidth) * worldWidth; const deltaYWorld = (dy / clientHeight) * worldHeight; camera.position.x = panStartCameraX + deltaXWorld; camera.position.y = panStartCameraY + deltaYWorld; lastPointerX = e.clientX; lastPointerY = e.clientY; currentlyHoveredBlock = null; return; } if (isDraggingExistingBlock) { handleExistingBlockDragMove(e); lastPointerX = e.clientX; lastPointerY = e.clientY; currentlyHoveredBlock = null; return; } if (isDragging) { handleSidebarDragMove(e); lastPointerX = e.clientX; lastPointerY = e.clientY; currentlyHoveredBlock = null; return; } lastPointerX = e.clientX; lastPointerY = e.clientY; if (!contextMenu.classList.contains('active') && !simulationInterval) { const ndc = getPointerNdc(e); currentlyHoveredBlock = getIntersectedBlock(ndc); } else { currentlyHoveredBlock = null; } }
function onPointerUp(e) { if (isPanning && e.button === 1) { isPanning = false; renderer.domElement.style.cursor = 'default'; const ndc = getPointerNdc(e); currentlyHoveredBlock = getIntersectedBlock(ndc); } else if (isDraggingExistingBlock && e.button === 0) { handleExistingBlockDragEnd(e); const ndc = getPointerNdc(e); currentlyHoveredBlock = getIntersectedBlock(ndc); } else if (isDragging && e.button === 0) { handleSidebarDragEnd(e); const ndc = getPointerNdc(e); currentlyHoveredBlock = getIntersectedBlock(ndc); } }
function onPointerLeave(e) { if (isPanning) { isPanning = false; renderer.domElement.style.cursor = 'default'; } if (isDragging) { handleSidebarDragEnd(e); } if (isDraggingExistingBlock) { cancelExistingBlockDrag(); } currentlyHoveredBlock = null; }
function onWheel(e) { e.preventDefault(); const zoomFactor = 0.9; const scale = (e.deltaY < 0) ? zoomFactor : 1 / zoomFactor; const currentVisibleHeight = camera.top - camera.bottom; let newVisibleHeight = currentVisibleHeight * scale; newVisibleHeight = Math.max(minZoom, Math.min(maxZoom, newVisibleHeight)); if (Math.abs(newVisibleHeight - currentVisibleHeight) < 0.001) return; const pointerWorldBefore = screenToWorld(e.clientX, e.clientY); const aspect = (camera.right - camera.left) / (camera.top - camera.bottom); camera.top = newVisibleHeight / 2; camera.bottom = -newVisibleHeight / 2; camera.left = -camera.top * aspect; camera.right = camera.top * aspect; camera.updateProjectionMatrix(); const pointerWorldAfter = screenToWorld(e.clientX, e.clientY); if (pointerWorldBefore && pointerWorldAfter) { const dx = pointerWorldBefore.x - pointerWorldAfter.x; const dy = pointerWorldBefore.y - pointerWorldAfter.y; camera.position.x += dx; camera.position.y += dy; } updateParticleZoomScale(); }
function updateParticleZoomScale() { if (!cursor || !cursor.particleMaterial || !camera) return; const currentVisibleHeight = camera.top - camera.bottom; const rawZoomScale = initialVisibleHeight / currentVisibleHeight; const clampedZoomScale = Math.max(minParticleZoomScale, Math.min(maxParticleZoomScale, rawZoomScale)); cursor.particleMaterial.uniforms.uZoomScale.value = clampedZoomScale; }
function onContextMenu(e) { e.preventDefault(); if (isDragging || simulationInterval || isPanning || isDraggingExistingBlock) return; hideContextMenu(); const ndc = getPointerNdc(e); contextMenuTarget = getIntersectedBlock(ndc); if (contextMenuTarget?.userData?.blockType) { const type = contextMenuTarget.userData.blockType; const BClass = blockRegistry.getBlockClass(type); if (BClass?.populateContextMenu) { BClass.populateContextMenu(contextMenu, contextMenuTarget); positionContextMenu(e.clientX, e.clientY); contextMenu.classList.add('active'); currentlyHoveredBlock = null; } else { contextMenuTarget = null; } } else { contextMenuTarget = null; } }
function positionContextMenu(x, y) { const cR = renderer.domElement.getBoundingClientRect(); const mW = contextMenu.offsetWidth, mH = contextMenu.offsetHeight; const cW = cR.width; const cH = cR.height; let l = x - cR.left; let t = y - cR.top; l = Math.max(5, Math.min(l, cW - mW - 5)); t = Math.max(5, Math.min(t, cH - mH - 5)); contextMenu.style.left = `${l + cR.left}px`; contextMenu.style.top = `${t + cR.top}px`; }
function hideContextMenu() { if (contextMenu.classList.contains('active')) { contextMenu.classList.remove('active'); if (!simulationInterval && !isPanning && !isDragging && !isDraggingExistingBlock && lastPointerX !== undefined && lastPointerY !== undefined) { try { const ndc = getPointerNdc({ clientX: lastPointerX, clientY: lastPointerY }); currentlyHoveredBlock = getIntersectedBlock(ndc); } catch (e) { console.error("Err rechecking hover", e); currentlyHoveredBlock = null; } } contextMenuTarget = null; } }
function hideContextMenuOnClickOutside(e) { if (contextMenu.contains(e.target) || isDragging || isPanning || isDraggingExistingBlock) return; if (contextMenu.classList.contains('active')) { if (e.button === 2) { try { const ndc = getPointerNdc(e); if (getIntersectedBlock(ndc) === contextMenuTarget) return; } catch (e) { } } hideContextMenu(); } }
function handleCloseMenuEvent() { hideContextMenu(); }
function handleDeleteBlockEvent(e) { const block = e.detail?.blockGroup; if (!block?.position) return; const key = _getGridKey(block.position.x, block.position.y); if (key !== null) { removeBlock(key, block); if (simulationInterval) { console.log("Stopping sim due to delete."); stopSimulation(); } } else { console.warn(`Delete failed to get key for ${block.position.x},${block.position.y}`); } }
function handleKeyDown(e) { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return; if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !isDragging && !isPanning && !isDraggingExistingBlock) { e.preventDefault(); if (simulationInterval) { stopSimulation(); } else if (currentlyHoveredBlock) { const sPos = { x: currentlyHoveredBlock.position.x, y: currentlyHoveredBlock.position.y }; currentlyHoveredBlock = null; startSimulation(sPos); } else { console.log("Press 'F' over block to start."); } } if (e.key === 'Escape') { if (simulationInterval) { e.preventDefault(); stopSimulation(); } else if (isDragging) { e.preventDefault(); handleSidebarDragEnd({ type: 'pointerup' }); console.log("Cancelled sidebar drag."); } else if (isDraggingExistingBlock) { e.preventDefault(); cancelExistingBlockDrag(); } else if (isPanning) { e.preventDefault(); isPanning = false; renderer.domElement.style.cursor = 'default'; console.log("Cancelled pan."); } else if (contextMenu.classList.contains('active')) { e.preventDefault(); hideContextMenu(); } } }

function startSimulation(startPos) { if (!startPos || typeof startPos.x !== 'number' || typeof startPos.y !== 'number') { console.error("Invalid start pos:", startPos); return; } if (simulationInterval) { console.warn("Sim running, stopping first."); stopSimulation(); } cursor.reset(startPos); if (cursor.start()) { console.log("Simulation started at:", startPos); updateIndexDisplay(); simulationInterval = setInterval(() => { const continueSim = cursor.step(); updateIndexDisplay(); if (!continueSim) { stopSimulation(); } }, simulationSpeed); } else { console.error("Cursor failed start activation."); } }
function stopSimulation() { if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; cursor?.stop(); console.log("Simulation stopped."); cursor?.reset(); updateIndexDisplay(); if (!isPanning && !isDragging && !isDraggingExistingBlock && lastPointerX !== undefined && lastPointerY !== undefined) { try { const ndc = getPointerNdc({ clientX: lastPointerX, clientY: lastPointerY }); currentlyHoveredBlock = getIntersectedBlock(ndc); } catch (e) { console.error("Err rechecking hover", e); currentlyHoveredBlock = null; } } } }

function updateIndexDisplay() { if (!cursor || !indexValuesElement || !indexDisplayElement) return; const data = cursor.getIndexDisplayData(); const { array, pointer } = data; indexValuesElement.innerHTML = ''; if (array && array.length > 0) { for (let i = 0; i < array.length; i++) { const valueSpan = document.createElement('span'); valueSpan.className = 'index-value'; valueSpan.textContent = array[i]; if (i === pointer) { valueSpan.classList.add('active-index'); } indexValuesElement.appendChild(valueSpan); } } else { const zeroSpan = document.createElement('span'); zeroSpan.className = 'index-value active-index'; zeroSpan.textContent = '0'; indexValuesElement.appendChild(zeroSpan); } const activeElement = indexValuesElement.querySelector('.active-index'); if (activeElement) { activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } }

function onWindowResize() { if (!camera || !renderer || !composer) return; const indexHeight = indexDisplayElement ? indexDisplayElement.offsetHeight : 0; const sidebarCurrentWidth = sidebar ? sidebar.offsetWidth : sidebarWidth; const w = window.innerWidth - sidebarCurrentWidth; const h = window.innerHeight - indexHeight; const effectiveHeight = Math.max(1, h); const aspect = w / effectiveHeight; const currentVisibleHeight = camera.top - camera.bottom; camera.top = currentVisibleHeight / 2; camera.bottom = -currentVisibleHeight / 2; camera.left = -camera.top * aspect; camera.right = camera.top * aspect; camera.updateProjectionMatrix(); renderer.setSize(w, effectiveHeight); composer.setSize(w, effectiveHeight); if (container) container.style.top = `${indexHeight}px`; if (sidebar) sidebar.style.top = `${indexHeight}px`; updateParticleZoomScale(); hideContextMenu(); }

function animate(time) { requestAnimationFrame(animate); const dt = clock.getDelta(); TWEEN.update(time); cursor?.update(dt); composer.render(); }