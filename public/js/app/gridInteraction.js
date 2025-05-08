import * as THREE from 'three';
import * as Config from './config.js';

let planeMesh, gridLinesHelper, raycaster;
let _camera, _renderer, _placedBlocksMap, _indexDisplayElement; 

export function initializeGridInteraction(scene, camera, renderer, placedBlocksMap, indexDisplayElement) {
    _camera = camera;
    _renderer = renderer;
    _placedBlocksMap = placedBlocksMap;
    _indexDisplayElement = indexDisplayElement;

    raycaster = new THREE.Raycaster();

    gridLinesHelper = createGridLines(Config.gridRenderSize);
    scene.add(gridLinesHelper);

    planeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Config.interactionPlaneSize, Config.interactionPlaneSize),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }) 
    );
    planeMesh.position.z = -0.01; 
    scene.add(planeMesh);

    return { planeMesh, gridLinesHelper, raycaster }; 
}

function createGridLines(renderSize) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const half = renderSize / 2;
    for (let i = -half; i <= half; i++) {

        vertices.push(-half, i, 0, half, i, 0);

        vertices.push(i, -half, 0, i, half, 0);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const gridLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: Config.gridColor,
        transparent: true,
        opacity: 0.6
    }));
    gridLines.position.z = -0.02; 
    return gridLines;
}

export function getPointerNdc(event) {
    const indexHeight = _indexDisplayElement ? _indexDisplayElement.offsetHeight : 0;
    const rect = _renderer.domElement.getBoundingClientRect();

    if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) {

         return { x: -999, y: -999 }; 
    }

    const clientYAdjusted = event.clientY - rect.top;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientYAdjusted) / rect.height) * 2 + 1; 

    return { x, y };
}

export function screenToWorld(screenX, screenY) {
    const ndc = getPointerNdc({ clientX: screenX, clientY: screenY });
    if (ndc.x === -999) return null; 

    raycaster.setFromCamera(ndc, _camera);
    const intersects = raycaster.intersectObject(planeMesh);
    return intersects.length > 0 ? intersects[0].point : null;
}

export function getIntersectedBlock(ndc) {
    if (ndc.x === -999) return null;

    raycaster.setFromCamera(ndc, _camera);
    const blocks = Array.from(_placedBlocksMap.values());
    if (blocks.length === 0) return null;

    const hits = raycaster.intersectObjects(blocks, true); 

    if (hits.length > 0) {
        let hitObject = hits[0].object;
        while (hitObject && (!hitObject.userData?.blockType || !(hitObject instanceof THREE.Group))) {
            hitObject = hitObject.parent;
        }
        return (hitObject instanceof THREE.Group && hitObject.userData?.blockType) ? hitObject : null;
    }
    return null;
}

export function getGridKeyFromWorld(worldX, worldY) {
    if (typeof worldX !== 'number' || typeof worldY !== 'number' || isNaN(worldX) || isNaN(worldY)) {
        console.warn("Invalid input to getGridKeyFromWorld:", worldX, worldY);
        return null;
    }
    const gridX = Math.floor(worldX);
    const gridY = Math.floor(worldY);
    return `${gridX},${gridY}`;
}

export function isOccupied(worldX, worldY, excludeKey = null) {
    const key = getGridKeyFromWorld(worldX, worldY);
    return key !== null && key !== excludeKey && _placedBlocksMap.has(key);
}