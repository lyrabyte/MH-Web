import * as THREE from 'three';

export class RandomDirection {

    static blockType = 'randomDirection';
    static fallbackColor = 0xb48ead;
    static label = 'Random'; 
    static texturePath = '/textures/randomdir.png'; 

    static textureLoader = new THREE.TextureLoader();
    static blockTexture = null;
    static textureLoaded = false;
    static textureLoadFailed = false;

    static loadTexture() {
        if (this.textureLoaded || this.textureLoadFailed) return;
        this.textureLoaded = true;
        try {
            this.blockTexture = this.textureLoader.load(this.texturePath,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    this.textureLoadFailed = false;
                },
                undefined,
                (error) => {
                    console.error(`${this.label}: Failed texture load "${this.texturePath}".`, error);
                    this.blockTexture = null; this.textureLoadFailed = true;
                }
            );
        } catch (err) {
            console.error(`${this.label}: Error setting up texture load.`, err);
            this.blockTexture = null; this.textureLoadFailed = true;
        }
    }

    static createPreviewMesh() {
        return new THREE.Mesh( new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color: this.fallbackColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
        );
    }

    static createSidebarElement() {
        const el = document.createElement('div');
        el.className = `sidebar-item ${this.blockType}`;
        const img = document.createElement('img');
        img.src = this.texturePath; img.alt = this.label; img.style.imageRendering = 'pixelated';
        el.appendChild(img); return el;
    }

    static createInstance(position) {
        const group = new THREE.Group();
        const useTexture = this.blockTexture && !this.textureLoadFailed;
        const material = new THREE.MeshStandardMaterial({
            color: useTexture ? 0xffffff : this.fallbackColor, map: useTexture ? this.blockTexture : null,
            roughness: 0.8, metalness: 0.1, transparent: !useTexture, alphaTest: useTexture ? 0.1 : 0, side: THREE.DoubleSide
        });
        const square = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material );
        group.add(square);

        group.userData = {
            blockType: this.blockType,
        };
        group.position.copy(position);
        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = '';
        const title = document.createElement('div'); title.className = 'menu-title'; title.textContent = this.label; menuElement.appendChild(title);
        const separator = document.createElement('div'); separator.className = 'menu-separator'; menuElement.appendChild(separator);
        const deleteItem = document.createElement('div'); deleteItem.className = 'menu-item delete-item';
        deleteItem.innerHTML = `<span class="icon" style="color: var(--nord11);">🗑️</span> Delete Block`;
        deleteItem.addEventListener('click', () => {
            menuElement.dispatchEvent(new CustomEvent('deleteblock', { detail: { blockGroup: blockGroup }, bubbles: true }));
        });
        menuElement.appendChild(deleteItem);
    }

    /**
     * Determines the cursor's next action by checking adjacent blocks
     * and randomly choosing one of the occupied directions.
     * @param {THREE.Group} blockInstance The specific instance of the block the cursor is on.
     * @param {{x: number, y: number}} currentGridPos The cursor's current grid position.
     * @param {{x: number, y: number}|null} previousGridPos The cursor's previous grid position.
     * @param {Map<string, THREE.Group>} blockGridMap A map of grid keys ("x,y") to block instances.
     * @param {import('../BlockRegistry').BlockRegistry} blockRegistry The block registry.
     * @returns {{action: string, nextGridPos: {x: number, y: number}|null}}
     *          Action can be 'move' or 'fizzleInPlace'.
     */
    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry) {
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;

        const DirClass = blockRegistry.getBlockClass('director');
        if (!DirClass) {
            console.error(`${this.label} Error: Could not find 'director' block class in registry. Stopping.`);
            return { action: 'fizzleInPlace', nextGridPos: null };
        }
        const possibleDirs = DirClass.dirs; 
        if (!possibleDirs || !Array.isArray(possibleDirs) || possibleDirs.length === 0) {
            console.error(`${this.label} Error: Invalid or empty 'dirs' array found on directorSquare class. Stopping.`);
            return { action: 'fizzleInPlace', nextGridPos: null };
        }

        const getGridKey = (pos) => {
            if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || isNaN(pos.x) || isNaN(pos.y)) return null;
            return `${Math.round(pos.x - 0.5)},${Math.round(pos.y - 0.5)}`;
        };

        const validDirections = [];
        for (const dirInfo of possibleDirs) {
            if (!dirInfo || !dirInfo.vec || typeof dirInfo.rotation !== 'number' || typeof dirInfo.name !== 'string') {
                console.warn(`${this.label}: Skipping invalid direction info in directorSquare.dirs.`);
                continue;
            }

            const potentialNextPos = {
                x: currentGridPos.x + dirInfo.vec.x,
                y: currentGridPos.y + dirInfo.vec.y
            };
            const potentialNextKey = getGridKey(potentialNextPos);

            if (potentialNextKey !== null && blockGridMap.has(potentialNextKey)) {
                validDirections.push(dirInfo); 
            }
        }

        if (validDirections.length === 0) {

            console.log(`${this.label} at ${currentGridKey}: No valid adjacent blocks found. Fizzling.`);

            return { action: 'fizzleInPlace', nextGridPos: null };
        } else {

            const randomIndex = Math.floor(Math.random() * validDirections.length);
            const chosenDirInfo = validDirections[randomIndex];
            const directionVec = chosenDirInfo.vec;
            const targetRotation = chosenDirInfo.rotation;

            console.log(`${this.label} at ${currentGridKey} chose valid direction: ${chosenDirInfo.name}`);

            blockInstance.rotation.z = targetRotation;

            const nextGridPos = {
                x: currentGridPos.x + directionVec.x,
                y: currentGridPos.y + directionVec.y
            };

            return { action: 'move', nextGridPos: nextGridPos };
        }
    }
}