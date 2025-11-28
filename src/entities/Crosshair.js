import { GameState } from "../core/GameState.js";

export class Crosshair {
  constructor() {
    this.camera = GameState.camera;
    this.size = 0.003;
    this.padding = 0.002;
    this.color = 0x55ff55;

    this.line = this.createCrosshair();
    this.line.layers.set(1); 
    this.camera.add(this.line);
    this.camera.layers.enable(1); 
  }

  createCrosshair() {
    const material = new THREE.LineBasicMaterial({
      color: this.color,
    });

    const geometries = [];

    // Define each line segment (vertical and horizontal)
    const directions = [
      [
        [0, this.size + this.padding, 0],
        [0, this.padding, 0],
      ], // Top
      [
        [0, -this.size - this.padding, 0],
        [0, -this.padding, 0],
      ], // Bottom
      [
        [-this.size - this.padding, 0, 0],
        [-this.padding, 0, 0],
      ], // Left
      [
        [this.size + this.padding, 0, 0],
        [this.padding, 0, 0],
      ], // Right
    ];

    const group = new THREE.Group();

    for (const [start, end] of directions) {
      const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      group.add(line);
    }

    // Positioning the crosshair in front of the camera
    group.position.z = -0.2;

    return group;
  }

  dispose() {
    // Clean up geometry and material
    this.line.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    if (this.line.parent) {
      this.line.parent.remove(this.line);
    }
  }
}
