import * as THREE from 'three';

export class Wire {

    static blockType = 'wire';
    static fallbackColor = 0xd8dee9; 
    static label = 'Wire';
    static texturePath = '/textures/wire.png'; 
    static defaultWireColor = 'white';
    static lastSelectedColor = 'white'; 
    static description = 'Comes in all colors';

    static wireColors = [

        { name: 'brown', hex: 0x925100, displayName: 'Brown' },
        { name: 'red', hex: 0xB00000, displayName: 'Red' },
        { name: 'orange', hex: 0xFF9900, displayName: 'Orange' },
        { name: 'yellow', hex: 0xFFFF00, displayName: 'Yellow' },

        { name: 'lime', hex: 0x7FFF00, displayName: 'Lime' },
        { name: 'green', hex: 0x00A800, displayName: 'Green' },
        { name: 'cyan', hex: 0x00FFFF, displayName: 'Cyan' },
        { name: 'lightblue', hex: 0x99CCFF, displayName: 'Light Blue' },

        { name: 'blue', hex: 0x0000FF, displayName: 'Blue' },
        { name: 'purple', hex: 0xA020F0, displayName: 'Purple' },
        { name: 'magenta', hex: 0xFF00FF, displayName: 'Magenta' },
        { name: 'pink', hex: 0xFFACDD, displayName: 'Pink' }
    ];

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

        const color = this.getColorByName(this.lastSelectedColor)?.hex || this.fallbackColor;

        return new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ 
                color: color, 
                transparent: true, 
                opacity: 0.6, 
                side: THREE.DoubleSide, 
                depthWrite: false 
            })
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

        el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.showColorPickerUI(event.clientX, event.clientY);
        });

        return el;
    }

    static createInstance(position) {
        const group = new THREE.Group();
        const useTexture = this.blockTexture && !this.textureLoadFailed;

        const selectedColor = this.getColorByName(this.lastSelectedColor);
        const colorHex = selectedColor ? selectedColor.hex : 0xFFFFFF;

        const material = new THREE.MeshStandardMaterial({
            color: colorHex,
            map: useTexture ? this.blockTexture : null,
            roughness: 0.85, 
            metalness: 0.05,
            transparent: !useTexture || (useTexture && this.blockTexture?.format === THREE.RGBAFormat),
            alphaTest: useTexture ? 0.1 : 0,
            side: THREE.DoubleSide
        });
        const square = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        group.add(square);

        group.userData = {
            blockType: this.blockType,
            wireColor: this.lastSelectedColor 
        };
        group.position.copy(position);
        return group;
    }

    static getColorByName(colorName) {
        return this.wireColors.find(c => c.name === colorName) || 
               this.wireColors.find(c => c.name === 'white') || 
               { name: 'white', hex: 0xFFFFFF, displayName: 'White' };
    }

    static showColorPickerUI(x, y) {

        const colorPicker = document.createElement('div');
        colorPicker.className = 'wire-color-picker-floating';
        colorPicker.style.position = 'fixed';
        colorPicker.style.left = `${x}px`;
        colorPicker.style.top = `${y}px`;
        colorPicker.style.zIndex = '1000';
        colorPicker.style.background = '#2E3440';
        colorPicker.style.border = '1px solid #4C566A';
        colorPicker.style.borderRadius = '4px';
        colorPicker.style.padding = '8px';
        colorPicker.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.4)';

        const title = document.createElement('div');
        title.textContent = 'Wire Color';
        title.style.marginBottom = '8px';
        title.style.fontWeight = 'bold';
        title.style.color = '#ECEFF4';
        colorPicker.appendChild(title);

        const colorGrid = document.createElement('div');
        colorGrid.style.display = 'grid';
        colorGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        colorGrid.style.gap = '4px';
        colorGrid.style.maxWidth = '200px';

        this.wireColors.forEach(color => {
            const colorBlock = document.createElement('div');
            colorBlock.style.width = '32px';
            colorBlock.style.height = '32px';
            colorBlock.style.backgroundColor = `#${color.hex.toString(16).padStart(6, '0')}`;
            colorBlock.style.border = this.lastSelectedColor === color.name ? '2px solid white' : '2px solid #555';
            colorBlock.style.borderRadius = '2px';
            colorBlock.style.cursor = 'pointer';
            colorBlock.style.boxSizing = 'border-box';
            colorBlock.title = color.displayName;

            colorBlock.addEventListener('mouseenter', () => {
                colorBlock.style.boxShadow = '0 0 0 1px white';
            });

            colorBlock.addEventListener('mouseleave', () => {
                colorBlock.style.boxShadow = 'none';
            });

            colorBlock.addEventListener('click', () => {
                this.lastSelectedColor = color.name;
                document.body.removeChild(colorPicker);
            });

            colorGrid.appendChild(colorBlock);
        });

        colorPicker.appendChild(colorGrid);

        function handleClickOutside(e) {
            if (!colorPicker.contains(e.target)) {
                document.body.removeChild(colorPicker);
                document.removeEventListener('click', handleClickOutside);
            }
        }

        document.body.appendChild(colorPicker);

        const rect = colorPicker.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            colorPicker.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            colorPicker.style.top = `${window.innerHeight - rect.height - 10}px`;
        }

        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = ''; 

        const currentColor = blockGroup.userData.wireColor || 'white';

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = 'Wire Color';
        menuElement.appendChild(title);

        const colorGrid = document.createElement('div');
        colorGrid.className = 'wire-color-grid';
        colorGrid.style.display = 'grid';
        colorGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        colorGrid.style.gap = '4px';
        colorGrid.style.margin = '8px 4px';
        colorGrid.style.maxWidth = '200px';

        this.wireColors.forEach(color => {
            const colorBlock = document.createElement('div');
            colorBlock.className = 'wire-color-item';
            colorBlock.style.width = '32px';
            colorBlock.style.height = '32px';
            colorBlock.style.backgroundColor = `#${color.hex.toString(16).padStart(6, '0')}`;
            colorBlock.style.border = currentColor === color.name ? '2px solid white' : '2px solid #555';
            colorBlock.style.borderRadius = '2px';
            colorBlock.style.cursor = 'pointer';
            colorBlock.style.position = 'relative';
            colorBlock.style.boxSizing = 'border-box';
            colorBlock.title = color.displayName;

            colorBlock.addEventListener('mouseenter', () => {
                colorBlock.style.boxShadow = '0 0 0 1px white';
            });

            colorBlock.addEventListener('mouseleave', () => {
                colorBlock.style.boxShadow = 'none';
            });

            colorBlock.addEventListener('click', () => {

                blockGroup.userData.wireColor = color.name;

                this.lastSelectedColor = color.name;

                blockGroup.children.forEach(child => {
                    if (child instanceof THREE.Mesh && child.material) {
                        child.material.color.setHex(color.hex);
                        child.material.needsUpdate = true;
                    }
                });

                colorGrid.querySelectorAll('.wire-color-item').forEach(el => {
                    el.style.border = '2px solid #555';
                });
                colorBlock.style.border = '2px solid white';

                menuElement.dispatchEvent(new CustomEvent('closemenu', { bubbles: true }));
            });

            colorGrid.appendChild(colorBlock);
        });

        menuElement.appendChild(colorGrid);

        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        menuElement.appendChild(separator);

        const deleteItem = document.createElement('div');
        deleteItem.className = 'menu-item delete-item';
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
            menuElement.dispatchEvent(new CustomEvent('deleteblock', {
                detail: { blockGroup: blockGroup },
                bubbles: true
            }));
        });
        menuElement.appendChild(deleteItem);
    }

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