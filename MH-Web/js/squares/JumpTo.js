import * as THREE from 'three';

export class JumpTo {

    static blockType = 'jumpTo';
    static fallbackColor = 0xb48ead; 
    static label = 'Jump To Index';
    static texturePath = '/textures/JumpTo.png'; 
    static defaultJumpIndex = 0; 
    static defaultIsClamped = true; 
    static description = 'Goes to a specific index and expands the buffer if needed';
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
        img.draggable = false;
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
        const material = new THREE.MeshStandardMaterial({ color: useTexture ? 0xffffff : this.fallbackColor, map: useTexture ? this.blockTexture : null, roughness: 0.8, metalness: 0.1, transparent: !useTexture || (useTexture && this.blockTexture?.format === THREE.RGBAFormat), alphaTest: useTexture ? 0.1 : 0, side: THREE.DoubleSide });
        const square = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material );
        group.add(square);

        group.userData = {
            blockType: this.blockType,
            jumpIndex: this.defaultJumpIndex,
            isClamped: this.defaultIsClamped
        };
        group.position.copy(position);
        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = '';
        const currentJumpIndex = blockGroup.userData.jumpIndex ?? this.defaultJumpIndex;
        const currentIsClamped = blockGroup.userData.isClamped ?? this.defaultIsClamped; 

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = `${this.label} (${currentJumpIndex})`;
        menuElement.appendChild(title);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'menu-item input-item';
        const indexLabel = document.createElement('label');
        indexLabel.htmlFor = 'jump-index-input'; indexLabel.textContent = 'Index: '; indexLabel.style.marginRight = '5px';
        const indexInput = document.createElement('input');
        indexInput.type = 'number'; indexInput.id = 'jump-index-input'; indexInput.className = 'menu-input';
        indexInput.value = currentJumpIndex;
        indexInput.min = "0";
        indexInput.step = "1"; indexInput.style.width = "50px";
        if (currentIsClamped) {
            indexInput.max = "255";
        }

        indexInput.addEventListener('change', (event) => {
            let value = parseInt(event.target.value, 10);
            const isClamped = blockGroup.userData.isClamped ?? this.defaultIsClamped;

            if (isNaN(value)) { value = 0; }
            value = Math.max(0, value); 

            if (isClamped) {
                value = Math.min(255, value);
            }
            event.target.value = value; 

            blockGroup.userData.jumpIndex = value;
            title.textContent = `${this.label} (${value})`;
            console.log(`Jump target index set to: ${value}`);
        });
        indexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                indexInput.blur(); indexInput.dispatchEvent(new Event('change'));
                menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true }));
            }
        });

        inputContainer.appendChild(indexLabel); inputContainer.appendChild(indexInput); menuElement.appendChild(inputContainer);

        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'menu-item toggle-item';

        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = 'jump-clamp-toggle';

        const toggleText = document.createElement('span');
        toggleText.textContent = "Clamp (0-255):";
        toggleText.className = 'toggle-label-text';

        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.id = 'jump-clamp-toggle';
        toggleCheckbox.className = 'toggle-switch';
        toggleCheckbox.checked = currentIsClamped; 

        const toggleVisual = document.createElement('span');
        toggleVisual.className = 'toggle-switch-visual';
        toggleVisual.setAttribute('aria-hidden', 'true');

        toggleCheckbox.addEventListener('change', (event) => {
            const isNowClamped = event.target.checked;
            blockGroup.userData.isClamped = isNowClamped;
            console.log(`Jump clamping set to: ${isNowClamped}`);

            if (isNowClamped) {
                indexInput.setAttribute('max', '255');
                let currentValue = parseInt(indexInput.value, 10);
                if (!isNaN(currentValue) && currentValue > 255) {
                    indexInput.value = 255;
                    indexInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                indexInput.removeAttribute('max');
            }
        });

        toggleLabel.appendChild(toggleText);
        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleVisual);
        toggleContainer.appendChild(toggleLabel);
        menuElement.appendChild(toggleContainer);

        const separator = document.createElement('div'); separator.className = 'menu-separator'; menuElement.appendChild(separator);

        const deleteItem = document.createElement('div'); deleteItem.className = 'menu-item delete-item';
        deleteItem.innerHTML = `
  <span class="icon" style="color: var(--nord11);">
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 24 24"
         width="16" height="16"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  </span>
  Delete Block
`;
        deleteItem.addEventListener('click', () => {
            menuElement.dispatchEvent(new CustomEvent('deleteblock', { detail: { blockGroup: blockGroup }, bubbles: true }));
        });
        menuElement.appendChild(deleteItem);

        requestAnimationFrame(() => indexInput.focus());
    }

    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry, cursor) {
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;
        const targetIndexRaw = blockInstance.userData?.jumpIndex ?? this.defaultJumpIndex;
        const isClamped = blockInstance.userData?.isClamped ?? this.defaultIsClamped; 

        let validatedTargetIndex = Math.floor(targetIndexRaw);
        validatedTargetIndex = Math.max(0, validatedTargetIndex);

        if (isClamped) {
            validatedTargetIndex = Math.min(255, validatedTargetIndex);
        }

        const oldPointer = cursor.indexPointer;
        cursor.indexPointer = validatedTargetIndex;
        cursor._ensureIndexCapacity(cursor.indexPointer);

        console.log(`${this.label} at ${currentGridKey}: Jumping index pointer to ${cursor.indexPointer} (from ${targetIndexRaw}, clamped: ${isClamped}). Old: ${oldPointer}`);

        let nextGridPos = null;
        if (previousGridPos) {
            const dx = Math.round(currentGridPos.x - previousGridPos.x);
            const dy = Math.round(currentGridPos.y - previousGridPos.y);
            if ((Math.abs(dx) === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1)) {
                nextGridPos = { x: currentGridPos.x + dx, y: currentGridPos.y + dy };
            } else {
                console.warn(`${this.label} at ${currentGridKey}: Could not determine valid incoming direction. Fizzling.`);
            }
        } else {
            console.warn(`${this.label} at ${currentGridKey}: No previous position available. Fizzling.`);
        }

        if (nextGridPos) {
            return { action: 'move', nextGridPos: nextGridPos };
        } else {
            return { action: 'fizzleInPlace' };
        }
    }
}