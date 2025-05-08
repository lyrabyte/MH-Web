import * as THREE from 'three';

export class Decrease {

    static blockType = 'decrease';
    static fallbackColor = 0xbf616a; 
    static label = 'Decrease';
    static texturePath = '/textures/decrease.png'; 
    static defaultDecrementAmount = 1; 
    static description = 'Decreases the value at the current index';
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
                    console.error(`${this.label}: Failed texture load "${this.texturePath}". Using fallback color.`, error);
                    this.blockTexture = null; this.textureLoadFailed = true;
                }
            );
        } catch (err) {
            console.error(`${this.label}: Error setting up texture load. Using fallback color.`, err);
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
            roughness: 0.8, metalness: 0.1,
            transparent: !useTexture || (useTexture && this.blockTexture?.format === THREE.RGBAFormat),
            alphaTest: useTexture ? 0.1 : 0,
            side: THREE.DoubleSide
        });
        const square = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), material );
        group.add(square);

        group.userData = {
            blockType: this.blockType,
            decrementAmount: this.defaultDecrementAmount 
        };
        group.position.copy(position);
        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = '';
        const currentAmount = blockGroup.userData.decrementAmount ?? this.defaultDecrementAmount;

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = `${this.label} (-${currentAmount})`; 
        menuElement.appendChild(title);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'menu-item input-item';
        const label = document.createElement('label');
        label.htmlFor = 'decrement-amount-input'; label.textContent = 'Amount: '; label.style.marginRight = '5px';
        const input = document.createElement('input');
        input.type = 'number'; input.id = 'decrement-amount-input'; input.className = 'menu-input';
        input.value = currentAmount; input.min = "1"; input.step = "1"; input.style.width = "50px";

        input.addEventListener('change', (event) => {
            let value = parseInt(event.target.value, 10);
            if (isNaN(value) || value < 1) { value = 1; event.target.value = value; }
            blockGroup.userData.decrementAmount = value;
            title.textContent = `${this.label} (-${value})`;
            console.log(`Decrement amount set to: ${value}`);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur(); input.dispatchEvent(new Event('change'));
                menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true }));
            }
        });

        inputContainer.appendChild(label); inputContainer.appendChild(input); menuElement.appendChild(inputContainer);

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

        requestAnimationFrame(() => input.focus());
    }

    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry, cursor) {
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;
        const decrementAmount = blockInstance.userData?.decrementAmount ?? this.defaultDecrementAmount;

        const currentValue = cursor.getCurrentIndexValue(); 

        const newValue = (currentValue - decrementAmount + 256) % 256;

        cursor.setCurrentIndexValue(newValue); 
        console.log(`${this.label} at ${currentGridKey}: Decrementing index by ${decrementAmount}. Old: ${currentValue}, New: ${newValue}`);

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