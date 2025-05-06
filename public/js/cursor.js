import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.min.js';

const PARTICLE_COUNT = 350;
const PARTICLE_TARGET_PIXEL_SIZE = 5.0;

const CURSOR_BASE_COLOR = new THREE.Color(0x75ffb1); 

const COLOR_VARIATION_RANGE = 0.15; 
const PARTICLE_LIFETIME_MIN = 0.8;
const PARTICLE_LIFETIME_MAX = 1.8;
const PARTICLE_OUTWARD_VELOCITY = 0.15;
const PARTICLE_UPWARD_VELOCITY = 0.2;
const GRAVITY = 0.0;
const MOVE_DURATION_MS = 25;
const FIZZLE_DURATION_MS = 350;
const HOP_HEIGHT = 0.25;
const PULSE_SCALE = 1.25;

const vertexShader = `
  uniform float uTargetPixelSize;
  uniform float uZoomScale;
  uniform float uFizzleFactor; 
  attribute float size;
  attribute vec2 life; 

  attribute vec3 colorOffset;

  varying float vLifetimeRatio;
  varying float vAge;

  varying vec3 vColorOffset;

  void main() {
    vLifetimeRatio = life.x / life.y;
    vAge = life.x;

    vColorOffset = colorOffset;

    float sf = 1.0 - vLifetimeRatio;

    float fizzleScale = 1.0 - uFizzleFactor;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uTargetPixelSize * uZoomScale * size * sf * fizzleScale;
    gl_PointSize = max(0.0, gl_PointSize); 
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = `
  uniform vec3 uBaseColor; 
  uniform sampler2D uTexture;
  uniform float uFizzleFactor; 
  varying float vLifetimeRatio;

  varying vec3 vColorOffset;

  void main() {

    float fade = 1.0 - pow(vLifetimeRatio, 1.5);

    fade *= (1.0 - pow(uFizzleFactor, 1.5));

    vec4 texColor = texture2D(uTexture, gl_PointCoord);

    vec3 finalColor = uBaseColor + vColorOffset;

    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, fade * texColor.a);

    if (gl_FragColor.a < 0.01) discard;
  }
`;

export class Cursor {

    scene; blockGridMap; blockRegistry; gridPos; worldPos;
    previousGridPos = null;
    particleGeometry = null; particleMaterial = null; points = null;
    currentBlock = null;
    currentBlockClass = null;
    isMoving = false;
    isStopped = false;
    isActive = false;
    _moveTween = null;
    _fizzleTween = null;
    isPaused = false;
    pauseEndTime = 0;
    nextPosAfterPause = null;

    indexArray = new Uint8Array(1);
    indexPointer = 0;

    audioListener = null;
    audioLoader = null;
    clickSoundBuffer = null;
    fizzleSoundBuffer = null;

    constructor(scene, blockGridMap, blockRegistry, listener, initialGridPos = { x: 0.5, y: 0.5 }) {
        this.scene = scene;
        this.blockGridMap = blockGridMap;
        this.blockRegistry = blockRegistry;
        this.gridPos = {
            x: Math.round(initialGridPos.x - 0.5),
            y: Math.round(initialGridPos.y - 0.5)
        };
        this.previousGridPos = null;
        this.worldPos = new THREE.Vector3(this.gridPos.x + 0.5, this.gridPos.y + 0.5, 0.1);
        this._resetIndexArray();

        this.audioListener = listener;
        if (this.audioListener) {
            this.audioLoader = new THREE.AudioLoader();
            this._loadSounds();
        } else {
            console.warn("AudioListener not provided to Cursor, sounds disabled.");
        }

        this._createParticleSystem(); 
        if (this.points) {
            this.points.position.copy(this.worldPos);
            this.scene.add(this.points);
        }
        else { console.error("Cursor particle system failed to initialize."); }

        this.isPaused = false;
        this.pauseEndTime = 0;
        this.nextPosAfterPause = null;

        this._updateCurrentBlock();
        console.log("Cursor initialized.");
    }

    _loadSounds() {
        if (!this.audioLoader) return;
        const clickPath = '/sounds/click.wav';
        const fizzlePath = '/sounds/Booffff.wav';

        this.audioLoader.load(clickPath,
            (buffer) => { this.clickSoundBuffer = buffer; console.log(`Sound loaded: ${clickPath}`); },
            undefined,
            (error) => { console.error(`Error loading sound ${clickPath}:`, error); }
        );
        this.audioLoader.load(fizzlePath,
            (buffer) => { this.fizzleSoundBuffer = buffer; console.log(`Sound loaded: ${fizzlePath}`); },
            undefined,
            (error) => { console.error(`Error loading sound ${fizzlePath}:`, error); }
        );
    }

    _playSound(buffer) {
        if (!this.audioListener || !buffer) return;
        if (this.audioListener.context.state === 'suspended') {
            this.audioListener.context.resume().catch(err => console.error("Audio resume failed:", err));
        }
        if (this.audioListener.context.state === 'running') {
            const sound = new THREE.Audio(this.audioListener);
            sound.setBuffer(buffer);
            sound.setVolume(0.6);
            sound.play();
        }
    }

    _createParticleSystem() {
        try {
            this.particleGeometry = new THREE.BufferGeometry();

            const positions = new Float32Array(PARTICLE_COUNT * 3);
            const velocities = new Float32Array(PARTICLE_COUNT * 3);
            const lifetimes = new Float32Array(PARTICLE_COUNT * 2); 
            const sizes = new Float32Array(PARTICLE_COUNT);

            const colorOffsets = new Float32Array(PARTICLE_COUNT * 3);
            const halfSize = 0.5; 

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                const i2 = i * 2;

                const edge = Math.floor(Math.random() * 4);
                const t = Math.random();
                let x, y;
                switch (edge) {
                    case 0: x = THREE.MathUtils.lerp(-halfSize, halfSize, t); y = -halfSize; break;
                    case 1: x = halfSize; y = THREE.MathUtils.lerp(-halfSize, halfSize, t); break;
                    case 2: x = THREE.MathUtils.lerp(halfSize, -halfSize, t); y = halfSize; break;
                    case 3: default: x = -halfSize; y = THREE.MathUtils.lerp(halfSize, -halfSize, t); break;
                }
                positions[i3 + 0] = x;
                positions[i3 + 1] = y;
                positions[i3 + 2] = (Math.random() - 0.5) * 0.1; 

                let outwardX = x; let outwardY = y;
                const len = Math.sqrt(outwardX * outwardX + outwardY * outwardY);
                if (len > 0.01) { outwardX /= len; outwardY /= len; }
                else { outwardX = Math.random() * 2 - 1; outwardY = Math.random() * 2 - 1; const rl = Math.sqrt(outwardX*outwardX + outwardY*outwardY); if(rl > 0.01){outwardX /= rl; outwardY /= rl;} }
                velocities[i3 + 0] = outwardX * PARTICLE_OUTWARD_VELOCITY * (0.8 + Math.random() * 0.4);
                velocities[i3 + 1] = outwardY * PARTICLE_OUTWARD_VELOCITY * (0.8 + Math.random() * 0.4);
                velocities[i3 + 2] = PARTICLE_UPWARD_VELOCITY * (0.8 + Math.random() * 0.4);

                lifetimes[i2 + 0] = Math.random() * PARTICLE_LIFETIME_MAX; 
                lifetimes[i2 + 1] = THREE.MathUtils.randFloat(PARTICLE_LIFETIME_MIN, PARTICLE_LIFETIME_MAX);

                sizes[i] = Math.random() * 0.8 + 0.6;

                colorOffsets[i3 + 0] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
                colorOffsets[i3 + 1] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
                colorOffsets[i3 + 2] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
            }
            this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this.particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
            this.particleGeometry.setAttribute('life', new THREE.BufferAttribute(lifetimes, 2));
            this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            this.particleGeometry.setAttribute('colorOffset', new THREE.BufferAttribute(colorOffsets, 3));

            const textureLoader = new THREE.TextureLoader();
            let particleTexture = null;
            const texturePath = '/textures/particle.png';
            try {
                particleTexture = textureLoader.load(texturePath,
                    () => { console.log(`Particle texture loaded: ${texturePath}`); }, undefined,
                    (error) => { console.error(`Cursor particle texture load failed from ${texturePath}:`, error); }
                );
                particleTexture.magFilter = THREE.NearestFilter;
                particleTexture.minFilter = THREE.NearestFilter;
            } catch (texError) { console.error('Error initiating cursor texture load:', texError); }

            this.particleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uBaseColor: { value: CURSOR_BASE_COLOR },
                    uTexture: { value: particleTexture },
                    uTargetPixelSize: { value: PARTICLE_TARGET_PIXEL_SIZE },
                    uZoomScale: { value: 1.0 },
                    uFizzleFactor: { value: 0.0 }
                },
                vertexShader: vertexShader,     
                fragmentShader: fragmentShader, 
                blending: THREE.NormalBlending,
                depthWrite: false,
                transparent: true,
            });

            this.points = new THREE.Points(this.particleGeometry, this.particleMaterial);
            this.points.visible = false;
        } catch (error) {
            console.error("Error creating particle system:", error);
            this.particleGeometry?.dispose(); this.particleMaterial?.dispose();
            this.points = null; this.particleGeometry = null; this.particleMaterial = null;
        }
    }

    _gridToWorld(gridPos) {
        return new THREE.Vector3(gridPos.x + 0.5, gridPos.y + 0.5, 0.1);
    }

    _getGridKey(pos) {
        if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || isNaN(pos.x) || isNaN(pos.y)) { return null; }
        const gridX = Math.round(pos.x - 0.5); const gridY = Math.round(pos.y - 0.5);
        return `${gridX},${gridY}`;
    }

    _updateCurrentBlock() {
        const key = `${this.gridPos.x},${this.gridPos.y}`;
        this.currentBlock = this.blockGridMap.get(key) || null;
        if (this.currentBlock?.userData?.blockType) {
            const type = this.currentBlock.userData.blockType;
            this.currentBlockClass = this.blockRegistry.getBlockClass(type);
            if (!this.currentBlockClass) { console.warn(`Cursor: Block class not found for type "${type}" at key ${key}.`); }
        } else { this.currentBlockClass = null; }
    }

    _resetIndexArray() { this.indexArray = new Uint8Array(1); this.indexArray[0] = 0; this.indexPointer = 0; }
    _ensureIndexCapacity(index) { if (index >= this.indexArray.length) { const nc = index + 1; const na = new Uint8Array(nc); na.set(this.indexArray, 0); this.indexArray = na; } }
    getIndexValue(index) { if (index >= 0 && index < this.indexArray.length) { return this.indexArray[index]; } return 0; }
    setIndexValue(index, value) { if (index < 0) return; this._ensureIndexCapacity(index); const wv = (Math.floor(value % 256) + 256) % 256; this.indexArray[index] = wv; }
    incrementIndexPointer(amount = 1) { const ja = Math.max(1, Math.floor(amount)); this.indexPointer += ja; this._ensureIndexCapacity(this.indexPointer); }
    decrementIndexPointer(amount = 1) { const ja = Math.max(1, Math.floor(amount)); this.indexPointer -= ja; if (this.indexPointer < 0) { this.indexPointer = 0; } }
    getCurrentIndexValue() { if (this.indexPointer >= this.indexArray.length) { this._ensureIndexCapacity(this.indexPointer); } if (this.indexPointer < 0) this.indexPointer = 0; return this.indexArray[this.indexPointer]; }
    setCurrentIndexValue(value) { if (this.indexPointer >= this.indexArray.length) { this._ensureIndexCapacity(this.indexPointer); } if (this.indexPointer < 0) this.indexPointer = 0; const wv = (Math.floor(value % 256) + 256) % 256; this.indexArray[this.indexPointer] = wv; }
    getIndexDisplayData() { const ac = new Uint8Array(this.indexArray); const sp = Math.max(0, Math.min(this.indexPointer, ac.length - 1)); return { array: ac, pointer: sp }; }
    popIndex() { this.popIndices(1); }
    popIndices(count) { if (count <= 0) return; let rc = Math.max(1, Math.floor(count)); const ol = this.indexArray.length; const cp = this.indexPointer; if (ol <= 0 || (ol === 1 && rc >= 1)) { this._resetIndexArray(); return; } if (cp < 0 || cp >= ol) { console.error(`PopIndices: Invalid pointer ${cp}`); return; } let si, ei, pm; const fei = cp + rc - 1; if (fei < ol) { si = cp; ei = fei; pm = 'forward'; } else { ei = cp; si = Math.max(0, ei - rc + 1); pm = 'backward'; } const actr = ei - si + 1; if (actr <= 0) return; const nl = ol - actr; if (nl <= 0) { this._resetIndexArray(); return; } const na = new Uint8Array(nl); let wi = 0; if (si > 0) { na.set(this.indexArray.slice(0, si), wi); wi += si; } if (ei < ol - 1) { na.set(this.indexArray.slice(ei + 1), wi); } this.indexArray = na; let np; if (pm === 'backward') { np = Math.max(0, si - 1); } else { np = Math.max(0, Math.min(si, nl - 1)); } this.indexPointer = np; }

    start() { if (!this.points) return false; if (this.isActive) return true; console.log("Starting cursor simulation at grid:", this.gridPos); this.isStopped = false; this.isActive = true; this.isPaused = false; this.pauseEndTime = 0; this.nextPosAfterPause = null; if (this.particleMaterial) this.particleMaterial.uniforms.uFizzleFactor.value = 0.0; this.points.visible = true; this.points.scale.set(1, 1, 1); this.worldPos = this._gridToWorld(this.gridPos); this.points.position.copy(this.worldPos); this.previousGridPos = null; this._resetIndexArray(); this._updateCurrentBlock(); return true; }
    stop() { let wa = this.isActive; this.isActive = false; this.isMoving = false; this.isPaused = false; if (this._moveTween) { if (this._moveTween.xy) TWEEN.remove(this._moveTween.xy); if (this._moveTween.z) TWEEN.remove(this._moveTween.z); if (this._moveTween.scale) TWEEN.remove(this._moveTween.scale); this._moveTween = null; } if (this._fizzleTween) { this.isStopped = true; } else if (wa || !this.isStopped) { this._fizzle(); } else { if (this.points) this.points.visible = false; this.isStopped = true; } }
    reset(initialGridPos = { x: 0.5, y: 0.5 }) { const iIGP = { x: Math.round(initialGridPos.x - 0.5), y: Math.round(initialGridPos.y - 0.5) }; console.log("Resetting cursor to grid:", iIGP); if (!this.points) return; this.isActive = false; this.isMoving = false; this.isPaused = false; this.isStopped = true; if (this._moveTween) { if (this._moveTween.xy) TWEEN.remove(this._moveTween.xy); if (this._moveTween.z) TWEEN.remove(this._moveTween.z); if (this._moveTween.scale) TWEEN.remove(this._moveTween.scale); this._moveTween = null; } if (this._fizzleTween) { TWEEN.remove(this._fizzleTween); this._fizzleTween = null; } this.gridPos = iIGP; this.worldPos = this._gridToWorld(this.gridPos); this.previousGridPos = null; if (this.particleMaterial) this.particleMaterial.uniforms.uFizzleFactor.value = 0.0; this.points.position.copy(this.worldPos); this.points.scale.set(1, 1, 1); this.points.visible = false; this._resetIndexArray(); this._updateCurrentBlock(); }

    update(dT) {
        if (!this.points || !this.particleGeometry || !this.particleGeometry.attributes.position || this.isStopped) {
            if (this.isStopped && this.points && this.points.visible && !this._fizzleTween) { this.points.visible = false; }
            return;
        }
        if (this._fizzleTween) return;

        if (this.isActive && this.points.visible) {
            const positions = this.particleGeometry.attributes.position.array;
            const velocities = this.particleGeometry.attributes.velocity.array;
            const lifetimes = this.particleGeometry.attributes.life.array;

            const colorOffsets = this.particleGeometry.attributes.colorOffset.array;

            let positionNeedsUpdate = false;
            let lifeNeedsUpdate = false;
            let velocityNeedsUpdate = false;

            let colorOffsetNeedsUpdate = false;
            const halfSize = 0.5;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                const i2 = i * 2;

                lifetimes[i2] += dT;
                lifeNeedsUpdate = true;

                if (lifetimes[i2] >= lifetimes[i2 + 1]) {

                    lifetimes[i2] = 0;
                    const edge = Math.floor(Math.random() * 4);
                    const t = Math.random();
                    let x, y;
                    switch (edge) {
                        case 0: x = THREE.MathUtils.lerp(-halfSize, halfSize, t); y = -halfSize; break;
                        case 1: x = halfSize; y = THREE.MathUtils.lerp(-halfSize, halfSize, t); break;
                        case 2: x = THREE.MathUtils.lerp(halfSize, -halfSize, t); y = halfSize; break;
                        case 3: default: x = -halfSize; y = THREE.MathUtils.lerp(halfSize, -halfSize, t); break;
                    }
                    positions[i3 + 0] = x;
                    positions[i3 + 1] = y;
                    positions[i3 + 2] = (Math.random() - 0.5) * 0.1;
                    positionNeedsUpdate = true;

                    let outwardX = x; let outwardY = y;
                    const len = Math.sqrt(outwardX * outwardX + outwardY * outwardY);
                    if (len > 0.01) { outwardX /= len; outwardY /= len; }
                    else { outwardX = Math.random()*2-1; outwardY = Math.random()*2-1; const rl=Math.sqrt(outwardX*outwardX+outwardY*outwardY); if(rl>0.01){outwardX/=rl; outwardY/=rl;} }
                    velocities[i3 + 0] = outwardX * PARTICLE_OUTWARD_VELOCITY * (0.8 + Math.random() * 0.4);
                    velocities[i3 + 1] = outwardY * PARTICLE_OUTWARD_VELOCITY * (0.8 + Math.random() * 0.4);
                    velocities[i3 + 2] = PARTICLE_UPWARD_VELOCITY * (0.8 + Math.random() * 0.4);
                    velocityNeedsUpdate = true;

                    colorOffsets[i3 + 0] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
                    colorOffsets[i3 + 1] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
                    colorOffsets[i3 + 2] = (Math.random() * 2 - 1) * COLOR_VARIATION_RANGE;
                    colorOffsetNeedsUpdate = true; 

                } else {

                    positions[i3 + 0] += velocities[i3 + 0] * dT;
                    positions[i3 + 1] += velocities[i3 + 1] * dT;
                    positions[i3 + 2] += velocities[i3 + 2] * dT;
                    positionNeedsUpdate = true;
                }
            }

            if (positionNeedsUpdate) this.particleGeometry.attributes.position.needsUpdate = true;
            if (lifeNeedsUpdate) this.particleGeometry.attributes.life.needsUpdate = true;
            if (velocityNeedsUpdate) this.particleGeometry.attributes.velocity.needsUpdate = true;

            if (colorOffsetNeedsUpdate) this.particleGeometry.attributes.colorOffset.needsUpdate = true;
         }
    }

    step() { if (this.isPaused) { if (Date.now() >= this.pauseEndTime) { this.isPaused = false; const tPAP = this.nextPosAfterPause; this.nextPosAfterPause = null; this.pauseEndTime = 0; if (tPAP && typeof tPAP.x === 'number' && typeof tPAP.y === 'number') { this._animateMove(tPAP); return true; } return true; } else { return true; } } if (!this.isActive || this.isMoving || this.isStopped || this._fizzleTween || !this.points) { return this.isActive && this.isMoving; } this.worldPos = this._gridToWorld(this.gridPos); this.points.position.copy(this.worldPos); this._updateCurrentBlock(); const cgk = `${this.gridPos.x},${this.gridPos.y}`; if (!this.currentBlock) { console.log(`Cursor stopping: Empty square ${cgk}.`); this._fizzle(); return false; } if (!this.currentBlockClass || typeof this.currentBlockClass.onCursorStep !== 'function') { const bt = this.currentBlock?.userData?.blockType || 'Unknown'; console.log(`Cursor stopping: Invalid block '${bt}' at ${cgk}.`); this._fizzle(); return false; } let sr; try { sr = this.currentBlockClass.onCursorStep(this.currentBlock, {...this.gridPos}, this.previousGridPos ? {...this.previousGridPos} : null, this.blockGridMap, this.blockRegistry, this); } catch (be) { const bt = this.currentBlock?.userData?.blockType || 'Unknown'; console.error(`Cursor Error: Exception in onCursorStep for '${bt}' at ${cgk}. Stopping.`, be); this._fizzle(); return false; } if (!sr || typeof sr.action !== 'string') { const bt = this.currentBlock?.userData?.blockType || 'Unknown'; console.error(`Cursor Error: Invalid stepResult from '${bt}' at ${cgk}. Stopping.`, sr); this._fizzle(); return false; } let cs = true; switch (sr.action) { case 'move': if (!sr.nextGridPos || typeof sr.nextGridPos.x !== 'number' || typeof sr.nextGridPos.y !== 'number' || !Number.isInteger(sr.nextGridPos.x) || !Number.isInteger(sr.nextGridPos.y)) { console.error(`Cursor Error: Action 'move' invalid integer 'nextGridPos'. Stopping.`, sr); this._fizzle(); cs = false; } else { this._animateMove(sr.nextGridPos); } break; case 'moveAndFizzle': if (!sr.nextGridPos || typeof sr.nextGridPos.x !== 'number' || typeof sr.nextGridPos.y !== 'number' || !Number.isInteger(sr.nextGridPos.x) || !Number.isInteger(sr.nextGridPos.y)) { console.error(`Cursor Error: Action 'moveAndFizzle' invalid integer 'nextGridPos'. Stopping in place.`, sr); this._fizzle(); cs = false; } else { this._animateMoveAndFizzle(sr.nextGridPos); cs = false; } break; case 'pause': if (typeof sr.pauseDuration !== 'number' || sr.pauseDuration <= 0) { console.error(`Cursor Error: Action 'pause' invalid 'pauseDuration'. Stopping.`, sr); this._fizzle(); cs = false; } else { if (sr.nextGridPos && (typeof sr.nextGridPos.x !== 'number' || typeof sr.nextGridPos.y !== 'number' || !Number.isInteger(sr.nextGridPos.x) || !Number.isInteger(sr.nextGridPos.y))) { console.warn(`Cursor Warning: Action 'pause' invalid 'nextGridPos'. Pausing without move intent.`, sr); this.nextPosAfterPause = null; } else { this.nextPosAfterPause = sr.nextGridPos || null; } this.isPaused = true; this.pauseEndTime = Date.now() + sr.pauseDuration; } break; case 'fizzleInPlace': this._fizzle(); cs = false; break; default: console.warn(`Cursor Warning: Block at ${cgk} returned unknown action '${sr.action}'. Stopping.`); this._fizzle(); cs = false; break; } return cs; }

    _animateMove(targetGridPos) { if (this.isMoving || !this.points || this._fizzleTween) return; this.isMoving = true; const twp = this._gridToWorld(targetGridPos); if (this._moveTween) { if (this._moveTween.xy) TWEEN.remove(this._moveTween.xy); if (this._moveTween.z) TWEEN.remove(this._moveTween.z); if (this._moveTween.scale) TWEEN.remove(this._moveTween.scale); } this._moveTween = {}; const pbm = { ...this.gridPos }; this._playSound(this.clickSoundBuffer); const xye = TWEEN.Easing.Quadratic.Out; this._moveTween.xy = new TWEEN.Tween(this.points.position).to({ x: twp.x, y: twp.y }, MOVE_DURATION_MS).easing(xye).onComplete(() => { this.isMoving = false; this.previousGridPos = pbm; this.gridPos = targetGridPos; this.worldPos.copy(this.points.position); this._moveTween = null; }).start(); const ze = TWEEN.Easing.Quadratic.InOut; this._moveTween.z = new TWEEN.Tween(this.points.position).to({ z: [this.worldPos.z + HOP_HEIGHT, twp.z] }, MOVE_DURATION_MS).easing(ze).start(); const se = TWEEN.Easing.Quadratic.InOut; this._moveTween.scale = new TWEEN.Tween(this.points.scale).to({ x: [PULSE_SCALE, 1.0], y: [PULSE_SCALE, 1.0], z: [PULSE_SCALE, 1.0] }, MOVE_DURATION_MS).easing(se).start(); }
    _animateMoveAndFizzle(targetGridPos) { if (this.isMoving || !this.points || this._fizzleTween) return; this.isMoving = true; this.isStopped = true; this.isActive = false; const twp = this._gridToWorld(targetGridPos); if (this._moveTween) { if (this._moveTween.xy) TWEEN.remove(this._moveTween.xy); if (this._moveTween.z) TWEEN.remove(this._moveTween.z); if (this._moveTween.scale) TWEEN.remove(this._moveTween.scale); } this._moveTween = {}; const pbm = { ...this.gridPos }; this._playSound(this.clickSoundBuffer); const xye = TWEEN.Easing.Quadratic.Out; this._moveTween.xy = new TWEEN.Tween(this.points.position).to({ x: twp.x, y: twp.y }, MOVE_DURATION_MS).easing(xye).onComplete(() => { this.previousGridPos = pbm; this.gridPos = targetGridPos; this.worldPos.copy(this.points.position); this.currentBlock = null; this.currentBlockClass = null; this._moveTween = null; this.isMoving = false; this._fizzle(); }).start(); const ze = TWEEN.Easing.Quadratic.InOut; this._moveTween.z = new TWEEN.Tween(this.points.position).to({ z: [this.worldPos.z + HOP_HEIGHT, twp.z] }, MOVE_DURATION_MS).easing(ze).start(); const se = TWEEN.Easing.Quadratic.InOut; this._moveTween.scale = new TWEEN.Tween(this.points.scale).to({ x: [PULSE_SCALE, 1.0], y: [PULSE_SCALE, 1.0], z: [PULSE_SCALE, 1.0] }, MOVE_DURATION_MS).easing(se).start(); }
    _fizzle() { if (!this.points || !this.particleMaterial || this._fizzleTween) { if (this.isStopped && this.points && this.points.visible && !this._fizzleTween) { this.points.visible = false; } return; } this.isStopped = true; this.isActive = false; this.isMoving = false; if (this._moveTween) { if (this._moveTween.xy) TWEEN.remove(this._moveTween.xy); if (this._moveTween.z) TWEEN.remove(this._moveTween.z); if (this._moveTween.scale) TWEEN.remove(this._moveTween.scale); this._moveTween = null; } this._playSound(this.fizzleSoundBuffer); const fu = this.particleMaterial.uniforms.uFizzleFactor; this.points.visible = true; this._fizzleTween = new TWEEN.Tween(fu).to({ value: 1.0 }, FIZZLE_DURATION_MS).easing(TWEEN.Easing.Exponential.In).onComplete(() => { if (this.points) { this.points.visible = false; } fu.value = 0.0; this.isMoving = false; this.isActive = false; this.isStopped = true; this._fizzleTween = null; }).start(); }
}