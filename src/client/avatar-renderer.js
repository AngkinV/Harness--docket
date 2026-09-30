import * as THREE from 'three'
import { disposeModelResources } from './model-resources.js'
import { createModelMeasurement } from './model-measurement.js'
import { effectiveExpressions } from './expression-capabilities.js'
import { createGazeController, gazeCapability } from './gaze-controller.js'
import { createPocketGesture } from './pocket-gesture.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { motionAsset, retargetMotion, humanBones } from './companion-motion.js'
export { inspectMotion, motionAsset, forgetMotionAsset } from './companion-motion.js'

// Each view owns its renderer and model. No shared mixer, bone pose or GPU state.
export function createAvatarView(host, { onError = () => {}, onTick = () => {}, onLayout, onPocket = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0, 0); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100)
  scene.add(new THREE.AmbientLight(0xffffff, .7))
  const key = new THREE.DirectionalLight(0xfff5ef, .85); key.position.set(1, 2, 3); scene.add(key)
  const fill = new THREE.DirectionalLight(0xabc9ff, .25); fill.position.set(-2, 1, -1); scene.add(fill)
  let current = null, disposed = false, sequence = 0, animation = 'idle', showBones = false, paused = false, frame = 0, last = 0, time = 0
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const measurement = onLayout ? createModelMeasurement(renderer, scene, camera, host, onLayout) : null
  let pace = 1
  let pocket = null, pocketOpen = false, pocketSide = 1, pocketSuspended = false
  const project = point => { const p = point.clone().project(camera); return { x: (p.x + 1) / 2 * host.clientWidth, y: (1 - p.y) / 2 * host.clientHeight } }
  let angle = 0, expression = '', intensity = 0.8, motionSequence = 0, motionAbort = null
  let idleTimer = 0
  const gaze = createGazeController(host, camera, wake)
  let speaking = false, parsing = Promise.resolve()

  function disposeModel(model) {
    if (!model) return
    model.externalMixer?.stopAllAction(); if (model.externalMixer) model.externalMixer.uncacheRoot(model.root); model.mixer?.stopAllAction(); if (model.mixer) model.mixer.uncacheRoot(model.root)
    model.helper?.geometry.dispose(); model.helper?.material.dispose()
    if (model.helper) scene.remove(model.helper)
    scene.remove(model.container)
    disposeModelResources(model.root)
  }
  function fit() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height, false); camera.aspect = width / height
    if (current) {
      const { size, center } = current
      // A fixed orthographic projection keeps bone lengths identical in pixels
      // across clips, depth changes and turns. Reserve space once per model.
      const aspect = width / height
      const span = Math.max(size.y * 2.1, Math.max(size.x, size.z) * 1.2 / aspect)
      camera.left = -span * aspect / 2; camera.right = span * aspect / 2
      camera.top = span / 2; camera.bottom = -span / 2
      camera.position.set(0, center.y + size.y * .4, size.y * 8); camera.lookAt(0, center.y + size.y * .4, 0)
      camera.near = .001; camera.far = size.y * 20
      host.dataset.frameSpan = String(span)

    }
    camera.updateProjectionMatrix()
    draw(); measurement?.sample(current, performance.now(), true)
  }
  function setBone(vrm, bone, x, y, z) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone)
    if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z))
  }
  function pose(delta) {
    if (!current) return
    const turn = Math.atan2(Math.sin(angle - current.container.rotation.y), Math.cos(angle - current.container.rotation.y))
    current.container.rotation.y += turn * (delta ? 1 - Math.exp(-delta * 9) : 0)
    const previous = current.lastPose ||= current.poseBones?.map(b => b.quaternion.clone())
    const previousPositions = current.lastPositions ||= current.poseBones?.map(b => b.position.clone())
    const { vrm } = current
    if (vrm) {
      if (!current.externalMixer || reduced.matches || animation === 'rest') {
      vrm.humanoid.resetNormalizedPose()
      const wave = Math.sin(time * 1.3), movement = reduced.matches ? 0 : 1
      // Normalized humanoids face +Z; their left arm extends toward -X.
      // VRM0 orientation is converted once by rotateVRM0, not per bone.
      setBone(vrm, 'leftUpperArm', 0, 0, 1.18)
      setBone(vrm, 'rightUpperArm', 0, 0, -1.18)
      setBone(vrm, 'leftLowerArm', 0, -.08, 0); setBone(vrm, 'rightLowerArm', 0, .08, 0)
      if (animation === 'walk') {
        const phase = time * 6.2, stride = Math.sin(phase) * movement
        setBone(vrm, 'leftUpperLeg', .36 * stride, 0, 0); setBone(vrm, 'rightUpperLeg', -.36 * stride, 0, 0)
        setBone(vrm, 'leftLowerLeg', .52 * Math.max(0, -stride), 0, 0); setBone(vrm, 'rightLowerLeg', .52 * Math.max(0, stride), 0, 0)
        setBone(vrm, 'leftFoot', -.13 * stride, 0, 0); setBone(vrm, 'rightFoot', .13 * stride, 0, 0)
        setBone(vrm, 'leftUpperArm', -.27 * stride, 0, 1.36); setBone(vrm, 'rightUpperArm', .27 * stride, 0, -1.36)
        setBone(vrm, 'spine', .025, .045 * stride, .018 * stride)
        const hips = vrm.humanoid.getNormalizedBoneNode('hips'); hips.position.y += current.size.y * .007 * (1 - Math.cos(phase * 2)) * movement
      } else if (animation === 'wave') {
        setBone(vrm, 'rightUpperArm', 0, 0, -.25)
        setBone(vrm, 'rightLowerArm', 0, 0, 1.6 + .24 * Math.sin(time * 8) * movement)
        setBone(vrm, 'head', 0, .08, -.07)
      } else if (animation === 'idle') {
        setBone(vrm, 'spine', .012 * wave * movement, 0, 0)
        setBone(vrm, 'head', 0, .025 * Math.sin(time * .65) * movement, .015 * wave * movement)
      } else if (animation === 'left') {
        setBone(vrm, 'leftUpperArm', 0, 0, .15)
        setBone(vrm, 'leftLowerArm', 0, 0, -.95 + .3 * wave * movement)
      } else if (animation === 'right') {
        setBone(vrm, 'rightUpperArm', 0, 0, -.15)
        setBone(vrm, 'rightLowerArm', 0, 0, .95 - .3 * wave * movement)
      } else if (animation === 'head') setBone(vrm, 'head', 0, .35 * (reduced.matches ? 1 : wave), 0)
      else if (animation === 'rest') vrm.humanoid.resetNormalizedPose()
      }
      if (current.externalMixer && !reduced.matches && animation !== 'rest') current.externalMixer.update(delta * pace)
      if (previous && delta) current.poseBones.forEach((b, i) => b.quaternion.copy(previous[i].slerp(b.quaternion, 1 - Math.exp(-delta * 16))))
      if (previousPositions && delta) current.poseBones.forEach((b, i) => b.position.copy(previousPositions[i].lerp(b.position, 1 - Math.exp(-delta * 16))))
      current.poseBones.forEach((b, i) => { previousPositions[i].copy(b.position); previous[i].copy(b.quaternion) })
      for (const name of current.expressions || []) {
        if (name.startsWith('look')) continue
        if (name === 'blink' || name === 'blinkLeft' || name === 'blinkRight') continue
        const before = vrm.expressionManager.getValue(name) || 0
        vrm.expressionManager.setValue(name, THREE.MathUtils.lerp(before, name === expression ? intensity : 0, delta ? 1 - Math.exp(-delta * 10) : 1))
      }
      current.nextBlink ??= time + 2 + Math.random() * 4
      if (time > current.nextBlink + .18) current.nextBlink = time + 2 + Math.random() * 4
      const blocksBlink = vrm.expressionManager?.expressionMap?.[expression]?.overrideBlink === 'block' || expression.startsWith('blink')
      const blink = !blocksBlink && !reduced.matches && time >= current.nextBlink ? Math.sin((time - current.nextBlink) / .18 * Math.PI) : 0
      vrm.expressionManager?.setValue('blink', blink)
      gaze.update(current, delta, !reduced.matches && !current.externalMixer && animation === 'idle')
      if (current.expressions.includes('aa')) vrm.expressionManager.setValue('aa', speaking && !reduced.matches ? .12 + .1 * Math.sin(time * 14) : expression === 'aa' ? intensity : 0)
      vrm.update(Math.min(delta, .05))
    } else if (current.externalMixer && !reduced.matches && animation !== 'rest') current.externalMixer.update(delta * pace)
    else if (current.mixer && !reduced.matches && animation !== 'rest') current.mixer.update(delta * pace)
    else current.animate?.(time, animation, reduced.matches)
    if (!vrm) gaze.update(current, delta, !reduced.matches && !current.externalMixer && animation === 'idle')
    current.root.updateMatrixWorld(true)
    current.helper?.updateMatrixWorld(true)
  }
  function draw() { if (!disposed) renderer.render(scene, camera) }
  function wake() {
    clearTimeout(idleTimer); idleTimer = 0
    if (!disposed && !frame) frame = requestAnimationFrame(tick)
  }
  function schedule(relaxed) {
    if (disposed || frame || idleTimer) return
    if (relaxed) idleTimer = setTimeout(() => { idleTimer = 0; wake() }, 1000 / 6)
    else wake()
  }
  function tick(now) {
    if (disposed) return
    frame = 0
    const presenting = pocket?.active && !(pocket.open && host.__hdaPocket?.phase?.done)
    const relaxed = !presenting && animation === 'idle' && !current?.externalMixer && !current?.mixer && !speaking && !gaze.hasPointer()
    const fps = relaxed ? 6 : 30
    if (!current || (paused && !presenting) || pocketSuspended || document.hidden) { last = now; return }
    if (now - last < 1000 / fps) { schedule(false); return }
    const delta = Math.min((now - (last || now)) / 1000, relaxed ? .2 : .05); last = now
    try {
      if (presenting) {
        const state = pocket.frame(delta, project); host.__hdaPocket = state; onPocket(state)
      } else { time += delta * pace; pose(delta); onTick(delta) }
      draw(); measurement?.sample(current, now); schedule(relaxed)
    } catch { paused = true; pocketSuspended = true; onError('角色渲染遇到问题，请重新选择角色') }
  }
  const resize = new ResizeObserver(fit); resize.observe(host)
  const lost = event => { event.preventDefault(); paused = true; onError('图形资源暂时不可用，快捷功能仍可使用') }
  renderer.domElement.addEventListener('webglcontextlost', lost)
  const visible = () => { if (!document.hidden) { last = 0; wake() } }
  document.addEventListener('visibilitychange', visible)
  frame = requestAnimationFrame(tick)
  async function load(item, signal) {
    measurement?.reset()
    const token = ++sequence; motionSequence++; motionAbort?.abort()
    let model
    try {
      if (item.source === 'builtin') model = companion()
      else {
        const response = await fetch('/harness-docket/avatar-model?id=' + encodeURIComponent(item.id) + '&v=' + encodeURIComponent(item.version), { signal, cache: 'no-cache' })
        if (!response.ok) throw new Error('读取模型失败，请刷新后重试')
        const bytes = await response.arrayBuffer()
        if (disposed || token !== sequence || signal?.aborted) return false
        const manager = new THREE.LoadingManager()
        manager.setURLModifier(url => { if (url.startsWith('blob:') || url.startsWith('data:')) return url; throw new Error('模型引用了外部资源') })
        const loader = new GLTFLoader(manager).register(parser => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }))
        await parsing
        if (disposed || token !== sequence || signal?.aborted) return false
        let finishParse
        parsing = new Promise(resolve => { finishParse = resolve })
        let gltf
        try { gltf = await loader.parseAsync(bytes, '') } finally { finishParse() }
        const root = gltf.scene, vrm = gltf.userData.vrm
        model = { root, vrm, container: new THREE.Group() }
        if (item.human && !vrm) throw new Error('VRM 人形骨架未能建立')
        if (vrm) {
          VRMUtils.rotateVRM0(vrm)
          for (const name of ['hips', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) if (!vrm.humanoid.getNormalizedBoneNode(name)) throw new Error('人形骨骼加载失败：' + name)
          vrm.humanoid.resetNormalizedPose()
          setBone(vrm, 'leftUpperArm', 0, 0, 1.18); setBone(vrm, 'rightUpperArm', 0, 0, -1.18)
          vrm.update(0)
        } else if (gltf.animations.length) { model.mixer = new THREE.AnimationMixer(root); model.mixer.clipAction(gltf.animations[0]).play() }
        root.traverse(object => { if (object.isMesh) object.frustumCulled = false })
      }
      if (disposed || token !== sequence || signal?.aborted) { disposeModel(model); return false }
      model.container ??= new THREE.Group(); model.container.add(model.root)
      model.root.updateMatrixWorld(true)
      // Frame the rest pose once, then keep the camera stable during movement.
      const box = new THREE.Box3().setFromObject(model.root), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
      if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite) || size.y < .001 || size.y > 10000) throw new Error('模型尺寸无效')
      model.root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
      model.size = size; model.center = new THREE.Vector3(0, size.y / 2, 0)
      model.helper = new THREE.SkeletonHelper(model.root); model.helper.material.depthTest = false; model.helper.renderOrder = 100; model.helper.visible = showBones
      model.restBones = []
      let mapped = new Map()
      try { mapped = humanBones(model.root) } catch { /* An ambiguous GLB keeps its embedded animations. */ }
      model.root.traverse(node => { if (node.isBone) { model.restBones.push({ node, quaternion: node.quaternion.clone(), position: node.position.clone(), scale: node.scale.clone() }) } })
      model.motionSupport = !!model.vrm || ['hips', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'].every(n => mapped.has(n))
      model.menuId = item.id; model.menuVersion = item.version
      model.menuHips = model.vrm?.humanoid.getRawBoneNode('hips') || (model.motionSupport ? mapped.get('hips') : null)
      model.expressions = effectiveExpressions(model.vrm?.expressionManager)
      model.poseBones = model.vrm ? Object.values(model.vrm.humanoid.normalizedHumanBones).map(b => b.node) : []
      disposeModel(current); current = model
      scene.add(model.container, model.helper); time = 0; pose(0); fit()
      pocket = createPocketGesture(model); if (pocketOpen && !reduced.matches) pocket?.setOpen(true, pocketSide)
      host.dataset.modelId = item.id; host.dataset.rigged = String(item.rigged); host.dataset.loaded = 'true'; wake()
      return true
    } catch (error) {
      if (model && model !== current) disposeModel(model)
      if (token !== sequence || disposed || signal?.aborted) return false
      throw error
    }
  }
  return {
    load,
    snapshot() { return { resources: { ...renderer.info.memory, calls: renderer.info.render.calls }, gaze: host.__hdaGaze || null, eyes: current?.vrm ? ['leftEye', 'rightEye'].map(name => { const node = current.vrm.humanoid.getRawBoneNode(name); return node ? { name, quaternion: node.quaternion.toArray(), world: node.getWorldQuaternion(new THREE.Quaternion()).toArray() } : null }) : [], time, paused, pocket: host.__hdaPocket || null, pose: current?.poseBones.map(node => ({ name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray() })) || [], bones: current?.restBones.map(({ node }) => ({ name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray() })) || [] } },
    capabilities() { return { expressions: current?.expressions || [], motion: !!current?.motionSupport, pocket: !!pocket, gaze: current ? gazeCapability(current) : 'none' } },
    setGaze(mode, enabled = true) { gaze.set(mode, enabled); wake() },
    setSpeaking(value) { speaking = value; wake() },
    setPocket(open, side = 1, suspended = false) {
      wake(); pocketOpen = open; pocketSide = side; pocketSuspended = suspended
      if (open !== pocket?.open) host.__hdaPocket = null
      if (open && !pocket?.open) gaze.reset(current)
      pocket?.setOpen(open && !reduced.matches, side)
      if (open && (!pocket || reduced.matches)) onPocket({ active: true, time: 4, capable: false, instant: true })
    },
    async setMotion(binding, once = false) {
      const token = ++motionSequence, model = current
      motionAbort?.abort(); motionAbort = new AbortController()
      if (!model) return
      if (!binding) { model.externalMixer?.stopAllAction(); model.externalMixer?.uncacheRoot(model.root); model.externalMixer = null; model.mixer?.timeScale !== undefined && (model.mixer.timeScale = 1); return }
      const data = await motionAsset(binding.id, motionAbort.signal)
      if (disposed || token !== motionSequence || model !== current) return
      const before = model.poseBones?.map(b => b.quaternion.clone()), beforeAngle = model.container.rotation.y
      const bonePose = model.restBones.map(({ node }) => ({ node, quaternion: node.quaternion.clone(), position: node.position.clone(), scale: node.scale.clone() }))
      let clip
      try {
        model.container.rotation.y = 0
        if (!model.vrm) for (const b of model.restBones) { b.node.quaternion.copy(b.quaternion); b.node.position.copy(b.position); b.node.scale.copy(b.scale) }
        model.container.updateMatrixWorld(true)
        clip = retargetMotion(data, binding.clip, model)

      } finally {
        model.container.rotation.y = beforeAngle
        for (const b of bonePose) { b.node.quaternion.copy(b.quaternion); b.node.position.copy(b.position); b.node.scale.copy(b.scale) }
        if (before) model.poseBones.forEach((b, i) => b.quaternion.copy(before[i]))
        model.container.updateMatrixWorld(true)
      }
      model.externalMixer?.stopAllAction(); model.externalMixer?.uncacheRoot(model.root)
      model.externalMixer = new THREE.AnimationMixer(model.root)
      const action = model.externalMixer.clipAction(clip); if (once) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true }; action.play()
      if (model.mixer) model.mixer.timeScale = 0
      fit(); wake()
    },
    setPace(value) { pace = Math.max(.3, Math.min(2.5, value)) },
    setExpression(name, value = .8) { expression = name; intensity = value },
    setAnimation(value) { if (animation !== value) { animation = value; time = 0 }; draw(); wake() },
    setSkeleton(value) { showBones = value; if (current?.helper) current.helper.visible = value; draw() },
    setAngle(value) { angle = value; if (!paused && !pocket?.active) pose(0); draw() },
    setPaused(value) { if (value && !paused) { draw(); measurement?.freeze(current) }; paused = value; if (!value) { last = 0; draw(); wake() } },
    dispose() { disposed = true; sequence++; motionSequence++; motionAbort?.abort(); cancelAnimationFrame(frame); clearTimeout(idleTimer); document.removeEventListener('visibilitychange', visible); resize.disconnect(); gaze.dispose(); renderer.domElement.removeEventListener('webglcontextlost', lost); measurement?.dispose(); disposeModel(current); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove() },
  }
}

// Original code-built companion, available even when the user's local models
// directory is absent. Rigid parts follow actual Bone nodes; no external asset.
function companion() {
  const root = new THREE.Group(), hips = new THREE.Bone(); root.add(hips)
  const eyeParts = [], gestureBones = { hips }; hips.position.y = .77
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: .78 })
  const skin = material(0xffd8c4), hair = material(0x40475f), coat = material(0xb2c9ff), dark = material(0x243149), white = material(0xfff4e9)
  const part = (geometry, mat, parent, x, y, z) => { const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh }
  part(new THREE.CapsuleGeometry(.23, .33, 6, 16), coat, hips, 0, 0, 0)
  const head = new THREE.Bone(); head.position.y = .61; hips.add(head); gestureBones.head = head
  part(new THREE.SphereGeometry(.38, 24, 16), skin, head, 0, 0, 0)
  part(new THREE.SphereGeometry(.395, 24, 16, 0, Math.PI * 2, 0, Math.PI * .49), hair, head, 0, .055, -.025)
  for (const side of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(side * .14, -.02, .28); head.add(eye); eyeParts.push(eye)
    part(new THREE.SphereGeometry(.065, 12, 10), dark, eye, 0, 0, .057)
    part(new THREE.SphereGeometry(.021, 10, 8), white, eye, -.012, .024, .112)
    const prefix = side === 1 ? 'left' : 'right'
    const arm = new THREE.Bone(); arm.name = prefix + 'UpperArm'; arm.position.set(side * .27, .21, 0); hips.add(arm)
    const lower = new THREE.Bone(); lower.name = prefix + 'LowerArm'; lower.position.set(side * .03, -.19, 0); arm.add(lower)
    const hand = new THREE.Bone(); hand.name = prefix + 'Hand'; hand.position.set(side * .025, -.18, 0); lower.add(hand)
    part(new THREE.CapsuleGeometry(.083, .10, 5, 12), coat, arm, side * .015, -.10, 0)
    part(new THREE.CapsuleGeometry(.073, .09, 5, 12), coat, lower, side * .012, -.08, 0)
    part(new THREE.SphereGeometry(.086, 12, 10), skin, hand, 0, 0, 0)
    for (const bone of [arm, lower, hand]) gestureBones[bone.name] = bone
    const leg = new THREE.Bone(); leg.name = prefix + 'UpperLeg'; leg.position.set(side * .125, -.32, 0); hips.add(leg); gestureBones[leg.name] = leg
    part(new THREE.CapsuleGeometry(.09, .23, 5, 12), dark, leg, 0, -.14, 0)
    part(new THREE.SphereGeometry(.12, 12, 10), white, leg, 0, -.32, .055)
  }
  const pin = part(new THREE.OctahedronGeometry(.07), white, head, .28, .2, .27); pin.rotation.z = .25
  const gestureRest = Object.values(gestureBones).map(node => ({ node, q: node.quaternion.clone(), p: node.position.clone() }))
  return { root, eyeParts, gestureBones, gestureRest, animate(time, action, reduced) {
    const stride = reduced ? 0 : Math.sin(time * 6.2)
    head.rotation.set(0, action === 'head' ? .35 * (reduced ? 1 : Math.sin(time)) : .05 * Math.sin(time * .7) * !reduced, 0)
    hips.rotation.z = .018 * Math.sin(time) * !reduced
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? 1 : -1, arm = root.getObjectByName(side + 'UpperArm'), leg = root.getObjectByName(side + 'UpperLeg')
      arm.rotation.z = action === side || action === 'wave' && side === 'right' ? sign * (1.8 + .2 * Math.sin(time * 8) * !reduced) : 0
      arm.rotation.x = action === 'walk' ? -.35 * stride * sign : 0
      leg.rotation.x = action === 'walk' ? .4 * stride * sign : 0
    }
  } }
}
