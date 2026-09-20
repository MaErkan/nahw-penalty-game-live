import * as THREE from "three";
import { GLTFLoader } from "https://unpkg.com/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "https://unpkg.com/three@0.170.0/examples/jsm/utils/SkeletonUtils.js";
import { QUESTIONS, CLUBS } from "./questions.js";

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];
const state = {
  phase: "start", club: null, opponentClub: null, kickCount: 5, difficulty: "all", cinematic: true, sound: true, commentary: false,
  questions: [], kickIndex: 0, correct: 0, goals: [0,0], streak: 0, bestStreak: 0,
  mistakes: [], selectedAim: null, firstAttempt: true, answerCorrect: true, currentShot: null, special: false
};

function showScreen(id) {
  screens.forEach(s => s.classList.toggle("active", s.id === id));
  state.phase = id.replace("Screen", "");
  if(["startScreen","clubScreen","finalScreen","reviewScreen"].includes(id))$("commentaryBar").classList.add("hidden");
}

function setCommentary(text){$("commentaryBar").textContent=text;$("commentaryBar").classList.remove("hidden")}

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
    const picked=CLUBS[Number(card.dataset.club)];
    if(state.club===picked){state.club=state.opponentClub;state.opponentClub=null}
    else if(state.opponentClub===picked){state.opponentClub=null}
    else if(!state.club){state.club=picked}
    else if(!state.opponentClub){state.opponentClub=picked}
    else{state.club=picked;state.opponentClub=null}
    document.querySelectorAll(".club-card").forEach(c=>{const club=CLUBS[Number(c.dataset.club)];c.classList.toggle("selected",club===state.club||club===state.opponentClub);c.classList.toggle("selected-primary",club===state.club);c.classList.toggle("selected-opponent",club===state.opponentClub)});
    $("teamChoiceHint").textContent=!state.club?"اختر فريقك":!state.opponentClub?`فريقك: ${state.club.name} — اختر المنافس`:`${state.club.name} ضد ${state.opponentClub.name}`;
    $("toMatchBtn").disabled = !(state.club&&state.opponentClub);
    applyKit();
    if(state.club&&state.opponentClub)commentator.matchup(state.club.name,state.opponentClub.name);
    audio.tap();
  }));
}

function chooseQuestions() {
  let pool = QUESTIONS;
  if (state.difficulty !== "all") pool = QUESTIONS.filter(q => q.difficulty === state.difficulty);
  if (!pool.length) pool = QUESTIONS;
  const total=state.kickCount*2,selected=[];
  while(selected.length<total)selected.push(...shuffle(pool));
  state.questions = selected.slice(0,total);
}

function resetMatch() {
  state.kickIndex = 0; state.correct = 0; state.goals = [0,0]; state.streak = 0; state.bestStreak = 0;
  state.mistakes = []; state.currentShot = null; state.special = false;
  chooseQuestions();
  updateHUD();
}

function updateHUD() {
  const currentTeam=state.kickIndex%2;
  $("hudTeam").textContent = state.club?.name || "—";
  $("opponentName").textContent = state.opponentClub?.name || "—";
  $("teamSwatch").style.background = state.club?.primary || "#fff";
  $("opponentSwatch").style.background = state.opponentClub?.primary || "#fff";
  $("rightTeam").classList.toggle("attacking",currentTeam===0);
  $("leftTeam").classList.toggle("attacking",currentTeam===1);
  $("hudCorrect").textContent = `${state.correct}/${Math.max(1, state.kickIndex + (state.phase === "final" ? 0 : 1))}`;
  $("hudGoals").textContent = `${state.goals[0]} - ${state.goals[1]}`;
  $("hudKick").textContent = `${Math.min(Math.floor(state.kickIndex/2)+1,state.kickCount)} / ${state.kickCount}`;
  $("streakMeter").firstElementChild.style.width = `${Math.min(100, state.streak / 3 * 100)}%`;
}

function renderQuestion() {
  audio.resetEventAudio();
  const q = state.questions[state.kickIndex];
  applyTurnKits();
  state.firstAttempt = true;
  state.answerCorrect = true;
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
  const attackingClub=state.kickIndex%2?state.opponentClub:state.club;
  setCommentary(`مباشر من استاد آركان الرياضي: الدور الآن على ${attackingClub.name}.`);
  commentator.turn(attackingClub.name);
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
    setCommentary("إجابة صحيحة! يستعد اللاعب الآن لتنفيذ ركلة الترجيح.");
    commentator.correct();
    updateHUD();
  } else {
    button.classList.add("wrong");
    document.querySelectorAll(".option-btn").forEach(b => b.disabled = true);
    document.querySelector(`.option-btn[data-index="${q.correct}"]`)?.classList.add("correct");
    if (state.firstAttempt) {
      state.mistakes.push({ question: q.question, selected: q.options[index], correct: q.options[q.correct], rule: q.rule });
      state.firstAttempt = false;
      state.streak = 0;
    }
    state.answerCorrect = false;
    state.special = false;
    $("feedback").textContent = `إجابة غير صحيحة. ستدخل للتسديد، لكن هذه الركلة لن تصيب المرمى. ${q.rule}`;
    $("feedback").className = "feedback bad";
    $("continueBtn").classList.remove("hidden");
    audio.wrong();
    setCommentary("إجابة غير صحيحة؛ ستُنفذ الركلة التدريبية لكنها لن تصيب المرمى.");
    commentator.wrong();
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
  audio.preKick();
  const attackingClub=state.kickIndex%2?state.opponentClub:state.club;
  setCommentary(`${attackingClub.name} يستعد للتسديد وسط تشجيع جماهير استاد آركان الرياضي.`);
}

function showFinal() {
  audio.resetEventAudio();
  state.phase = "final";
  $("hud").classList.add("hidden");
  const totalKicks=state.kickCount*2,accuracy = Math.round(state.correct / totalKicks * 100);
  $("finalClub").textContent = `${state.club.name} × ${state.opponentClub.name}`;
  $("finalAccuracy").textContent = `${accuracy}%`;
  $("finalCorrect").textContent = `${state.correct}/${totalKicks}`;
  $("finalGoals").textContent = `${state.club.name} ${state.goals[0]} - ${state.goals[1]} ${state.opponentClub.name}`;
  $("finalStreak").textContent = state.bestStreak;
  const winner=state.goals[0]===state.goals[1]?"تعادل الفريقان.":`${state.goals[0]>state.goals[1]?state.club.name:state.opponentClub.name} فاز بالمباراة.`;
  $("finalMessage").textContent = `${winner} ${accuracy >= 80 ? "أتقنت تحديد عمل «لا» النافية للجنس وشروطها." : "راجع شروط عمل «لا» النافية للجنس وأنواع اسمها."}`;
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
  constructor(){this.ctx=null;this.enabled=true;this.crowd=null;this.stadium=null;this.cheer=null;this.celebration=null;this.intro=null;this.cheerTimer=null;this.matchStarted=false}
  init(){
    if(!this.stadium){
      this.stadium=new Audio("./assets/stadium-roar.mp3");this.stadium.loop=true;this.stadium.preload="auto";this.stadium.volume=.32;this.stadium.muted=!this.enabled;
      this.cheer=new Audio("./assets/stadium-roar.mp3");this.cheer.preload="auto";this.cheer.volume=.62;this.cheer.muted=!this.enabled;
      this.celebration=new Audio("./assets/goal-celebration.mp3");this.celebration.preload="auto";this.celebration.volume=.48;this.celebration.muted=!this.enabled;
      this.intro=new Audio("./assets/arkan-stadium-intro.wav");this.intro.preload="auto";this.intro.volume=.96;this.intro.muted=!this.enabled;this.intro.onended=()=>this.startStadium();this.intro.onerror=()=>this.startStadium();
    }
    if(this.ctx){if(this.ctx.state==="suspended")this.ctx.resume();return}
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.22;
    const src=this.ctx.createBufferSource(), filter=this.ctx.createBiquadFilter(), gain=this.ctx.createGain();
    src.buffer=buffer;src.loop=true;filter.type="lowpass";filter.frequency.value=430;gain.gain.value=.012;
    src.connect(filter).connect(gain).connect(this.ctx.destination);src.start();this.crowd={src,gain};
  }
  setEnabled(value){this.enabled=value;if(this.crowd)this.crowd.gain.gain.value=value?.008:0;[this.stadium,this.cheer,this.celebration,this.intro].forEach(track=>{if(track)track.muted=!value});if(this.stadium&&value&&this.matchStarted)this.stadium.play().catch(()=>{})}
  duck(){if(this.stadium&&!this.stadium.muted)this.stadium.volume=.12}
  restore(){if(this.stadium)this.stadium.volume=.32}
  tone(freq,duration=.12,type="sine",gain=.08,slide=0){if(!this.enabled)return;this.init();const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),this.ctx.currentTime+duration);g.gain.setValueAtTime(gain,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.connect(g).connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration)}
  crowdBurst(duration=1800,volume=.62){if(!this.enabled)return;this.init();clearTimeout(this.cheerTimer);this.cheer.pause();this.cheer.currentTime=Math.min(Math.max(0,Math.random()*18),18);this.cheer.volume=volume;this.cheer.play().catch(()=>{});this.cheerTimer=setTimeout(()=>this.cheer.pause(),duration)}
  impact(){if(!this.enabled)return;this.init();const length=Math.floor(this.ctx.sampleRate*.09),buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,3);const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();src.buffer=buffer;filter.type="lowpass";filter.frequency.value=720;gain.gain.setValueAtTime(.32,this.ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+.09);src.connect(filter).connect(gain).connect(this.ctx.destination);src.start()}
  tap(){this.tone(320,.07,"sine",.025,460)} kick(){this.impact()} correct(){this.tone(520,.12,"sine",.04,820);setTimeout(()=>this.tone(780,.13,"sine",.035,1040),90)} wrong(){this.tone(180,.18,"triangle",.035,120)}
  preKick(){this.crowdBurst(1200,.46)}
  resetEventAudio(){clearTimeout(this.cheerTimer);[this.cheer,this.celebration].forEach(track=>{if(track){track.pause();track.currentTime=0}})}
  startStadium(){this.init();this.matchStarted=true;this.restore();if(this.enabled)this.stadium.play().catch(()=>{})}
  playIntro(){if(!this.enabled)return;this.init();this.matchStarted=false;this.resetEventAudio();this.stadium.pause();this.intro.currentTime=0;this.intro.play().catch(()=>this.startStadium())}
  startMatch(){this.init();if(this.intro&&!this.intro.paused){this.intro.pause();this.intro.currentTime=0}this.resetEventAudio();this.startStadium()}
  goal(){this.crowdBurst(4200,.9);this.celebration.currentTime=0;this.celebration.play().catch(()=>{})}
  save(){this.crowdBurst(2200,.7)}
}
const audio = new AudioManager();
const commentator={intro(){},matchup(){},turn(){},correct(){},wrong(){},shoot(){},goal(){},save(){},miss(){},stop(){}};

// 3D stadium and original low-poly characters.
const canvas = $("gameCanvas");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.35:1.75)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  g.userData={kit,shorts,socks,boot,joints,torso};return g;
}
const QATAR_MAROON=0x8a1538,PLAYER_WHITE=0xf7f7f2,KEEPER_GREEN=0x087a52;
const player=new THREE.Group(),playerFallback=makePerson(QATAR_MAROON,PLAYER_WHITE);player.add(playerFallback);player.userData=playerFallback.userData;player.position.set(0,0,9);player.rotation.y=Math.PI;scene.add(player);
const keeper=new THREE.Group(),keeperFallback=makePerson(KEEPER_GREEN,KEEPER_GREEN,true);keeper.add(keeperFallback);keeper.userData=keeperFallback.userData;keeper.scale.set(.96,.96,.96);keeper.position.set(0,0,-19.2);scene.add(keeper);
const teammateActors=[[-9,2],[9,1]].map(([x,z],i)=>{const actor=makePerson(QATAR_MAROON,PLAYER_WHITE);actor.scale.setScalar(.82);actor.position.set(x,0,z);actor.rotation.y=i?-.55:.55;scene.add(actor);return actor});
const opponentActors=[[-8,-8],[8,-10]].map(([x,z],i)=>{const actor=makePerson(0xf7f7f2,0x263238);actor.scale.setScalar(.84);actor.position.set(x,0,z);actor.rotation.y=i?.45:-.45;scene.add(actor);return actor});
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
  const materials={shirt:[],accent:[],pants:[],socks:[],shoes:[]};
  model.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;node.material=node.material.clone();const n=node.material.name||"";
    if(isKeeper){
      if(/Shirt/i.test(n)){node.material.color.set(KEEPER_GREEN);materials.shirt.push(node.material)}
      else if(/Pants/i.test(n)){node.material.color.set(KEEPER_GREEN);materials.pants.push(node.material)}
      else if(/Socks/i.test(n)){node.material.color.set(0x16966d);materials.socks.push(node.material)}
      else if(/Shoes/i.test(n)){node.material.color.set(0x172a24);materials.shoes.push(node.material)}
      else if(/Hair/i.test(n))node.material.color.set(0x2a1512);
    }else{
      if(/Shirt2/i.test(n)){node.material.color.set(PLAYER_WHITE);materials.accent.push(node.material)}
      else if(/Shirt/i.test(n)){node.material.color.set(QATAR_MAROON);materials.shirt.push(node.material)}
      else if(/Pants/i.test(n)){node.material.color.set(PLAYER_WHITE);materials.pants.push(node.material)}
      else if(/Socks/i.test(n)){node.material.color.set(PLAYER_WHITE);materials.socks.push(node.material)}
      else if(/Shoes/i.test(n)){node.material.color.set(0x7e1836);materials.shoes.push(node.material)}
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
  root.add(model);const number=makeJerseyNumber(isKeeper?"1":"10",!isKeeper);root.add(number);root.userData.jerseyNumber=number;fallback.visible=false;root.userData.realModel=model;root.userData.materials=materials;
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

const KEEPER_KITS=["#087a52","#e07a19","#6c3db5","#e2b51f","#7b243d","#156b8d"];
function colorActor(root,primary,secondary,accent=secondary,shoe="#16191c"){
  root.userData.kit?.color.set(primary);root.userData.shorts?.color.set(secondary);root.userData.socks?.color.set(accent);root.userData.boot?.color.set(shoe);
  root.userData.materials?.shirt.forEach(m=>m.color.set(primary));root.userData.materials?.accent.forEach(m=>m.color.set(accent));root.userData.materials?.pants.forEach(m=>m.color.set(secondary));root.userData.materials?.socks.forEach(m=>m.color.set(accent));root.userData.materials?.shoes.forEach(m=>m.color.set(shoe));
}
function applyKit(){
  const selected=state.club||{primary:"#8a1538",secondary:"#f7f7f2",accent:"#f7f7f2"};
  const opponent=state.opponentClub||{primary:"#f7f7f2",secondary:"#263238",accent:"#f7f7f2"};
  const keeperColor=KEEPER_KITS[Math.max(0,CLUBS.indexOf(state.opponentClub))%KEEPER_KITS.length];
  colorActor(player,selected.primary,selected.secondary,selected.accent,selected.primary);
  teammateActors.forEach(actor=>colorActor(actor,selected.primary,selected.secondary,selected.accent,selected.primary));
  opponentActors.forEach(actor=>colorActor(actor,opponent.primary,opponent.secondary,opponent.accent,opponent.primary));
  colorActor(keeper,keeperColor,keeperColor,"#f4f4f0","#111820");
}
function applyTurnKits(){
  const currentTeam=state.kickIndex%2,attacker=currentTeam?state.opponentClub:state.club,defender=currentTeam?state.club:state.opponentClub;
  if(!attacker||!defender){applyKit();return}
  colorActor(player,attacker.primary,attacker.secondary,attacker.accent,attacker.primary);
  teammateActors.forEach(actor=>colorActor(actor,attacker.primary,attacker.secondary,attacker.accent,attacker.primary));
  opponentActors.forEach(actor=>colorActor(actor,defender.primary,defender.secondary,defender.accent,defender.primary));
  const keeperColor=KEEPER_KITS[CLUBS.indexOf(defender)%KEEPER_KITS.length];
  colorActor(keeper,keeperColor,keeperColor,"#f4f4f0","#111820");
}
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
    if(!state.answerCorrect){
      const missAim={x:aim.x>=0?7.35:-7.35,y:Math.min(4.1,Math.max(.8,aim.y))};
      state.currentShot={aim:missAim,power,keeperGuess:{x:0,y:1.8},goal:false,outcome:"miss",special:false};
    }else{
      const reach=Math.abs(keeperGuess.x-aim.x)<1.7 && Math.abs(keeperGuess.y-aim.y)<1.45;
      const saveChance=reach?(power<62?.82:power<82?.60:.38):.05;
      const goalResult=Math.random()>saveChance;
      state.currentShot={aim:{...aim},power,keeperGuess,goal:goalResult,outcome:goalResult?"goal":"save",special:state.special};
    }
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
  if(!s.launched){s.launched=true;s.launchTime=now;audio.kick();commentator.shoot();if(player.userData.realModel){player.userData.mixer.stopAllAction();restoreRig(player);const upper=player.userData.realModel.getObjectByName("UpperLeg.R"),lower=player.userData.realModel.getObjectByName("LowerLeg.R");if(upper)upper.rotation.x-=1.15;if(lower)lower.rotation.x+=.48}else player.userData.joints.legs[1].rotation.x=-1.2}
  const t=Math.min(1,(now-s.launchTime)/1000/s.duration),e=1-Math.pow(1-t,2);
  const target=s.shot.aim;ball.position.set(THREE.MathUtils.lerp(0,target.x,e),THREE.MathUtils.lerp(.35,target.y,e)+Math.sin(t*Math.PI)*(.7+s.shot.power/160),THREE.MathUtils.lerp(4,-20.1,e));ball.rotation.x+=.34;ball.rotation.z+=.17;
  const diveT=Math.max(0,Math.min(1,(t-.25)/.55));keeper.position.x=THREE.MathUtils.lerp(0,s.shot.keeperGuess.x,diveT);keeper.position.y=Math.sin(diveT*Math.PI)*Math.min(1.65,s.shot.keeperGuess.y*.55);keeper.rotation.z=-Math.sign(s.shot.keeperGuess.x||1)*diveT*.85;if(keeper.userData.realModel){if(!s.keeperStopped){keeper.userData.mixer.stopAllAction();restoreRig(keeper);s.keeperStopped=true}const left=keeper.userData.realModel.getObjectByName("UpperArm.L"),right=keeper.userData.realModel.getObjectByName("UpperArm.R");if(left)left.rotation.z=.9;if(right)right.rotation.z=-.9}else{keeper.userData.joints.arms[0].rotation.z=.8;keeper.userData.joints.arms[1].rotation.z=-.8}
  if(s.shot.special)trail.forEach((p,i)=>{const lag=Math.max(0,t-i*.022);p.position.set(THREE.MathUtils.lerp(0,target.x,lag),THREE.MathUtils.lerp(.35,target.y,lag)+Math.sin(lag*Math.PI)*(.7+s.shot.power/160),THREE.MathUtils.lerp(4,-20.1,lag));p.material.opacity=(1-i/trail.length)*.5});
  if(state.cinematic&&!s.isReplay){camera.position.z=THREE.MathUtils.lerp(17,7,t);camera.position.y=THREE.MathUtils.lerp(4.9,3.4,t);camera.lookAt(ball.position)}
  if(t>=1&&!s.finished){s.finished=true;if(s.shot.goal){goal.scale.z=1.18;audio.goal();setTimeout(()=>playActor(player,"Clapping"),180)}else if(s.shot.outcome==="save"){ball.position.copy(keeper.position).add(new THREE.Vector3(0,1.6,.2));audio.save()}else{audio.wrong()}setTimeout(()=>finishShot(s),650)}
}

function finishShot(anim){
  if(shotAnim!==anim)return;shotAnim=null;
  if(!anim.isReplay){if(anim.shot.goal)state.goals[state.kickIndex%2]++;updateHUD()}
  $("resultOverlay").classList.toggle("save",anim.shot.outcome==="save");
  $("resultOverlay").classList.toggle("miss",anim.shot.outcome==="miss");
  $("resultWord").textContent=anim.shot.goal?"هــدف!":anim.shot.outcome==="miss"?"خارج المرمى!":"تصدٍّ!";
  const defendingClub=state.kickIndex%2?state.club:state.opponentClub;
  const attackingClub=state.kickIndex%2?state.opponentClub:state.club;
  $("resultDetail").textContent=anim.shot.goal?(anim.shot.special?"إجابة صحيحة وركلة نحو حاسمة!":"إجابة صحيحة وتسديدة موفقة."):anim.shot.outcome==="miss"?"الإجابة غير صحيحة؛ نُفذت الركلة التدريبية لكنها لم تصب المرمى.":`إجابتك النحوية صحيحة، لكن حارس ${defendingClub.name} تصدّى للركلة.`;
  setCommentary(anim.shot.goal?`هدف رائع لفريق ${attackingClub.name} في استاد آركان الرياضي!`:anim.shot.outcome==="save"?`تصدي مميز من حارس ${defendingClub.name}!`:"الكرة خارج المرمى، وننتظر الركلة التالية.");
  if(!anim.isReplay){if(anim.shot.goal)commentator.goal(attackingClub.name);else if(anim.shot.outcome==="save")commentator.save(defendingClub.name);else commentator.miss()}
  $("resultOverlay").classList.add("active");
}

function animate(now){requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());introT+=dt;actorMixers.forEach(m=>m.update(dt));
  if(!shotAnim){player.position.y=Math.sin(introT*2)*.012;keeper.position.x=Math.sin(introT*.8)*.7}
  teammateActors.forEach((actor,i)=>actor.position.y=Math.sin(introT*1.7+i)*.018);opponentActors.forEach((actor,i)=>actor.position.y=Math.sin(introT*1.5+i+2)*.018);
  if(state.phase==="start"){camera.position.x=Math.sin(introT*.23)*8;camera.position.y=6.5+Math.sin(introT*.31)*1.2;camera.position.z=16+Math.cos(introT*.23)*4;camera.lookAt(0,1.8,-12)}
  updateShot(now);renderer.render(scene,camera)}

$("startBtn").addEventListener("click",()=>{audio.init();audio.playIntro();showScreen("clubScreen");camera.position.set(7,5,15);camera.lookAt(0,2,-14)});
$("toMatchBtn").addEventListener("click",()=>{audio.startMatch();resetMatch();$("hud").classList.remove("hidden");renderQuestion()});
$("continueBtn").addEventListener("click",enterAim);
$("aimPad").addEventListener("pointerdown",e=>{const r=e.currentTarget.getBoundingClientRect();const px=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const py=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));state.selectedAim={x:(px-.5)*10.6,y:(1-py)*3.25+.55};$("target").style.display="block";$("target").style.left=`${px*100}%`;$("target").style.top=`${py*100}%`;$("shootBtn").disabled=false;audio.tap()});
$("powerRange").addEventListener("input",e=>$("powerValue").textContent=`${e.target.value}%`);
$("shootBtn").addEventListener("click",()=>performShot(false));
$("replayBtn").addEventListener("click",()=>{$("resultOverlay").classList.remove("active");performShot(true)});
$("nextBtn").addEventListener("click",()=>{$("resultOverlay").classList.remove("active");state.kickIndex++;if(state.kickIndex>=state.kickCount*2)showFinal();else renderQuestion()});
$("reviewBtn").addEventListener("click",renderReview);$("reviewBackBtn").addEventListener("click",()=>showScreen("finalScreen"));
$("restartBtn").addEventListener("click",()=>{resetMatch();$("hud").classList.remove("hidden");renderQuestion()});
$("changeClubBtn").addEventListener("click",()=>{state.club=null;state.opponentClub=null;$("teamChoiceHint").textContent="الاختيار الأول لفريقك، والثاني للمنافس";$("toMatchBtn").disabled=true;document.querySelectorAll(".club-card").forEach(c=>c.classList.remove("selected","selected-primary","selected-opponent"));applyKit();showScreen("clubScreen")});
$("teacherBtn").addEventListener("click",()=>$("teacherDialog").showModal());
$("applyTeacherBtn").addEventListener("click",e=>{e.preventDefault();state.kickCount=Number(document.querySelector('input[name="kickCount"]:checked').value);state.difficulty=document.querySelector('input[name="difficulty"]:checked').value;state.cinematic=$("cinematicToggle").checked;state.sound=$("audioToggle").checked;audio.setEnabled(state.sound);$("soundBtn").innerHTML=`<i data-lucide="${state.sound?"volume-2":"volume-x"}"></i>`;lucide.createIcons();$("teacherDialog").close()});
$("soundBtn").addEventListener("click",()=>{state.sound=!state.sound;$("audioToggle").checked=state.sound;audio.setEnabled(state.sound);if(!state.sound)commentator.stop();$("soundBtn").innerHTML=`<i data-lucide="${state.sound?"volume-2":"volume-x"}"></i>`;lucide.createIcons()});
addEventListener("resize",()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<760?1.35:1.75));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});

buildClubs();lucide.createIcons();resetActors();animate(performance.now());
