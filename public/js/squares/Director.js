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
        const title = document.createElement('div'); title.className = 'menu-title'; title.textContent = 'Set Direction'; menuElement.appendChild(title);
        const currentDirIndex = blockGroup.userData?.dirIndex;
        this.dirs.forEach((dir, index) => {
            const item = document.createElement('div'); item.className = 'menu-item';
            if (index === currentDirIndex) { item.classList.add('active-direction'); }
            item.innerHTML = `<span class="icon">${dir.icon}</span> ${dir.name}`;
            item.addEventListener('click', () => {
                blockGroup.userData.dirIndex = index; blockGroup.rotation.z = dir.rotation;
                menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true }));
            });
            menuElement.appendChild(item);
        });
        const separator = document.createElement('div'); separator.className = 'menu-separator'; menuElement.appendChild(separator);
        const deleteItem = document.createElement('div'); deleteItem.className = 'menu-item delete-item';
        deleteItem.innerHTML = `<span class="icon" style="color: var(--nord11);">🗑️</span> Delete Block`;
        deleteItem.addEventListener('click', () => {
            menuElement.dispatchEvent(new CustomEvent('deleteblock', { detail: { blockGroup: blockGroup }, bubbles: true }));
        });
        menuElement.appendChild(deleteItem);
    }

    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry) {
        const blockData = blockInstance.userData;
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;

        if (typeof blockData.dirIndex !== 'number') {
            console.error(`Director at ${currentGridKey} missing dirIndex. Stopping.`);
            return { action: 'fizzleInPlace', nextGridPos: null };
        }
        const directionInfo = this.dirs[blockData.dirIndex];
        if (!directionInfo || !directionInfo.vec) {
            console.error(`Invalid dir info for ${this.blockType} at ${currentGridKey}. Idx: ${blockData.dirIndex}. Stopping.`);
            return { action: 'fizzleInPlace', nextGridPos: null };
        }

        const directionVec = directionInfo.vec;
        const nextGridPos = { x: currentGridPos.x + directionVec.x, y: currentGridPos.y + directionVec.y };

        const getGridKey = (pos) => {
            if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || isNaN(pos.x) || isNaN(pos.y)) return null;

            return `${Math.round(pos.x - 0.5)},${Math.round(pos.y - 0.5)}`;
        };

        const nextBlockKey = getGridKey(nextGridPos);
        if (nextBlockKey === null) {
             console.warn(`Director calculated invalid next pos: ${JSON.stringify(nextGridPos)}`);

             return { action: 'moveAndFizzle', nextGridPos: nextGridPos };
        }

        const nextBlockExists = blockGridMap.has(nextBlockKey);
        if (nextBlockExists) {

            return { action: 'move', nextGridPos: nextGridPos };
        } else {

             console.log(`Director: No block at next key [${nextBlockKey}] (from dir ${directionInfo.name}). Fizzling.`);
             return { action: 'moveAndFizzle', nextGridPos: nextGridPos };
        }
    }
}