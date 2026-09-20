import * as THREE from "three";
import { GLTFLoader } from "https://unpkg.com/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "https://unpkg.com/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";
import { QUESTIONS, CLUBS } from "./questions.js";

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];
const state = {
  phase: "start", club: null, kickCount: 5, difficulty: "all", cinematic: true, sound: true,
  questions: [], kickIndex: 0, correct: 0, goals: 0, streak: 0, bestStreak: 0,
  mistakes: [], selectedAim: null, firstAttempt: true, currentShot: null, special: false
};

function showScreen(id) {
  screens.forEach(s => s.classList.toggle("active", s.id === id));
  state.phase = id.replace("Screen", "");
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildClubs() {
  $("clubGrid").innerHTML = CLUBS.map((club, index) => `
    <button class="club-card" style="--club:${club.primary};--club2:${club.secondary}" data-club="${index}">
      <div class="club-mark"></div><b>${club.name}</b>
    </button>`).join("");
  document.querySelectorAll(".club-card").forEach(card => card.addEventListener("click", () => {
    document.querySelectorAll(".club-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    state.club = CLUBS[Number(card.dataset.club)];
    $("toMatchBtn").disabled = false;
    applyKit(state.club);
    audio.tap();
  }));
}

function chooseQuestions() {
  let pool = QUESTIONS;
  if (state.difficulty !== "all") pool = QUESTIONS.filter(q => q.difficulty === state.difficulty);
  if (pool.length < state.kickCount) pool = QUESTIONS;
  state.questions = shuffle(pool).slice(0, state.kickCount);
}

function resetMatch() {
  state.kickIndex = 0; state.correct = 0; state.goals = 0; state.streak = 0; state.bestStreak = 0;
  state.mistakes = []; state.currentShot = null; state.special = false;
  chooseQuestions();
  updateHUD();
}

function updateHUD() {
  $("hudTeam").textContent = state.club?.name || "—";
  $("teamSwatch").style.background = state.club?.primary || "#fff";
  $("hudCorrect").textContent = `${state.correct}/${Math.max(1, state.kickIndex + (state.phase === "final" ? 0 : 1))}`;
  $("hudGoals").textContent = state.goals;
  $("hudKick").textContent = `${Math.min(state.kickIndex + 1, state.kickCount)} / ${state.kickCount}`;
  $("streakMeter").firstElementChild.style.width = `${Math.min(100, state.streak / 3 * 100)}%`;
}

function renderQuestion() {
  const q = state.questions[state.kickIndex];
  state.firstAttempt = true;
  state.special = state.streak >= 3;
  $("questionCategory").textContent = q.category;
  $("questionNumber").textContent = String(state.kickIndex + 1).padStart(2, "0");
  $("questionText").textContent = q.question;
  $("feedback").textContent = state.special ? "ركلة النحو الحاسمة جاهزة بعد سلسلتك الصحيحة." : "";
  $("feedback").className = state.special ? "feedback good" : "feedback";
  $("continueBtn").classList.add("hidden");
  const labels = ["أ", "ب", "ج", "د"];
  $("options").innerHTML = q.options.map((option, i) => `<button class="option-btn" data-index="${i}"><b>${labels[i]}</b> ${option}</button>`).join("");
  document.querySelectorAll(".option-btn").forEach(btn => btn.addEventListener("click", () => answerQuestion(btn, q)));
  showScreen("questionScreen");
  updateHUD();
}

function answerQuestion(button, q) {
  const index = Number(button.dataset.index);
  if (index === q.correct) {
    button.classList.add("correct");
    document.querySelectorAll(".option-btn").forEach(b => b.disabled = true);
    if (state.firstAttempt) {
      state.correct++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    }
    $("feedback").textContent = state.firstAttempt ? `إجابة صحيحة. ${q.feedback}` : `أحسنت التصحيح. ${q.feedback}`;
    $("feedback").className = "feedback good";
    $("continueBtn").classList.remove("hidden");
    audio.correct();
    updateHUD();
  } else {
    button.classList.add("wrong");
    button.disabled = true;
    if (state.firstAttempt) {
      state.mistakes.push({ question: q.question, selected: q.options[index], correct: q.options[q.correct], rule: q.rule });
      state.firstAttempt = false;
      state.streak = 0;
    }
    $("feedback").textContent = `راجع القاعدة وحاول مرة أخرى: ${q.rule}`;
    $("feedback").className = "feedback bad";
    audio.wrong();
    updateHUD();
  }
}

function enterAim() {
  state.selectedAim = null;
  $("target").style.display = "none";
  $("shootBtn").disabled = true;
  resetActors();
  setCamera("aim");
  showScreen("aimScreen");
  audio.whistle();
}

function showFinal() {
  state.phase = "final";
  $("hud").classList.add("hidden");
  const accuracy = Math.round(state.correct / state.kickCount * 100);
  $("finalClub").textContent = state.club.name;
  $("finalAccuracy").textContent = `${accuracy}%`;
  $("finalCorrect").textContent = `${state.correct}/${state.kickCount}`;
  $("finalGoals").textContent = `${state.goals}/${state.kickCount}`;
  $("finalStreak").textContent = state.bestStreak;
  $("finalMessage").textContent = accuracy >= 80 ? "أتقنت تحديد عمل «لا» النافية للجنس وشروطها." : "راجع شروط عمل «لا» النافية للجنس وأنواع اسمها.";
  $("reviewBtn").style.display = state.mistakes.length ? "inline-flex" : "none";
  showScreen("finalScreen");
  setCamera("celebrate");
}

function renderReview() {
  $("reviewList").innerHTML = state.mistakes.length ? state.mistakes.map((m, i) => `
    <article class="review-item"><h3>${i + 1}. ${m.question}</h3>
      <p>إجابتك: ${m.selected}</p><p class="correct-answer">الإجابة الصحيحة: ${m.correct}</p>
      <p class="rule">القاعدة من العرض: ${m.rule}</p></article>`).join("") : `<div class="empty-review">لم تسجل أي أخطاء في هذه المباراة.</div>`;
  showScreen("reviewScreen");
}

class AudioManager {
  constructor(){ this.ctx = null; this.enabled = true; this.crowd = null; }
  init(){
    if(this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.22;
    const src=this.ctx.createBufferSource(), filter=this.ctx.createBiquadFilter(), gain=this.ctx.createGain();
    src.buffer=buffer;src.loop=true;filter.type="lowpass";filter.frequency.value=430;gain.gain.value=.028;
    src.connect(filter).connect(gain).connect(this.ctx.destination);src.start();this.crowd={src,gain};
  }
  setEnabled(value){this.enabled=value;if(this.crowd)this.crowd.gain.gain.value=value?.028:0;}
  tone(freq,duration=.12,type="sine",gain=.08,slide=0){if(!this.enabled)return;this.init();const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),this.ctx.currentTime+duration);g.gain.setValueAtTime(gain,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.connect(g).connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration)}
  tap(){this.tone(320,.07,"sine",.04,460)} whistle(){this.tone(1650,.18,"sine",.06,2300)} kick(){this.tone(95,.18,"triangle",.15,45)} correct(){this.tone(520,.12,"sine",.06,820);setTimeout(()=>this.tone(780,.13,"sine",.05,1040),90)} wrong(){this.tone(180,.18,"triangle",.05,120)}
  goal(){[392,523,659,784].forEach((f,i)=>setTimeout(()=>this.tone(f,.26,"sine",.055,f*1.3),i*80))} save(){this.tone(130,.28,"sawtooth",.07,70)}
}
const audio = new AudioManager();

// 3D stadium and original low-poly characters.
const canvas = $("gameCanvas");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x071113); scene.fog = new THREE.FogExp2(0x071113,.011);
new THREE.TextureLoader().load("./assets/stadium-night-v2.png", texture => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  scene.background = texture;
  scene.backgroundIntensity = .74;
});
const camera = new THREE.PerspectiveCamera(48, innerWidth/innerHeight,.1,180); camera.position.set(0,5.6,18);
scene.add(new THREE.HemisphereLight(0xd9eeff,0x1b3424,1.05));
const flood = new THREE.DirectionalLight(0xfff8e8,3.7); flood.position.set(-12,24,14); flood.castShadow=true;flood.shadow.mapSize.set(2048,2048);flood.shadow.camera.left=-24;flood.shadow.camera.right=24;flood.shadow.camera.top=28;flood.shadow.camera.bottom=-12;flood.shadow.bias=-.0003;scene.add(flood);
const rim = new THREE.DirectionalLight(0xa7d8ff,1.55);rim.position.set(14,10,-24);scene.add(rim);
const goalLight = new THREE.SpotLight(0xffffff,38,55,.58,.55,1.4);goalLight.position.set(0,18,-13);goalLight.target.position.set(0,1.5,-20);scene.add(goalLight,goalLight.target);

const pitch = new THREE.Mesh(new THREE.PlaneGeometry(52,82),new THREE.MeshPhysicalMaterial({color:0x1b6d42,roughness:.96,clearcoat:.04,clearcoatRoughness:.9}));pitch.rotation.x=-Math.PI/2;pitch.receiveShadow=true;scene.add(pitch);
for(let z=-38;z<42;z+=8){const stripe=new THREE.Mesh(new THREE.PlaneGeometry(52,4),new THREE.MeshBasicMaterial({color:z%16===0?0x1a6b45:0x14583a,transparent:true,opacity:.5}));stripe.rotation.x=-Math.PI/2;stripe.position.set(0,.006,z);scene.add(stripe)}
const lineMat=new THREE.MeshBasicMaterial({color:0xe8f2e9});
function fieldLine(w,d,x,z){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),lineMat);m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);scene.add(m)}
fieldLine(24,.12,0,-20);fieldLine(.12,12,-12,-14);fieldLine(.12,12,12,-14);fieldLine(24,.12,0,-8);fieldLine(.12,80,-26,0);fieldLine(.12,80,26,0);
const spot=new THREE.Mesh(new THREE.CircleGeometry(.18,20),lineMat);spot.rotation.x=-Math.PI/2;spot.position.set(0,.015,4);scene.add(spot);

const goal = new THREE.Group(); goal.position.z=-20;
const postMat=new THREE.MeshStandardMaterial({color:0xffffff,metalness:.1,roughness:.35});
function post(x,y,w,h,d){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),postMat);m.position.set(x,y,0);m.castShadow=true;goal.add(m)}
post(-6,2.2,.22,4.4,.22);post(6,2.2,.22,4.4,.22);post(0,4.35,12.2,.22,.22);
const netMat=new THREE.LineBasicMaterial({color:0xdcebea,transparent:true,opacity:.32});
const netVerts=[];for(let x=-6;x<=6;x+=.75){netVerts.push(x,0,0,x,4.25,0,x,4.25,2.6)}for(let y=0;y<=4.25;y+=.55){netVerts.push(-6,y,0,6,y,0,-6,y,0,-6,y,2.6,6,y,0,6,y,2.6)}
const netGeo=new THREE.BufferGeometry();netGeo.setAttribute("position",new THREE.Float32BufferAttribute(netVerts,3));const net=new THREE.LineSegments(netGeo,netMat);goal.add(net);scene.add(goal);

const boardMat=new THREE.MeshStandardMaterial({color:0x132629,emissive:0x0c5350,emissiveIntensity:.55,roughness:.35});
[-24,24].forEach(x=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.35,1.15,28),boardMat);b.position.set(x,.58,-8);scene.add(b)});
const backBoard=new THREE.Mesh(new THREE.BoxGeometry(30,1.15,.35),boardMat);backBoard.position.set(0,.58,-27);scene.add(backBoard);

function makePerson(primary=0xffffff,secondary=0x222222,keeper=false){
  const g=new THREE.Group();
  const skin=new THREE.MeshPhysicalMaterial({color:0xa96943,roughness:.68,clearcoat:.05});
  const kit=new THREE.MeshPhysicalMaterial({color:primary,roughness:.62,sheen:.3,sheenColor:new THREE.Color(primary)});
  const shorts=new THREE.MeshStandardMaterial({color:secondary,roughness:.74});
  const socks=new THREE.MeshStandardMaterial({color:primary,roughness:.82});
  const boot=new THREE.MeshStandardMaterial({color:0x101315,roughness:.48,metalness:.12});
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.5,.39,1.18,14),kit);torso.position.y=2.3;torso.castShadow=true;g.add(torso);
  const waist=new THREE.Mesh(new THREE.CylinderGeometry(.41,.43,.42,12),shorts);waist.position.y=1.55;waist.castShadow=true;g.add(waist);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.115,.13,.22,12),skin);neck.position.y=3;g.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.32,24,18),skin);head.scale.set(.9,1.12,.92);head.position.y=3.35;head.castShadow=true;g.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.305,22,12,0,Math.PI*2,0,Math.PI*.48),new THREE.MeshStandardMaterial({color:0x17120f,roughness:.9}));hair.scale.set(.92,1.05,.95);hair.position.y=3.49;g.add(hair);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.055,.14,8),skin);nose.rotation.x=Math.PI/2;nose.position.set(0,3.34,-.3);g.add(nose);
  const joints={arms:[],legs:[]};
  [-1,1].forEach(side=>{
    const arm=new THREE.Group();
    const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.145,.36,5,10),kit);sleeve.position.y=-.25;arm.add(sleeve);
    const forearm=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.42,5,10),skin);forearm.position.y=-.75;forearm.rotation.z=-side*.08;arm.add(forearm);
    const handMaterial=keeper?new THREE.MeshStandardMaterial({color:0xf4f4f0,roughness:.65}):skin;
    const hand=new THREE.Mesh(new THREE.SphereGeometry(keeper?.16:.125,12,10),handMaterial);hand.position.y=-1.08;hand.scale.set(1,.8,.65);arm.add(hand);
    arm.position.set(side*.58,2.72,0);arm.rotation.z=side*.11;arm.traverse(o=>{if(o.isMesh)o.castShadow=true});g.add(arm);joints.arms.push(arm);
    const leg=new THREE.Group();
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.48,5,10),shorts);thigh.position.y=-.34;leg.add(thigh);
    const lower=new THREE.Mesh(new THREE.CapsuleGeometry(.135,.58,5,10),socks);lower.position.y=-.98;leg.add(lower);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(.3,.17,.58),boot);shoe.position.set(0,-1.38,-.13);leg.add(shoe);
    leg.position.set(side*.23,1.43,0);leg.traverse(o=>{if(o.isMesh)o.castShadow=true});g.add(leg);joints.legs.push(leg);
  });
  g.userData={kit,shorts,joints,torso};return g;
}
const QATAR_MAROON=0x8a1538,PLAYER_WHITE=0xf7f7f2,KEEPER_GREEN=0x087a52;
const player=new THREE.Group(),playerFallback=makePerson(QATAR_MAROON,PLAYER_WHITE);player.add(playerFallback);player.userData=playerFallback.userData;player.position.set(0,0,9);player.rotation.y=Math.PI;scene.add(player);
const keeper=new THREE.Group(),keeperFallback=makePerson(KEEPER_GREEN,KEEPER_GREEN,true);keeper.add(keeperFallback);keeper.userData=keeperFallback.userData;keeper.scale.set(.96,.96,.96);keeper.position.set(0,0,-19.2);scene.add(keeper);
const actorMixers=[];

function makeJerseyNumber(value,isBack){
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d");ctx.clearRect(0,0,256,256);ctx.fillStyle="#fff";ctx.font=`900 ${value.length>1?172:196}px Arial`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(value,128,139);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const number=new THREE.Mesh(new THREE.PlaneGeometry(.62,.62),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
  number.position.set(0,2.38,isBack?-.315:.315);number.rotation.y=isBack?Math.PI:0;number.renderOrder=4;return number;
}
function addKeeperGloves(model){
  const gloveMaterial=new THREE.MeshStandardMaterial({color:0xf3f0e7,roughness:.72});
  ["Hand.L","Hand.R"].forEach(name=>{const hand=model.getObjectByName(name);if(!hand)return;const glove=new THREE.Mesh(new THREE.SphereGeometry(2.6,12,10),gloveMaterial);glove.scale.set(1.05,.78,.58);glove.castShadow=true;hand.add(glove)});
}

function actionFor(root, fragment){return root.userData.actions?.find(a=>a.getClip().name.includes(fragment))}
function playActor(root, fragment, once=false){
  if(!root.userData.mixer)return;
  const next=actionFor(root,fragment)||actionFor(root,"Idle");
  if(!next||root.userData.activeAction===next)return;
  root.userData.activeAction?.fadeOut(.16);
  next.reset().fadeIn(.16).play();
  next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;
  root.userData.activeAction=next;
}
function restoreRig(root){
  if(!root.userData.rigBase)return;
  root.userData.rigBase.forEach((q,name)=>root.userData.realModel.getObjectByName(name)?.quaternion.copy(q));
}
function prepareRealActor(gltf,root,fallback,isKeeper=false){
  const model=cloneSkeleton(gltf.scene);
  model.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;node.material=node.material.clone();const n=node.material.name||"";
    if(isKeeper){
      if(/Shirt/i.test(n))node.material.color.set(KEEPER_GREEN);
      else if(/Pants/i.test(n))node.material.color.set(KEEPER_GREEN);
      else if(/Socks/i.test(n))node.material.color.set(0x16966d);
      else if(/Shoes/i.test(n))node.material.color.set(0x172a24);
      else if(/Hair/i.test(n))node.material.color.set(0x2a1512);
    }else{
      if(/Shirt2/i.test(n))node.material.color.set(PLAYER_WHITE);
      else if(/Shirt/i.test(n))node.material.color.set(QATAR_MAROON);
      else if(/Pants/i.test(n))node.material.color.set(PLAYER_WHITE);
      else if(/Socks/i.test(n))node.material.color.set(PLAYER_WHITE);
      else if(/Shoes/i.test(n))node.material.color.set(0x7e1836);
      else if(/Hair/i.test(n))node.material.color.set(0x2a1512);
    }
    node.material.roughness=Math.max(.55,node.material.roughness??.7)});
  model.updateMatrixWorld(true);
  const bodyBox=new THREE.Box3().makeEmpty(),meshBox=new THREE.Box3();
  model.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    node.computeBoundingBox();
    if(node.boundingBox)bodyBox.union(meshBox.copy(node.boundingBox).applyMatrix4(node.matrixWorld));
  });
  const bodyHeight=bodyBox.isEmpty()?1:Math.max(.01,bodyBox.max.y-bodyBox.min.y);
  const actorScale=3.55/bodyHeight;
  model.scale.setScalar(actorScale);
  model.position.y=bodyBox.isEmpty()?0:-bodyBox.min.y*actorScale;
  if(isKeeper)addKeeperGloves(model);
  root.add(model);const number=makeJerseyNumber(isKeeper?"1":"10",!isKeeper);root.add(number);root.userData.jerseyNumber=number;fallback.visible=false;root.userData.realModel=model;
  root.userData.mixer=new THREE.AnimationMixer(model);root.userData.actions=gltf.animations.map(clip=>root.userData.mixer.clipAction(clip));actorMixers.push(root.userData.mixer);
  const rigNames=["UpperLeg.R","LowerLeg.R","Shoulder.L","Shoulder.R","UpperArm.L","UpperArm.R","Torso"];
  root.userData.rigBase=new Map(rigNames.map(name=>[name,model.getObjectByName(name)?.quaternion.clone()]).filter(([,q])=>q));
  playActor(root,"Idle");
}
new GLTFLoader().load("./assets/player-quaternius-cc0.glb",gltf=>{prepareRealActor(gltf,player,playerFallback,false);prepareRealActor(gltf,keeper,keeperFallback,true);applyKit(state.club);resetActors()},undefined,()=>{playerFallback.visible=true;keeperFallback.visible=true});
const ball=new THREE.Mesh(new THREE.SphereGeometry(.34,36,24),new THREE.MeshPhysicalMaterial({color:0xf4f1e8,roughness:.46,clearcoat:.18,clearcoatRoughness:.5}));ball.position.set(0,.35,4);ball.castShadow=true;scene.add(ball);
const patchMat=new THREE.MeshStandardMaterial({color:0x171b1d,roughness:.58,side:THREE.DoubleSide});
[new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),new THREE.Vector3(.7,.55,.45),new THREE.Vector3(-.7,.55,.45),new THREE.Vector3(.7,-.55,-.45),new THREE.Vector3(-.7,-.55,-.45)].forEach(dir=>{dir.normalize();const patch=new THREE.Mesh(new THREE.CircleGeometry(.105,5),patchMat);patch.position.copy(dir).multiplyScalar(.338);patch.lookAt(dir.clone().multiplyScalar(2));ball.add(patch)});
const trail=[];for(let i=0;i<12;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.06+i*.006,8,6),new THREE.MeshBasicMaterial({color:0xf6cf68,transparent:true,opacity:0}));scene.add(p);trail.push(p)}

function applyKit(){player.userData.kit?.color.set(QATAR_MAROON);player.userData.shorts?.color.set(PLAYER_WHITE);keeper.userData.kit?.color.set(KEEPER_GREEN);keeper.userData.shorts?.color.set(KEEPER_GREEN)}
function resetActors(){player.position.set(0,0,9);player.rotation.set(0,Math.PI,0);keeper.position.set(0,0,-19.2);keeper.rotation.set(0,0,0);player.userData.joints?.arms.forEach((a,i)=>a.rotation.set(0,0,i?-.11:.11));player.userData.joints?.legs.forEach(l=>l.rotation.set(0,0,0));keeper.userData.joints?.arms.forEach((a,i)=>a.rotation.set(0,0,i?-.15:.15));keeper.userData.joints?.legs.forEach(l=>l.rotation.set(0,0,0));restoreRig(player);restoreRig(keeper);playActor(player,"Idle");playActor(keeper,"Idle");ball.position.set(0,.35,4);ball.rotation.set(0,0,0);ball.material.emissive?.set(0x000000);trail.forEach(p=>p.material.opacity=0);goal.scale.z=1}
function setCamera(mode){
  if(mode==="aim"){camera.position.set(0,4.35,16.2);camera.lookAt(0,1.85,-20)}
  else if(mode==="replay"){camera.position.set(12,4,4);camera.lookAt(0,1.8,-10)}
  else if(mode==="celebrate"){camera.position.set(-7,4,10);camera.lookAt(player.position.x,2,player.position.z)}
}

let shotAnim=null, introT=0, clock=new THREE.Clock();
function performShot(isReplay=false){
  const power=Number($("powerRange").value);const aim=state.selectedAim;
  if(!isReplay){
    const keeperGuess={x:(Math.random()*10-5),y:1.1+Math.random()*2.6};
    const reach=Math.abs(keeperGuess.x-aim.x)<1.7 && Math.abs(keeperGuess.y-aim.y)<1.45;
    const saveChance=reach?(power<62?.82:power<82?.60:.38):.05;
    const goalResult=Math.random()>saveChance;
    state.currentShot={aim:{...aim},power,keeperGuess,goal:goalResult,special:state.special};
  }
  const shot=state.currentShot;resetActors();setCamera(isReplay?"replay":"aim");showScreen("aimScreen");$("aimScreen").classList.remove("active");
  playActor(player,"Run");
  shotAnim={start:performance.now(),isReplay,launched:false,finished:false,duration:Math.max(.7,1.16-(shot.power-35)/170),shot};
  if(shot.special){ball.material.emissive=new THREE.Color(0xe2a93f);ball.material.emissiveIntensity=1.8}
}

function updateShot(now){
  if(!shotAnim)return;const s=shotAnim,elapsed=(now-s.start)/1000;
  if(elapsed<.68){
    const t=Math.min(1,elapsed/.68);player.position.z=9-4.3*t;const swing=Math.sin(t*Math.PI*4)*.55;if(!player.userData.realModel){player.userData.joints.arms[0].rotation.x=swing;player.userData.joints.arms[1].rotation.x=-swing;player.userData.joints.legs[0].rotation.x=-swing;player.userData.joints.legs[1].rotation.x=swing}
    if(state.cinematic && t>.72) camera.position.x=Math.sin(t*5)*.25;
    return;
  }
  if(!s.launched){s.launched=true;s.launchTime=now;audio.kick();if(player.userData.realModel){player.userData.mixer.stopAllAction();restoreRig(player);const upper=player.userData.realModel.getObjectByName("UpperLeg.R"),lower=player.userData.realModel.getObjectByName("LowerLeg.R");if(upper)upper.rotation.x-=1.15;if(lower)lower.rotation.x+=.48}else player.userData.joints.legs[1].rotation.x=-1.2}
  const t=Math.min(1,(now-s.launchTime)/1000/s.duration),e=1-Math.pow(1-t,2);
  const target=s.shot.aim;ball.position.set(THREE.MathUtils.lerp(0,target.x,e),THREE.MathUtils.lerp(.35,target.y,e)+Math.sin(t*Math.PI)*(.7+s.shot.power/160),THREE.MathUtils.lerp(4,-20.1,e));ball.rotation.x+=.34;ball.rotation.z+=.17;
  const diveT=Math.max(0,Math.min(1,(t-.25)/.55));keeper.position.x=THREE.MathUtils.lerp(0,s.shot.keeperGuess.x,diveT);keeper.position.y=Math.sin(diveT*Math.PI)*Math.min(1.65,s.shot.keeperGuess.y*.55);keeper.rotation.z=-Math.sign(s.shot.keeperGuess.x||1)*diveT*.85;if(keeper.userData.realModel){if(!s.keeperStopped){keeper.userData.mixer.stopAllAction();restoreRig(keeper);s.keeperStopped=true}const left=keeper.userData.realModel.getObjectByName("UpperArm.L"),right=keeper.userData.realModel.getObjectByName("UpperArm.R");if(left)left.rotation.z=.9;if(right)right.rotation.z=-.9}else{keeper.userData.joints.arms[0].rotation.z=.8;keeper.userData.joints.arms[1].rotation.z=-.8}
  if(s.shot.special)trail.forEach((p,i)=>{const lag=Math.max(0,t-i*.022);p.position.set(THREE.MathUtils.lerp(0,target.x,lag),THREE.MathUtils.lerp(.35,target.y,lag)+Math.sin(lag*Math.PI)*(.7+s.shot.power/160),THREE.MathUtils.lerp(4,-20.1,lag));p.material.opacity=(1-i/trail.length)*.5});
  if(state.cinematic&&!s.isReplay){camera.position.z=THREE.MathUtils.lerp(17,7,t);camera.position.y=THREE.MathUtils.lerp(4.9,3.4,t);camera.lookAt(ball.position)}
  if(t>=1&&!s.finished){s.finished=true;if(s.shot.goal){goal.scale.z=1.18;audio.goal();setTimeout(()=>playActor(player,"Clapping"),180)}else{ball.position.copy(keeper.position).add(new THREE.Vector3(0,1.6,.2));audio.save()}setTimeout(()=>finishShot(s),650)}
}

function finishShot(anim){
  if(shotAnim!==anim)return;shotAnim=null;
  if(!anim.isReplay){if(anim.shot.goal)state.goals++;updateHUD()}
  $("resultOverlay").classList.toggle("save",!anim.shot.goal);
  $("resultWord").textContent=anim.shot.goal?"هــدف!":"تصدٍّ!";
  $("resultDetail").textContent=anim.shot.goal?(anim.shot.special?"إجابة صحيحة وركلة نحو حاسمة!":"إجابة صحيحة وتسديدة موفقة."):"إجابتك النحوية صحيحة، لكن الحارس تصدّى للركلة.";
  $("resultOverlay").classList.add("active");
}

function animate(now){requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());introT+=dt;actorMixers.forEach(m=>m.update(dt));
  if(!shotAnim){player.position.y=Math.sin(introT*2)*.012;keeper.position.x=Math.sin(introT*.8)*.7}
  if(state.phase==="start"){camera.position.x=Math.sin(introT*.23)*8;camera.position.y=6.5+Math.sin(introT*.31)*1.2;camera.position.z=16+Math.cos(introT*.23)*4;camera.lookAt(0,1.8,-12)}
  updateShot(now);renderer.render(scene,camera)}

$("startBtn").addEventListener("click",()=>{audio.init();audio.whistle();showScreen("clubScreen");camera.position.set(7,5,15);camera.lookAt(0,2,-14)});
$("toMatchBtn").addEventListener("click",()=>{resetMatch();$("hud").classList.remove("hidden");renderQuestion()});
$("continueBtn").addEventListener("click",enterAim);
$("aimPad").addEventListener("pointerdown",e=>{const r=e.currentTarget.getBoundingClientRect();const px=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const py=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));state.selectedAim={x:(px-.5)*10.6,y:(1-py)*3.25+.55};$("target").style.display="block";$("target").style.left=`${px*100}%`;$("target").style.top=`${py*100}%`;$("shootBtn").disabled=false;audio.tap()});
$("powerRange").addEventListener("input",e=>$("powerValue").textContent=`${e.target.value}%`);
$("shootBtn").addEventListener("click",()=>performShot(false));
$("replayBtn").addEventListener("click",()=>{$("resultOverlay").classList.remove("active");performShot(true)});
$("nextBtn").addEventListener("click",()=>{$("resultOverlay").classList.remove("active");state.kickIndex++;if(state.kickIndex>=state.kickCount)showFinal();else renderQuestion()});
$("reviewBtn").addEventListener("click",renderReview);$("reviewBackBtn").addEventListener("click",()=>showScreen("finalScreen"));
$("restartBtn").addEventListener("click",()=>{resetMatch();$("hud").classList.remove("hidden");renderQuestion()});
$("changeClubBtn").addEventListener("click",()=>{state.club=null;$("toMatchBtn").disabled=true;document.querySelectorAll(".club-card").forEach(c=>c.classList.remove("selected"));showScreen("clubScreen")});
$("teacherBtn").addEventListener("click",()=>$("teacherDialog").showModal());
$("applyTeacherBtn").addEventListener("click",e=>{e.preventDefault();state.kickCount=Number(document.querySelector('input[name="kickCount"]:checked').value);state.difficulty=document.querySelector('input[name="difficulty"]:checked').value;state.cinematic=$("cinematicToggle").checked;state.sound=$("audioToggle").checked;audio.setEnabled(state.sound);$("soundBtn").innerHTML=`<i data-lucide="${state.sound?"volume-2":"volume-x"}"></i>`;lucide.createIcons();$("teacherDialog").close()});
$("soundBtn").addEventListener("click",()=>{state.sound=!state.sound;$("audioToggle").checked=state.sound;audio.setEnabled(state.sound);$("soundBtn").innerHTML=`<i data-lucide="${state.sound?"volume-2":"volume-x"}"></i>`;lucide.createIcons()});
addEventListener("resize",()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});

buildClubs();lucide.createIcons();resetActors();animate(performance.now());
