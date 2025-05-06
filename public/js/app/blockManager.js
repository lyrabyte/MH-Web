import * as THREE from 'three';

import { BlockRegistry } from '../squares/BlockRegistry.js';
import { AllBlockClasses } from '../squares/allBlocks.js';

const placedBlocksMap = new Map(); 
const blockRegistry = new BlockRegistry();
let _scene = null; 
let _isOccupiedChecker = null; 

export function setSceneReference(sceneRef) {
    _scene = sceneRef;
    if (_scene) {
        console.log("BlockManager received scene reference.");
    } else {
        console.warn("BlockManager received null scene reference.");
    }
}

export function setIsOccupiedChecker(checkerFn) {
    _isOccupiedChecker = checkerFn;
    if (_isOccupiedChecker) {
        console.log("BlockManager received isOccupied checker function.");
    } else {
        console.warn("BlockManager received null isOccupied checker function.");
    }
}

export async function initializeBlockManager() {
    console.log("Registering blocks...");
    try {
        AllBlockClasses.forEach(BlockClass => {
            if (BlockClass && BlockClass.blockType) {
                blockRegistry.register(BlockClass);
            } else {
                console.warn("Found invalid item in AllBlockClasses. Skipping.", BlockClass);
            }
        });
        console.log(`Registered ${blockRegistry.getTypeNames().length} block types.`);
        await blockRegistry.loadAllTextures();
        console.log("Completed texture loading for all registered blocks.");
    } catch (error) {
        console.error("Error during block registration or texture loading:", error);
    }
}

export function addBlock(typeName, gridX, gridY) {

    if (typeof _isOccupiedChecker !== 'function') {
        console.error("BlockManager Error: isOccupied checker not set or not a function before calling addBlock.");
        return null;
    }
    if (!(_scene instanceof THREE.Scene)) {
        console.error("BlockManager Error: Scene reference not set or not a valid Scene before calling addBlock.");
        return null;
    }

    const key = `${gridX},${gridY}`;

    if (_isOccupiedChecker(gridX + 0.5, gridY + 0.5)) {
        console.warn(`Cannot add block: cell ${key} is already occupied.`);
        return null;
    }

    const instance = blockRegistry.createInstance(typeName, new THREE.Vector3(gridX + 0.5, gridY + 0.5, 0));

    if (instance) {

        if (!instance.userData || !instance.userData.blockType) {
             console.error(`Block instance of type "${typeName}" created without proper userData. Fixing.`);
             if (!instance.userData) instance.userData = {};
             instance.userData.blockType = typeName; 
        }

        _scene.add(instance);
        placedBlocksMap.set(key, instance);
        console.log(`Added ${typeName} block at ${key}`);
        return instance;
    } else {
        console.error(`Failed to create instance for block type: ${typeName}`);
        return null;
    }
}

export function removeBlock(key, blockInstance) {

     if (!(_scene instanceof THREE.Scene)) {
        console.error("BlockManager Error: Scene reference not set or not a valid Scene before calling removeBlock.");

        if (placedBlocksMap.has(key)) {
            placedBlocksMap.delete(key);
            console.warn(`Removed key ${key} from map, but couldn't remove from scene (no valid scene reference).`);
        }
        return false; 
    }

    if (!blockInstance && placedBlocksMap.has(key)) {
        blockInstance = placedBlocksMap.get(key);
    }

    if (!blockInstance) {
        console.warn(`removeBlock called with no valid instance for key: ${key}`);

        if (placedBlocksMap.has(key)) {
             placedBlocksMap.delete(key);
             console.log(`Removed potentially dangling key ${key} from map.`);
        }
        return false; 
    }

    let instanceMatchesKey = placedBlocksMap.get(key) === blockInstance;

    if (instanceMatchesKey) {

        _scene.remove(blockInstance);

        blockInstance.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => {
                            material.map?.dispose(); 
                            material.dispose();
                        });
                    } else {
                        child.material.map?.dispose(); 
                        child.material.dispose();
                    }
                }
            }
        });

        placedBlocksMap.delete(key); 
        console.log(`Removed block at ${key}`);
        return true; 

    } else {

        console.warn(`Block removal: Instance mismatch for key ${key} or key not found. Searching map for instance.`);
        let foundKey = null;
        for(const [k, v] of placedBlocksMap.entries()) {
            if (v === blockInstance) {
                foundKey = k;
                break;
            }
        }
        if (foundKey) {
            console.warn(`Block instance found under different key ${foundKey}. Removing from there.`);

            _scene.remove(blockInstance); 

             blockInstance.traverse(child => {
                 if (child instanceof THREE.Mesh) {
                     child.geometry?.dispose();
                     if (child.material) {
                         if (Array.isArray(child.material)) {
                             child.material.forEach(material => { material.map?.dispose(); material.dispose(); });
                         } else {
                             child.material.map?.dispose(); child.material.dispose();
                         }
                     }
                 }
             });

            placedBlocksMap.delete(foundKey); 
            console.log(`Removed block previously at ${foundKey}`);
            return true; 
        } else {

            console.error(`Block instance provided to removeBlock was not found in the placedBlocksMap at all. Cannot remove from map.`);

             _scene.remove(blockInstance); 
             console.warn(`Attempted scene removal for block instance not found in map.`);
            return false; 
        }
    }
}

export function getPlacedBlocksMap() {
    return placedBlocksMap;
}

export function getBlockRegistry() {
    return blockRegistry;
}