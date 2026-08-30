const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const GRAVITY = 0.45;
const TILE = 32;

// --- បង្កើតផែនទីវែងជាងមុន ដោយស្វ័យប្រវត្តិ (ដីជាចម្រៀក + គម្លាតតូចៗងាយលោត) ---
const LEVEL_COLS = 100;
const LEVEL_ROWS = 17;
const GROUND_ROW = 15;
const level = [];
for (let r = 0; r < LEVEL_ROWS; r++) level.push(new Array(LEVEL_COLS).fill("."));

const groundSegments = [[0,9],[12,24],[28,40],[43,55],[59,75],[78,99]];
groundSegments.forEach(([s,e]) => {
  for (let c = s; c <= e; c++) { level[GROUND_ROW][c] = "1"; level[GROUND_ROW+1][c] = "1"; }
});

// ប្លុកអណ្តែត (brick/question) សម្រាប់ចម្រុះលេង
const blockSpots = [
  {col:14,row:13,ch:"2"},{col:15,row:13,ch:"2"},{col:16,row:13,ch:"3"},
  {col:30,row:13,ch:"2"},{col:31,row:13,ch:"3"},{col:32,row:13,ch:"2"},
  {col:45,row:11,ch:"3"},{col:47,row:11,ch:"2"},{col:49,row:11,ch:"3"},
  {col:61,row:13,ch:"2"},{col:62,row:13,ch:"3"},{col:63,row:13,ch:"2"},
  {col:80,row:11,ch:"3"},{col:82,row:11,ch:"2"},{col:84,row:11,ch:"3"}
];
blockSpots.forEach(b => level[b.row][b.col] = b.ch);

// ទង់ចប់ហ្គេម
const FLAG_COL = 96;
level[12][FLAG_COL] = "4";
level[13][FLAG_COL] = "4";
level[14][FLAG_COL] = "4";

const levelWidth = level[0].length * TILE;
const levelHeight = level.length * TILE;

function tileAt(col, row) {
  if (row < 0 || row >= level.length || col < 0 || col >= level[0].length) return ".";
  return level[row][col];
}

// --- Player: Zip the Fox ---
const player = {
  x: 60, y: 200, w: 26, h: 28,
  vx: 0, vy: 0,
  onGround: false,
  facing: 1,
  lives: 3,
  invincible: 0,
  isPlayer: true
};

let gems = 0;
let timeLeft = 400;
let camX = 0;
let gameOver = false;
let win = false;
let frame = 0;

// --- សត្រូវ ២ប្រភេទ៖ slime (ដើររាងស៊ីវិល) និង hopper (លោតៗ) ---
let enemies = [
  { x: 17*TILE, y: GROUND_ROW*TILE-24, w: 26, h: 24, vx: -1.2, vy:0, alive: true, type: "slime" },
  { x: 34*TILE, y: GROUND_ROW*TILE-24, w: 26, h: 24, vx: -1.2, vy:0, alive: true, type: "slime" },
  { x: 50*TILE, y: GROUND_ROW*TILE-24, w: 24, h: 24, vx: -1, vy:0, alive: true, type: "hopper", hopTimer: 60 },
  { x: 65*TILE, y: GROUND_ROW*TILE-24, w: 26, h: 24, vx: -1.2, vy:0, alive: true, type: "slime" },
  { x: 72*TILE, y: GROUND_ROW*TILE-24, w: 24, h: 24, vx: -1, vy:0, alive: true, type: "hopper", hopTimer: 100 },
  { x: 87*TILE, y: GROUND_ROW*TILE-24, w: 26, h: 24, vx: -1.2, vy:0, alive: true, type: "slime" }
];

// --- ចំណីច្រើនៗ (gems) ក្នុងផ្លូវទាំងមូល ---
let gemList = [];
groundSegments.forEach(([s,e]) => {
  const mid = Math.floor((s+e)/2);
  for (let i = -1; i <= 1; i++) {
    gemList.push({ x:(mid+i)*TILE+8, y:(GROUND_ROW-1)*TILE, w:16, h:16, taken:false });
  }
});
[[14,13],[30,13],[45,11],[61,13],[80,11]].forEach(([col,row]) => {
  for (let i = 0; i < 3; i++) {
    gemList.push({ x:(col+i)*TILE+8, y:(row-2)*TILE, w:16, h:16, taken:false });
  }
});

// --- Input ---
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", e => keys[e.code] = false);

// --- ប៊ូតុងចុចលើអេក្រង់ (touch/mobile friendly) ---
function bindHold(id, key) {
  const el = document.getElementById(id);
  const press = ev => { ev.preventDefault(); keys[key] = true; el.classList.add("pressed"); };
  const release = ev => { ev.preventDefault(); keys[key] = false; el.classList.remove("pressed"); };
  el.addEventListener("mousedown", press);
  el.addEventListener("touchstart", press, { passive:false });
  el.addEventListener("mouseup", release);
  el.addEventListener("mouseleave", release);
  el.addEventListener("touchend", release);
  el.addEventListener("touchcancel", release);
}
bindHold("btn-left", "ArrowLeft");
bindHold("btn-right", "ArrowRight");
bindHold("btn-jump", "ArrowUp");

// --- Game state machine ---
let gameState = "menu"; // menu | howto | playing | over
const startScreen = document.getElementById("start-screen");
const howtoScreen = document.getElementById("howto-screen");
const overlay = document.getElementById("overlay");

document.getElementById("start-btn").addEventListener("click", () => {
  gameState = "playing";
  startScreen.classList.add("hidden");
  loop();
});
document.getElementById("howto-btn").addEventListener("click", () => {
  startScreen.classList.add("hidden");
  howtoScreen.classList.remove("hidden");
});
document.getElementById("back-btn").addEventListener("click", () => {
  howtoScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
});
document.getElementById("menu-btn2").addEventListener("click", () => {
  window.location.reload();
});

// --- Popup gems ពេលទះលើប្រអប់ ? ---
let popups = [];

function solidTile(c) { return c === "1" || c === "2" || c === "3"; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function moveAndCollide(entity) {
  // horizontal
  entity.x += entity.vx;
  let col1 = Math.floor(entity.x / TILE);
  let col2 = Math.floor((entity.x + entity.w) / TILE);
  let row1 = Math.floor(entity.y / TILE);
  let row2 = Math.floor((entity.y + entity.h - 1) / TILE);
  for (let r = row1; r <= row2; r++) {
    if (entity.vx > 0 && solidTile(tileAt(col2, r))) {
      entity.x = col2 * TILE - entity.w;
      entity.vx = entity.bounce ? -entity.vx : 0;
    } else if (entity.vx < 0 && solidTile(tileAt(col1, r))) {
      entity.x = (col1 + 1) * TILE;
      entity.vx = entity.bounce ? -entity.vx : 0;
    }
  }

  // vertical
  entity.vy += GRAVITY;
  if (entity.vy > 12) entity.vy = 12;
  entity.y += entity.vy;
  entity.onGround = false;
  col1 = Math.floor(entity.x / TILE);
  col2 = Math.floor((entity.x + entity.w) / TILE);
  row1 = Math.floor(entity.y / TILE);
  row2 = Math.floor((entity.y + entity.h) / TILE);
  for (let c = col1; c <= col2; c++) {
    if (entity.vy > 0 && solidTile(tileAt(c, row2))) {
      entity.y = row2 * TILE - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    } else if (entity.vy < 0 && solidTile(tileAt(c, row1))) {
      entity.y = (row1 + 1) * TILE;
      entity.vy = 0;
      if (entity.isPlayer && tileAt(c, row1) === "3") {
        level[row1][c] = "2";
        popups.push({ x: c*TILE+8, y: row1*TILE, startY: row1*TILE, vy: -5, alpha: 1, settled:false });
        gems++;
        document.getElementById("gems").textContent = gems;
      }
    }
  }
}

let coyoteTimer = 0;
let jumpBufferTimer = 0;
let prevJumpKey = false;
const COYOTE_FRAMES = 8;
const JUMP_BUFFER_FRAMES = 8;
const JUMP_VELOCITY = -11.5;

function update() {
  if (gameOver) return;
  frame++;
  if (frame % 60 === 0) {
    timeLeft--;
    if (timeLeft <= 0) endGame(false, "ពេលវេលាអស់ហើយ!");
  }

  // player input
  player.vx = 0;
  if (keys["ArrowLeft"]) { player.vx = -3.5; player.facing = -1; }
  if (keys["ArrowRight"]) { player.vx = 3.5; player.facing = 1; }

  const jumpKey = !!(keys["Space"] || keys["ArrowUp"]);
  if (jumpKey && !prevJumpKey) jumpBufferTimer = JUMP_BUFFER_FRAMES;
  prevJumpKey = jumpKey;

  if (player.onGround) coyoteTimer = COYOTE_FRAMES;
  else if (coyoteTimer > 0) coyoteTimer--;

  if (jumpBufferTimer > 0 && coyoteTimer > 0) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    jumpBufferTimer = 0;
    coyoteTimer = 0;
  } else if (jumpBufferTimer > 0) {
    jumpBufferTimer--;
  }

  // ចុះទាបលឿនប្រសិនបើលែងចុចលោត (variable jump height)
  if (!jumpKey && player.vy < -4) player.vy = -4;

  moveAndCollide(player);
  if (player.invincible > 0) player.invincible--;

  if (player.y > H + 100) {
    loseLife();
  }

  // camera
  camX = player.x - W / 2 + player.w / 2;
  if (camX < 0) camX = 0;
  if (camX > levelWidth - W) camX = levelWidth - W;

  // enemies
  enemies.forEach(en => {
    if (!en.alive) return;
    en.bounce = true;
    if (en.type === "hopper") {
      if (en.onGround) {
        en.hopTimer--;
        if (en.hopTimer <= 0) { en.vy = -8; en.hopTimer = 70 + Math.floor(Math.random()*40); }
      }
    }
    moveAndCollide(en);
    if (rectsOverlap(player, en)) {
      if (player.vy > 0 && player.y + player.h - en.y < 14) {
        en.alive = false;
        player.vy = -7;
      } else if (player.invincible === 0) {
        loseLife();
      }
    }
  });

  // gems
  gemList.forEach(g => {
    if (!g.taken && rectsOverlap(player, g)) {
      g.taken = true;
      gems++;
      document.getElementById("gems").textContent = gems;
    }
  });

  // win condition: reach flag column
  const flagCol = level[12].indexOf("4");
  if (flagCol !== -1 && player.x > flagCol * TILE) {
    endGame(true, `ល្អណាស់! អ្នកប្រមូលបានផ្លុក ${gems} គ្រាប់`);
  }

  // popup gems (visual pop-out ពេលទះប្រអប់)
  popups.forEach(p => {
    if (!p.settled) {
      p.vy += 0.35;
      p.y += p.vy;
      if (p.y >= p.startY - 26) { p.y = p.startY - 26; p.settled = true; }
    } else {
      p.alpha -= 0.02;
    }
  });
  popups = popups.filter(p => p.alpha > 0);

  document.getElementById("time").textContent = timeLeft;
}

function loseLife() {
  player.lives--;
  document.getElementById("lives").textContent = "♥".repeat(Math.max(player.lives,0));
  if (player.lives <= 0) {
    endGame(false, "អ្នកបានចាញ់! សាកល្បងម្តងទៀត");
    return;
  }
  player.x = 60; player.y = 200; player.vx = 0; player.vy = 0;
  player.invincible = 90;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
}

function endGame(didWin, msg) {
  gameOver = true;
  gameState = "over";
  win = didWin;
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("overlay-title").textContent = didWin ? "ឈ្នះហើយ!" : "ចប់ហ្គេម";
  document.getElementById("overlay-msg").textContent = msg;
}

function drawTile(ch, x, y) {
  if (ch === "1") {
    ctx.fillStyle = "#c05a2f";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "#8a3e1f";
    ctx.strokeRect(x, y, TILE, TILE);
  } else if (ch === "2") {
    ctx.fillStyle = "#a8481f";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "#732f14";
    ctx.strokeRect(x, y, TILE, TILE);
    ctx.strokeRect(x, y + TILE/2, TILE, 0);
  } else if (ch === "3") {
    ctx.fillStyle = "#ffb703";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "#c9860a";
    ctx.strokeRect(x, y, TILE, TILE);
    ctx.fillStyle = "#7a4d00";
    ctx.font = "bold 18px monospace";
    ctx.fillText("?", x + 10, y + 22);
  } else if (ch === "4") {
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(x + TILE/2 - 3, y, 6, TILE);
    ctx.fillStyle = "#ef476f";
    ctx.beginPath();
    ctx.moveTo(x + TILE/2 + 3, y);
    ctx.lineTo(x + TILE/2 + 26, y + 8);
    ctx.lineTo(x + TILE/2 + 3, y + 16);
    ctx.fill();
  }
}

function drawFox(x, y, facing, blink) {
  ctx.save();
  ctx.translate(x + player.w/2, y);
  ctx.scale(facing, 1);
  ctx.translate(-player.w/2, 0);
  if (blink) ctx.globalAlpha = 0.5;
  // body
  ctx.fillStyle = "#f4801f";
  ctx.fillRect(2, 8, 22, 18);
  // head
  ctx.fillStyle = "#f4801f";
  ctx.fillRect(4, 0, 18, 12);
  // ear
  ctx.fillStyle = "#f4801f";
  ctx.beginPath();
  ctx.moveTo(4, 2); ctx.lineTo(2, -6); ctx.lineTo(10, 2); ctx.fill();
  // white muzzle
  ctx.fillStyle = "#fff3e0";
  ctx.fillRect(14, 4, 8, 7);
  // eye
  ctx.fillStyle = "#222";
  ctx.fillRect(16, 4, 2, 2);
  // legs
  ctx.fillStyle = "#c9601a";
  ctx.fillRect(4, 24, 6, 4);
  ctx.fillRect(16, 24, 6, 4);
  ctx.restore();
}

function drawEnemy(en) {
  if (en.type === "hopper") {
    ctx.fillStyle = "#ff8fa3";
    ctx.beginPath();
    ctx.ellipse(en.x + en.w/2, en.y + en.h/2, en.w/2, en.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(en.x + 5, en.y + 5, 5, 5);
    ctx.fillRect(en.x + 14, en.y + 5, 5, 5);
    ctx.fillStyle = "#222";
    ctx.fillRect(en.x + 7, en.y + 7, 2, 2);
    ctx.fillRect(en.x + 16, en.y + 7, 2, 2);
  } else {
    ctx.fillStyle = "#8a5cf6";
    ctx.beginPath();
    ctx.ellipse(en.x + en.w/2, en.y + en.h/2, en.w/2, en.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(en.x + 6, en.y + 6, 4, 4);
    ctx.fillRect(en.x + 16, en.y + 6, 4, 4);
  }
}

function drawGem(g) {
  const cx = g.x + g.w/2, cy = g.y + g.h/2;
  ctx.save();
  ctx.shadowColor = "rgba(255, 209, 102, 0.9)";
  ctx.shadowBlur = 8;
  // ខ្សែក្រៅ (outline ខ្មៅ) ដើម្បីលេចធ្លោលើផ្ទៃខាងក្រោយពណ៌ខៀវ
  ctx.strokeStyle = "#7a4d00";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.moveTo(cx, g.y - 2);
  ctx.lineTo(g.x + g.w + 2, cy);
  ctx.lineTo(cx, g.y + g.h + 2);
  ctx.lineTo(g.x - 2, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // ចំណុចភ្លឺនៅចំកណ្តាល
  ctx.fillStyle = "#fff6d9";
  ctx.beginPath();
  ctx.moveTo(cx, cy - g.h/4);
  ctx.lineTo(cx + g.w/4, cy);
  ctx.lineTo(cx, cy + g.h/4);
  ctx.lineTo(cx - g.w/4, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, 0);

  // clouds
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  [[80,50],[420,40],[600,70],[900,55],[1250,45],[1600,65],[1950,50],[2300,40],[2700,60],[3050,45]].forEach(([cx,cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI*2);
    ctx.arc(cx+18, cy+4, 20, 0, Math.PI*2);
    ctx.arc(cx+36, cy, 16, 0, Math.PI*2);
    ctx.fill();
  });

  // tiles
  for (let r = 0; r < level.length; r++) {
    for (let c = 0; c < level[r].length; c++) {
      const ch = level[r][c];
      if (ch !== ".") drawTile(ch, c*TILE, r*TILE);
    }
  }

  gemList.forEach(g => { if (!g.taken) drawGem(g); });
  popups.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(p.alpha, 0);
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "#7a4d00";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255, 209, 102, 0.9)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(p.x + 8, p.y - 2);
    ctx.lineTo(p.x + 18, p.y + 8);
    ctx.lineTo(p.x + 8, p.y + 18);
    ctx.lineTo(p.x - 2, p.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
  enemies.forEach(en => { if (en.alive) drawEnemy(en); });

  const blink = player.invincible > 0 && frame % 10 < 5;
  drawFox(player.x, player.y, player.facing, blink);

  ctx.restore();
}

function loop() {
  if (gameState !== "playing") return;
  update();
  draw();
  if (!gameOver) requestAnimationFrame(loop);
}

document.getElementById("restart-btn").addEventListener("click", () => {
  window.location.reload();
});

// គូរស្គ្រីនដំបូងសម្រាប់ preview ក្រោយ menu
draw();