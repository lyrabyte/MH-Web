import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.min.js';

const PARTICLE_COUNT = 200;
const PARTICLE_TARGET_PIXEL_SIZE = 8.0; 

const CURSOR_BASE_COLOR = new THREE.Color(0xffff99); 

const COLOR_VARIATION = 0.1; 

const PARTICLE_LIFETIME_MIN = 0.8;
const PARTICLE_LIFETIME_MAX = 1.6;
const PARTICLE_VELOCITY_MIN = 0.2;
const PARTICLE_VELOCITY_MAX = 0.8;
const GRAVITY = -1.0;
const EDGE_OFFSET = 0.05;
const MOVE_DURATION_MS = 200;
const FIZZLE_DURATION_MS = 300;

const vertexShader = `
  uniform float uTargetPixelSize;
  uniform float uZoomScale; 
  attribute float size;       
  attribute vec2 life;        
  attribute vec3 initialPosition;
  attribute vec3 colorOffset; 

  varying float vLifetimeRatio;
  varying float vAge;
  varying vec3 vColorOffset; 

  void main() {
    vLifetimeRatio = life.x / life.y;
    vAge = life.x;
    vColorOffset = colorOffset; 

    float sf = 1.0 - pow(vLifetimeRatio, 2.0); 

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);

    gl_PointSize = uTargetPixelSize * uZoomScale * size * sf;
    gl_PointSize = max(0.0, gl_PointSize); 

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = `
  uniform vec3 uBaseColor; 
  uniform sampler2D uTexture;
  varying float vLifetimeRatio;
  varying vec3 vColorOffset; 

  void main() {

    float fade = 1.0;
    float fadeStartRatio = 0.4;
    if (vLifetimeRatio > fadeStartRatio) {
        fade = 1.0 - pow((vLifetimeRatio - fadeStartRatio) / (1.0 - fadeStartRatio), 1.5);
    }

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
    currentBlock = null; currentBlockClass = null;
    isMoving = false; isStopped = false; isActive = false;
    _moveTween = null; _fizzleTween = null;
    isPaused = false;
    pauseEndTime = 0;
    nextPosAfterPause = null;

    indexArray = new Uint8Array(1);
    indexPointer = 0;

    constructor(scene, blockGridMap, blockRegistry, initialGridPos = { x: 0.5, y: 0.5 }) {
        this.scene = scene;
        this.blockGridMap = blockGridMap;
        this.blockRegistry = blockRegistry;
        this.gridPos = { ...initialGridPos };
        this.previousGridPos = null;
        this.worldPos = this._gridToWorld(this.gridPos);
        this._resetIndexArray();
        this._createParticleSystem(); 
        if (this.points) {
            this.points.position.copy(this.worldPos);
            this.scene.add(this.points);
        }
        else { console.error("Cursor particles failed init."); }
        this.isPaused = false; this.pauseEndTime = 0; this.nextPosAfterPause = null;
        this._updateCurrentBlock();
    }

    _createParticleSystem() {
        try {
            this.particleGeometry = new THREE.BufferGeometry();
            const positions = new Float32Array(PARTICLE_COUNT * 3);
            const initialPositions = new Float32Array(PARTICLE_COUNT * 3);
            const velocities = new Float32Array(PARTICLE_COUNT * 3);
            const lifetimes = new Float32Array(PARTICLE_COUNT * 2);
            const sizes = new Float32Array(PARTICLE_COUNT);

            const colorOffsets = new Float32Array(PARTICLE_COUNT * 3);

            const halfSize = 0.5;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const i3 = i * 3, i2 = i * 2;

                let x, y;
                const edge = Math.floor(Math.random() * 4), t = Math.random();
                switch (edge) { case 0: x = THREE.MathUtils.lerp(-halfSize, halfSize, t); y = -halfSize; break; case 1: x = halfSize; y = THREE.MathUtils.lerp(-halfSize, halfSize, t); break; case 2: x = THREE.MathUtils.lerp(halfSize, -halfSize, t); y = halfSize; break; case 3: x = -halfSize; y = THREE.MathUtils.lerp(halfSize, -halfSize, t); break; default: x = y = 0; }
                const angle = Math.atan2(y, x); x += Math.cos(angle) * EDGE_OFFSET; y += Math.sin(angle) * EDGE_OFFSET;
                const z = (Math.random() - 0.2) * 0.2;
                positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
                initialPositions[i3] = x; initialPositions[i3 + 1] = y; initialPositions[i3 + 2] = z;
                const vm = THREE.MathUtils.randFloat(PARTICLE_VELOCITY_MIN, PARTICLE_VELOCITY_MAX);
                const aXY = Math.random() * Math.PI * 2, aZ = (Math.random() * 0.6 + 0.4) * Math.PI / 2;
                velocities[i3] = Math.cos(aXY) * Math.sin(aZ) * vm; velocities[i3 + 1] = Math.sin(aXY) * Math.sin(aZ) * vm; velocities[i3 + 2] = Math.cos(aZ) * vm;
                lifetimes[i2] = Math.random() * PARTICLE_LIFETIME_MAX;
                lifetimes[i2 + 1] = THREE.MathUtils.randFloat(PARTICLE_LIFETIME_MIN, PARTICLE_LIFETIME_MAX);
                sizes[i] = Math.random() * 0.6 + 0.7; 

                const rOff = (Math.random() * 2 - 1) * COLOR_VARIATION;
                const gOff = (Math.random() * 2 - 1) * COLOR_VARIATION;
                const bOff = (Math.random() * 2 - 1) * COLOR_VARIATION;
                colorOffsets[i3 + 0] = rOff;
                colorOffsets[i3 + 1] = gOff;
                colorOffsets[i3 + 2] = bOff;
            }

            this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this.particleGeometry.setAttribute('initialPosition', new THREE.BufferAttribute(initialPositions, 3));
            this.particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
            this.particleGeometry.setAttribute('life', new THREE.BufferAttribute(lifetimes, 2));
            this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            this.particleGeometry.setAttribute('colorOffset', new THREE.BufferAttribute(colorOffsets, 3));

            const textureLoader = new THREE.TextureLoader();
            let particleTexture = null;
            try {
                particleTexture = textureLoader.load('/textures/particle.png', undefined, undefined, (er) => { console.error('Cursor tex load fail', er); });
                particleTexture.magFilter = THREE.NearestFilter; particleTexture.minFilter = THREE.NearestFilter;
            } catch (er) { console.error('Cursor tex setup fail', er); }

            this.particleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uBaseColor: { value: CURSOR_BASE_COLOR }, 
                    uTexture: { value: particleTexture },
                    uTargetPixelSize: { value: PARTICLE_TARGET_PIXEL_SIZE },
                    uZoomScale: { value: 1.0 } 
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                blending: THREE.NormalBlending, 
                depthWrite: false,
                transparent: true,
                vertexColors: false
            });

            this.points = new THREE.Points(this.particleGeometry, this.particleMaterial);
            this.points.visible = false;

        } catch (error) {
            console.error("Error creating particle system:", error);
            this.points = null;
        }
    }
    _gridToWorld(gridPos) { return new THREE.Vector3(gridPos.x, gridPos.y, 0.0); }
    _getGridKey(gridPos) { if (typeof gridPos?.x !== 'number' || typeof gridPos?.y !== 'number' || isNaN(gridPos.x) || isNaN(gridPos.y)) return null; return `${Math.round(gridPos.x - 0.5)},${Math.round(gridPos.y - 0.5)}`; }
    _updateCurrentBlock() { const k = this._getGridKey(this.gridPos); if (k === null) { this.currentBlock = null; this.currentBlockClass = null; return; } this.currentBlock = this.blockGridMap.get(k) || null; if (this.currentBlock?.userData?.blockType) { this.currentBlockClass = this.blockRegistry.getBlockClass(this.currentBlock.userData.blockType); if (!this.currentBlockClass) console.warn(`Cursor: Class not found for type "${this.currentBlock.userData.blockType}" at ${k}.`); } else { this.currentBlockClass = null; } }

    _resetIndexArray() { this.indexArray = new Uint8Array(1); this.indexArray[0] = 0; this.indexPointer = 0; }
    _ensureIndexCapacity(index) { if (index >= this.indexArray.length) { const newCapacity = Math.max(this.indexArray.length * 2, index + 1); const newArray = new Uint8Array(newCapacity); newArray.set(this.indexArray, 0); this.indexArray = newArray; } }
    getIndexValue(index) { if (index >= 0 && index < this.indexArray.length) { return this.indexArray[index]; } return 0; }
    setIndexValue(index, value) { if (index < 0) return; this._ensureIndexCapacity(index); this.indexArray[index] = Math.max(0, Math.min(255, Math.floor(value))); }
    incrementIndexPointer() { this.indexPointer++; this._ensureIndexCapacity(this.indexPointer); }
    decrementIndexPointer() { if (this.indexPointer > 0) { this.indexPointer--; } }
    getCurrentIndexValue() { return this.indexArray[this.indexPointer]; }
    setCurrentIndexValue(value) { this.indexArray[this.indexPointer] = Math.max(0, Math.min(255, Math.floor(value))); }
    getIndexDisplayData() { return { array: this.indexArray, pointer: this.indexPointer }; }

    start() { if (!this.points) return false; this.isStopped = false; this.isActive = true; this.points.visible = true; this.points.scale.set(1, 1, 1); this.points.position.copy(this.worldPos); this.previousGridPos = null; this._updateCurrentBlock(); return true; }
    stop() { this.isActive = false; this.isMoving = false; this.isStopped = true; this.isPaused = false; this.pauseEndTime = 0; this.nextPosAfterPause = null; this.previousGridPos = null; if (this.points) this.points.visible = false; if (this._moveTween) TWEEN.remove(this._moveTween); if (this._fizzleTween) TWEEN.remove(this._fizzleTween); this._moveTween = null; this._fizzleTween = null; }
    reset(initialGridPos = { x: 0.5, y: 0.5 }) { if (!this.points) return; this.stop(); this.gridPos = { ...initialGridPos }; this.worldPos = this._gridToWorld(this.gridPos); this.points.position.copy(this.worldPos); this.points.scale.set(1, 1, 1); this._resetIndexArray(); this._updateCurrentBlock(); }

    update(dT) {
        if (!this.isActive || this.isMoving || this.isPaused || !this.points || !this.points.visible) return;
        const positions = this.particleGeometry.attributes.position.array;
        const initialPositions = this.particleGeometry.attributes.initialPosition.array;
        const velocities = this.particleGeometry.attributes.velocity.array;
        const lifetimes = this.particleGeometry.attributes.life.array;
        let positionNeedsUpdate = false; let lifeNeedsUpdate = false; let velocityNeedsUpdate = false;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3, i2 = i * 2; lifetimes[i2] += dT; lifeNeedsUpdate = true;
            if (lifetimes[i2] >= lifetimes[i2 + 1]) {
                lifetimes[i2] = 0; positions[i3] = initialPositions[i3]; positions[i3 + 1] = initialPositions[i3 + 1]; positions[i3 + 2] = initialPositions[i3 + 2];
                const vm = THREE.MathUtils.randFloat(PARTICLE_VELOCITY_MIN, PARTICLE_VELOCITY_MAX); const aXY = Math.random() * Math.PI * 2, aZ = (Math.random() * 0.6 + 0.4) * Math.PI / 2;
                velocities[i3] = Math.cos(aXY) * Math.sin(aZ) * vm; velocities[i3 + 1] = Math.sin(aXY) * Math.sin(aZ) * vm; velocities[i3 + 2] = Math.cos(aZ) * vm;
                positionNeedsUpdate = true; velocityNeedsUpdate = true;
            } else {
                velocities[i3 + 2] += GRAVITY * dT;
                positions[i3] += velocities[i3] * dT; positions[i3 + 1] += velocities[i3 + 1] * dT; positions[i3 + 2] += velocities[i3 + 2] * dT;
                positionNeedsUpdate = true; velocityNeedsUpdate = true;
            }
        }
        if (positionNeedsUpdate) this.particleGeometry.attributes.position.needsUpdate = true;
        if (lifeNeedsUpdate) this.particleGeometry.attributes.life.needsUpdate = true;
        if (velocityNeedsUpdate) this.particleGeometry.attributes.velocity.needsUpdate = true;
    }

    step() { if (this.isPaused) { if (Date.now() >= this.pauseEndTime) { this.isPaused = false; const targetPos = this.nextPosAfterPause; this.nextPosAfterPause = null; this.pauseEndTime = 0; if (!targetPos || isNaN(targetPos.x) || isNaN(targetPos.y)) { console.log("Cursor stopping: No valid target after pause."); this.previousGridPos = { ...this.gridPos }; this._fizzle(); return false; } this._animateMove(targetPos); return true; } else { return true; } } if (!this.isActive || this.isMoving || this.isStopped || !this.points) return false; this._updateCurrentBlock(); const currentGridKey = this._getGridKey(this.gridPos); if (!this.currentBlock || !this.currentBlockClass) { console.log(`Cursor stopping: No valid block at ${currentGridKey}`); this.previousGridPos = { ...this.gridPos }; this._fizzle(); return false; } if (typeof this.currentBlockClass.onCursorStep !== 'function') { console.log(`Cursor stopping: Block '${this.currentBlock.userData.blockType}' at ${currentGridKey} missing onCursorStep.`); this.previousGridPos = { ...this.gridPos }; this._fizzle(); return false; } const stepResult = this.currentBlockClass.onCursorStep(this.currentBlock, this.gridPos, this.previousGridPos, this.blockGridMap, this.blockRegistry, this); if (!stepResult || typeof stepResult.action !== 'string') { console.error(`Cursor Error: Invalid stepResult from block at ${currentGridKey}.`); this.previousGridPos = { ...this.gridPos }; this._fizzle(); return false; } let continueSim = false; switch (stepResult.action) { case 'move': if (!stepResult.nextGridPos || isNaN(stepResult.nextGridPos.x) || isNaN(stepResult.nextGridPos.y)) { console.error("Cursor Error: 'move' missing/invalid nextGridPos."); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; } else { this._animateMove(stepResult.nextGridPos); continueSim = true; } break; case 'moveAndFizzle': if (!stepResult.nextGridPos || isNaN(stepResult.nextGridPos.x) || isNaN(stepResult.nextGridPos.y)) { console.error("Cursor Error: 'moveAndFizzle' missing/invalid nextGridPos."); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; } else { this._animateMoveAndFizzle(stepResult.nextGridPos); continueSim = false; } break; case 'pause': if (typeof stepResult.pauseDuration !== 'number' || stepResult.pauseDuration <= 0) { console.error("Cursor Error: 'pause' invalid pauseDuration.", stepResult); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; } else if (stepResult.nextGridPos && (isNaN(stepResult.nextGridPos.x) || isNaN(stepResult.nextGridPos.y))) { console.error("Cursor Error: 'pause' invalid nextGridPos.", stepResult); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; } else { this.isPaused = true; this.pauseEndTime = Date.now() + stepResult.pauseDuration; this.nextPosAfterPause = stepResult.nextGridPos; continueSim = true; } break; case 'fizzleInPlace': console.log(`Cursor stopping: Block at ${currentGridKey} indicated fizzleInPlace.`); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; break; default: console.warn(`Cursor Warning: Block at ${currentGridKey} returned unknown action '${stepResult.action}'. Stopping.`); this.previousGridPos = { ...this.gridPos }; this._fizzle(); continueSim = false; break; } return continueSim; }

    _animateMove(targetGridPos) { if (this.isMoving || !this.points) return; this.isMoving = true; const targetWorldPos = this._gridToWorld(targetGridPos); if (this._moveTween) TWEEN.remove(this._moveTween); const posBeforeMove = { ...this.gridPos }; this._moveTween = new TWEEN.Tween(this.points.position) .to(targetWorldPos, MOVE_DURATION_MS) .easing(TWEEN.Easing.Quadratic.Out) .onComplete(() => { this.isMoving = false; this.previousGridPos = posBeforeMove; this.gridPos = targetGridPos; this.worldPos.copy(targetWorldPos); this._moveTween = null; }) .start(); }
    _animateMoveAndFizzle(targetGridPos) { if (this.isMoving || !this.points) return; this.isMoving = true; this.isStopped = true; const targetWorldPos = this._gridToWorld(targetGridPos); if (this._moveTween) TWEEN.remove(this._moveTween); const posBeforeMove = { ...this.gridPos }; this._moveTween = new TWEEN.Tween(this.points.position) .to(targetWorldPos, MOVE_DURATION_MS) .easing(TWEEN.Easing.Quadratic.Out) .onComplete(() => { this.previousGridPos = posBeforeMove; this.gridPos = targetGridPos; this.worldPos.copy(targetWorldPos); this.currentBlock = null; this.currentBlockClass = null; this._moveTween = null; this._fizzle(); }) .start(); }
    _fizzle() { if (!this.points) return; this.isStopped = true; if (this._fizzleTween) TWEEN.remove(this._fizzleTween); const iS = this.points.scale.x; this._fizzleTween = new TWEEN.Tween({ scale: iS }).to({ scale: .01 }, FIZZLE_DURATION_MS).easing(TWEEN.Easing.Exponential.In).onUpdate((o) => { if (this.points) this.points.scale.set(o.scale, o.scale, o.scale); }).onComplete(() => { if (this.points) { this.points.visible = false; } this.isMoving = false; this.isActive = false; this._fizzleTween = null; console.log("Cursor fizzled."); }).start(); }

} 