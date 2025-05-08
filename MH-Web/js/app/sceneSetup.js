import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as Config from './config.js';

let scene, camera, renderer, composer, audioListener;

export function initializeScene(container, indexDisplayElement) {

    scene = new THREE.Scene();
    scene.background = new THREE.Color(Config.backgroundColor);
    scene.add(new THREE.AmbientLight(0xd8dee9, 0.45)); 
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(8, 15, 10);
    scene.add(dirLight);

    camera = createCamera(container, indexDisplayElement);

    audioListener = new THREE.AudioListener();
    camera.add(audioListener); 

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(1, 1), 
        Config.bloomParams.strength, Config.bloomParams.radius, Config.bloomParams.threshold
    );
    composer.addPass(bloomPass);
    const outputPass = new OutputPass(); 
    composer.addPass(outputPass);

    console.log("Scene components initialized (Renderer size pending first resize call).");
    return { scene, camera, renderer, composer, audioListener };
}

function createCamera(container, indexDisplayElement) {
    const indexHeight = indexDisplayElement ? indexDisplayElement.offsetHeight : 0;

    const w = window.innerWidth - Config.sidebarWidth;
    const h = window.innerHeight - indexHeight;
    const aspect = w / Math.max(1, h);
    const halfH = Config.initialVisibleHeight / 2;
    const halfW = halfH * aspect;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    return cam;
}

export function resizeHandler(container, indexDisplayElement, sidebarElement) {

    if (!camera || !renderer || !composer || !container || !indexDisplayElement || !sidebarElement || window.innerWidth === 0 || window.innerHeight === 0) {
         console.warn("Resize handler skipped: Missing elements or zero dimensions.");
         return;
    }

    const indexHeight = indexDisplayElement.offsetHeight;
    const sidebarCurrentWidth = sidebarElement.offsetWidth; 
    const w = window.innerWidth - sidebarCurrentWidth;
    const h = window.innerHeight - indexHeight;

    const effectiveWidth = Math.max(1, w);
    const effectiveHeight = Math.max(1, h);

    const aspect = effectiveWidth / effectiveHeight;

    const currentVisibleHeight = camera.top - camera.bottom;
    camera.top = currentVisibleHeight / 2;
    camera.bottom = -currentVisibleHeight / 2;
    camera.left = -camera.top * aspect;
    camera.right = camera.top * aspect;
    camera.updateProjectionMatrix(); 

    try {
        renderer.setSize(effectiveWidth, effectiveHeight);
        composer.setSize(effectiveWidth, effectiveHeight);

    } catch (e) {
        console.error("Error setting renderer/composer size:", e);
    }
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getComposer() { return composer; }
export function getAudioListener() { return audioListener; }