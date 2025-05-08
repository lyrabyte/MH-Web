let simulationInterval = null;
let _cursor; 
let _simulationSpeed; 
let _updateIndexDisplayCallback; 
let _updateHoverStateCallback; 

export function initializeSimulationManager(cursor, simulationSpeed, updateIndexDisplayCb, updateHoverStateCb) {
    _cursor = cursor;
    _simulationSpeed = simulationSpeed;
    _updateIndexDisplayCallback = updateIndexDisplayCb;
    _updateHoverStateCallback = updateHoverStateCb;
    console.log("SimulationManager initialized.");
}

export function startSimulation(startPos) {
    if (!_cursor) {
        console.error("Simulation Manager Error: Cursor not initialized.");
        return false;
    }
    if (simulationInterval) {
        console.warn("Simulation already running. Stopping previous one first.");
        stopSimulation(); 
    }

     if (!startPos || typeof startPos.x !== 'number' || typeof startPos.y !== 'number') {
         console.error("Simulation Manager Error: Invalid start position provided for simulation:", startPos);
         return false;
     }

    _cursor.reset(startPos);
    if (_cursor.start()) {
        console.log("Simulation started at:", startPos);
        if (_updateIndexDisplayCallback) _updateIndexDisplayCallback(); 

        simulationInterval = setInterval(() => {
            try {
                const continueSim = _cursor.step();

                if (_updateIndexDisplayCallback) _updateIndexDisplayCallback();

                if (!continueSim) {
                    stopSimulation(); 
                }
            } catch (error) {
                console.error("Error during simulation step:", error);
                stopSimulation(); 
            }
        }, _simulationSpeed);
        return true; 
    } else {
        console.error("Simulation Manager Error: Cursor failed to start simulation.");
        return false; 
    }
}

export function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;

        try {
            _cursor?.stop(); 
        } catch(e) {
            console.error("Error during cursor stop:", e);
        }
        console.log("Simulation stopped.");

        if (_updateIndexDisplayCallback) {
             try { _updateIndexDisplayCallback(); } catch(e) { console.error("Error calling updateIndexDisplay on stop:", e); }
        }
        if (_updateHoverStateCallback) {
            try { _updateHoverStateCallback(); } catch(e) { console.error("Error calling updateHoverState on stop:", e); }
        }
    }
}

export function isSimulationRunning() {
    return simulationInterval !== null;
}

export function forceStopSimulation() {
    if (isSimulationRunning()) {
        console.log("Simulation force stopped (e.g., due to block deletion).");
        stopSimulation();
    }
}