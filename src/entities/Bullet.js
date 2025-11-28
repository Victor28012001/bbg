import { GameState } from "../core/GameState.js";
import { updateSpiderHUD } from "../utils/utils.js";

export class Bullet {
  constructor(position, direction) {
    const geometry = new THREE.SphereGeometry(0.01, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.direction = direction.clone().normalize();
    this.distanceTraveled = 0;
    this.maxDistance = 5;
    // this.spider = new SpiderManager(GameState.scene, GameState.loadingManager)

    const light = new THREE.PointLight(0xffffff, 10, 100);
    light.position.copy(position);
    this.mesh.add(light);
    this.mesh.remove(light);

    GameState.scene.add(this.mesh);
    this.audio = GameState.audio;
  }

  update() {
    this.mesh.position.addScaledVector(this.direction, 0.75);
    this.distanceTraveled += 0.004;

    return this.distanceTraveled < this.maxDistance;
  }

  checkCollision(spiderManager, rakeManager, abandonedBuilding, index, bullets) {
    const raycaster = new THREE.Raycaster(this.mesh.position, this.direction);
    raycaster.camera = GameState.camera;

    // RAKE COLLISION
    rakeManager.rakes.forEach((rakeData, i) => {
      const rake = rakeData.object;

      if (!rake || !rake.isObject3D) {
        console.warn("Invalid rake object encountered");
        return;
      }

      // First check bounding sphere for quick rejection
      if (rake.geometry?.boundingSphere) {
        const sphere = rake.geometry.boundingSphere.clone();
        sphere.applyMatrix4(rake.matrixWorld);

        if (!raycaster.ray.intersectsSphere(sphere)) {
          return;
        }
      }

      // Then do detailed intersection test
      try {
        const intersects = raycaster.intersectObject(rake, true);

        if (intersects.length > 0) {
          GameState.shotsHit++;
          rakeManager.handleHit(rakeData, 25); // Rakes take more damage per hit

          // Remove bullet
          GameState.scene.remove(this.mesh);
          bullets.splice(index, 1);
        }
      } catch (error) {
        console.error("Error during rake collision check:", error);
      }
    });

    // SPIDER COLLISION
    spiderManager.spiders.forEach((spiderData, i) => {
      // Make sure we're checking against the spider's mesh object
      const spider = spiderData.object;

      if (!spider || !spider.isObject3D) {
        console.warn("Invalid spider object encountered");
        return;
      }

      // First check bounding sphere for quick rejection
      if (spider.geometry?.boundingSphere) {
        const sphere = spider.geometry.boundingSphere.clone();
        sphere.applyMatrix4(spider.matrixWorld);

        if (!raycaster.ray.intersectsSphere(sphere)) {
          return;
        }
      }

      // Then do detailed intersection test
      try {
        const intersects = raycaster.intersectObject(spider, true);

        if (intersects.length > 0) {
          GameState.shotsHit++;
          spiderManager.playAction(spiderData, "hit");
          spiderData.health -= 10;
          spiderData.speed = Math.max(spiderData.speed * 0.9, 0.2);

          // Flash effect
          const originalColors = [];
          spider.traverse((child) => {
            if (child.isMesh) {
              originalColors.push({
                mesh: child,
                color: child.material.color.clone(),
              });
              child.material.color.set(0xff0000);
            }
          });

          setTimeout(() => {
            originalColors.forEach(({ mesh, color }) => {
              mesh.material.color.copy(color);
            });
          }, 50);

          // Remove bullet
          GameState.scene.remove(this.mesh);
          bullets.splice(index, 1);

          // Update spider state
          spiderManager.updateHealthBar(spiderData);
          if (spiderData.health <= 0) {
            GameState.scene.remove(spider);
            GameState.killedSpiders++;
            GameState.enemiesDefeated++;
            spiderManager.spiders.splice(i, 1);
          } else {
            const playerPos = GameState.game.controlsSystem.isMobile ? GameState.camera.position.clone() : GameState.controls.getObject().position.clone();
            spiderManager.alertNearbySpiders(spiderData, playerPos);
          }

          updateSpiderHUD(GameState.totalSpiders, GameState.killedSpiders);
        }
      } catch (error) {
        console.error("Error during spider collision check:", error);
      }
    });

    // BUILDING COLLISION
    const buildingHits = raycaster.intersectObject(abandonedBuilding, true);
    if (buildingHits.length > 0) {
      if (GameState.bulletCount % 15 === 0) {
        this.audio.play("wallhit", 1);
        // this.audio.fadeOutMusic(3);
      }
      GameState.bulletCount++;

      const point = buildingHits[0].point;
      const offset = new THREE.Vector3(0, 0, 0.01);
      const insertionOffset = new THREE.Vector3(0, 0.01, 0);
      const insertionPoint = point.clone().add(offset).add(insertionOffset);

      const loader = new THREE.TextureLoader();
      const material = new THREE.MeshBasicMaterial({
        map: loader.load("./assets/images/bullet-hole.png"),
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
      });

      const geometry = new THREE.PlaneGeometry(0.08, 0.08);
      const bulletHoleMesh = new THREE.Mesh(geometry, material);
      bulletHoleMesh.position.copy(insertionPoint);

      GameState.scene.add(bulletHoleMesh);
      GameState.bulletHoles.push(bulletHoleMesh);

      let opacity = 1.0;
      const fadeOutDuration = 5000;
      const fadeOutInterval = 50;

      const fadeOutTimer = setInterval(() => {
        opacity -= fadeOutInterval / fadeOutDuration;
        if (opacity <= 0) {
          clearInterval(fadeOutTimer);
          GameState.scene.remove(bulletHoleMesh);
          GameState.bulletHoles.splice(
            GameState.bulletHoles.indexOf(bulletHoleMesh),
            1
          );
        } else {
          bulletHoleMesh.material.opacity = opacity;
        }
      }, fadeOutInterval);
    }
  }
}
