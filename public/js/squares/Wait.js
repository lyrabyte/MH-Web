import * as THREE from 'three';

export class Wait {

    static blockType = 'wait';
    static fallbackColor = 0xd08770; 
    static label = 'Wait';
    static texturePath = '/textures/wait.png'; 
    static defaultWaitTicks = 20; 
    static tickDurationMs = 50; 

    static textureLoader = new THREE.TextureLoader();
    static blockTexture = null; static textureLoaded = false; static textureLoadFailed = false;
    static loadTexture() { if (this.textureLoaded || this.textureLoadFailed) return; this.textureLoaded = true; try { this.blockTexture = this.textureLoader.load(this.texturePath, (t)=>{ t.colorSpace=THREE.SRGBColorSpace; t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter; this.textureLoadFailed=false; }, undefined, (e)=>{ console.error(`${this.label}: Tex load fail "${this.texturePath}".`, e); this.blockTexture=null; this.textureLoadFailed=true; }); } catch (err) { console.error(`${this.label}: Tex setup fail.`, err); this.blockTexture=null; this.textureLoadFailed=true; } }

    static createPreviewMesh() { return new THREE.Mesh( new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: this.fallbackColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }) ); }

    static createSidebarElement() { const el=document.createElement('div'); el.className=`sidebar-item ${this.blockType}`; const img=document.createElement('img'); img.src=this.texturePath; img.alt=this.label; img.style.imageRendering='pixelated'; el.appendChild(img); return el; }

    static createInstance(position) {
        const group = new THREE.Group();
        const useTexture = this.blockTexture && !this.textureLoadFailed;
        const material = new THREE.MeshStandardMaterial({ color:useTexture?0xffffff:this.fallbackColor, map:useTexture?this.blockTexture:null, roughness:0.8, metalness:0.1, transparent:!useTexture, alphaTest:useTexture?0.1:0, side:THREE.DoubleSide });
        const square = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material );
        group.add(square);

        group.userData = {
            blockType: this.blockType,
            waitTicks: this.defaultWaitTicks 
        };
        group.position.copy(position);
        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = '';
        const currentTicks = blockGroup.userData.waitTicks || this.defaultWaitTicks;
        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = `${this.label} (${currentTicks} ticks)`;
        menuElement.appendChild(title);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'menu-item input-item';
        const label = document.createElement('label');
        label.htmlFor = 'wait-ticks-input'; label.textContent = 'Ticks: ';
        const input = document.createElement('input');
        input.type = 'number'; input.id = 'wait-ticks-input'; input.className = 'menu-input';
        input.value = currentTicks; input.min = "1"; input.step = "1";

        input.addEventListener('change', (event) => {
            let value = parseInt(event.target.value, 10);
            if (isNaN(value) || value < 1) { value = 1; event.target.value = value; }
            blockGroup.userData.waitTicks = value;
            title.textContent = `${this.label} (${value} ticks)`;
            console.log(`Wait ticks set: ${value}`);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { input.blur(); menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true })); }
        });

        inputContainer.appendChild(label); inputContainer.appendChild(input); menuElement.appendChild(inputContainer);

        const separator = document.createElement('div'); separator.className = 'menu-separator'; menuElement.appendChild(separator);
        const deleteItem = document.createElement('div'); deleteItem.className = 'menu-item delete-item';
        deleteItem.innerHTML = `<span class="icon" style="color: var(--nord11);">🗑️</span> Delete Block`;
        deleteItem.addEventListener('click', () => {
            menuElement.dispatchEvent(new CustomEvent('deleteblock', { detail: { blockGroup: blockGroup }, bubbles: true }));
        });
        menuElement.appendChild(deleteItem);
        requestAnimationFrame(() => input.focus());
    }

    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry) {
        const waitTicks = blockInstance.userData?.waitTicks || this.defaultWaitTicks;
        const durationMs = waitTicks * this.tickDurationMs;
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;

        let nextGridPosAfterPause = null;
        let incomingDirection = null;

        if (previousGridPos && currentGridPos) {
            incomingDirection = {
                x: Math.round(currentGridPos.x - previousGridPos.x), 
                y: Math.round(currentGridPos.y - previousGridPos.y)
            };

            if ( (Math.abs(incomingDirection.x) === 1 && incomingDirection.y === 0) ||
                 (Math.abs(incomingDirection.y) === 1 && incomingDirection.x === 0) )
            {

                 nextGridPosAfterPause = {
                      x: currentGridPos.x + incomingDirection.x,
                      y: currentGridPos.y + incomingDirection.y
                 };
                 console.log(`Wait at ${currentGridKey}: Detected incoming dir ${JSON.stringify(incomingDirection)}. Pausing for ${durationMs}ms. Will target ${JSON.stringify(nextGridPosAfterPause)}.`);

            } else {
                 console.warn(`Wait at ${currentGridKey}: Could not determine valid incoming direction from prev=${JSON.stringify(previousGridPos)} to curr=${JSON.stringify(currentGridPos)}. Diff: ${JSON.stringify(incomingDirection)}`);
                 incomingDirection = null; 
            }
        } else {

            console.warn(`Wait at ${currentGridKey}: No previous position available. Cannot determine direction.`);
        }

        if (!nextGridPosAfterPause) {
            console.log(`Wait at ${currentGridKey}: Pausing for ${durationMs}ms, but cannot determine continuation path. Cursor will fizzle.`);

            return {
                action: 'pause',
                nextGridPos: null, 
                pauseDuration: durationMs,
            };
        } else {

             return {
                 action: 'pause',
                 nextGridPos: nextGridPosAfterPause,
                 pauseDuration: durationMs,
             };
        }
    }
}