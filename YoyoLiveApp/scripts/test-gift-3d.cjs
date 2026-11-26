const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const native = fs.readFileSync(path.join(root, 'Gift3DModel.native.js'), 'utf8');
const fallback = fs.readFileSync(path.join(root, 'Gift3DModel.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'LiveGiftPanel.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

assert.ok(native.includes("from 'expo-gl'"), 'Native gift renderer must use Expo GL');
assert.ok(native.includes("from 'three'"), 'Native gift renderer must use Three.js');
assert.ok(native.includes('new THREE.WebGLRenderer'), 'Gift rendering must use a real WebGL renderer');
assert.ok(native.includes('new THREE.MeshStandardMaterial'), 'Gift models must use actual 3D mesh materials');
assert.ok(native.includes('buildGiftModel(model, animationKey)'), 'The selected catalog gift must build a 3D model');
assert.ok(native.includes("k.includes('tiger')") && native.includes("k.includes('lion')"), 'Tiger and lion gifts need dedicated 3D models');
assert.ok(native.includes("k.includes('dragon')") && native.includes("k.includes('crown')"), 'Dragon and royal gifts need dedicated 3D models');
assert.ok(panel.includes("import Gift3DModel from './Gift3DModel'"), 'Gift panel must mount the 3D model component');
assert.ok(panel.includes('Gift3DModel animationKey={incoming.animationKey}'), 'Incoming gifts must render as 3D models');
assert.ok(panel.includes('Gift3DModel animationKey={incoming.animationKey}'), 'Sent and received gifts must render as native 3D models');
assert.ok(panel.includes('styles.previewStage') && panel.includes('معاينة ثلاثية الأبعاد'), 'Gift selection must identify the true 3D preview');
assert.ok(panel.includes('Gift3DModel animationKey={selectedGift.animation_key}'), 'Selected catalog gifts must render as actual 3D models');
assert.ok(panel.includes('styles.modalOverlay') && !panel.includes('<Modal'), '3D picker must use an in-tree overlay rather than a native Modal GL surface');
assert.ok(pkg.dependencies['expo-gl'] && pkg.dependencies.three, '3D renderer dependencies must be declared');
assert.ok(lock.packages['node_modules/expo-gl'] && lock.packages['node_modules/three'], '3D renderer dependencies must be locked');
assert.ok(fallback.includes('معاينة 3D متاحة على التطبيق'), 'Web fallback must not pretend to be native 3D');

console.log('YOYO LIVE real 3D gift checks passed (native WebGL meshes, selected-gift 3D preview, live overlay, dependency lock).');
