import * as THREE from 'three';

export class Wire {

    static blockType = 'wire';
    static fallbackColor = 0xd8dee9; 
    static label = 'Wire';
    static texturePath = '/textures/wire.png'; 

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
        img.onerror = () => {
             console.warn(`Sidebar image failed to load for ${this.label} (${this.texturePath})`);
             el.textContent = this.label.substring(0, 1);
             el.style.textAlign = 'center'; el.style.lineHeight = '30px';
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
            roughness: 0.85, 
            metalness: 0.05,
            transparent: !useTexture || (useTexture && this.blockTexture?.format === THREE.RGBAFormat),
            alphaTest: useTexture ? 0.1 : 0,
            side: THREE.DoubleSide
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

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = this.label; 
        menuElement.appendChild(title);

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
     * Tells the cursor to continue moving in the same direction it entered from.
     * @param {THREE.Group} blockInstance The specific instance of the block.
     * @param {{x: number, y: number}} currentGridPos The cursor's current grid position.
     * @param {{x: number, y: number}|null} previousGridPos The cursor's previous grid position.
     * @param {Map<string, THREE.Group>} blockGridMap Map of all blocks.
     * @param {import('../BlockRegistry').BlockRegistry} blockRegistry The block registry.
     * @param {import('../cursor').Cursor} cursor The cursor instance.
     * @returns {{action: string, nextGridPos?: {x: number, y: number}}}
     */
    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry, cursor) {
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;

        let nextGridPos = null;
        if (previousGridPos) {
            const dx = Math.round(currentGridPos.x - previousGridPos.x);
            const dy = Math.round(currentGridPos.y - previousGridPos.y);
            if ((Math.abs(dx) === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1)) {
                nextGridPos = {
                    x: currentGridPos.x + dx,
                    y: currentGridPos.y + dy
                };

            } else {
                console.warn(`${this.label} at ${currentGridKey}: Could not determine valid incoming direction. Prev: ${JSON.stringify(previousGridPos)}, Curr: ${JSON.stringify(currentGridPos)}. Fizzling.`);
            }
        } else {
            console.warn(`${this.label} at ${currentGridKey}: No previous position available (first step?). Fizzling.`);
        }

        if (nextGridPos) {
            return { action: 'move', nextGridPos: nextGridPos };
        } else {

            return { action: 'fizzleInPlace' };
        }
    }
}