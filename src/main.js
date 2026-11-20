import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
const AppUpdater = registerPlugin('AppUpdater');
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.8';

const $ = (s) => document.querySelector(s);
const home = $('#home'), editor = $('#editor'), viewport = $('#viewport');
const data = {
  project: 'fps', customName: '', selected: null, mode: 'move', tab: 'scene',
  playing: false, objects: [], script: '',
};
const state = {
  scene: null, rootNode: null, camera: null, renderer: null, raycaster: new THREE.Raycaster(),
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
  state.luaWorker.onmessage=e=>{const msg=e.data||{};if(msg.type==='command'){applyLuaCommand(msg);return;}if(msg.type==='ready'){clearTimeout(state.luaTimer);state.luaWaiting=false;const b=$('#runLua');if(b)b.disabled=false;const result=$('#luaResult');if(result)result.textContent=msg.output||'Script iniciado';if(msg.output)toast(msg.output.slice(0,100));return;}if(msg.type==='tick'){clearTimeout(state.luaTimer);state.luaWaiting=false;return;}if(msg.type==='done'){clearTimeout(state.luaTimer);state.luaWaiting=false;return;}if(msg.type==='error'){clearTimeout(state.luaTimer);state.luaWaiting=false;state.luaLive=false;const b=$('#runLua');if(b)b.disabled=false;const result=$('#luaResult');if(result)result.textContent=`Error: ${msg.error}`;toast(`Lua: ${msg.error}`);state.luaWorker?.terminate();state.luaWorker=null;}};
  state.luaWorker.onerror=()=>{clearTimeout(state.luaTimer);state.luaWaiting=false;const b=$('#runLua');if(b)b.disabled=false;toast('Error del runtime Lua');state.luaWorker?.terminate();state.luaWorker=null;};
}
function materialFor(color) { return mat(color); }
function makeNode(name,type,pos=[0,0,0],color=0x6ee5cc) {
  const geo=type==='Sphere'?new THREE.SphereGeometry(.6,20,14):type==='Capsule'?new THREE.CapsuleGeometry(.35,.8,5,10):new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.Mesh(geo,materialFor(color)); mesh.name=name; mesh.position.set(...pos); mesh.castShadow=true; mesh.userData.nodeType=type;
  const parent=data.selected&&data.selected.userData.nodeType!=='LuaScript'?data.selected:state.rootNode;parent.add(mesh);data.objects.push(mesh);return mesh;
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
  const target=data.selected.userData.nodeType==='LuaScript'?(data.selected.parent||data.selected):data.selected;
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
  state.paused=false;state.velocity.set(0,0,0);state.verticalVelocity=0;state.playSnapshot=null;moveVec={x:0,z:0};
  state.camera=new THREE.PerspectiveCamera(48,1,.1,100);state.camera.position.set(6,5,7);
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
  data.script=starter;if(player)createScriptChild(player,starter,false);
  data.selected=player||data.objects.find(o=>!o.userData.helper);createGizmo();state.spherical={theta:.7,phi:1.12,radius:8};updateTree();updateInspector();resizeViewport();
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
  state.lastFrame=time; const dt=Math.min(state.clock.getDelta(),.04); if(data.playing&&!state.paused)updatePlayerPhysics(dt); updateCamera(); syncGizmo();
  if(data.playing&&!state.paused&&state.luaLive&&state.luaWorker&&!state.luaWaiting){state.luaWaiting=true;state.luaTimer=setTimeout(()=>{if(state.luaWaiting){state.luaWorker?.terminate();state.luaWorker=null;state.luaLive=false;state.luaWaiting=false;toast('Lua detenido: excedió el límite por actualización');}},1500);state.luaWorker.postMessage({type:'update',dt});}
  state.renderer?.render(state.scene,state.camera); state.frame=requestAnimationFrame(tick);
}
function startRender() { state.active=true; state.clock.start(); if(!state.frame)state.frame=requestAnimationFrame(tick); }
function startGame(){if(data.playing)return;state.playSnapshot=new Map(data.objects.filter(o=>o.position&&o.quaternion&&o.scale).map(o=>[o,{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()}]));data.playing=true;state.paused=false;state.velocity.set(0,0,0);state.verticalVelocity=0;state.grounded=false;state.jumpQueued=false;moveVec={x:0,z:0};state.drag=null;state.orbit=null;$('#runHud').classList.remove('hidden');$('#play').innerHTML='<img src="/icons/player-stop.svg" alt="Detener">';$('#pause').classList.remove('active');$('#fpsLabel').textContent='EJECUTANDO';$('#bottomStatus').textContent='Juego en ejecución';if(!state.frame)startRender();setGizmoMode(data.mode);const player=data.objects.find(o=>o.name.startsWith('Player'));const script=player&&data.objects.find(o=>o.userData.nodeType==='LuaScript'&&o.parent===player);if(script?.userData.scriptText)executeLua(script.userData.scriptText,player,true,true);}
function stopGame(){if(!data.playing)return;data.playing=false;state.paused=false;if(state.luaWorker){state.luaWorker.terminate();state.luaWorker=null;}state.luaLive=false;clearTimeout(state.luaTimer);state.luaWaiting=false;moveVec={x:0,z:0};state.velocity.set(0,0,0);state.verticalVelocity=0;state.jumpQueued=false;if(state.playSnapshot){for(const [o,t] of state.playSnapshot){o.position.copy(t.position);o.quaternion.copy(t.quaternion);o.scale.copy(t.scale);}state.playSnapshot=null;}$('#runHud').classList.add('hidden');$('#play').innerHTML='<img src="/icons/play.svg" alt="Ejecutar">';$('#pause').classList.remove('active');$('#fpsLabel').textContent='EDITOR';$('#bottomStatus').textContent='Edición · listo';updateTree();updateInspector();updateCamera();syncGizmo();}
function updatePlayerPhysics(dt){const p=data.objects.find(o=>o.name.startsWith('Player'));if(!p)return;const theta=state.spherical.theta,stickX=THREE.MathUtils.clamp(moveVec.x,-1,1),stickZ=THREE.MathUtils.clamp(moveVec.z,-1,1);const tx=(stickX*Math.cos(theta)+stickZ*Math.sin(theta))*3.6,tz=(-stickX*Math.sin(theta)+stickZ*Math.cos(theta))*3.6,moving=Math.hypot(stickX,stickZ)>.08,blend=1-Math.exp(-(moving?15:8)*dt);state.velocity.x+=(tx-state.velocity.x)*blend;state.velocity.z+=(tz-state.velocity.z)*blend;if(!moving&&Math.hypot(state.velocity.x,state.velocity.z)<.025){state.velocity.x=0;state.velocity.z=0;}p.position.x+=state.velocity.x*dt;p.position.z+=state.velocity.z*dt;let floor=-.56;const platform=data.objects.find(o=>o.name==='Plataforma');if(platform){const hx=Math.abs(platform.scale.x)*.5,hz=Math.abs(platform.scale.z)*.5;if(Math.abs(p.position.x-platform.position.x)<=hx+.3&&Math.abs(p.position.z-platform.position.z)<=hz+.3)floor=Math.max(floor,platform.position.y+Math.abs(platform.scale.y)*.5);}const half=p.userData.nodeType==='Capsule'?.75:.5;if(state.jumpQueued&&state.grounded){state.verticalVelocity=5;state.grounded=false;}state.jumpQueued=false;state.verticalVelocity=Math.max(-18,state.verticalVelocity-14*dt);p.position.y+=state.verticalVelocity*dt;const groundY=floor+half;if(p.position.y<=groundY){p.position.y=groundY;state.verticalVelocity=0;state.grounded=true;}else state.grounded=false;}
function stopRender() { state.active=false; if(state.frame)cancelAnimationFrame(state.frame);state.frame=0; }
function nodeDepth(o){let n=0,p=o.parent;while(p&&p!==state.scene){n++;p=p.parent;}return Math.max(0,n-1);}
function updateTree() {
  const box=$('#nodeList');if(!box)return;box.replaceChildren();
  const add=(o,depth)=>{if(o.userData.helper)return;const d=document.createElement('div');d.className='node-item'+(o===data.selected?' selected':'')+(o.userData.nodeType==='LuaScript'?' script-node':'');d.style.paddingLeft=`${5+depth*10}px`;d.title=`${o.name} · Padre: ${o.parent?.name||'root'}`;const icon=o.userData.nodeType==='LuaScript'?'⌘':o.name==='Suelo'?'▱':o.userData.nodeType==='Capsule'?'◉':o.userData.nodeType==='Sphere'?'●':o.userData.nodeType==='GLTF'?'▣':'◧';const name=document.createElement('span');name.textContent=`${icon}　${o.name}`;const parent=document.createElement('small');parent.textContent=`Padre: ${o.parent?.name||'root'}`;d.append(name,parent);d.onclick=()=>selectObject(o);box.append(d);for(const child of o.children)add(child,depth+1);};
  if(state.rootNode)for(const child of state.rootNode.children)add(child,0);
}
function selectObject(o) { data.selected=o; if(o?.userData.nodeType==='LuaScript')data.script=o.userData.scriptText||''; updateTree(); updateInspector(); syncGizmo(); }
function vecProp(label,v,key){return `<div class="prop"><label>${label}</label><div class="xyz">${['x','y','z'].map((axis,i)=>`<input type="number" step="0.1" value="${v[axis].toFixed(1)}" data-prop="${key}" data-axis="${i}" aria-label="${axis}">`).join('')}</div></div>`;}
function updateInspector(){
  const box=$('#inspectBody');if(!box||!data.selected){if(box)box.textContent='Selecciona un nodo';return;}
  const selected=data.selected,isScript=selected.userData.nodeType==='LuaScript',o=isScript?(selected.parent||selected):selected;
  const childScripts=data.objects.filter(x=>x.userData.nodeType==='LuaScript'&&x.parent===o);
  box.innerHTML=`<div class="inspect-title">${selected.name}</div><div class="prop parent-prop"><label>PADRE</label><span>${selected.parent?.name||'root'}</span></div>${vecProp('POSICIÓN',o.position,'pos')}${vecProp('ROTACIÓN',o.rotation,'rot')}${vecProp('ESCALA',o.scale,'scale')}<div class="prop"><label>TIPO DE NODO</label><span class="node-type">${selected.userData.nodeType||'Node3D'}</span></div>${isScript?'<div class="prop"><button id="editChildScript" class="small-btn accent">Abrir script</button></div>':`<div class="prop"><button id="makeChildScript" class="small-btn accent">＋ Script hijo</button>${childScripts.length?`<div class="child-script-list">${childScripts.map((s,i)=>`<button class="child-script" data-script-index="${i}">⌘ ${s.name}</button>`).join('')}</div>`:''}</div>`}<div class="prop"><button id="deleteNode" class="small-btn">Eliminar nodo</button></div>`;
  box.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{const v=Number(inp.value),k=inp.dataset.prop,axis=['x','y','z'][Number(inp.dataset.axis)];if(Number.isFinite(v))o[k][axis]=v;syncGizmo();});
  const make=$('#makeChildScript');if(make)make.onclick=()=>{createScriptChild(o);openDrawer('script');};
  const edit=$('#editChildScript');if(edit)edit.onclick=()=>openDrawer('script');
  box.querySelectorAll('[data-script-index]').forEach(btn=>btn.onclick=()=>{const scripts=data.objects.filter(x=>x.userData.nodeType==='LuaScript'&&x.parent===o);selectObject(scripts[Number(btn.dataset.scriptIndex)]);openDrawer('script');});
  $('#deleteNode').onclick=()=>{const victim=selected;if(victim===state.rootNode||victim.name==='Suelo'){toast('No se puede eliminar este nodo');return;}const doomed=[];victim.traverse(n=>{doomed.push(n);for(const url of n.userData?.blobUrls||[])URL.revokeObjectURL(url);});victim.parent?.remove(victim);data.objects=data.objects.filter(x=>!doomed.includes(x));selectObject(data.objects.find(x=>x.name.startsWith('Player'))||data.objects.find(x=>!x.userData.helper)||null);};
}
function createScriptChild(parent,source='-- Script del objeto\nfunction start()\n  print("Script listo: " .. node.name)\nend\nfunction update(dt)\nend',select=true){
  if(parent.userData.nodeType==='LuaScript')parent=parent.parent||state.rootNode;
  const count=data.objects.filter(o=>o.userData.nodeType==='LuaScript'&&o.parent===parent).length+1;
  const script=new THREE.Object3D();script.name=count===1?'Script':`Script ${count}`;script.userData.nodeType='LuaScript';script.userData.scriptText=source;parent.add(script);data.objects.push(script);
  if(select)selectObject(script);else updateTree();return script;
}
function ensureScriptForSelected(){let target=data.selected||data.objects.find(o=>o.name.startsWith('Player'))||state.rootNode;if(target.userData.nodeType==='LuaScript')return target;let child=data.objects.find(o=>o.userData.nodeType==='LuaScript'&&o.parent===target);if(!child)child=createScriptChild(target,undefined,false);selectObject(child);return child;}
function applyLuaCommand(msg){const t=state.luaTarget;if(!t)return;const v=(msg.values||[]).map(Number);if(v.some(x=>!Number.isFinite(x)))return;const [x=0,y=0,z=0]=v;switch(msg.command){case'move':t.position.add(new THREE.Vector3(x,y,z));break;case'set_position':t.position.set(x,y,z);break;case'rotate':t.rotation.x+=x;t.rotation.y+=y;t.rotation.z+=z;break;case'set_scale':t.scale.set(Math.max(.01,x),Math.max(.01,y),Math.max(.01,z));break;}syncGizmo();const now=performance.now();if(data.selected===t&&now-state.lastPhysicsUi>150){state.lastPhysicsUi=now;updateInspector();}}
function addCustomCard(name) { const card=document.createElement('button');card.className='project-card';card.innerHTML='<div class="thumb tps"><span>3D</span><div class="figure">✦</div></div><b></b><small>Proyecto propio · escena 3D</small><i>ABRIR PROYECTO　›</i>';card.querySelector('b').textContent=name;card.onclick=()=>{data.customName=name;showEditor('custom');};$('.project-grid').append(card); }
JSON.parse(localStorage.getItem('mf_projects')||'[]').forEach(addCustomCard);
$('#newProject').onclick=()=>{const n=prompt('Nombre del nuevo proyecto','Mi juego');if(!n)return;const p=JSON.parse(localStorage.getItem('mf_projects')||'[]');if(p.includes(n)){toast('Ya existe ese proyecto');return;}p.push(n);localStorage.setItem('mf_projects',JSON.stringify(p));addCustomCard(n);data.customName=n;showEditor('custom');};
$('#addChildScript').onclick=()=>{const parent=data.selected?.userData.nodeType==='LuaScript'?data.selected.parent:data.selected;if(!parent){toast('Selecciona primero un objeto');return;}const script=createScriptChild(parent);openDrawer('script');};
$('#importModel').onclick=()=>$('#modelFile').click();$('#importModelSide').onclick=()=>$('#modelFile').click();
$('#modelFile').addEventListener('change',async e=>{const files=[...(e.target.files||[])];if(!files.length)return;try{await importModelFiles(files);}catch(err){toast(`Importación falló: ${err.message||err}`);}finally{e.target.value='';}});
async function importModelFiles(files){const main=files.find(f=>/\.(glb|gltf)$/i.test(f.name));if(!main)throw new Error('Selecciona un modelo GLB o GLTF');if(files.some(f=>f.size>150*1024*1024))throw new Error('Cada archivo debe pesar menos de 150 MB');const urls=[],cache=new Map(),byName=new Map(files.map(f=>[f.name.toLowerCase(),f]));const loader=new GLTFLoader();loader.manager.setURLModifier(request=>{const path=decodeURIComponent(request.split(/[?#]/)[0]),name=path.split('/').pop().toLowerCase(),asset=byName.get(name);if(!asset)return request;if(!cache.has(asset.name)){const url=URL.createObjectURL(asset);cache.set(asset.name,url);urls.push(url);}return cache.get(asset.name);});try{const buffer=await main.arrayBuffer();const gltf=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));const model=new THREE.Group();model.name=main.name.replace(/\.(glb|gltf)$/i,'');model.userData.nodeType='GLTF';model.userData.sourceFile=main.name;model.userData.blobUrls=urls;model.add(gltf.scene);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const bounds=new THREE.Box3().setFromObject(model);if(!bounds.isEmpty()){const size=bounds.getSize(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z);if(max>20)model.scale.setScalar(20/max);bounds.setFromObject(model);model.position.y=-.56-bounds.min.y;}state.rootNode.add(model);data.objects.push(model);selectObject(model);updateFileList([...files.map(f=>f.name)]);toast(`Importado: ${model.name}`);}catch(err){urls.forEach(URL.revokeObjectURL);throw err;}}
function updateFileList(names=[]){const box=$('#fileList');if(!box)return;box.innerHTML='<div>res://</div><div class="file-entry">▸　Scenes</div><div class="file-entry">▸　Scripts</div><div class="file-entry">▾　Assets</div>';for(const name of names){const row=document.createElement('div');row.className='file-entry';row.textContent=`　${name}`;box.append(row);}}
document.querySelectorAll('.project-card[data-project]').forEach(c=>c.onclick=()=>showEditor(c.dataset.project));
function showEditor(which) { home.classList.add('hidden');editor.classList.remove('hidden');data.playing=false;$('#runHud').classList.add('hidden');initScene(which);resizeViewport();setWorker();startRender(); }
$('#back').onclick=()=>{if(data.playing)stopGame();stopRender();editor.classList.add('hidden');home.classList.remove('hidden');if(state.luaWorker){state.luaWorker.terminate();state.luaWorker=null;}};
$('#save').onclick=()=>{localStorage.setItem('mf_scene_'+data.project,JSON.stringify({nodes:data.objects.filter(o=>!o.userData.helper).map(o=>({name:o.name,type:o.userData.nodeType,parent:o.parent?.name||'root',script:o.userData.scriptText||null,sourceFile:o.userData.sourceFile||null,position:o.position.toArray(),rotation:o.rotation.toArray(),scale:o.scale.toArray(),color:o.material?.color?.getHex()}))}));toast('Proyecto guardado en este dispositivo');};
function addPrimitive(type) { const o=type==='Sphere'?makeNode('Esfera','Sphere',[0,1,0],0x9b8dff):type==='Capsule'?makeNode('Cápsula','Capsule',[0,1,0],0xffb86b):makeNode('Cubo','Box',[0,1,0],0x50e0c0);selectObject(o); }
$('#addNode').onclick=()=>{const c=prompt('Agregar nodo: cubo, esfera o cápsula','cubo')?.toLowerCase();if(!c)return;addPrimitive(c.includes('esf')?'Sphere':c.includes('caps')||c.includes('cáps')?'Capsule':'Box');};
function screenOf(world) { const p=world.clone().project(state.camera),r=viewport.getBoundingClientRect();return new THREE.Vector2(r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2); }
function beginGizmoDrag(hit,e) {
  const {axis,mode}=hit.object.userData.gizmo,o=data.selected.userData.nodeType==='LuaScript'?(data.selected.parent||data.selected):data.selected,worldDir=V3[axis].clone(),dir=worldDir.clone();if(o.parent){o.parent.updateWorldMatrix(true,false);dir.applyQuaternion(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();}const center=o.getWorldPosition(new THREE.Vector3());
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
  const hits=state.raycaster.intersectObjects(data.objects.filter(o=>!o.userData.helper&&o.userData.nodeType!=='LuaScript'),true);if(hits.length){let target=hits[0].object;while(target.parent&&target.parent!==state.rootNode)target=target.parent;if(target!==state.rootNode)selectObject(target);}
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
$('#play').onclick=()=>{if(data.playing)stopGame();else startGame();};$('#pause').onclick=()=>{if(!data.playing){toast('Ejecuta el juego para pausarlo');return;}state.paused=!state.paused;$('#pause').classList.toggle('active',state.paused);$('#bottomStatus').textContent=state.paused?'Juego pausado':'Juego en ejecución';};
$('#jump').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();state.jumpQueued=true;});$('#action').addEventListener('pointerdown',e=>e.stopPropagation());$('#action').onclick=()=>toast('Acción del jugador');
const stick=$('#stick'),knob=$('.stick-knob');let stickId=null,moveVec={x:0,z:0};
function stickMove(e){const r=stick.getBoundingClientRect(),limit=Math.max(1,r.width*.31);let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,m=Math.min(limit,Math.hypot(x,y)),a=Math.atan2(y,x);x=Math.cos(a)*m;y=Math.sin(a)*m;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;moveVec.x=x/limit;moveVec.z=y/limit;}
stick.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);});stick.addEventListener('pointermove',e=>{if(stickId===e.pointerId)stickMove(e);});stick.addEventListener('pointerup',e=>{e.stopPropagation();stickId=null;moveVec={x:0,z:0};knob.style.transform='translate(-50%,-50%)';});stick.addEventListener('pointercancel',()=>{stickId=null;moveVec={x:0,z:0};knob.style.transform='translate(-50%,-50%)';});
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');data.tab=b.dataset.tab;if(data.tab==='scene')$('#drawer').classList.remove('open');else openDrawer(data.tab);});
document.querySelectorAll('.gizmo-mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.gizmo-mode').forEach(x=>x.classList.toggle('active',x===b));setGizmoMode(b.dataset.mode);});
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
function openDrawer(tab){const d=$('#drawer'),body=$('#drawerContent');if(tab!=='script'){d.classList.remove('open');return;}d.classList.add('open');const script=ensureScriptForSelected();data.script=script.userData.scriptText||'';body.innerHTML=`<div class="drawer-inner"><h3>${script.parent?.name||'Objeto'} · ${script.name}</h3><textarea class="codebox" id="luaEditor" spellcheck="false"></textarea><div class="action-row"><button id="runLua" class="small-btn accent">Ejecutar</button><button id="resetLua" class="small-btn">Restablecer</button><span id="luaResult" class="lua-result"></span></div></div>`;$('#luaEditor').value=data.script;$('#luaEditor').oninput=e=>{data.script=e.target.value;script.userData.scriptText=data.script;};$('#runLua').onclick=runLua;$('#resetLua').onclick=()=>{script.userData.scriptText=`-- Script de ${script.parent?.name||'objeto'}\nfunction start()\n  print("Listo: " .. node.name)\nend\nfunction update(dt)\nend`;data.script=script.userData.scriptText;$('#luaEditor').value=data.script;toast('Script restablecido');};}
function executeLua(source,target,automatic=false,live=false){if(state.luaWorker)state.luaWorker.terminate();setWorker();state.luaTarget=target;state.luaLive=live;state.luaWaiting=true;const b=$('#runLua'),result=$('#luaResult');if(b)b.disabled=true;if(result)result.textContent='Ejecutando…';clearTimeout(state.luaTimer);state.luaTimer=setTimeout(()=>{state.luaWorker?.terminate();state.luaWorker=null;state.luaLive=false;state.luaWaiting=false;if(b)b.disabled=false;if(result)result.textContent='Tiempo agotado; ejecución detenida.';if(!automatic)toast('Lua detenido por límite de tiempo');},1500);state.luaWorker.postMessage({type:'run',source,nodeName:target?.name||'Node3D',persistent:live});}
function runLua(){const selected=data.selected?.userData.nodeType==='LuaScript'?data.selected:ensureScriptForSelected();selected.userData.scriptText=$('#luaEditor').value;data.script=selected.userData.scriptText;executeLua(data.script,selected.parent||selected,false,false);}
$('.drawer-grip').onclick=()=>$('#drawer').classList.toggle('open');
openDrawer('scene');
$('#treeFilter').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('#nodeList .node-item').forEach(n=>{n.hidden=!n.textContent.toLowerCase().includes(q);});});
document.querySelectorAll('[data-dock="scene"]').forEach(b=>b.onclick=()=>{$('#nodeList').classList.remove('hidden');$('#fileList').classList.add('hidden');document.querySelectorAll('.tree .dock-tab[data-dock]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('[data-dock="files"]').forEach(b=>b.onclick=()=>{$('#nodeList').classList.add('hidden');$('#fileList').classList.remove('hidden');document.querySelectorAll('.tree .dock-tab[data-dock]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('.main-modes [data-tool="script"]').forEach(b=>b.onclick=()=>{ensureScriptForSelected();openDrawer('script');});
document.querySelectorAll('.main-modes [data-tool="game"]').forEach(b=>b.onclick=()=>{$('#play').click();});
$('#toggleGrid').onclick=()=>{state.grid.visible=!state.grid.visible;$('#toggleGrid').classList.toggle('active',state.grid.visible);};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRender();}else if(!editor.classList.contains('hidden'))startRender();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&data.playing)stopGame();});
