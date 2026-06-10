import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
} from "@angular/core";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SANCTUARY_CRYSTAL_CONFIG } from "../../../consts/gameplay/sanctuary-crystal-config";
import { SanctuaryElement } from "@models/world/MapCell";

@Component({
  selector: "app-sanctuary-crystal",
  standalone: true,
  templateUrl: "./sanctuary-crystal.html",
  styleUrl: "./sanctuary-crystal.scss",
})
export class SanctuaryCrystal implements AfterViewInit, OnDestroy {
  public active = input<boolean>(false);
  public element = input<SanctuaryElement | undefined>(undefined);

  @ViewChild("canvasHost", { static: true })
  private canvasHost?: ElementRef<HTMLDivElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private crystalGroup: THREE.Group | null = null;
  private crystalMesh: THREE.Mesh | null = null;
  private crystalEdges: LineSegments2 | null = null;
  private glowSprite: THREE.Sprite | null = null;
  private crystalMaterial: THREE.MeshBasicMaterial | null = null;
  private edgeMaterial: LineMaterial | null = null;
  private glowMaterial: THREE.SpriteMaterial | null = null;
  private glowTexture: THREE.CanvasTexture | null = null;
  private edgeGeometry: LineSegmentsGeometry | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;

  private readonly clock = new THREE.Clock();
  private targetRotationSpeed = SANCTUARY_CRYSTAL_CONFIG.animation.inactiveRotationSpeed;
  private currentRotationSpeed = SANCTUARY_CRYSTAL_CONFIG.animation.inactiveRotationSpeed;
  private targetColor = new THREE.Color("#f3f3f3");
  private targetEdgeColor = new THREE.Color("#d3d3d3");
  private targetGlowColor = new THREE.Color("#f3f3f3");
  private targetGlowOpacity = SANCTUARY_CRYSTAL_CONFIG.visuals.glowOpacityInactive;

  public ngAfterViewInit(): void {
    const host = this.canvasHost?.nativeElement;
    if (!host) return;

    this.initializeThree(host);
    this.watchState();
    this.startAnimation();
  }

  public ngOnDestroy(): void {
    this.disposeThree();
  }

  private initializeThree(host: HTMLDivElement): void {
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: SANCTUARY_CRYSTAL_CONFIG.renderer.antialias, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SANCTUARY_CRYSTAL_CONFIG.renderer.pixelRatioCap));
    host.appendChild(this.renderer.domElement);

    if (SANCTUARY_CRYSTAL_CONFIG.renderer.pixelated) {
      this.renderer.domElement.style.imageRendering = "pixelated";
    }

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambient);

    this.crystalGroup = this.buildCrystal();
    this.scene.add(this.crystalGroup);

    this.resizeObserver = new ResizeObserver(() => this.resizeToHost());
    this.resizeObserver.observe(host);
    this.resizeToHost();
  }

  private buildCrystal(): THREE.Group {
    const group = new THREE.Group();

    const crystalMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#f3f3f3"),
      transparent: false,
      opacity: SANCTUARY_CRYSTAL_CONFIG.visuals.inactiveOpacity,
      depthWrite: true,
      depthTest: true,
    });
    this.crystalMaterial = crystalMaterial;
    this.glowTexture = this.buildGlowTexture();
    this.glowMaterial = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color("#f3f3f3"),
      transparent: true,
      opacity: SANCTUARY_CRYSTAL_CONFIG.visuals.glowOpacityInactive,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const bodyRadius = SANCTUARY_CRYSTAL_CONFIG.geometry.bodyRadius;
    const bodyHeight = SANCTUARY_CRYSTAL_CONFIG.geometry.bodyHeight;
    const tipHeight = SANCTUARY_CRYSTAL_CONFIG.geometry.tipHeight;
    const radialSegments = SANCTUARY_CRYSTAL_CONFIG.geometry.radialSegments;

    const prismGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, radialSegments, 1, false);
    const topGeometry = new THREE.ConeGeometry(bodyRadius, tipHeight, radialSegments, 1, false);
    const bottomGeometry = new THREE.ConeGeometry(bodyRadius, tipHeight, radialSegments, 1, false);

    topGeometry.translate(0, (bodyHeight * 0.5) + (tipHeight * 0.5), 0);
    bottomGeometry.rotateX(Math.PI);
    bottomGeometry.translate(0, -((bodyHeight * 0.5) + (tipHeight * 0.5)), 0);

    const rawCrystalGeometry = mergeGeometries([prismGeometry, topGeometry, bottomGeometry], false);
    if (!rawCrystalGeometry) {
      throw new Error("Unable to build sanctuary crystal geometry.");
    }

    const crystalGeometry = mergeVertices(rawCrystalGeometry, 1e-4);
    rawCrystalGeometry.dispose();

    crystalGeometry.computeVertexNormals();
    const edgeSourceGeometry = new THREE.EdgesGeometry(crystalGeometry, 34);
    this.edgeGeometry = new LineSegmentsGeometry();
    const edgePositions = edgeSourceGeometry.attributes["position"].array;
    this.edgeGeometry.setPositions(Array.from(edgePositions));

    const core = new THREE.Mesh(crystalGeometry, crystalMaterial);
    this.edgeMaterial = new LineMaterial({
      color: new THREE.Color("#d3d3d3"),
      linewidth: SANCTUARY_CRYSTAL_CONFIG.visuals.edgeLineWidth,
      transparent: false,
      opacity: SANCTUARY_CRYSTAL_CONFIG.visuals.edgeOpacity,
      worldUnits: false,
      alphaToCoverage: true,
    });
    this.edgeMaterial.depthTest = true;
    this.edgeMaterial.depthWrite = false;
    this.edgeMaterial.resolution.set(1, 1);
    this.crystalEdges = new LineSegments2(this.edgeGeometry, this.edgeMaterial);
    this.glowSprite = new THREE.Sprite(this.glowMaterial);
    this.glowSprite.scale.setScalar(SANCTUARY_CRYSTAL_CONFIG.visuals.glowSize);
    this.glowSprite.position.set(0, 0, -0.02);

    group.add(core);
    group.add(this.crystalEdges);
    group.add(this.glowSprite);

    group.scale.set(
      SANCTUARY_CRYSTAL_CONFIG.geometry.scale.x,
      SANCTUARY_CRYSTAL_CONFIG.geometry.scale.y,
      SANCTUARY_CRYSTAL_CONFIG.geometry.scale.z,
    );
    this.crystalMesh = core;

    this.destroyRef.onDestroy(() => {
      crystalGeometry.dispose();
      edgeSourceGeometry.dispose();
      prismGeometry.dispose();
      topGeometry.dispose();
      bottomGeometry.dispose();
    });

    return group;
  }

  private watchState(): void {
    effect(() => {
      const isActive = this.active();
      const element = this.element();
      const activeColor = this.resolveElementColor(element);

      this.targetRotationSpeed = isActive
        ? SANCTUARY_CRYSTAL_CONFIG.animation.activeRotationSpeed
        : SANCTUARY_CRYSTAL_CONFIG.animation.inactiveRotationSpeed;
      this.targetColor = isActive ? activeColor : new THREE.Color("#f3f3f3");
      this.targetEdgeColor = isActive
        ? this.resolveDarkerEdgeColor(activeColor)
        : new THREE.Color("#d3d3d3");
      this.targetGlowColor = this.targetColor.clone();
      this.targetGlowOpacity = isActive
        ? SANCTUARY_CRYSTAL_CONFIG.visuals.glowOpacityActive
        : SANCTUARY_CRYSTAL_CONFIG.visuals.glowOpacityInactive;
    }, { allowSignalWrites: false, injector: this.injector });
  }

  private startAnimation(): void {
    const animate = () => {
      if (!this.renderer || !this.scene || !this.camera || !this.crystalGroup || !this.crystalMaterial || !this.edgeMaterial || !this.glowMaterial) {
        return;
      }

      const delta = Math.min(this.clock.getDelta(), 0.05);
      const time = this.clock.elapsedTime;
      const blend = Math.min(1, delta * SANCTUARY_CRYSTAL_CONFIG.animation.smoothing);

      this.currentRotationSpeed += (this.targetRotationSpeed - this.currentRotationSpeed) * blend;
      this.crystalGroup.rotation.y += this.currentRotationSpeed * delta;
      this.crystalGroup.position.y = Math.sin(time * SANCTUARY_CRYSTAL_CONFIG.animation.bobSpeed)
        * SANCTUARY_CRYSTAL_CONFIG.animation.bobAmplitude;

      this.crystalMaterial.color.lerp(this.targetColor, blend);
      this.edgeMaterial.color.lerp(this.targetEdgeColor, blend);
      this.glowMaterial.color.lerp(this.targetGlowColor, blend);
      this.glowMaterial.opacity += (this.targetGlowOpacity - this.glowMaterial.opacity) * blend;

      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = window.requestAnimationFrame(animate);
    };

    this.animationFrameId = window.requestAnimationFrame(animate);
  }

  private resolveElementColor(element: SanctuaryElement | undefined): THREE.Color {
    if (element === "water") return new THREE.Color("#6cb8ff");
    if (element === "fire") return new THREE.Color("#ff8a5f");
    if (element === "wind") return new THREE.Color("#b899ef");
    if (element === "earth") return new THREE.Color("#e8d279");
    return new THREE.Color("#70c9ff");
  }

  private resolveDarkerEdgeColor(fillColor: THREE.Color): THREE.Color {
    return fillColor.clone().lerp(new THREE.Color("#000000"), 0.38);
  }

  private buildGlowTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    }

    const gradient = context.createRadialGradient(
      size * 0.5,
      size * 0.5,
      0,
      size * 0.5,
      size * 0.5,
      size * 0.5,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.22, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.clearRect(0, 0, size, size);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private resizeToHost(): void {
    if (!this.renderer || !this.camera || !this.canvasHost?.nativeElement) return;

    const host = this.canvasHost.nativeElement;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    const renderScale = SANCTUARY_CRYSTAL_CONFIG.renderer.renderScale;
    const renderWidth = Math.max(1, Math.floor(width * renderScale));
    const renderHeight = Math.max(1, Math.floor(height * renderScale));

    this.renderer.setSize(renderWidth, renderHeight, true);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";

    const aspect = width / height;
    const orthoHeight = 1.35;
    const orthoWidth = orthoHeight * aspect;

    this.camera.left = -orthoWidth;
    this.camera.right = orthoWidth;
    this.camera.top = orthoHeight;
    this.camera.bottom = -orthoHeight;
    this.camera.updateProjectionMatrix();
    this.edgeMaterial?.resolution.set(renderWidth, renderHeight);
  }

  private disposeThree(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.crystalMaterial?.dispose();
    this.edgeMaterial?.dispose();
    this.glowMaterial?.dispose();
    this.glowTexture?.dispose();
    this.edgeGeometry?.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      const canvas = this.renderer.domElement;
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      this.renderer = null;
    }

    this.crystalMesh = null;
    this.crystalEdges = null;
    this.glowSprite = null;
    this.edgeGeometry = null;
    this.glowMaterial = null;
    this.glowTexture = null;
    this.crystalGroup = null;
    this.camera = null;
    this.scene = null;
  }
}
