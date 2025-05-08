import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.min.js';

import * as Config from './config.js';

import { initializeScene, resizeHandler, getScene, getCamera, getRenderer, getComposer, getAudioListener } from './sceneSetup.js';
import { initializeGridInteraction, getPointerNdc, screenToWorld, getIntersectedBlock, isOccupied, getGridKeyFromWorld } from './gridInteraction.js';

import { initializeBlockManager, addBlock, removeBlock, getPlacedBlocksMap, getBlockRegistry, setSceneReference, setIsOccupiedChecker } from './blockManager.js';

import { initializeUI, setLoading, updateIndexDisplay, showContextMenu, hideContextMenu, setupContextMenuListeners, getSidebarElement } from './uiManager.js';
import { initializeSimulationManager, startSimulation, stopSimulation, isSimulationRunning, forceStopSimulation } from './simulationManager.js';
import { initializeInputHandler, startSidebarDrag, updateHoverState, handleDeleteBlockEvent, isInteracting } from './inputHandler.js';

import { Cursor } from '../cursor.js';
import { initializeFileControls } from './fileManager.js';

let clock;
let cursorInstance;

init();

async function init() {
    console.log("Initializing application...");
    clock = new THREE.Clock();

    const container = document.getElementById('container');
    const indexDisplayElement = document.getElementById('index-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    if (!container || !indexDisplayElement || !loadingIndicator) {
        console.error("FATAL: Could not find essential container, index display, or loading indicator elements.");
        return;
    }
    loadingIndicator.classList.add('visible');

    await initializeBlockManager();
    const blockRegistry = getBlockRegistry();
    const placedBlocksMap = getPlacedBlocksMap();

    const { scene, camera, renderer, composer, audioListener } = initializeScene(container, indexDisplayElement);

    setSceneReference(scene);

    initializeGridInteraction(scene, camera, renderer, placedBlocksMap, indexDisplayElement);

    setIsOccupiedChecker(isOccupied);

    cursorInstance = new Cursor(scene, placedBlocksMap, blockRegistry, audioListener);

    initializeSimulationManager(cursorInstance, Config.simulationSpeed, updateIndexDisplay, () => updateHoverState());

    const uiElements = initializeUI(
        blockRegistry,
        cursorInstance,
        (e, typeName) => {
            if (!isInteracting() && !isSimulationRunning()) {
                startSidebarDrag(e, typeName);
            } else {
                 console.log("Ignoring sidebar drag start due to active interaction or simulation.");
            }
        },
        handleDeleteBlockEvent,
        isSimulationRunning 
    );
    const sidebarElement = getSidebarElement();

    if (sidebarElement && container && indexDisplayElement) {
        console.log("Performing initial resize call...");
        resizeHandler(container, indexDisplayElement, sidebarElement);
    } else {
        console.error("Could not perform initial resize: Missing container, index display, or sidebar element reference.");
    }

    initializeInputHandler({
        renderer, camera, scene, cursor: cursorInstance, container, contextMenu: uiElements.contextMenu,
        blockRegistry,
        addBlock, removeBlock,
        getPlacedBlocksMap, 
        getPointerNdc, screenToWorld, getIntersectedBlock, isOccupied, getGridKeyFromWorld,
        startSimulation, stopSimulation, isSimulationRunning, forceStopSimulation,
        showContextMenu, hideContextMenu,
    });

    setupContextMenuListeners(() => updateHoverState());

    window.addEventListener('resize', () => {

        const currentSidebarElement = getSidebarElement();
        const currentContainer = document.getElementById('container');
        const currentIndexDisplay = document.getElementById('index-display');

        if (currentContainer && currentIndexDisplay && currentSidebarElement) {
            resizeHandler(currentContainer, currentIndexDisplay, currentSidebarElement);
        } else {
            console.warn("Resize handler skipped during window resize: Missing required elements.");
        }
        updateHoverState();
        hideContextMenu(() => updateHoverState());
    });

    console.log("Initialization complete.");
    setLoading(false);

    initializeFileControls();

    animate(); 
}

function animate(time) {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const composer = getComposer();
    TWEEN.update(time);
    cursorInstance?.update(dt); 
    if (composer) {
        try {
            composer.render();
        } catch (e) {
            console.error("Error during composer render:", e);
        }
    } else {
         const renderer = getRenderer();
         const scene = getScene();
         const camera = getCamera();
         if (renderer && scene && camera) {
             renderer.render(scene, camera);
         }
    }
}