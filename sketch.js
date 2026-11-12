// 格鬥精靈動畫：修正為使用每個動作的獨立 PNG 影格，避免切圖錯位。
const FRAME_PATHS = { // 定義各種動作的影格路徑。
  stand: ["start/0.png", "start/1.png", "start/2.png", "start/3.png", "start/4.png", "start/5.png"], // 六格站立影格。
  kick: ["magic/0.png", "magic/1.png", "magic/2.png", "magic/3.png", "magic/4.png", "magic/5.png"], // 六格踢腿影格。
  crouch: ["stop/0.png", "stop/1.png", "stop/2.png"] // 三格蹲下影格。
}; // 結束影格路徑設定。
const CHARACTER_BASE_HEIGHT = 87; // 原始站立與踢腿角色的參考高度。
const WALL = 8; // 兩側牆壁的厚度。
let frames = { stand: [], kick: [], crouch: [] }; // 儲存已載入的影格。
let loadErrors = []; // 紀錄無法載入的檔案。
let x = 0; // 角色的水平中心座標。
let y = 0; // 角色腳底的座標。
let vy = 0; // 角色的垂直速度。
let onGround = true; // 記錄角色是否在地面。
let facingRight = true; // 記錄角色面向的方向。
let action = "stand"; // 記錄目前播放的動作。
let animationFrame = 0; // 記錄目前影格位置。
let lastAnimationChange = 0; // 記錄上一個影格切換時間。
let projectiles = []; // 儲存發出的能量球。
let particles = []; // 儲存灰塵與火花粒子。
let keys = {}; // 儲存鍵盤與觸控按鈕狀態。
let blocking = false; // 記錄是否正在防禦。
let scaleFactor = 1; // 記錄精靈縮放比例。
let wallEffectAt = 0; // 限制撞牆粒子的產生頻率。
let particleAt = 0; // 限制走路灰塵的產生頻率。

function preload() { // p5.js 初始化前先載入圖片。
  for (const name of Object.keys(FRAME_PATHS)) { // 走訪站立、踢腿、蹲下。
    frames[name] = FRAME_PATHS[name].map((path) => loadImage(path, undefined, () => { loadErrors.push(path); console.error("圖片載入失敗：", path); })); // 按照影格順序載入圖片。
  } // 結束三組圖片的載入。
} // 結束 preload。

function setup() { // 建立遊戲畫布。
  createCanvas(windowWidth, windowHeight); // 產生與螢幕相同大小的畫布。
  pixelDensity(1); // 避免高解析度螢幕增加多餘運算。
  noSmooth(); // 保留像素圖片的銳利邊緣。
  frameRate(60); // 每秒繪製約60次。
  x = width * 2 / 3; // 初始位置是畫布寬度的三分之二。
  y = height; // 初始腳底貼齊畫布底端。
  updateScale(); // 依螢幕尺寸設定縮放比例。
  document.querySelector('#status').textContent = '已載入精靈，可使用鍵盤操作'; // 顯示正常載入訊息。
  window.gameReady = true; // 提供測試用的初始化旗標。
} // 結束 setup。

function updateScale() { // 計算不同螢幕的角色尺寸。
  let desired = height / 3 / CHARACTER_BASE_HEIGHT; // 讓站立角色高度約為畫布的三分之一。
  let fitWidth = (width - 2 * WALL - 10) / 106; // 極窄螢幕時避免最大的踢腿影格超出畫布。
  scaleFactor = Math.max(0.1, Math.min(desired, fitWidth)); // 決定實際可用的縮放倍率。
} // 結束縮放設定。

function draw() { // 每個畫面持續更新角色。
  background(135, 206, 235); // 繪製天空藍背景。
  const dt = Math.min(deltaTime / 16.6667, 3); // 以60fps為基準計算移動步長。
  updatePlayer(dt); // 更新角色的走路、跳躍、撞牆與防禦。
  updateAnimation(); // 更新角色動畫影格。
  updateProjectiles(dt); // 更新飛行能量球。
  updateParticles(dt); // 更新灰塵與火花。
  drawWorld(); // 繪製牆壁及地板。
  drawShadow(); // 繪製腳底陰影。
  drawPlayer(); // 繪製格鬥角色。
  drawProjectiles(); // 繪製發功特效。
  drawParticles(); // 繪製火花與灰塵。
  if (blocking) drawShield(); // 防禦時顯示藍色護盾。
  if (loadErrors.length) drawError(); // 圖片缺失時顯示具體路徑。
} // 結束 draw。

function switchAction(next) { // 在需要時切換動畫。
  if (action === next) return; // 相同動畫不重新開始。
  action = next; // 更新角色動作。
  animationFrame = 0; // 從第一個影格開始播放。
  lastAnimationChange = millis(); // 更新動畫時間。
} // 結束動作切換。

function getCurrentImage() { // 取得目前要顯示的影格。
  return frames[action][animationFrame] || frames.stand[0]; // 如果資料不存在就回到站立影格。
} // 結束影格取得。

function currentHalfWidth() { // 取得角色目前的左右半寬。
  return getCurrentImage().width * scaleFactor / 2; // 讓碰撞位置符合圖片寬度。
} // 結束寬度計算。

function updatePlayer(dt) { // 更新角色的方向與移動。
  const left = !!(keys.a || keys.ArrowLeft); // 判斷是否向左。
  const right = !!(keys.d || keys.ArrowRight); // 判斷是否向右。
  const down = !!(keys.s || keys.ArrowDown); // 判斷是否蹲下。
  blocking = !!keys.k && action !== 'kick' && onGround; // 判斷角色是否正在防禦。
  let move = 0; // 預設水平移動量為零。
  if (action !== 'kick' && !down && !blocking) { // 攻擊、蹲下和防禦時暫停移動。
    if (left && !right) { move = -5 * dt; facingRight = false; } // 按左鍵讓角色向左並翻面。
    if (right && !left) { move = 5 * dt; facingRight = true; } // 按右鍵讓角色向右。
  } // 結束移動輸入判斷。
  if (action !== 'kick') switchAction(down && onGround ? 'crouch' : 'stand'); // 自動切換蹲下或站立。
  const previousX = x; // 記錄移動前位置。
  x += move; // 更新水平位置。
  const halfWidth = currentHalfWidth(); // 取得目前角色半寬。
  const maxHalf = Math.max(halfWidth, 55 * scaleFactor); // 確保原始站立影格不穿牆。
  const minX = WALL + maxHalf; // 計算左側可走的最小位置。
  const maxX = width - WALL - maxHalf; // 計算右側可走的最大位置。
  x = minX <= maxX ? constrain(x, minX, maxX) : width / 2; // 角色碰到牆壁立即停下。
  if (move !== 0 && Math.abs(x - previousX - move) > 0.01 && millis() - wallEffectAt > 260) { // 判斷是否剛剛碰到牆壁。
    emitParticles(x + Math.sign(move) * halfWidth, y - 38 * scaleFactor, 10, true); // 在碰撞處產生火花。
    wallEffectAt = millis(); // 更新撞牆時間。
  } // 結束碰牆特效。
  if (onGround && move !== 0 && millis() - particleAt > 105) { // 在走動時產生灰塵。
    emitParticles(x, height - 4, 2, false); // 在腳底產生灰塵。
    particleAt = millis(); // 更新灰塵時間。
  } // 結束走路灰塵。
  if (!onGround) { // 跳起後套用重力。
    vy += 0.7 * dt; // 每個影格增加向下速度。
    y += vy * dt; // 更新腳底垂直位置。
    if (y >= height) { // 判斷是否落到地板。
      y = height; vy = 0; onGround = true; // 停止下落並恢復地面狀態。
      emitParticles(x, height - 4, 14, false); // 落地時產生灰塵。
    } // 結束落地判斷。
  } // 結束跳躍運動。
} // 結束角色移動。

function updateAnimation() { // 依動作切換動畫影格。
  const interval = action === 'kick' ? 100 : action === 'crouch' ? 170 : 130; // 設定動畫播放速度。
  if (millis() - lastAnimationChange < interval) return; // 時間未到就保留目前影格。
  lastAnimationChange = millis(); // 紀錄這次切換時間。
  if (action === 'kick' && animationFrame === frames.kick.length - 1) { // 當最後一格踢腿動畫播放完成。
    shoot(); // 朝角色面向方向發射能量球。
    switchAction('stand'); // 攻擊後恢復站立動畫。
  } else { // 一般動作與攻擊的前幾格。
    animationFrame = (animationFrame + 1) % frames[action].length; // 播放下一格影格。
  } // 結束動畫切換。
} // 結束動畫更新。

function drawPlayer() { // 繪製當前的格鬥精靈。
  const img = getCurrentImage(); // 讀取目前影格圖片。
  push(); // 暫存畫布繪製設定。
  translate(x, y); // 將座標原點移到角色腳底中心。
  if (!facingRight) scale(-1, 1); // 朝左時水平翻轉角色。
  image(img, -img.width * scaleFactor / 2, -img.height * scaleFactor, img.width * scaleFactor, img.height * scaleFactor); // 依照原始寬高比顯示完整單格精靈。
  pop(); // 還原畫布繪製設定。
} // 結束角色繪製。

function jump() { // 執行向上跳躍。
  if (!onGround || action === 'kick' || blocking) return; // 空中或攻擊防禦中不能重複跳。
  vy = -17; // 設定向上初速度。
  onGround = false; // 將角色設定為空中狀態。
  emitParticles(x, height - 4, 11, false); // 起跳時產生灰塵。
} // 結束跳躍功能。

function kick() { // 執行踢腿發功。
  if (action === 'kick' || blocking) return; // 正在攻擊或防禦時不重複觸發。
  switchAction('kick'); // 開始播放完整六格踢腿動畫。
} // 結束踢腿功能。

function shoot() { // 產生往角色面向方向飛行的能量球。
  const dir = facingRight ? 1 : -1; // 取得方向值。
  const px = x + dir * 70 * scaleFactor; // 計算能量球起始水平位置。
  const py = y - 47 * scaleFactor; // 計算能量球起始高度。
  projectiles.push({ x: px, y: py, vx: dir * 10, age: 0 }); // 新增一顆能量球。
  emitParticles(px, py, 12, true); // 發射時產生火花。
} // 結束發功。

function updateProjectiles(dt) { // 更新飛行能量球。
  for (let i = projectiles.length - 1; i >= 0; i--) { // 反向走訪特效陣列。
    const p = projectiles[i]; // 取得一顆能量球。
    p.x += p.vx * dt; p.age += dt; // 更新水平位置與動畫時間。
    if (p.x <= WALL + 16 || p.x >= width - WALL - 16) { // 判斷能量球是否撞牆。
      emitParticles(constrain(p.x, WALL, width - WALL), p.y, 18, true); // 撞牆時產生粒子。
      projectiles.splice(i, 1); // 撞牆後刪除能量球。
    } // 結束能量球碰撞。
  } // 結束飛行更新。
} // 結束能量球更新。

function drawProjectiles() { // 繪製藍色能量球。
  for (const p of projectiles) { // 逐一繪製能量球。
    push(); noStroke(); // 暫存設定並取消邊框。
    fill(45, 130, 255, 70); circle(p.x, p.y, 60 + sin(p.age * 0.35) * 7); // 繪製外層光圈。
    fill(40, 190, 255, 185); circle(p.x, p.y, 39); // 繪製藍色中層光球。
    fill(250, 255, 255); circle(p.x, p.y, 21); // 繪製亮白色核心。
    fill(70, 180, 255, 120); ellipse(p.x - p.vx * 1.8, p.y, 42, 17); // 繪製飛行拖尾。
    pop(); // 還原繪圖設定。
  } // 結束能量球繪製。
} // 結束發功繪製。

function emitParticles(px, py, count, spark) { // 在指定位置建立粒子特效。
  for (let i = 0; i < count; i++) { // 建立指定數量粒子。
    particles.push({ x: px, y: py, vx: random(-4, 4), vy: random(-4, 0), life: 27, size: random(3, 7), spark }); // 記錄位置、速度及類型。
  } // 結束新增粒子。
} // 結束粒子建立。

function updateParticles(dt) { // 更新每一個粒子。
  for (let i = particles.length - 1; i >= 0; i--) { // 反向走訪粒子陣列。
    const p = particles[i]; // 取得單一粒子。
    p.x += p.vx * dt; p.y += p.vy * dt; // 更新粒子位置。
    p.vy += 0.13 * dt; p.life -= dt; // 增加重力並減少生命。
    if (p.life <= 0) particles.splice(i, 1); // 移除生命結束的粒子。
  } // 結束粒子更新。
} // 結束粒子運動。

function drawParticles() { // 繪製灰塵與火花。
  push(); noStroke(); // 暫存狀態並取消邊框。
  for (const p of particles) { // 逐一繪製粒子。
    if (p.spark) fill(255, 185, 30, p.life * 9); else fill(220, 225, 235, p.life * 8); // 依粒子類型決定顏色。
    circle(p.x, p.y, p.size); // 繪製單一粒子。
  } // 結束粒子繪製。
  pop(); // 還原畫布狀態。
} // 結束粒子特效。

function drawWorld() { // 繪製牆壁與地面。
  noStroke(); fill(95, 105, 120); // 設定牆壁顏色。
  rect(0, 0, WALL, height); rect(width - WALL, 0, WALL, height); // 繪製左右邊界。
  fill(84, 100, 114); rect(0, height - 5, width, 5); // 繪製底部地面線。
} // 結束背景環境繪製。

function drawShadow() { // 繪製地板上的角色陰影。
  const aboveGround = height - y; // 取得角色離地高度。
  const shadowRatio = Math.max(0.35, 1 - aboveGround / 400); // 角色越高影子越小。
  noStroke(); fill(35, 50, 65, 75); // 設定半透明陰影顏色。
  ellipse(x, height - 5, 70 * scaleFactor * shadowRatio, 10); // 繪製橢圓陰影。
} // 結束陰影繪製。

function drawShield() { // 繪製防禦護盾。
  push(); noFill(); stroke(35, 160, 255, 190); strokeWeight(5); // 設定護盾外框。
  ellipse(x, y - 45 * scaleFactor, 115 * scaleFactor, 110 * scaleFactor); // 繪製藍色防禦護盾。
  pop(); // 還原畫布設定。
} // 結束防禦繪製。

function drawError() { // 顯示圖片載入錯誤訊息。
  push(); fill(150, 0, 0); noStroke(); textSize(14); textAlign(CENTER); // 設定錯誤文字外觀。
  text('圖片無法載入：' + loadErrors.join('、'), width / 2, height / 2); // 列出實際出錯的檔案路徑。
  pop(); // 還原畫布設定。
} // 結束錯誤提示。

function keyPressed() { // 處理鍵盤按下事件。
  keys[key.length === 1 ? key.toLowerCase() : key] = true; // 記錄目前按下的按鍵。
  if (key === ' ' || key === 'w' || key === 'W' || keyCode === UP_ARROW) jump(); // 空白、W、上箭頭讓角色跳躍。
  if (key === 'j' || key === 'J') kick(); // J鍵播放踢腿攻擊。
  if ([LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, 32].includes(keyCode)) return false; // 避免瀏覽器因操作而捲動。
} // 結束按鍵按下事件。

function keyReleased() { // 處理鍵盤放開事件。
  keys[key.length === 1 ? key.toLowerCase() : key] = false; // 解除對應按鍵狀態。
  if ([LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, 32].includes(keyCode)) return false; // 避免按鍵影響瀏覽器。
} // 結束按鍵放開事件。

function windowResized() { // 瀏覽器尺寸變動時重新排版。
  const oldWidth = width; // 記錄原本畫布寬度。
  const aboveGround = height - y; // 記錄原本的離地距離。
  resizeCanvas(windowWidth, windowHeight); // 變更畫布大小。
  updateScale(); // 更新角色縮放比例。
  x = oldWidth > 0 ? x / oldWidth * width : width * 2 / 3; // 讓角色依畫布等比例變換位置。
  y = height - aboveGround; // 讓角色保留原有離地高度。
  if (onGround) y = height; // 在地面時讓角色腳底保持貼齊畫布。
  keys = {}; // 清除可能殘留的鍵盤狀態。
} // 結束視窗調整。

window.addEventListener('blur', () => { keys = {}; }); // 瀏覽器失去焦點後清除按鍵。
window.setGameKey = (name, value) => { keys[name] = value; }; // 允許手機按鈕控制移動。
window.gameJump = () => jump(); // 允許手機按鈕觸發跳躍。
window.gameKick = () => kick(); // 允許手機按鈕觸發攻擊。
