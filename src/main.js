import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
const AppUpdater = registerPlugin('AppUpdater');
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.9';

const $ = (s) => document.querySelector(s);
const home = $('#home'), editor = $('#editor'), viewport = $('#viewport');
const data = {
  project: 'fps', customName: '', selected: null, mode: 'move', tab: 'scene',
  playing: false, objects: [], script: '',
};
const state = {
  scene: null, rootNode: null, camera: null, renderer: null, raycaster: new THREE.Raycaster(), focusTarget: new THREE.Vector3(), outlineEnabled: true, outlineNodes: [], scriptTarget: null,
  clock: new THREE.Clock(), gizmo: null, gizmoHandles: [], drag: null,
  activePointers: new Map(), orbit: null, pinch: null, frame: 0, lastFrame: 0,
  active: false, luaWorker: null, luaTimer: 0, playSnapshot: null, velocity: new THREE.Vector3(), verticalVelocity: 0, grounded: false, paused: false, lastPhysicsUi: 0,
};
const COLORS = { x: 0xff626f, y: 0x66e6ae, z: 0x63a9ff };
const V3 = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
const mat = (color, roughness=.6) => new THREE.MeshStandardMaterial({color, roughness, metalness:.03});
function toast(text) { const el=$('#toast'); el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1900); }
function setWorker() {
  if(state.luaWorker)state.luaWorker.terminate();
  state.luaWorker=new Worker(new URL('./lua-worker.js',import.meta.url),{type:'module'});state.luaWaiting=false;
  state.luaWorker.onmessage=e=>{const msg=e.data||{};if(msg.type==='command'){applyLuaCommand(msg);return;}if(msg.type==='ready'){clearTimeout(state.luaTimer);state.luaWaiting=false;const b=$('#runOverlayScript');if(b)b.disabled=false;const result=$('#luaResult');if(result)result.textContent=msg.output||'Script iniciado';if(msg.output)toast(msg.output.slice(0,100));return;}if(msg.type==='tick'){clearTimeout(state.luaTimer);state.luaWaiting=false;return;}if(msg.type==='done'){clearTimeout(state.luaTimer);state.luaWaiting=false;return;}if(msg.type==='error'){clearTimeout(state.luaTimer);state.luaWaiting=false;state.luaLive=false;const b=$('#runOverlayScript');if(b)b.disabled=false;const result=$('#luaResult');if(result)result.textContent=`Error: ${msg.error}`;toast(`Lua: ${msg.error}`);state.luaWorker?.terminate();state.luaWorker=null;}};
  state.luaWorker.onerror=()=>{clearTimeout(state.luaTimer);state.luaWaiting=false;const b=$('#runOverlayScript');if(b)b.disabled=false;toast('Error del runtime Lua');state.luaWorker?.terminate();state.luaWorker=null;};
}
function materialFor(color) { return mat(color); }
function makeNode(name,type,pos=[0,0,0],color=0x6ee5cc,parent=null) {
  const geo=type==='Sphere'?new THREE.SphereGeometry(.6,20,14):type==='Capsule'?new THREE.CapsuleGeometry(.35,.8,5,10):new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.Mesh(geo,materialFor(color)); mesh.name=name; mesh.position.set(...pos); mesh.castShadow=true; mesh.userData.nodeType=type;
  const container=parent||(data.selected||state.rootNode);container.add(mesh);data.objects.push(mesh);return mesh;
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
  if(!state.gizmo)return;if(!state.camera||!data.selected){state.gizmo.visible=false;return;}
  const target=data.selected;
  state.gizmo.position.copy(target.getWorldPosition(new THREE.Vector3()));
  const rect=viewport.getBoundingClientRect(), dist=Math.max(.1,state.camera.position.distanceTo(state.gizmo.position));
  const worldPerPixel=(2*dist*Math.tan(THREE.MathUtils.degToRad(state.camera.fov*.5)))/Math.max(1,rect.height);
  const size=THREE.MathUtils.clamp(worldPerPixel*82,.32,2.8);
  state.gizmo.scale.setScalar(size); state.gizmo.visible=!data.playing; state.gizmo.updateMatrixWorld(true);
}
function disposePreviousScene() {
  if(state.scene)state.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}for(const url of o.userData?.blobUrls||[])URL.revokeObjectURL(url);});
  if(state.renderer){state.renderer.renderLists.dispose();state.renderer.dispose();state.renderer.forceContextLoss();}
}
function initScene(which) {
  disposePreviousScene();data.project=which;data.objects=[];data.selected=null;
  state.scene=new THREE.Scene();state.scene.background=new THREE.Color('#aeb8c0');state.scene.fog=new THREE.Fog('#777c75',13,42);
  state.rootNode=new THREE.Group();state.rootNode.name='root';state.rootNode.userData.nodeType='Node3D';state.scene.add(state.rootNode);
  state.paused=false;state.velocity.set(0,0,0);state.verticalVelocity=0;state.playSnapshot=null;state.focusTarget.set(0,0,0);state.scriptTarget=null;state.outlineNodes=[];state.drag=null;state.orbit=null;state.pinch=null;state.activePointers.clear();moveVec={x:0,z:0};
  state.camera=new THREE.PerspectiveCamera(48,1,.1,120);state.camera.position.set(6,5,7);
  state.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});state.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));state.renderer.shadowMap.enabled=true;state.renderer.shadowMap.type=THREE.PCFSoftShadowMap;state.renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.replaceChildren(state.renderer.domElement);state.raycaster=new THREE.Raycaster();
  state.scene.add(new THREE.HemisphereLight(0xb9d9ef,0x243140,2));const light=new THREE.DirectionalLight(0xffedcf,2.7);light.position.set(4,8,5);light.castShadow=true;light.shadow.mapSize.set(512,512);state.scene.add(light);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#66675f',roughness:.96}));ground.rotation.x=-Math.PI/2;ground.position.y=-.56;ground.receiveShadow=true;ground.name='Suelo';ground.userData.nodeType='Plane';state.rootNode.add(ground);data.objects.push(ground);
  state.grid=new THREE.GridHelper(80,80,'#766f5e','#858273');state.grid.position.y=-.55;state.grid.userData.helper=true;state.scene.add(state.grid);
  if(which==='fps'){
    makeNode('Player (FPS)','Capsule',[0,.19,0],0x55dfc2);makeNode('Caja','Box',[-1.7,.1,-1],0x8578ff);makeNode('Luz','Sphere',[2,.4,-1.5],0xffbf70);$('#projectName').textContent='First Person Starter';
  }else if(which==='tps'){
    makeNode('Player (TPS)','Capsule',[0,.70,0],0xffb86b);makeNode('Plataforma','Box',[0,-.15,0],0x435d72).scale.set(4,.2,4);makeNode('Punto de cámara','Sphere',[0,2.2,4],0x9b8dff);$('#projectName').textContent='Third Person Starter';
  }else{
    makeNode('Player','Capsule',[0,.19,0],0x55dfc2);makeNode('Cubo','Box',[1,.5,-1],0x8578ff);$('#projectName').textContent=data.customName||'Mi juego';
  }
  const player=data.objects.find(o=>o.name.startsWith('Player'));
  const starter=`-- Controlador de ${player?.name||'Player'}\n-- Joystick y salto: controlados por el motor.\n-- API: move(x,y,z), set_position(x,y,z), rotate(x,y,z), set_scale(x,y,z).\nfunction start()\n  print("Controlador listo: " .. node.name)\nend\nfunction update(dt)\n  -- Ejemplo: move(0, 0, -1 * dt)\nend`;
  data.script=starter;if(player)player.userData.scriptText=starter;
  data.selected=player||data.objects.find(o=>!o.userData.helper);createGizmo();state.spherical={theta:.7,phi:1.12,radius:8};if(data.selected)state.focusTarget.copy(data.selected.getWorldPosition(new THREE.Vector3()));updateTree();updateInspector();refreshOutline();resizeViewport();
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
  const target=state.focusTarget,s=state.spherical;
  state.camera.position.set(target.x+s.radius*Math.sin(s.phi)*Math.sin(s.theta),target.y+s.radius*Math.cos(s.phi),target.z+s.radius*Math.sin(s.phi)*Math.cos(s.theta));state.camera.lookAt(target);
}
function tick(time=0) {
  state.frame=0; if(!state.active||document.hidden)return;
  if(time-state.lastFrame<1000/60){state.frame=requestAnimationFrame(tick);return;}
  state.lastFrame=time; const dt=Math.min(state.clock.getDelta(),.04); if(data.playing&&!state.paused)updatePlayerPhysics(dt); updateCamera(); syncGizmo();
  if(data.playing&&!state.paused&&state.luaLive&&state.luaWorker&&!state.luaWaiting){state.luaWaiting=true;state.luaTimer=setTimeout(()=>{if(state.luaWaiting){state.luaWorker?.terminate();state.luaWorker=null;state.luaLive=false;state.luaWaiting=false;toast('Lua detenido: excedió el límite por actualización');}},1500);state.luaWorker.postMessage({type:'update',dt});}
  state.renderer?.render(state.scene,state.camera); state.frame=requestAnimationFrame(tick);
}
function startRender() { state.active=true; state.clock.start(); if(!state.frame)state.frame=requestAnimationFrame(tick); }
function startGame(){if(data.playing)return;closeScriptMode();state.playSnapshot=new Map(data.objects.filter(o=>o.position&&o.quaternion&&o.scale).map(o=>[o,{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()}]));data.playing=true;state.paused=false;state.velocity.set(0,0,0);state.verticalVelocity=0;state.grounded=false;state.jumpQueued=false;moveVec={x:0,z:0};state.drag=null;state.orbit=null;$('#runHud').classList.remove('hidden');$('#play').innerHTML='<img src="/icons/player-stop.svg" alt="Detener">';$('#pause').classList.remove('active');$('#fpsLabel').textContent='EJECUTANDO';$('#bottomStatus').textContent='Juego en ejecución';if(!state.frame)startRender();setGizmoMode(data.mode);const player=data.objects.find(o=>o.name.startsWith('Player'));const script=player?.userData.scriptText;if(script)executeLua(script,player,true,true);}
function stopGame(){if(!data.playing)return;data.playing=false;state.paused=false;if(state.luaWorker){state.luaWorker.terminate();state.luaWorker=null;}state.luaLive=false;clearTimeout(state.luaTimer);state.luaWaiting=false;moveVec={x:0,z:0};state.velocity.set(0,0,0);state.verticalVelocity=0;state.jumpQueued=false;if(state.playSnapshot){for(const [o,t] of state.playSnapshot){o.position.copy(t.position);o.quaternion.copy(t.quaternion);o.scale.copy(t.scale);}state.playSnapshot=null;}$('#runHud').classList.add('hidden');$('#play').innerHTML='<img src="/icons/play.svg" alt="Ejecutar">';$('#pause').classList.remove('active');$('#fpsLabel').textContent='EDITOR';$('#bottomStatus').textContent='Edición · listo';updateTree();updateInspector();updateCamera();syncGizmo();}
function updatePlayerPhysics(dt){const p=data.objects.find(o=>o.name.startsWith('Player'));if(!p)return;const theta=state.spherical.theta,stickX=THREE.MathUtils.clamp(moveVec.x,-1,1),stickZ=THREE.MathUtils.clamp(moveVec.z,-1,1);const tx=(stickX*Math.cos(theta)+stickZ*Math.sin(theta))*3.6,tz=(-stickX*Math.sin(theta)+stickZ*Math.cos(theta))*3.6,moving=Math.hypot(stickX,stickZ)>.08,blend=1-Math.exp(-(moving?15:8)*dt);state.velocity.x+=(tx-state.velocity.x)*blend;state.velocity.z+=(tz-state.velocity.z)*blend;if(!moving&&Math.hypot(state.velocity.x,state.velocity.z)<.025){state.velocity.x=0;state.velocity.z=0;}p.position.x+=state.velocity.x*dt;p.position.z+=state.velocity.z*dt;let floor=-.56;const platform=data.objects.find(o=>o.name==='Plataforma');if(platform){const hx=Math.abs(platform.scale.x)*.5,hz=Math.abs(platform.scale.z)*.5;if(Math.abs(p.position.x-platform.position.x)<=hx+.3&&Math.abs(p.position.z-platform.position.z)<=hz+.3)floor=Math.max(floor,platform.position.y+Math.abs(platform.scale.y)*.5);}const half=p.userData.nodeType==='Capsule'?.75:.5;if(state.jumpQueued&&state.grounded){state.verticalVelocity=5;state.grounded=false;}state.jumpQueued=false;state.verticalVelocity=Math.max(-18,state.verticalVelocity-14*dt);p.position.y+=state.verticalVelocity*dt;const groundY=floor+half;if(p.position.y<=groundY){p.position.y=groundY;state.verticalVelocity=0;state.grounded=true;}else state.grounded=false;}
function stopRender() { state.active=false; if(state.frame)cancelAnimationFrame(state.frame);state.frame=0; }
function nodeDepth(o){let n=0,p=o.parent;while(p&&p!==state.scene){n++;p=p.parent;}return Math.max(0,n-1);}
function escapeHtml(text){return String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function updateTree(){const box=$('#nodeList');if(!box)return;box.replaceChildren();const add=(o,depth)=>{if(o.userData.helper)return;const d=document.createElement('div');d.className='node-item'+(o===data.selected?' selected':'');d.style.paddingLeft=`${5+depth*10}px`;d.title=`${o.name} · Padre: ${o.parent?.name||'root'}`;const name=document.createElement('span');name.textContent=`${o.name==='Suelo'?'▱':o.userData.nodeType==='Capsule'?'◉':o.userData.nodeType==='Sphere'?'●':o.userData.nodeType==='GLTF'?'▣':'◧'}　${o.name}`;const parent=document.createElement('small');parent.textContent=`Padre: ${o.parent?.name||'root'}`;d.append(name,parent);d.onclick=()=>selectObject(o);box.append(d);for(const child of o.children)add(child,depth+1);};if(state.rootNode)for(const child of state.rootNode.children)add(child,0);}
function vecProp(label,v,key){return `<div class="prop"><label>${label}</label><div class="xyz">${['x','y','z'].map((axis,i)=>`<input type="number" step="0.1" value="${v[axis].toFixed(2)}" data-prop="${key}" data-axis="${i}" aria-label="${axis}">`).join('')}</div></div>`;}
function ensureScriptForSelected(){const target=data.selected;if(!target)return null;if(!target.userData.scriptText)target.userData.scriptText=`-- Script de ${target.name}\nfunction start()\n  print("Listo: " .. node.name)\nend\nfunction update(dt)\nend`;return target;}
function updateInspector(){const box=$('#inspectBody');if(!box||!data.selected){if(box)box.textContent='Selecciona un nodo';return;}const o=data.selected;box.innerHTML=`<div class="inspect-title">${escapeHtml(o.name)}</div><div class="prop parent-prop"><label>PADRE</label><span>${escapeHtml(o.parent?.name||'root')}</span></div>${vecProp('POSICIÓN',o.position,'pos')}${vecProp('ROTACIÓN',o.rotation,'rot')}${vecProp('ESCALA',o.scale,'scale')}<div class="prop"><label>TIPO</label><span class="node-type">${escapeHtml(o.userData.nodeType||'Node3D')}</span></div><div class="prop inspector-script"><label>SCRIPT LUA</label><textarea id="inspectorScript" class="inspector-code" spellcheck="false" aria-label="Script Lua del objeto"></textarea><div class="script-actions"><button id="openScriptMode" class="small-btn">Abrir en visor</button><button id="runInspectorScript" class="small-btn accent">Ejecutar</button></div></div><div class="prop"><button id="deleteNode" class="small-btn">Eliminar nodo</button></div>`;const code=$('#inspectorScript');code.value=o.userData.scriptText||'';code.oninput=()=>setObjectScript(o,code.value);box.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{const v=Number(inp.value),k=inp.dataset.prop,axis=['x','y','z'][Number(inp.dataset.axis)];if(Number.isFinite(v))o[k][axis]=v;syncGizmo();});$('#openScriptMode').onclick=()=>openScriptMode(o);$('#runInspectorScript').onclick=()=>{openScriptMode(o);executeLua(o.userData.scriptText||'',o,false,false);};$('#deleteNode').onclick=()=>{if(o.name==='Suelo'){toast('No se puede eliminar el suelo');return;}const doomed=[];o.traverse(n=>{doomed.push(n);for(const url of n.userData?.blobUrls||[])URL.revokeObjectURL(url);});o.parent?.remove(o);data.objects=data.objects.filter(x=>!doomed.includes(x));selectObject(data.objects.find(x=>x.name.startsWith('Player'))||data.objects.find(x=>!x.userData.helper)||null);};}
function setObjectScript(target,text){if(!target)return;target.userData.scriptText=text;if(data.selected===target)data.script=text;const overlay=$('#scriptOverlayEditor'),side=$('#inspectorScript');if(state.scriptTarget===target&&overlay.value!==text)overlay.value=text;if(data.selected===target&&side&&side.value!==text)side.value=text;}
function openScriptMode(target=data.selected){if(!target){toast('Selecciona un objeto para editar su script');return;}state.scriptTarget=target;ensureScriptForSelectedFor(target);$('#scriptTitle').textContent=`Script · ${target.name}`;$('#scriptOverlayEditor').value=target.userData.scriptText||'';const side=$('#inspectorScript');if(side)side.value=target.userData.scriptText||'';$('#scriptOverlay').classList.remove('hidden');document.querySelectorAll('.main-modes .mode-tab').forEach(b=>b.classList.toggle('selected',b.dataset.tool==='script'));$('#bottomStatus').textContent=`Script · ${target.name}`;}
function ensureScriptForSelectedFor(target){if(!target.userData.scriptText)target.userData.scriptText=`-- Script de ${target.name}\nfunction start()\n  print("Listo: " .. node.name)\nend\nfunction update(dt)\nend`;return target;}
function closeScriptMode(){const overlay=$('#scriptOverlay');overlay.classList.add('hidden');document.querySelectorAll('.main-modes .mode-tab').forEach(b=>b.classList.toggle('selected',b.dataset.tool==='3d'));state.scriptTarget=null;$('#bottomStatus').textContent='Edición · listo';}
function refreshOutline(){for(const n of state.outlineNodes){if(n.parent)n.parent.remove(n);n.material?.dispose?.();}state.outlineNodes=[];if(!state.outlineEnabled||!data.selected)return;data.selected.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.helper||mesh.isSkinnedMesh)return;const material=new THREE.MeshBasicMaterial({color:0x73b8ff,side:THREE.BackSide,depthTest:true,depthWrite:false,transparent:false});const shell=new THREE.Mesh(mesh.geometry,material);shell.name='Outline';shell.userData.helper=true;shell.scale.setScalar(1.035);shell.renderOrder=2;shell.raycast=()=>{};mesh.add(shell);state.outlineNodes.push(shell);});}
function addCustomCard(name) { const card=document.createElement('button');card.className='project-card';card.innerHTML='<div class="thumb tps"><span>3D</span><div class="figure">✦</div></div><b></b><small>Proyecto propio · escena 3D</small><i>ABRIR PROYECTO　›</i>';card.querySelector('b').textContent=name;card.onclick=()=>{data.customName=name;showEditor('custom');};$('.project-grid').append(card); }
JSON.parse(localStorage.getItem('mf_projects')||'[]').forEach(addCustomCard);
$('#newProject').onclick=()=>{const n=prompt('Nombre del nuevo proyecto','Mi juego');if(!n)return;const p=JSON.parse(localStorage.getItem('mf_projects')||'[]');if(p.includes(n)){toast('Ya existe ese proyecto');return;}p.push(n);localStorage.setItem('mf_projects',JSON.stringify(p));addCustomCard(n);data.customName=n;showEditor('custom');};
$('#importModel').onclick=()=>$('#modelFile').click();
$('#modelFile').addEventListener('change',async e=>{const files=[...(e.target.files||[])];if(!files.length)return;try{await importModelFiles(files);}catch(err){toast(`Importación falló: ${err.message||err}`);}finally{e.target.value='';}});
async function importModelFiles(files){if(data.playing)stopGame();const main=files.find(f=>/\.(glb|gltf)$/i.test(f.name));if(!main)throw new Error('Selecciona un archivo GLB o GLTF');if(files.some(f=>f.size>150*1024*1024))throw new Error('Cada archivo debe pesar menos de 150 MB');const urls=[],cache=new Map(),byName=new Map(files.map(f=>[f.name.toLowerCase(),f]));const loader=new GLTFLoader();loader.manager.setURLModifier(request=>{const path=decodeURIComponent(request.split(/[?#]/)[0]),name=path.split('/').pop().toLowerCase(),asset=byName.get(name);if(!asset)return request;if(!cache.has(asset.name)){const url=URL.createObjectURL(asset);cache.set(asset.name,url);urls.push(url);}return cache.get(asset.name);});try{const buffer=await main.arrayBuffer();const gltf=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));const model=new THREE.Group();model.name=main.name.replace(/\.(glb|gltf)$/i,'');model.userData.nodeType='GLTF';model.userData.sourceFile=main.name;model.userData.blobUrls=urls;model.add(gltf.scene);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});model.updateWorldMatrix(true,true);let bounds=new THREE.Box3().setFromObject(model);if(!bounds.isEmpty()){const size=bounds.getSize(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z);if(max>10000)throw new Error('El escenario tiene dimensiones fuera de rango');if(max>24)model.scale.setScalar(24/max);model.updateWorldMatrix(true,true);bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y+=-.56-bounds.min.y;model.updateWorldMatrix(true,true);bounds.setFromObject(model);}state.rootNode.add(model);data.objects.push(model);data.selected=model;const sphere=bounds.getBoundingSphere(new THREE.Sphere());state.focusTarget.set(0,Math.max(0,sphere.center.y),0);state.spherical.radius=THREE.MathUtils.clamp(Math.max(4,sphere.radius*2.2),4,40);state.spherical.phi=1.1;state.orbit=null;state.pinch=null;state.drag=null;state.activePointers.clear();updateCamera();updateTree();updateInspector();refreshOutline();syncGizmo();updateFileList(files.map(f=>f.name));toast(`Escena importada y encuadrada: ${model.name}`);}catch(err){urls.forEach(URL.revokeObjectURL);throw err;}}
function updateFileList(names=[]){const box=$('#fileList');if(!box)return;box.replaceChildren();const root=document.createElement('div');root.textContent='Assets';box.append(root);for(const name of names){const row=document.createElement('div');row.className='file-entry';row.textContent=`${name}`;box.append(row);}}
const SCENE_PRESETS=[{id:'fps',name:'First Person Starter'},{id:'tps',name:'Third Person Starter'},{id:'testyard',name:'Patio de pruebas'},{id:'room',name:'Habitación de prueba'}];
function sceneRecords(){try{const records=JSON.parse(localStorage.getItem('mf_saved_scenes')||'[]');if(records.length)return records;const migrated=[];for(const key of ['fps','tps','custom']){try{const scene=JSON.parse(localStorage.getItem(`mf_scene_${key}`)||'null');if(scene?.nodes?.length)migrated.push({id:`legacy-${key}`,name:`Escena ${key.toUpperCase()}`,project:key,scene});}catch{}}return migrated;}catch{return[];}}
function renderSceneList(){const box=$('#sceneList');if(!box)return;box.replaceChildren();for(const preset of SCENE_PRESETS){const row=document.createElement('div');row.className='scene-entry';const title=document.createElement('strong');title.textContent=preset.name;const actions=document.createElement('div');actions.className='scene-actions';const open=document.createElement('button');open.className='small-btn';open.textContent='Abrir';open.onclick=()=>openPreset(preset.id);const insert=document.createElement('button');insert.className='small-btn accent';insert.textContent='Insertar';insert.onclick=()=>insertPreset(preset.id);actions.append(open,insert);row.append(title,actions);box.append(row);}const saved=sceneRecords();if(saved.length){const heading=document.createElement('div');heading.className='scene-section-title';heading.textContent='Guardadas';box.append(heading);for(const scene of saved){const row=document.createElement('div');row.className='scene-entry';const title=document.createElement('strong');title.textContent=scene.name;const actions=document.createElement('div');actions.className='scene-actions';const open=document.createElement('button');open.className='small-btn accent';open.textContent='Abrir';open.onclick=()=>loadSavedScene(scene);const remove=document.createElement('button');remove.className='small-btn';remove.textContent='×';remove.title='Eliminar escena guardada';remove.onclick=()=>{localStorage.setItem('mf_saved_scenes',JSON.stringify(sceneRecords().filter(x=>x.id!==scene.id)));renderSceneList();};actions.append(open,remove);row.append(title,actions);box.append(row);}}else{const note=document.createElement('small');note.className='scene-note';note.textContent='Las escenas que guardes aparecerán aquí.';box.append(note);}}
function resetToGround(){for(const child of [...state.rootNode.children]){child.traverse(o=>{if(o.userData?.blobUrls)for(const url of o.userData.blobUrls)URL.revokeObjectURL(url);});if(child.name!=='Suelo')state.rootNode.remove(child);}data.objects=data.objects.filter(o=>o.name==='Suelo');data.selected=data.objects[0]||null;}
function addPresetGroup(id){const root=new THREE.Group();root.name=id==='room'?'Habitación de prueba':'Patio de pruebas';root.userData.nodeType='SceneGroup';state.rootNode.add(root);data.objects.push(root);const items=id==='room'?[['Piso','Box',[0,-.15,0],[8,.2,8],0x555960],['Pared izquierda','Box',[-4,1.4,0],[.2,3,8],0x727d88],['Pared derecha','Box',[4,1.4,0],[.2,3,8],0x727d88],['Pared fondo','Box',[0,1.4,-4],[8,3,.2],0x818c94],['Pared frente','Box',[0,1.4,4],[8,3,.2],0x69747d],['Plataforma','Box',[0,.2,0],[2,.4,2],0x455d75]]:[['Plataforma grande','Box',[0,-.12,0],[6,.24,6],0x455d75],['Bloque A','Box',[-1.6,.5,-.7],[1,1,1],0x6d82a0],['Bloque B','Box',[1.3,.8,-1],[1.3,1.6,1.3],0x8d78a8],['Rampa','Box',[0,.3,2],[2,.35,1.3],0x608d82],['Pilar','Box',[2,1.2,1.5],[.6,2.4,.6],0xb58c60]];for(const [name,type,pos,scale,color]of items){const o=makeNode(name,type,pos,color,root);o.scale.set(...scale);}return root;}
function openPreset(id){if(id==='fps'||id==='tps'){showEditor(id);return;}data.customName=id==='room'?'Habitación de prueba':'Patio de pruebas';showEditor('custom');resetToGround();const group=addPresetGroup(id);selectObject(group);setDock('scene');}
function insertPreset(id){let group;if(id==='fps'||id==='tps'){group=new THREE.Group();group.name=id==='fps'?'FPS Starter insertado':'TPS Starter insertado';group.userData.nodeType='SceneGroup';state.rootNode.add(group);data.objects.push(group);const player=makeNode(id==='fps'?'Player (FPS)':'Player (TPS)','Capsule',[0,id==='fps'?.75:1,0],id==='fps'?0x55dfc2:0xffb86b,group);player.userData.scriptText=`-- Controlador de ${player.name}\nfunction start()\n  print("Controlador listo: " .. node.name)\nend\nfunction update(dt)\nend`;makeNode('Objeto de prueba','Box',[1,.5,-1],0x8578ff,group);}else group=addPresetGroup(id);selectObject(group);setDock('scene');toast('Escena insertada en el proyecto');}
function setDock(tab){for(const [key,id]of [['scene','nodeList'],['scenes','sceneList'],['files','fileList']])$('#'+id).classList.toggle('hidden',key!==tab);$('#treeFilter').parentElement.classList.toggle('hidden',tab!=='scene');document.querySelectorAll('.tree .dock-tab[data-dock]').forEach(b=>b.classList.toggle('active',b.dataset.dock===tab));if(tab==='scenes')renderSceneList();}
function serializeScene(){const nodes=[];for(const o of data.objects){if(o.userData.helper||o.userData.nodeType==='GLTF')continue;nodes.push({name:o.name,type:o.userData.nodeType||'Node3D',parent:o.parent?.name||'root',position:o.position.toArray(),rotation:o.rotation.toArray(),scale:o.scale.toArray(),color:o.material?.color?.getHex()??0x6ee5cc,script:o.userData.scriptText||''});}return {nodes,modelFiles:data.objects.filter(o=>o.userData.nodeType==='GLTF').map(o=>o.userData.sourceFile||o.name)};}
function saveCurrentScene(){const name=(prompt('Nombre de la escena',data.customName||$('#projectName').textContent)||'').trim();if(!name)return;const saved=sceneRecords(),entry={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,project:data.project,scene:serializeScene(),savedAt:new Date().toISOString()};try{localStorage.setItem('mf_saved_scenes',JSON.stringify([entry,...saved.filter(x=>x.name!==name)].slice(0,20)));localStorage.setItem(`mf_scene_${data.project}`,JSON.stringify(entry.scene));renderSceneList();toast('Escena guardada');}catch{toast('No hay espacio disponible para guardar la escena');}}
function makeFromRecord(r,parent){let node;if(r.type==='Node3D'||r.type==='SceneGroup'){node=new THREE.Group();}else{const geometry=r.type==='Sphere'?new THREE.SphereGeometry(.6,20,14):r.type==='Capsule'?new THREE.CapsuleGeometry(.35,.8,5,10):r.type==='Plane'?new THREE.PlaneGeometry(80,80):new THREE.BoxGeometry(1,1,1);node=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:r.color??0x6ee5cc,roughness:.65}));node.castShadow=true;node.receiveShadow=true;}node.name=r.name;node.userData.nodeType=r.type;node.position.fromArray(r.position||[0,0,0]);node.rotation.fromArray(r.rotation||[0,0,0]);node.scale.fromArray(r.scale||[1,1,1]);if(r.script)node.userData.scriptText=r.script;parent.add(node);data.objects.push(node);return node;}
function clearSceneForRestore(){for(const child of [...state.rootNode.children])state.rootNode.remove(child);data.objects=[];state.outlineNodes=[];}
function loadSavedScene(entry){if(!entry?.scene?.nodes){toast('La escena guardada no tiene datos válidos');return;}data.customName=entry.name;showEditor('custom');clearSceneForRestore();const map=new Map([['root',state.rootNode]]),pending=[...entry.scene.nodes];let pass=0;while(pending.length&&pass++<entry.scene.nodes.length+10){let progress=false;for(let i=pending.length-1;i>=0;i--){const r=pending[i];if(r.type==='GLTF'){pending.splice(i,1);continue;}const parent=map.get(r.parent)||((!r.parent||r.parent==='root')?state.rootNode:null);if(!parent)continue;if(r.type==='LuaScript'){parent.userData.scriptText=r.script||'';map.set(r.name,parent);}else{const node=makeFromRecord(r,parent);map.set(r.name,node);}pending.splice(i,1);progress=true;}if(!progress)break;}if(!data.objects.length){const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0x66675f,roughness:.96}));floor.name='Suelo';floor.userData.nodeType='Plane';floor.rotation.x=-Math.PI/2;floor.position.y=-.56;floor.receiveShadow=true;state.rootNode.add(floor);data.objects.push(floor);}data.selected=data.objects.find(o=>o.name.startsWith('Player'))||data.objects.find(o=>o.name!=='Suelo')||data.objects[0];state.focusTarget.copy(data.selected?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3());state.spherical.radius=8;updateTree();updateInspector();refreshOutline();syncGizmo();setDock('scene');toast(pending.length?'Escena abierta; algunos padres no se pudieron restaurar':(entry.scene.modelFiles||[]).length?`Escena abierta. Reimporta: ${(entry.scene.modelFiles||[]).join(', ').slice(0,70)}`:'Escena abierta.');}
document.querySelectorAll('.project-card[data-project]').forEach(c=>c.onclick=()=>showEditor(c.dataset.project));
function showEditor(which){home.classList.add('hidden');editor.classList.remove('hidden');data.playing=false;$('#runHud').classList.add('hidden');$('#scriptOverlay').classList.add('hidden');initScene(which);setDock('scene');resizeViewport();setWorker();startRender();}
$('#back').onclick=()=>{if(data.playing)stopGame();stopRender();editor.classList.add('hidden');home.classList.remove('hidden');if(state.luaWorker){state.luaWorker.terminate();state.luaWorker=null;}};
$('#save').onclick=saveCurrentScene;
function addPrimitive(type) { const o=type==='Sphere'?makeNode('Esfera','Sphere',[0,1,0],0x9b8dff):type==='Capsule'?makeNode('Cápsula','Capsule',[0,1,0],0xffb86b):makeNode('Cubo','Box',[0,1,0],0x50e0c0);selectObject(o); }
$('#addNode').onclick=()=>{const c=prompt('Agregar nodo: cubo, esfera o cápsula','cubo')?.toLowerCase();if(!c)return;addPrimitive(c.includes('esf')?'Sphere':c.includes('caps')||c.includes('cáps')?'Capsule':'Box');};
function screenOf(world) { const p=world.clone().project(state.camera),r=viewport.getBoundingClientRect();return new THREE.Vector2(r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2); }
function beginGizmoDrag(hit,e) {
  const {axis,mode}=hit.object.userData.gizmo,o=data.selected,worldDir=V3[axis].clone(),dir=worldDir.clone();if(o.parent){o.parent.updateWorldMatrix(true,false);dir.applyQuaternion(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();}const center=o.getWorldPosition(new THREE.Vector3());
  const rotBasis=axis==='x'?[new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]:axis==='y'?[new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)]:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)];
  state.drag={pointerId:e.pointerId,axis,mode,startX:e.clientX,startY:e.clientY,startPosition:o.position.clone(),startScale:o.scale.clone(),startQuaternion:o.quaternion.clone(),center,dir,worldDir,rotU:rotBasis[0],rotV:rotBasis[1],axisScreen:null,pixelsPerUnit:0,lastAngle:null,totalAngle:0};
  if(mode==='rotate') {const ray=rayFromPoint(e),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(worldDir,center),p=new THREE.Vector3();if(ray.intersectPlane(plane,p)){const v=p.sub(center).normalize();state.drag.lastAngle=Math.atan2(v.dot(state.drag.rotV),v.dot(state.drag.rotU));} }
  if(mode!=='rotate') {const a=screenOf(center),b=screenOf(center.clone().add(worldDir));const v=b.sub(a);state.drag.pixelsPerUnit=v.length();state.drag.axisScreen=v.length()>3?v.normalize():new THREE.Vector2(0,-1);}
  e.preventDefault();e.stopPropagation();viewport.setPointerCapture(e.pointerId);state.orbit=null;
}
function moveGizmoDrag(e) {
  const d=state.drag,o=data.selected;if(!d||!o||e.pointerId!==d.pointerId)return; e.preventDefault();
  if(d.mode==='move'||d.mode==='scale') {
    const delta=new THREE.Vector2(e.clientX-d.startX,e.clientY-d.startY),px=Math.max(d.pixelsPerUnit,viewport.clientHeight*.025),amount=delta.dot(d.axisScreen)/px;
    if(d.mode==='move')o.position.copy(d.startPosition).addScaledVector(d.dir,amount);
    else {const i=['x','y','z'].indexOf(d.axis);o.scale.copy(d.startScale);o.scale.setComponent(i,THREE.MathUtils.clamp(d.startScale.getComponent(i)+amount,.05,100));}
  } else {
    const ray=rayFromPoint(e),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(d.worldDir,d.center),p=new THREE.Vector3();if(!ray.intersectPlane(plane,p))return;
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
  const hits=state.raycaster.intersectObjects(data.objects.filter(o=>!o.userData.helper),true);if(hits.length){let target=hits[0].object;while(target.parent&&target.parent!==state.rootNode)target=target.parent;if(target!==state.rootNode)selectObject(target);}
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
  if(state.activePointers.size>=2&&state.pinch){const a=[...state.activePointers.values()],dist=Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y));state.spherical.radius=THREE.MathUtils.clamp(state.pinch.radius*state.pinch.distance/dist,2,45);return;}
  if(state.drag){moveGizmoDrag(e);return;}
  const o=state.orbit;if(!o||o.pointerId!==e.pointerId)return;const dx=e.clientX-o.lastX,dy=e.clientY-o.lastY;o.lastX=e.clientX;o.lastY=e.clientY;
  if(data.playing){state.spherical.theta-=dx*.008;return;}
  if(e.shiftKey){const right=new THREE.Vector3().setFromMatrixColumn(state.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(state.camera.matrixWorld,1);state.focusTarget.addScaledVector(right,-dx*.012).addScaledVector(up,dy*.012);return;}
  state.spherical.theta-=dx*.008;state.spherical.phi=THREE.MathUtils.clamp(state.spherical.phi+dy*.008,.15,2.85);
},{passive:false});
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);viewport.addEventListener('wheel',e=>{state.spherical.radius=THREE.MathUtils.clamp(state.spherical.radius+e.deltaY*.008,2,45);},{passive:true});viewport.addEventListener('contextmenu',e=>e.preventDefault());
const resizeObserver=new ResizeObserver(()=>resizeViewport());resizeObserver.observe(viewport);window.addEventListener('resize',resizeViewport);window.addEventListener('orientationchange',()=>setTimeout(resizeViewport,180));window.visualViewport?.addEventListener('resize',resizeViewport);
$('#play').onclick=()=>{if(data.playing)stopGame();else startGame();};$('#pause').onclick=()=>{if(!data.playing){toast('Ejecuta el juego para pausarlo');return;}state.paused=!state.paused;$('#pause').classList.toggle('active',state.paused);$('#bottomStatus').textContent=state.paused?'Juego pausado':'Juego en ejecución';};
$('#jump').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();state.jumpQueued=true;});
const stick=$('#stick'),knob=$('.stick-knob');let stickId=null,moveVec={x:0,z:0};
function stickMove(e){const r=stick.getBoundingClientRect(),limit=Math.max(1,r.width*.31);let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,m=Math.min(limit,Math.hypot(x,y)),a=Math.atan2(y,x);x=Math.cos(a)*m;y=Math.sin(a)*m;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;moveVec.x=x/limit;moveVec.z=y/limit;}
stick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);});stick.addEventListener('pointermove',e=>{if(stickId===e.pointerId)stickMove(e);});stick.addEventListener('pointerup',e=>{e.stopPropagation();stickId=null;moveVec={x:0,z:0};knob.style.transform='translate(-50%,-50%)';});stick.addEventListener('pointercancel',()=>{stickId=null;moveVec={x:0,z:0};knob.style.transform='translate(-50%,-50%)';});
$('#scriptOverlayEditor').addEventListener('input',e=>setObjectScript(state.scriptTarget,e.target.value));for(const eventName of ['pointerdown','pointermove','pointerup','pointercancel','wheel'])$('#scriptOverlay').addEventListener(eventName,e=>e.stopPropagation());$('#runOverlayScript').onclick=()=>{const t=state.scriptTarget||data.selected;if(t)executeLua(t.userData.scriptText||'',t,false,false);};$('#closeScriptOverlay').onclick=closeScriptMode;
document.querySelectorAll('.main-modes .mode-tab').forEach(b=>b.onclick=()=>{const mode=b.dataset.tool;if(mode==='script'){openScriptMode();return;}if(mode==='3d'){closeScriptMode();document.querySelectorAll('.main-modes .mode-tab').forEach(x=>x.classList.toggle('selected',x===b));if(data.playing)stopGame();return;}closeScriptMode();document.querySelectorAll('.main-modes .mode-tab').forEach(x=>x.classList.toggle('selected',x===b));if(data.playing)stopGame();else startGame();});
document.querySelectorAll('.gizmo-mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.gizmo-mode').forEach(x=>x.classList.toggle('active',x===b));setGizmoMode(b.dataset.mode);});
$('#toggleGrid').onclick=()=>{state.grid.visible=!state.grid.visible;$('#toggleGrid').classList.toggle('active',state.grid.visible);};$('#toggleOutline').onclick=()=>{state.outlineEnabled=!state.outlineEnabled;$('#toggleOutline').classList.toggle('active',state.outlineEnabled);refreshOutline();};
$('#treeFilter').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('#nodeList .node-item').forEach(n=>{n.hidden=!n.textContent.toLowerCase().includes(q);});});
document.querySelectorAll('[data-dock]').forEach(b=>b.onclick=()=>setDock(b.dataset.dock));
async function checkForUpdate(automatic=false){
  if(!Capacitor.isNativePlatform()){toast('Actualizaciones automáticas disponibles en Android');return;}
  try{
    const res=await fetch('https://api.github.com/repos/blopex67-cloud/MobiForge3D/releases/latest',{headers:{Accept:'application/vnd.github+json'}});
    if(!res.ok)throw new Error('No se pudo consultar la versión');
    const rel=await res.json(),latest=String(rel.tag_name||'').replace(/^v/i,''),current=APP_VERSION;
    const n=s=>s.split('.').map(x=>parseInt(x,10)||0),a=n(latest),b=n(current),newer=a.some((v,i)=>v>(b[i]||0)&&a.slice(0,i).every((x,j)=>x===(b[j]||0)));
    if(!newer){if(!automatic)toast('La app está actualizada');return;}
    const asset=(rel.assets||[]).find(x=>x.name==='MobiForge3D.apk');if(!asset)throw new Error('No se encontró el APK de actualización');
    if(!window.confirm(`Hay una actualización ${latest}. Descargar e instalar ahora? Android pedirá confirmar la instalación.`))return;
    toast('Descargando actualización…');await AppUpdater.install({url:asset.browser_download_url,version:latest});
  }catch(err){toast(err?.message||'No se pudo actualizar');}
}
$('#checkUpdates').onclick=()=>checkForUpdate(false);
$('#checkUpdatesHome').onclick=()=>checkForUpdate(false);
setTimeout(()=>checkForUpdate(true),1800);
function executeLua(source,target,automatic=false,live=false){if(state.luaWorker)state.luaWorker.terminate();setWorker();state.luaTarget=target;state.luaLive=live;state.luaWaiting=true;const b=$('#runOverlayScript'),result=$('#luaResult');if(b)b.disabled=true;if(result)result.textContent='Ejecutando…';clearTimeout(state.luaTimer);state.luaTimer=setTimeout(()=>{state.luaWorker?.terminate();state.luaWorker=null;state.luaLive=false;state.luaWaiting=false;if(b)b.disabled=false;if(result)result.textContent='Tiempo agotado; ejecución detenida.';if(!automatic)toast('Lua detenido por límite de tiempo');},1500);state.luaWorker.postMessage({type:'run',source,nodeName:target?.name||'Node3D',persistent:live});}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRender();}else if(!editor.classList.contains('hidden'))startRender();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&data.playing)stopGame();});
