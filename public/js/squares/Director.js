import * as THREE from 'three';

export class Director {

    static blockType = 'director';
    static fallbackColor = 0x88c0d0; 
    static label = 'Director';
    static texturePath = '/textures/piston.png'; 

    static dirs = [
      { name: 'Up',    vec: new THREE.Vector3(0, 1, 0),  icon: '↑', rotation: 0 },
      { name: 'Right', vec: new THREE.Vector3(1, 0, 0),  icon: '→', rotation: -Math.PI / 2 },
      { name: 'Down',  vec: new THREE.Vector3(0, -1, 0), icon: '↓', rotation: Math.PI },
      { name: 'Left',  vec: new THREE.Vector3(-1, 0, 0), icon: '←', rotation: Math.PI / 2 }
    ];

    static textureLoader = new THREE.TextureLoader();
    static blockTexture = null;
    static textureLoaded = false;
    static textureLoadFailed = false;

    static loadTexture() {
        if (this.textureLoaded || this.textureLoadFailed) return; 
        this.textureLoaded = true; 

        try {

            this.blockTexture = this.textureLoader.load( this.texturePath,
                (texture) => { 
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    this.textureLoadFailed = false;

                },
                undefined, 
                (error) => { 
                    console.error(`${this.label}: Failed texture load "${this.texturePath}".`, error);
                    this.blockTexture = null;
                    this.textureLoadFailed = true;
                }
            );
        } catch (err) {
            console.error(`${this.label}: Exception during texture load setup.`, err);
            this.blockTexture = null;
            this.textureLoadFailed = true;
        }
    }

    static createPreviewMesh() {

        const useTexture = this.blockTexture && !this.textureLoadFailed;
        const material = new THREE.MeshBasicMaterial({
             color: useTexture ? 0xffffff : this.fallbackColor,
             map: useTexture ? this.blockTexture : null,
             transparent: true, 
             opacity: 0.6,      
             side: THREE.DoubleSide,
             depthWrite: false 
        });
        return new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material);
    }

    static createSidebarElement() {
        const el = document.createElement('div');
        el.className = `sidebar-item ${this.blockType}`;
        const img = document.createElement('img');
        img.src = this.texturePath;
        img.alt = this.label;
        img.style.imageRendering = 'pixelated'; 
        img.draggable = false; 

        img.onerror = () => {
             console.warn(`Sidebar image failed to load for ${this.label} (${this.texturePath})`);
             el.textContent = this.label.substring(0, 1); 
             el.style.textAlign = 'center';
             el.style.lineHeight = '30px'; 
             el.removeChild(img); 
        };
        el.appendChild(img);
        return el;
    }

    static createInstance(position) {
        const group = new THREE.Group();
        const useTexture = this.blockTexture && !this.textureLoadFailed;

        const material = new THREE.MeshStandardMaterial({
            color: useTexture ? 0xffffff : this.fallbackColor,
            map: useTexture ? this.blockTexture : null,
            roughness: 0.8, 
            metalness: 0.1,

            transparent: !useTexture || (useTexture && this.blockTexture?.format === THREE.RGBAFormat),
            alphaTest: useTexture ? 0.1 : 0, 
            side: THREE.DoubleSide 
        });
        const square = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material );
        group.add(square);

        const defaultDirIndex = 1; 
        group.rotation.z = this.dirs[defaultDirIndex].rotation;
        group.userData = {
            blockType: this.blockType,
            dirIndex: defaultDirIndex,

        };
        group.position.copy(position); 

        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = ''; 

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = 'Set Direction';
        menuElement.appendChild(title);

        const currentDirIndex = blockGroup.userData?.dirIndex;
        this.dirs.forEach((dir, index) => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            if (index === currentDirIndex) {
                item.classList.add('active-direction'); 
            }
            item.innerHTML = `<span class="icon">${dir.icon}</span> ${dir.name}`;
            item.addEventListener('click', () => {

                blockGroup.userData.dirIndex = index;
                blockGroup.rotation.z = dir.rotation; 

                menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true }));
            });
            menuElement.appendChild(item);
        });

        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        menuElement.appendChild(separator);

        const deleteItem = document.createElement('div');
        deleteItem.className = 'menu-item delete-item'; 
        deleteItem.innerHTML = `<span class="icon" style="color: var(--nord11);">🗑️</span> Delete Block`; 
        deleteItem.addEventListener('click', () => {

            menuElement.dispatchEvent(new CustomEvent('deleteblock', {
                detail: { blockGroup: blockGroup }, 
                bubbles: true 
            }));

        });
        menuElement.appendChild(deleteItem);
    }

    /**
     * Called by the Cursor's step() method when the cursor is on this block.
     * Determines the next action for the cursor.
     *
     * @param {THREE.Group} blockInstance - The specific instance of this block.
     * @param {{x: number, y: number}} currentGridPos - The grid center coords the cursor is currently at.
     * @param {{x: number, y: number} | null} previousGridPos - The grid center coords the cursor came from (null on first step).
     * @param {Map<string, THREE.Group>} blockGridMap - The map of all placed blocks.
     * @param {BlockRegistry} blockRegistry - The registry for block classes.
     * @param {Cursor} cursor - The cursor instance itself (for accessing index array, etc.).
     * @returns {{action: string, nextGridPos?: {x: number, y: number}, pauseDuration?: number}} - The action for the cursor.
     */
    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry, cursor) {
        const blockData = blockInstance.userData;
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;

        if (typeof blockData.dirIndex !== 'number' || blockData.dirIndex < 0 || blockData.dirIndex >= this.dirs.length) {
            console.error(`Director at ${currentGridKey} has invalid dirIndex (${blockData.dirIndex}). Stopping.`);

            return { action: 'fizzleInPlace' };
        }

        const directionInfo = this.dirs[blockData.dirIndex];

        if (!directionInfo || !directionInfo.vec) {
            console.error(`Invalid direction info derived for ${this.blockType} at ${currentGridKey}. Idx: ${blockData.dirIndex}. Stopping.`);
            return { action: 'fizzleInPlace' };
        }

        const directionVec = directionInfo.vec;

        const nextGridPos = {
            x: currentGridPos.x + directionVec.x,
            y: currentGridPos.y + directionVec.y
        };

        return { action: 'move', nextGridPos: nextGridPos };

    }
}