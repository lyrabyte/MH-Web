import { getPlacedBlocksMap, addBlock, removeBlock } from './blockManager.js';
import { forceStopSimulation, isSimulationRunning } from './simulationManager.js';
import { setLoading } from './uiManager.js';

export function initializeFileControls() {
    const downloadBtn = document.getElementById('btn-download');
    const importBtn = document.getElementById('btn-import');
    const fileInput = document.getElementById('import-file-input');

    downloadBtn.addEventListener('click', () => {
        downloadMachine();
    });

    importBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            importMachine(file);

            event.target.value = '';
        }
    });

    console.log("File controls initialized");
}

function downloadMachine() {
    console.log("Preparing machine download...");
    const placedBlocksMap = getPlacedBlocksMap();

    const serializedBlocks = [];
    placedBlocksMap.forEach((blockInstance, key) => {
        const [x, y] = key.split(',').map(Number);

        const blockData = {
            position: { x, y },
            type: blockInstance.userData.blockType,
            userData: { ...blockInstance.userData }
        };

        delete blockData.userData.parent;
        delete blockData.userData.children;

        serializedBlocks.push(blockData);
    });

    const machineData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        blocks: serializedBlocks
    };

    const jsonString = JSON.stringify(machineData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `machine_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);

    console.log("Machine downloaded!");
}

function importMachine(file) {
    console.log("Importing machine from file...");

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const machineData = JSON.parse(event.target.result);

            if (!machineData.blocks || !Array.isArray(machineData.blocks)) {
                throw new Error("Invalid machine data format");
            }

            importBlocksFromData(machineData);
        } catch (error) {
            console.error("Error importing machine:", error);
            alert("Failed to import machine. Invalid file format.");
        }
    };

    reader.readAsText(file);
}

function importBlocksFromData(machineData) {

    if (isSimulationRunning()) {
        forceStopSimulation();
    }

    setLoading(true);

    clearAllBlocks();

    setTimeout(() => {
        try {
            let successCount = 0;

            for (const blockData of machineData.blocks) {
                if (!blockData.type || !blockData.position || 
                    typeof blockData.position.x !== 'number' || 
                    typeof blockData.position.y !== 'number') {
                    console.warn("Skipping invalid block data:", blockData);
                    continue;
                }

                const block = addBlock(
                    blockData.type, 
                    blockData.position.x, 
                    blockData.position.y
                );

                if (block && blockData.userData) {

                    Object.keys(blockData.userData).forEach(key => {

                        if (key !== 'blockType' && key !== 'parent' && key !== 'children') {
                            block.userData[key] = blockData.userData[key];
                        }
                    });
                    successCount++;
                }
            }

            console.log(`Imported ${successCount} of ${machineData.blocks.length} blocks successfully`);
            alert(`Machine imported successfully with ${successCount} blocks.`);
        } catch (error) {
            console.error("Error during block import:", error);
            alert("An error occurred during import. Some blocks may not have been imported correctly.");
        } finally {

            setLoading(false);
        }
    }, 100); 
}

function clearAllBlocks() {
    const placedBlocksMap = getPlacedBlocksMap();

    const keys = Array.from(placedBlocksMap.keys());

    let removedCount = 0;
    for (const key of keys) {
        const block = placedBlocksMap.get(key);
        if (block) {
            if (removeBlock(key, block)) {
                removedCount++;
            }
        }
    }

    console.log(`Cleared ${removedCount} existing blocks`);
}