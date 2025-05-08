import * as THREE from 'three';

export class ReturnCheckpoint {
    static blockType = 'returncheckpoint';
    static fallbackColor = 0x5e81ac; 
    static label = 'Return to Checkpoint';
    static texturePath = '/textures/returncheckpoint.png';
    static category = 'flow';
    static description = 'Returns back to the most recent checkpoint or selected checkpoint';
    static placedBlocksMap = null; 
    static lastVisitedCheckpoint = null; 

    static textureLoader = new THREE.TextureLoader();
    static blockTexture = null;
    static textureLoaded = false;
    static textureLoadFailed = false;

    static setBlocksMap(blocksMap) {
        this.placedBlocksMap = blocksMap;
    }

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
        return new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
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
        const square = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        group.add(square);

        group.userData = {
            blockType: this.blockType,
            targetCheckpoint: '' 
        };
        group.position.copy(position);
        return group;
    }

    static populateContextMenu(menuElement, blockGroup) {
        menuElement.innerHTML = '';

        const currentTarget = blockGroup.userData.targetCheckpoint || '';

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = currentTarget 
            ? `${this.label} (→ ${currentTarget})` 
            : `${this.label} (auto)`;
        menuElement.appendChild(title);

        const checkpoints = this.findAllCheckpoints();

        const selectContainer = document.createElement('div');
        selectContainer.className = 'menu-item input-item';

        const label = document.createElement('label');
        label.htmlFor = 'target-checkpoint-select';
        label.textContent = 'Target: ';
        label.style.marginRight = '5px';

        const select = document.createElement('select');
        select.id = 'target-checkpoint-select';
        select.className = 'menu-input';
        select.style.width = "120px";

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- Auto (last visited) --';
        select.appendChild(emptyOption);

        checkpoints.forEach(cp => {
            const option = document.createElement('option');
            option.value = cp.name;
            option.textContent = cp.name;
            if (cp.name === currentTarget) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (event) => {
            const value = event.target.value;
            blockGroup.userData.targetCheckpoint = value;
            title.textContent = value 
                ? `${this.label} (→ ${value})` 
                : `${this.label} (auto)`;
            console.log(`Target checkpoint set to: ${value || 'auto (last visited)'}`);
        });

        selectContainer.appendChild(label);
        selectContainer.appendChild(select);
        menuElement.appendChild(selectContainer);

        if (checkpoints.length === 0) {
            const noCheckpointsMsg = document.createElement('div');
            noCheckpointsMsg.className = 'menu-item';
            noCheckpointsMsg.textContent = 'No checkpoints available';
            noCheckpointsMsg.style.color = 'var(--nord11)';
            noCheckpointsMsg.style.fontStyle = 'italic';
            menuElement.appendChild(noCheckpointsMsg);
        }

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

        requestAnimationFrame(() => select.focus());
    }

    static onCursorStep(blockInstance, currentGridPos, previousGridPos, blockGridMap, blockRegistry, cursor) {
        const currentGridKey = `${Math.round(currentGridPos.x - 0.5)},${Math.round(currentGridPos.y - 0.5)}`;
        let targetCheckpointName = blockInstance.userData?.targetCheckpoint;
        let targetCheckpoint = null;

        if (!targetCheckpointName && this.lastVisitedCheckpoint) {
            console.log(`${this.label} at ${currentGridKey}: No target set, using last visited checkpoint "${this.lastVisitedCheckpoint.name}"`);
            targetCheckpointName = this.lastVisitedCheckpoint.name;

            targetCheckpoint = this.findCheckpointByName(targetCheckpointName, blockGridMap);

            if (!targetCheckpoint && this.lastVisitedCheckpoint.position) {
                console.log(`${this.label}: Using stored position for checkpoint "${targetCheckpointName}"`);

                targetCheckpoint = {
                    position: this.lastVisitedCheckpoint.position,
                    userData: {
                        blockType: 'checkpoint',
                        checkpointName: this.lastVisitedCheckpoint.name
                    }
                };
            }
        } else if (targetCheckpointName) {

            targetCheckpoint = this.findCheckpointByName(targetCheckpointName, blockGridMap);
        }

        if (!targetCheckpoint) {
            console.warn(`${this.label} at ${currentGridKey}: Target checkpoint "${targetCheckpointName}" not found. Continuing in same direction.`);

            let nextGridPos = null;
            if (previousGridPos) {
                const dx = Math.round(currentGridPos.x - previousGridPos.x);
                const dy = Math.round(currentGridPos.y - previousGridPos.y);
                if ((Math.abs(dx) === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1)) {
                    nextGridPos = {
                        x: currentGridPos.x + dx,
                        y: currentGridPos.y + dy
                    };
                }
            }

            if (nextGridPos) {
                return { action: 'move', nextGridPos: nextGridPos };
            } else {
                return { action: 'fizzleInPlace' };
            }
        }

        let dx = 0, dy = 0;
        if (previousGridPos) {
            dx = Math.round(currentGridPos.x - previousGridPos.x);
            dy = Math.round(currentGridPos.y - previousGridPos.y);
        }

        const hasValidDirection = (previousGridPos && 
            ((Math.abs(dx) === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1)));

        const checkpointWorldX = targetCheckpoint.position.x;
        const checkpointWorldY = targetCheckpoint.position.y;

        const checkpointGridPos = {
            x: checkpointWorldX - 0.5,
            y: checkpointWorldY - 0.5
        };

        const nextGridPos = hasValidDirection ? {
            x: checkpointGridPos.x + dx,
            y: checkpointGridPos.y + dy
        } : {
            x: checkpointGridPos.x,
            y: checkpointGridPos.y
        };

        const teleportPos = {
            x: checkpointWorldX,
            y: checkpointWorldY
        };

        console.log(`${this.label} at ${currentGridKey}: Teleporting to checkpoint "${targetCheckpointName}" at pos ${JSON.stringify(teleportPos)}, next pos ${JSON.stringify(nextGridPos)}`);

        return { 
            action: 'teleport',
            teleportPos: teleportPos,
            nextGridPos: nextGridPos
        };
    }

    static findAllCheckpoints() {
        const checkpoints = [];

        const blocksMap = this.placedBlocksMap;

        if (blocksMap) {

            blocksMap.forEach((block, key) => {
                if (block && block.userData && 
                    block.userData.blockType === 'checkpoint' &&
                    block.userData.checkpointName) {
                    checkpoints.push({
                        name: block.userData.checkpointName,
                        position: block.position
                    });
                }
            });
        } else {
            console.warn(`${this.label}: No blocks map available to find checkpoints`);
        }

        return checkpoints;
    }

    static findCheckpointByName(name, blockGridMap) {

        if (blockGridMap) {
            let foundCheckpoint = null;

            blockGridMap.forEach((block, key) => {
                if (block && block.userData && 
                    block.userData.blockType === 'checkpoint' &&
                    block.userData.checkpointName === name) {
                    foundCheckpoint = block;
                }
            });

            if (foundCheckpoint) return foundCheckpoint;
        }

        if (this.placedBlocksMap) {
            let foundCheckpoint = null;

            this.placedBlocksMap.forEach((block, key) => {
                if (block && block.userData && 
                    block.userData.blockType === 'checkpoint' &&
                    block.userData.checkpointName === name) {
                    foundCheckpoint = block;
                }
            });

            return foundCheckpoint;
        }

        return null;
    }

    static setLastVisitedCheckpoint(checkpoint) {
        this.lastVisitedCheckpoint = checkpoint;
        console.log(`Last visited checkpoint set to: ${checkpoint.name}`);
    }
}