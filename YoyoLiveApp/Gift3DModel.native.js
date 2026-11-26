import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { GLView } from 'expo-gl';
import * as THREE from 'three';

const MAT = {
  gold: 0xF5C451, orange: 0xE98A32, dark: 0x241A2D, cream: 0xF5E5C9,
  black: 0x17131D, white: 0xFFFFFF, pink: 0xF34E9B, purple: 0x8A5BEA,
  blue: 0x58BCEB, green: 0x55B98B, red: 0xD9434F, brown: 0x74412C,
};

function material(color, metalness = 0.12, roughness = 0.42) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function addMesh(group, geometry, color, position, scale, rotation) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function sphere(group, color, position, scale) {
  return addMesh(group, new THREE.SphereGeometry(1, 24, 18), color, position, scale);
}
function box(group, color, position, scale, rotation) {
  return addMesh(group, new THREE.BoxGeometry(1, 1, 1), color, position, scale, rotation);
}
function cone(group, color, position, radius = 0.22, height = 0.55, rotation = [0, 0, 0]) {
  return addMesh(group, new THREE.ConeGeometry(radius, height, 20), color, position, [1, 1, 1], rotation);
}
function cylinder(group, color, position, radiusTop, radiusBottom, height, rotation = [0, 0, 0]) {
  return addMesh(group, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20), color, position, [1, 1, 1], rotation);
}
function ring(group, color, position, radius = 0.72, tube = 0.055, rotation = [Math.PI / 2, 0, 0]) {
  return addMesh(group, new THREE.TorusGeometry(radius, tube, 10, 48), color, position, [1, 1, 1], rotation);
}
function triangle(group, color, points, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  shape.lineTo(points[1][0], points[1][1]);
  shape.lineTo(points[2][0], points[2][1]);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  return addMesh(group, geometry, color, [0, 0, z], [1, 1, 1]);
}

function addAnimalFace(group, kind) {
  const isLion = kind === 'lion';
  const isCat = kind === 'cat';
  const fur = isLion ? 0xB8792F : isCat ? 0xC7C5D0 : 0xE99A3B;
  const face = isLion ? 0xF2C477 : isCat ? 0xE6E0E8 : 0xF6B45E;
  if (isLion) sphere(group, 0x9B5529, [0, 0, 0], [1.02, 1.02, 0.62]);
  sphere(group, fur, [0, 0.04, 0.08], [0.78, 0.72, 0.58]);
  if (!isLion) {
    cone(group, fur, [-0.48, 0.62, 0.04], 0.28, 0.62, [0, 0, 0.35]);
    cone(group, fur, [0.48, 0.62, 0.04], 0.28, 0.62, [0, 0, -0.35]);
    if (isCat) {
      triangle(group, 0xE99CB9, [[-0.55,0.58],[-0.38,0.58],[-0.48,0.82]], 0.28);
      triangle(group, 0xE99CB9, [[0.38,0.58],[0.55,0.58],[0.48,0.82]], 0.28);
    }
  }
  sphere(group, face, [0, -0.2, 0.48], [0.5, 0.34, 0.23]);
  sphere(group, 0xFFFFFF, [-0.27, 0.12, 0.55], [0.15, 0.18, 0.09]);
  sphere(group, 0xFFFFFF, [0.27, 0.12, 0.55], [0.15, 0.18, 0.09]);
  sphere(group, 0x17131D, [-0.25, 0.1, 0.63], [0.065, 0.09, 0.04]);
  sphere(group, 0x17131D, [0.25, 0.1, 0.63], [0.065, 0.09, 0.04]);
  sphere(group, 0x5B2B2B, [0, -0.13, 0.7], [0.09, 0.065, 0.045]);
  sphere(group, 0xFFFFFF, [-0.16, -0.29, 0.58], [0.18, 0.12, 0.08]);
  sphere(group, 0xFFFFFF, [0.16, -0.29, 0.58], [0.18, 0.12, 0.08]);
  if (!isLion) {
    for (let i = 0; i < 3; i++) {
      box(group, 0x3A241D, [-0.62 + i * 0.13, 0.2 - i * 0.08, 0.49], [0.055, 0.27, 0.045], [0, 0, -0.35]);
      box(group, 0x3A241D, [0.62 - i * 0.13, 0.2 - i * 0.08, 0.49], [0.055, 0.27, 0.045], [0, 0, 0.35]);
    }
  }
}

function buildGiftModel(group, key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('lion') || k.includes('panther') || k.includes('tiger') || k.includes('cat')) {
    addAnimalFace(group, k.includes('lion') || k.includes('panther') ? 'lion' : k.includes('cat') ? 'cat' : 'tiger');
    if (k.includes('lion') || k.includes('tiger')) {
      ring(group, MAT.gold, [0, 0.88, 0.02], 0.4, 0.07, [0, 0, 0]);
      for (let i = -1; i <= 1; i++) box(group, MAT.gold, [i * 0.22, 1.08, 0.02], [0.09, 0.22, 0.09], [0, 0, i * -0.16]);
    }
    return;
  }
  if (k.includes('dragon')) {
    sphere(group, 0x2E9B83, [0, -0.05, 0], [0.72, 0.36, 0.38]);
    sphere(group, 0x45C7A7, [0.52, 0.18, 0.14], [0.35, 0.29, 0.3]);
    cone(group, 0xE8D07C, [0.42, 0.48, 0.1], 0.1, 0.34, [0, 0, -0.55]);
    cone(group, 0xE8D07C, [0.7, 0.42, 0.1], 0.1, 0.34, [0, 0, -0.4]);
    triangle(group, 0x55B98B, [[-0.2,0.1],[-0.82,0.86],[-0.48,-0.16]], -0.08);
    triangle(group, 0x55B98B, [[0.05,0.08],[0.58,0.9],[0.46,-0.2]], -0.12);
    cone(group, 0x2E9B83, [-0.82, -0.12, 0], 0.2, 0.72, [0, 0, Math.PI / 2]);
    return;
  }
  if (k.includes('car') || k.includes('race')) {
    box(group, 0xD9434F, [0, -0.05, 0], [1.65, 0.42, 0.68]);
    box(group, 0xF5C451, [0.05, 0.29, 0], [0.78, 0.43, 0.58]);
    box(group, 0x8BD8F5, [0.05, 0.31, 0.31], [0.58, 0.27, 0.025]);
    for (const x of [-0.55, 0.55]) cylinder(group, 0x19151E, [x, -0.32, 0.31], 0.19, 0.19, 0.14, [Math.PI/2,0,0]);
    ring(group, MAT.gold, [0, 0.55, 0], 0.55, 0.035);
    return;
  }
  if (k.includes('yacht') || k.includes('boat')) {
    box(group, 0xE9E6F0, [0, -0.18, 0], [1.65, 0.28, 0.6]);
    cone(group, 0xD6D2E0, [0, -0.28, 0], 0.44, 0.7, [0, 0, Math.PI]);
    cylinder(group, MAT.gold, [0, 0.25, 0], 0.045, 0.045, 0.85);
    triangle(group, 0xF34E9B, [[0.05,0.68],[0.05,0.1],[0.58,0.1]], 0.02);
    triangle(group, 0xFFFFFF, [[-0.04,0.55],[-0.04,0.12],[-0.48,0.12]], 0.02);
    return;
  }
  if (k.includes('castle') || k.includes('throne')) {
    box(group, 0x6D5BC2, [0, -0.15, 0], [1.15, 0.78, 0.72]);
    for (const x of [-0.52, 0.52]) {
      cylinder(group, 0x9A86E8, [x, 0.35, 0], 0.19, 0.19, 0.82);
      cone(group, MAT.gold, [x, 0.88, 0], 0.24, 0.38);
    }
    box(group, MAT.gold, [0, 0.28, 0.42], [0.55, 0.1, 0.08]);
    if (k.includes('throne')) {
      box(group, MAT.gold, [0, -0.05, 0.5], [0.58, 0.55, 0.16]);
      box(group, MAT.gold, [0, -0.38, 0.48], [0.68, 0.13, 0.22]);
      ring(group, MAT.gold, [0, 0.72, 0.35], 0.28, 0.07, [0,0,0]);
    }
    return;
  }
  if (k.includes('rocket')) {
    cylinder(group, 0xD9D9E8, [0, -0.05, 0], 0.3, 0.3, 1.1);
    cone(group, MAT.red, [0, 0.7, 0], 0.3, 0.55);
    for (const x of [-0.28, 0.28]) triangle(group, MAT.red, [[x, -0.15],[x * 1.8, -0.65],[x * 0.7, -0.48]], 0);
    cone(group, 0xF5A84C, [0, -0.72, 0], 0.19, 0.5, [Math.PI,0,0]);
    sphere(group, 0x8BD8F5, [0, 0.12, 0.28], [0.13,0.13,0.07]);
    return;
  }
  if (k.includes('crown') || k.includes('king')) {
    cylinder(group, MAT.gold, [0, -0.18, 0], 0.62, 0.62, 0.16);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * Math.PI * 0.9;
      cone(group, MAT.gold, [Math.sin(a) * 0.48, 0.22 + (i === 2 ? 0.18 : 0), Math.cos(a) * 0.12], 0.14, 0.62, [0, 0, -a * 0.5]);
      sphere(group, MAT.pink, [Math.sin(a) * 0.48, 0.42 + (i === 2 ? 0.18 : 0), 0.14], [0.075,0.075,0.075]);
    }
    ring(group, MAT.gold, [0, -0.03, 0], 0.64, 0.055);
    return;
  }
  if (k.includes('planet') || k.includes('galaxy') || k.includes('cosmic') || k.includes('eclipse')) {
    sphere(group, 0x7056D9, [0, 0, 0], [0.63,0.63,0.63]);
    sphere(group, 0xE9A7D0, [-0.18,0.2,0.5], [0.13,0.13,0.07]);
    ring(group, MAT.gold, [0,0,0], 0.98, 0.075, [0.8,0.2,0.25]);
    ring(group, 0x7AD8F0, [0,0,0], 1.13, 0.025, [0.8,0.2,0.25]);
    return;
  }
  if (k.includes('horse')) {
    sphere(group, 0xA96B39, [0, -0.12, 0], [0.6,0.45,0.48]);
    sphere(group, 0xC88A4C, [0.42,0.35,0.1], [0.34,0.45,0.34]);
    cone(group, 0xA96B39, [0.5,0.72,0.1], 0.12, 0.3, [0,0,-0.25]);
    for (const x of [-0.3,0.25]) cylinder(group, 0x5A3828, [x,-0.57,0], 0.07,0.07,0.58,[0,0,0.12]);
    ring(group, MAT.gold, [0,0.45,0.1], 0.34,0.045,[0,0,0]);
    return;
  }
  // A sculpted gift box is the 3D fallback for every remaining catalog item.
  box(group, 0x8B5BEA, [0, -0.05, 0], [1.12, 0.92, 0.78]);
  box(group, MAT.gold, [0, -0.05, 0.42], [0.16, 0.94, 0.035]);
  box(group, MAT.gold, [0, 0.02, 0.42], [1.14, 0.14, 0.035]);
  ring(group, MAT.pink, [-0.18, 0.58, 0], 0.25, 0.07, [0.3,0,0]);
  ring(group, MAT.pink, [0.18, 0.58, 0], 0.25, 0.07, [-0.3,0,0]);
  sphere(group, MAT.gold, [0, 0.58, 0], [0.12,0.12,0.12]);
}

export default function Gift3DModel({ animationKey, size = 148, style }) {
  const cleanupRef = useRef(null);
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const onContextCreate = (gl) => {
    try {
      const width = Math.max(1, gl.drawingBufferWidth || size);
      const height = Math.max(1, gl.drawingBufferHeight || size);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);
      camera.position.set(0, 0.08, 5.1);
      const renderer = new THREE.WebGLRenderer({ gl, alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x38264E, 2.0));
      const keyLight = new THREE.DirectionalLight(0xFFFFFF, 2.2);
      keyLight.position.set(3, 4, 5);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(0xB78BFF, 1.7, 12);
      rimLight.position.set(-3, 1, -2);
      scene.add(rimLight);
      const model = new THREE.Group();
      scene.add(model);
      buildGiftModel(model, animationKey);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.48, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xB78BFF, transparent: true, opacity: 0.7 }),
      );
      halo.rotation.x = 0.9;
      model.add(halo);
      let frame = 0;
      let disposed = false;
      const render = () => {
        if (disposed) return;
        frame = requestAnimationFrame(render);
        model.rotation.y += 0.009;
        model.rotation.x = Math.sin(Date.now() * 0.0007) * 0.055;
        model.position.y = Math.sin(Date.now() * 0.0014) * 0.08;
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
      cleanupRef.current = () => {
        disposed = true;
        cancelAnimationFrame(frame);
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((item) => item.dispose());
          }
        });
        renderer.dispose();
      };
    } catch (error) {
      console.warn('YOYO 3D gift renderer:', error?.message || error);
    }
  };

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <GLView style={{ width: size, height: size, backgroundColor: 'transparent' }} onContextCreate={onContextCreate} />
    </View>
  );
}
