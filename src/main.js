import './style.css';
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const home = $('#home'), editor = $('#editor'), viewport = $('#viewport');
const data = {
  project: 'fps', customName: '', selected: null, mode: 'move', tab: 'scene',
  playing: false, objects: [], script: '',
};
const state = {
  scene: null, camera: null, renderer: null, raycaster: new THREE.Raycaster(),
  clock: new THREE.Clock(), gizmo: null, gizmoHandles: [], drag: null,
  activePointers: new Map(), orbit: null, pinch: null, frame: 0, lastFrame: 0,
  active: false, luaWorker: null, luaTimer: 0,
};
const COLORS = { x: 0xff626f, y: 0x66e6ae, z: 0x63a9ff };
const V3 = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
const mat = (color, roughness=.6) => new THREE.MeshStandardMaterial({color, roughness, metalness:.03});
function toast(text) { const el=$('#toast'); el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1900); }
function setWorker() {
  if (state.luaWorker) state.luaWorker.terminate();
  state.luaWorker = new Worker(new URL('./lua-worker.js', import.meta.url), {type:'module'});
  state.luaWorker.onmessage = (e) => {
    clearTimeout(state.luaTimer); $('#runLua').disabled=false;
    const msg=e.data || {}; $('#luaResult').textContent=msg.error ? `Error: ${msg.error}` : (msg.output || 'Script ejecutado');
    toast(msg.error ? `Lua: ${msg.error}` : (msg.output || 'Script Lua ejecutado').slice(0,100));
  };
  state.luaWorker.onerror = (e) => { clearTimeout(state.luaTimer); $('#runLua') && ($('#runLua').disabled=false); toast('Error del runtime Lua'); };
}
function materialFor(color) { return mat(color); }
function makeNode(name,type,pos=[0,0,0],color=0x6ee5cc) {
  const geo=type==='Sphere'?new THREE.SphereGeometry(.6,20,14):type==='Capsule'?new THREE.CapsuleGeometry(.35,.8,5,10):new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.Mesh(geo,materialFor(color)); mesh.name=name; mesh.position.set(...pos); mesh.castShadow=true; mesh.userData.nodeType=type;
  state.scene.add(mesh); data.objects.push(mesh); return mesh;
}
function setOnTop(obj) { obj.renderOrder=1000; if(obj.material){obj.material.depthTest=false;obj.material.depthWrite=false;} obj.frustumCulled=false; }
function registerVisual(mesh,mode) { mesh.userData.gizmoVisual=mode; state.gizmo.add(mesh); setOnTop(mesh); }
function registerHandle(mesh,axis,mode) { mesh.userData.gizmo={axis,mode}; state.gizmo.add(mesh); state.gizmoHandles.push(mesh); setOnTop(mesh); }
function createGizmo() {
  state.gizmo=new THREE.Group(); state.gizmo.name='TransformGizmo'; state.scene.add(state.gizmo); state.gizmoHandles=[];
  for(const axis of ['x','y','z']) {
    const color=COLORS[axis], q=new THREE.Quaternion().setFromUnitVectors(V3.y,V3[axis]);
    const line=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.82,8),new THREE.MeshBasicMaterial({color,depthTest:false})); line.position.copy(V3[axis]).multiplyScalar(.45); line.quaternion.copy(q); registerVisual(line,'move');
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.075,.19,10),new THREE.MeshBasicMaterial({color,depthTest:false})); arrow.position.copy(V3[axis]).multiplyScalar(.94); arrow.quaternion.copy(q); registerVisual(arrow,'move');
    const hitMove=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,1.08,10),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:false,depthWrite:false})); hitMove.position.copy(V3[axis]).multiplyScalar(.52); hitMove.quaternion.copy(q); registerHandle(hitMove,axis,'move');
    const moveTip=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:false,depthWrite:false})); moveTip.position.copy(V3[axis]).multiplyScalar(.98); registerHandle(moveTip,axis,'move');
    const planeRot=axis==='x'?new THREE.Euler(0,Math.PI/2,0):axis==='y'?new THREE.Euler(Math.PI/2,0,0):new THREE.Euler();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.78,.018,6,48),new THREE.MeshBasicMaterial({color,depthTest:false})); ring.rotation.copy(planeRot); registerVisual(ring,'rotate');
    const hitRing=new THREE.Mesh(new THREE.TorusGeometry(.78,.13,5,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:false,depthWrite:false,side:THREE.DoubleSide})); hitRing.rotation.copy(planeRot); registerHandle(hitRing,axis,'rotate');
    const scaleLine=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.82,6),new THREE.MeshBasicMaterial({color,depthTest:false})); scaleLine.position.copy(V3[axis]).multiplyScalar(.45); scaleLine.quaternion.copy(q); registerVisual(scaleLine,'scale');
    const scaleBox=new THREE.Mesh(new THREE.BoxGeometry(.17,.17,.17),new THREE.MeshBasicMaterial({color,depthTest:false})); scaleBox.position.copy(V3[axis]).multiplyScalar(.94); registerVisual(scaleBox,'scale');
    const hitScale=new THREE.Mesh(new THREE.SphereGeometry(.21,10,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:false,depthWrite:false})); hitScale.position.copy(V3[axis]).multiplyScalar(.94); registerHandle(hitScale,axis,'scale');
  }
  setGizmoMode(data.mode);
}
function setGizmoMode(mode) {
  data.mode=mode;
  for(const h of state.gizmoHandles) h.visible=h.userData.gizmo.mode===mode;
  if(state.gizmo) { for(const child of state.gizmo.children) if(child.userData.gizmoVisual)child.visible=child.userData.gizmoVisual===mode; state.gizmo.visible=!!data.selected&&!data.playing; }
}
function syncGizmo() {
  if(!state.gizmo||!state.camera||!data.selected)return;
  state.gizmo.position.copy(data.selected.getWorldPosition(new THREE.Vector3()));
  const rect=viewport.getBoundingClientRect(), dist=Math.max(.1,state.camera.position.distanceTo(state.gizmo.position));
  const worldPerPixel=(2*dist*Math.tan(THREE.MathUtils.degToRad(state.camera.fov*.5)))/Math.max(1,rect.height);
  const size=THREE.MathUtils.clamp(worldPerPixel*82,.32,2.8);
  state.gizmo.scale.setScalar(size); state.gizmo.visible=!data.playing; state.gizmo.updateMatrixWorld(true);
}
function disposePreviousScene() {
  if(state.scene)state.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  if(state.renderer){state.renderer.renderLists.dispose();state.renderer.dispose();state.renderer.forceContextLoss();}
}
function initScene(which) {
  disposePreviousScene();
  data.project=which; data.objects=[]; data.selected=null;
  state.scene=new THREE.Scene(); state.scene.background=new THREE.Color('#aeb8c0'); state.scene.fog=new THREE.Fog('#777c75',13,42);
  state.camera=new THREE.PerspectiveCamera(48,1,.1,100); state.camera.position.set(6,5,7);
  state.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)); state.renderer.shadowMap.enabled=true; state.renderer.shadowMap.type=THREE.PCFSoftShadowMap; state.renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.replaceChildren(state.renderer.domElement); state.raycaster=new THREE.Raycaster();
  state.scene.add(new THREE.HemisphereLight(0xb9d9ef,0x243140,2.0));
  const light=new THREE.DirectionalLight(0xffedcf,2.7); light.position.set(4,8,5); light.castShadow=true; light.shadow.mapSize.set(512,512); state.scene.add(light);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#66675f',roughness:.96})); ground.rotation.x=-Math.PI/2; ground.position.y=-.56; ground.receiveShadow=true; ground.name='Suelo'; ground.userData.nodeType='Plane'; state.scene.add(ground); data.objects.push(ground);
  const grid=new THREE.GridHelper(80,80,'#766f5e','#858273'); grid.position.y=-.55; grid.userData.helper=true; state.scene.add(grid);
  if(which==='fps') {
    makeNode('Player (FPS)','Capsule',[0,.1,0],0x55dfc2); makeNode('Caja','Box',[-1.7,.1,-1],0x8578ff); makeNode('Luz','Sphere',[2,.4,-1.5],0xffbf70);
    data.script='-- FPS Starter · Lua\nfunction start()\n  print("FPS listo")\nend\n\nfunction update(dt)\n  -- lógica de movimiento\nend\n\nstart()'; $('#projectName').textContent='First Person Starter';
  } else if(which==='tps') {
    makeNode('Player (TPS)','Capsule',[0,.1,0],0xffb86b); makeNode('Plataforma','Box',[0,-.15,0],0x435d72).scale.set(4,.2,4); makeNode('Punto de cámara','Sphere',[0,2.2,4],0x9b8dff);
    data.script='-- TPS Starter · Lua\nfunction start()\n  print("TPS listo")\nend\n\nfunction update(dt)\n  -- lógica de cámara\nend\n\nstart()'; $('#projectName').textContent='Third Person Starter';
  } else {
    makeNode('Player','Capsule',[0,.1,0],0x55dfc2); makeNode('Cubo','Box',[1,.5,-1],0x8578ff);
    data.script=`-- ${data.customName||'Mi juego'} · Lua\nfunction start()\n  print("Proyecto iniciado")\nend\n\nfunction update(dt)\n  -- lógica del juego\nend\n\nstart()`; $('#projectName').textContent=data.customName||'Mi juego';
  }
  data.selected=data.objects.find(o=>o.name.startsWith('Player'))||data.objects[1];
  createGizmo(); state.spherical={theta:.7,phi:1.12,radius:8}; updateTree(); updateInspector(); resizeViewport();
}
function resizeViewport() {
  if(!state.renderer||!state.camera)return;
  const w=viewport.clientWidth,h=viewport.clientHeight; if(w<1||h<1)return;
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)); state.renderer.setSize(w,h,false);
  state.camera.aspect=w/h; state.camera.updateProjectionMatrix(); syncGizmo();
}
function pointToNdc(e) { const r=viewport.getBoundingClientRect(); return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); }
function rayFromPoint(e) { state.raycaster.setFromCamera(pointToNdc(e),state.camera); return state.raycaster.ray; }
function updateCamera() {
  if(!state.camera)return;
  if(data.playing) {
    const target=data.objects.find(o=>o.name.startsWith('Player'));
    if(target) { const yaw=state.spherical.theta; if(data.project==='tps'){state.camera.position.set(target.position.x+Math.sin(yaw)*4,target.position.y+2.3,target.position.z+Math.cos(yaw)*4);state.camera.lookAt(target.position.x,target.position.y+.25,target.position.z)}else{state.camera.position.set(target.position.x+Math.sin(yaw)*.25,target.position.y+1.5,target.position.z+Math.cos(yaw)*.25);state.camera.lookAt(target.position.x-Math.sin(yaw)*2,target.position.y+1.4,target.position.z-Math.cos(yaw)*2)} }
    return;
  }
  const target=data.selected?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3(); const s=state.spherical;
  state.camera.position.set(target.x+s.radius*Math.sin(s.phi)*Math.sin(s.theta),target.y+s.radius*Math.cos(s.phi),target.z+s.radius*Math.sin(s.phi)*Math.cos(s.theta)); state.camera.lookAt(target);
}
function tick(time=0) {
  state.frame=0; if(!state.active||document.hidden)return;
  if(time-state.lastFrame<1000/60){state.frame=requestAnimationFrame(tick);return;}
  state.lastFrame=time; const dt=Math.min(state.clock.getDelta(),.04); updateCamera(); syncGizmo();
  if(data.playing){const p=data.objects.find(o=>o.name.startsWith('Player'));if(p){p.position.x+=moveVec.x*dt*3.2;p.position.z+=moveVec.z*dt*3.2}}
  state.renderer?.render(state.scene,state.camera); state.frame=requestAnimationFrame(tick);
}
function startRender() { state.active=true; state.clock.start(); if(!state.frame)state.frame=requestAnimationFrame(tick); }
function stopRender() { state.active=false; if(state.frame)cancelAnimationFrame(state.frame);state.frame=0; }
function updateTree() {
  const box=$('#nodeList'); if(!box)return; box.replaceChildren();
  for(const o of data.objects){ if(o.userData.helper)continue; const d=document.createElement('div'); d.className='node-item'+(o===data.selected?' selected':''); d.textContent=(o.name==='Suelo'?'▱':o.userData.nodeType==='Capsule'?'◉':o.userData.nodeType==='Sphere'?'●':'◧')+'　'+o.name; d.onclick=()=>selectObject(o); box.append(d); }
}
function selectObject(o) { data.selected=o; updateTree(); updateInspector(); syncGizmo(); }
function vecProp(label,v,key){return `<div class="prop"><label>${label}</label><div class="xyz">${['x','y','z'].map((axis,i)=>`<input type="number" step="0.1" value="${v[axis].toFixed(1)}" data-prop="${key}" data-axis="${i}" aria-label="${axis}">`).join('')}</div></div>`;}
function updateInspector() {
  const box=$('#inspectBody'); if(!box||!data.selected){if(box)box.textContent='Selecciona un nodo';return;}
  const o=data.selected; box.innerHTML=`<div class="inspect-title">${o.name}</div>${vecProp('POSICIÓN',o.position,'pos')}${vecProp('ROTACIÓN',o.rotation,'rot')}${vecProp('ESCALA',o.scale,'scale')}<div class="prop"><label>TIPO DE NODO</label><span style="font-size:10px;color:#50e0c0">${o.userData.nodeType||'Node3D'}</span></div><div class="prop"><button id="deleteNode" class="small-btn">Eliminar nodo</button></div>`;
  box.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{const v=Number(inp.value),k=inp.dataset.prop,axis=['x','y','z'][Number(inp.dataset.axis)];if(Number.isFinite(v))data.selected[k][axis]=v;syncGizmo();});
  $('#deleteNode').onclick=()=>{if(o.name==='Suelo'){toast('El suelo es parte del escenario');return;}state.scene.remove(o);data.objects=data.objects.filter(x=>x!==o);selectObject(data.objects.find(x=>x.name.startsWith('Player'))||data.objects[0]);};
}
function addCustomCard(name) { const card=document.createElement('button');card.className='project-card';card.innerHTML='<div class="thumb tps"><span>3D</span><div class="figure">✦</div></div><b></b><small>Proyecto propio · escena 3D</small><i>ABRIR PROYECTO　›</i>';card.querySelector('b').textContent=name;card.onclick=()=>{data.customName=name;showEditor('custom');};$('.project-grid').append(card); }
JSON.parse(localStorage.getItem('mf_projects')||'[]').forEach(addCustomCard);
$('#newProject').onclick=()=>{const n=prompt('Nombre del nuevo proyecto','Mi juego');if(!n)return;const p=JSON.parse(localStorage.getItem('mf_projects')||'[]');if(p.includes(n)){toast('Ya existe ese proyecto');return;}p.push(n);localStorage.setItem('mf_projects',JSON.stringify(p));addCustomCard(n);data.customName=n;showEditor('custom');};
document.querySelectorAll('.project-card[data-project]').forEach(c=>c.onclick=()=>showEditor(c.dataset.project));
function showEditor(which) { home.classList.add('hidden');editor.classList.remove('hidden');data.playing=false;$('#runHud').classList.add('hidden');initScene(which);resizeViewport();setWorker();startRender(); }
$('#back').onclick=()=>{data.playing=false;stopRender();editor.classList.add('hidden');home.classList.remove('hidden');if(state.luaWorker){state.luaWorker.terminate();state.luaWorker=null;}};
$('#save').onclick=()=>{localStorage.setItem('mf_scene_'+data.project,JSON.stringify({script:data.script,nodes:data.objects.filter(o=>!o.userData.helper).map(o=>({name:o.name,type:o.userData.nodeType,position:o.position.toArray(),rotation:o.rotation.toArray(),scale:o.scale.toArray(),color:o.material?.color?.getHex()}))}));toast('Proyecto guardado en este dispositivo');};
function addPrimitive(type) { const o=type==='Sphere'?makeNode('Esfera','Sphere',[0,1,0],0x9b8dff):type==='Capsule'?makeNode('Cápsula','Capsule',[0,1,0],0xffb86b):makeNode('Cubo','Box',[0,1,0],0x50e0c0);selectObject(o); }
$('#addNode').onclick=()=>{const c=prompt('Agregar nodo: cubo, esfera o cápsula','cubo')?.toLowerCase();if(!c)return;addPrimitive(c.includes('esf')?'Sphere':c.includes('caps')||c.includes('cáps')?'Capsule':'Box');};
function screenOf(world) { const p=world.clone().project(state.camera),r=viewport.getBoundingClientRect();return new THREE.Vector2(r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2); }
function beginGizmoDrag(hit,e) {
  const {axis,mode}=hit.object.userData.gizmo,o=data.selected,dir=V3[axis].clone(); const center=o.getWorldPosition(new THREE.Vector3());
  const rotBasis=axis==='x'?[new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]:axis==='y'?[new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)]:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)];
  state.drag={pointerId:e.pointerId,axis,mode,startX:e.clientX,startY:e.clientY,startPosition:o.position.clone(),startScale:o.scale.clone(),startQuaternion:o.quaternion.clone(),center,dir,rotU:rotBasis[0],rotV:rotBasis[1],axisScreen:null,pixelsPerUnit:0,lastAngle:null,totalAngle:0};
  if(mode==='rotate') {const ray=rayFromPoint(e),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(dir,center),p=new THREE.Vector3();if(ray.intersectPlane(plane,p)){const v=p.sub(center).normalize();state.drag.lastAngle=Math.atan2(v.dot(state.drag.rotV),v.dot(state.drag.rotU));} }
  if(mode!=='rotate') {const a=screenOf(center),b=screenOf(center.clone().add(dir));const v=b.sub(a);state.drag.pixelsPerUnit=v.length();state.drag.axisScreen=v.length()>3?v.normalize():new THREE.Vector2(0,-1);}
  e.preventDefault();e.stopPropagation();viewport.setPointerCapture(e.pointerId);state.orbit=null;
}
function moveGizmoDrag(e) {
  const d=state.drag,o=data.selected;if(!d||!o||e.pointerId!==d.pointerId)return; e.preventDefault();
  if(d.mode==='move'||d.mode==='scale') {
    const delta=new THREE.Vector2(e.clientX-d.startX,e.clientY-d.startY),px=Math.max(d.pixelsPerUnit,viewport.clientHeight*.025),amount=delta.dot(d.axisScreen)/px;
    if(d.mode==='move')o.position.copy(d.startPosition).addScaledVector(d.dir,amount);
    else {const i=['x','y','z'].indexOf(d.axis);o.scale.copy(d.startScale);o.scale.setComponent(i,THREE.MathUtils.clamp(d.startScale.getComponent(i)+amount,.05,100));}
  } else {
    const ray=rayFromPoint(e),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(d.dir,d.center),p=new THREE.Vector3();if(!ray.intersectPlane(plane,p))return;
    const v=p.sub(d.center).normalize(),angle=Math.atan2(v.dot(d.rotV),v.dot(d.rotU));if(d.lastAngle!==null){let delta=angle-d.lastAngle;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;d.totalAngle+=delta;}d.lastAngle=angle;
    o.quaternion.copy(d.startQuaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(d.dir,d.totalAngle));
  }
  syncGizmo();
}
function endPointer(e) {
  const p=state.activePointers.get(e.pointerId); if(p)state.activePointers.delete(e.pointerId);
  if(state.drag&&state.drag.pointerId===e.pointerId){state.drag=null;updateTree();updateInspector();return;}
  if(state.pinch){state.pinch=null;return;}
  const orb=state.orbit;state.orbit=null;if(!orb||data.playing)return;
  const dist=Math.hypot(e.clientX-orb.startX,e.clientY-orb.startY);if(dist>9)return;
  state.raycaster.setFromCamera(pointToNdc(e),state.camera);
  const hits=state.raycaster.intersectObjects(data.objects.filter(o=>!o.userData.helper),false);if(hits.length)selectObject(hits[0].object);
}
viewport.addEventListener('pointerdown',e=>{
  state.activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(data.playing){if(e.clientX>viewport.getBoundingClientRect().left+viewport.clientWidth*.32){state.orbit={pointerId:e.pointerId,lastX:e.clientX,lastY:e.clientY,play:true};viewport.setPointerCapture(e.pointerId);}return;}
  if(state.activePointers.size===2){state.drag=null;state.orbit=null;viewport.setPointerCapture(e.pointerId);const a=[...state.activePointers.values()];state.pinch={distance:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)),radius:state.spherical.radius};return;}
  state.raycaster.setFromCamera(pointToNdc(e),state.camera);syncGizmo();const gh=state.raycaster.intersectObjects(state.gizmoHandles.filter(h=>h.visible),false);
  if(gh.length){beginGizmoDrag(gh[0],e);return;}
  state.orbit={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY};viewport.setPointerCapture(e.pointerId);
},{passive:false});
viewport.addEventListener('pointermove',e=>{
  if(state.activePointers.has(e.pointerId))state.activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(state.activePointers.size>=2&&state.pinch){const a=[...state.activePointers.values()],dist=Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y));state.spherical.radius=THREE.MathUtils.clamp(state.pinch.radius*state.pinch.distance/dist,2,20);return;}
  if(state.drag){moveGizmoDrag(e);return;}
  const o=state.orbit;if(!o||o.pointerId!==e.pointerId)return;const dx=e.clientX-o.lastX,dy=e.clientY-o.lastY;o.lastX=e.clientX;o.lastY=e.clientY;
  if(data.playing){state.spherical.theta-=dx*.008;return;}
  if(e.shiftKey){state.camera.position.x-=dx*.012;state.camera.position.y+=dy*.012;return;}
  state.spherical.theta-=dx*.008;state.spherical.phi=THREE.MathUtils.clamp(state.spherical.phi+dy*.008,.15,2.85);
},{passive:false});
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);viewport.addEventListener('wheel',e=>{state.spherical.radius=THREE.MathUtils.clamp(state.spherical.radius+e.deltaY*.008,2,20);},{passive:true});viewport.addEventListener('contextmenu',e=>e.preventDefault());
const resizeObserver=new ResizeObserver(()=>resizeViewport());resizeObserver.observe(viewport);window.addEventListener('resize',resizeViewport);window.addEventListener('orientationchange',()=>setTimeout(resizeViewport,180));window.visualViewport?.addEventListener('resize',resizeViewport);
$('#play').onclick=()=>{data.playing=!data.playing;state.drag=null;state.orbit=null;$('#runHud').classList.toggle('hidden',!data.playing);$('#play').textContent=data.playing?'■ DETENER':'▶ JUGAR';$('#fpsLabel').textContent=data.playing?'EJECUTANDO':'EDITOR';setGizmoMode(data.mode);toast(data.playing?'Modo juego · controles táctiles':'Modo edición');};
$('#jump').addEventListener('pointerdown',e=>e.stopPropagation());$('#action').addEventListener('pointerdown',e=>e.stopPropagation());$('#jump').onclick=()=>{const p=data.objects.find(o=>o.name.startsWith('Player'));if(p){p.position.y+=.55;setTimeout(()=>p.position.y=Math.max(.1,p.position.y-.55),220);}};$('#action').onclick=()=>toast('Acción móvil');
const stick=$('#stick'),knob=$('.stick-knob');let stickId=null,moveVec={x:0,z:0};
function stickMove(e){const r=stick.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,m=Math.min(23,Math.hypot(x,y)),a=Math.atan2(y,x);x=Math.cos(a)*m;y=Math.sin(a)*m;knob.style.transform=`translate(${x}px,${y}px)`;moveVec.x=x/23;moveVec.z=y/23;}
stick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);});stick.addEventListener('pointermove',e=>{if(stickId===e.pointerId)stickMove(e);});stick.addEventListener('pointerup',e=>{e.stopPropagation();stickId=null;moveVec={x:0,z:0};knob.style.transform='';});stick.addEventListener('pointercancel',()=>{stickId=null;moveVec={x:0,z:0};knob.style.transform='';});
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');data.tab=b.dataset.tab;openDrawer(data.tab);});
function openDrawer(tab){const d=$('#drawer'),body=$('#drawerContent');d.classList.add('open');
  if(tab==='script'){body.innerHTML='<div class="drawer-inner"><h3>⌘　SCRIPT LUA</h3><div class="lua-safe">Runtime aislado · límite de 1,5 s por ejecución</div><textarea class="codebox" id="luaEditor" spellcheck="false"></textarea><div class="action-row"><button id="runLua" class="small-btn accent">▶ Ejecutar script</button><button id="resetLua" class="small-btn">Restaurar plantilla</button><span id="luaResult" class="lua-result"></span></div></div>';$('#luaEditor').value=data.script;$('#luaEditor').oninput=e=>data.script=e.target.value;$('#runLua').onclick=runLua;$('#resetLua').onclick=()=>{initSceneScript();$('#luaEditor').value=data.script;toast('Plantilla restaurada');};}
  else if(tab==='transform'){body.innerHTML='<div class="drawer-inner"><h3>↗　GIZMOS 3D · ARRASTRA LOS EJES</h3><div class="action-row axis-buttons"><button data-mode="move">↔</button><button data-mode="rotate">⟳</button><button data-mode="scale">□</button><span class="hint">Toca y arrastra un eje coloreado del gizmo en el visor.</span></div><div class="action-row"><button class="small-btn" data-axis="x">X +</button><button class="small-btn" data-axis="y">Y +</button><button class="small-btn" data-axis="z">Z +</button><button class="small-btn" data-axis="-x">X −</button><button class="small-btn" data-axis="-y">Y −</button><button class="small-btn" data-axis="-z">Z −</button></div></div>';body.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');setGizmoMode(b.dataset.mode);toast('Gizmo: '+b.dataset.mode);});body.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>applyAxisStep(b.dataset.axis));}
  else if(tab==='hud'){body.innerHTML='<div class="drawer-inner"><h3>▦　HUD MÓVIL</h3><div class="lua-safe">Joystick a la izquierda · salto/acción a la derecha · espacio seguro para cámara.</div><div class="hud-preview"><div class="stick" data-hud="stick"><div class="stick-knob"></div></div><div class="run-buttons"><button data-hud="jump">↑</button><button data-hud="action">●</button></div></div><div class="action-row"><button id="resetHud" class="small-btn">Restablecer vista previa</button></div></div>';enableHudMove();$('#resetHud').onclick=()=>openDrawer('hud');}
  else {body.innerHTML='<div class="drawer-inner"><h3>◈　ESCENA Y NODOS</h3><div class="action-row"><button class="small-btn" id="addCube">＋ Cubo</button><button class="small-btn" id="addSphere">＋ Esfera</button><button class="small-btn" id="addLight">☼ Luz</button></div><div class="hint">Toca un objeto para seleccionarlo; arrastra fuera del gizmo para orbitar. Pellizca para zoom.</div></div>';$('#addCube').onclick=()=>addPrimitive('Box');$('#addSphere').onclick=()=>addPrimitive('Sphere');$('#addLight').onclick=()=>{const l=new THREE.PointLight(0x9cf7e0,14,9);l.position.set(1,3,1);l.name='Luz puntual';state.scene.add(l);const m=makeNode('Marcador de luz','Sphere',[1,3,1],0x9cf7e0);m.scale.setScalar(.16);selectObject(m);toast('Luz puntual agregada');};}
}
function initSceneScript(){data.script=data.project==='fps'?'-- FPS Starter · Lua\nfunction start()\n print("FPS listo")\nend\nfunction update(dt)\n -- lógica de movimiento\nend\nstart()':'-- Starter · Lua\nfunction start()\n print("Proyecto iniciado")\nend\nfunction update(dt)\n -- lógica del juego\nend\nstart()';}
function applyAxisStep(key){if(!data.selected)return;const sign=key.startsWith('-')?-1:1,axis=key.replace('-',''),o=data.selected;if(data.mode==='move')o.position[axis]+=sign*.25;else if(data.mode==='rotate')o.rotation[axis]+=sign*.2;else o.scale[axis]=Math.max(.05,o.scale[axis]+sign*.1);updateInspector();syncGizmo();}
function runLua(){if(!state.luaWorker)setWorker();const b=$('#runLua');b.disabled=true;$('#luaResult').textContent='Ejecutando…';clearTimeout(state.luaTimer);state.luaTimer=setTimeout(()=>{state.luaWorker?.terminate();state.luaWorker=null;if(b)b.disabled=false;$('#luaResult').textContent='Tiempo agotado (1,5 s); ejecución detenida.';toast('Lua detenido por límite de tiempo');},1500);state.luaWorker.postMessage({source:data.script});}
function enableHudMove(){document.querySelectorAll('[data-hud]').forEach(el=>{let dragging=false,ox=0,oy=0;el.onpointerdown=e=>{dragging=true;ox=e.clientX-el.offsetLeft;oy=e.clientY-el.offsetTop;el.setPointerCapture(e.pointerId);e.stopPropagation();};el.onpointermove=e=>{if(!dragging)return;const p=el.parentElement,r=p.getBoundingClientRect();el.style.left=Math.max(0,Math.min(r.width-el.offsetWidth,e.clientX-r.left-ox))+'px';el.style.top=Math.max(0,Math.min(r.height-el.offsetHeight,e.clientY-r.top-oy))+'px';el.style.bottom='auto';el.style.right='auto';};el.onpointerup=()=>dragging=false;});}
openDrawer('scene');
$('#treeFilter').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('#nodeList .node-item').forEach(n=>{n.hidden=!n.textContent.toLowerCase().includes(q);});});
document.querySelectorAll('[data-dock="scene"]').forEach(b=>b.onclick=()=>{$('#nodeList').classList.remove('hidden');$('#fileList').classList.add('hidden');document.querySelectorAll('.tree .dock-tab[data-dock]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('[data-dock="files"]').forEach(b=>b.onclick=()=>{$('#nodeList').classList.add('hidden');$('#fileList').classList.remove('hidden');document.querySelectorAll('.tree .dock-tab[data-dock]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('.main-modes [data-tool="script"]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x.dataset.tab==='script'));openDrawer('script');});
document.querySelectorAll('.main-modes [data-tool="game"]').forEach(b=>b.onclick=()=>{$('#play').click();});
document.querySelectorAll('.resource-tab').forEach(b=>b.onclick=()=>{if(b.classList.contains('add-resource')){toast('Escena nueva');return;}document.querySelectorAll('.resource-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRender();}else if(!editor.classList.contains('hidden'))startRender();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&data.playing)$('#play').click();});
