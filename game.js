// The Legend of Rhys - A Platformer Adventure

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GRAVITY = 0.3;
const PLAYER_SPEED = 3.5;
const JUMP_FORCE = -10;

let cameraX = 0;
let currentLevel = 1;

const COLORS = {
    skyTop: '#87CEEB',
    skyBottom: '#E0F6FF',
    grass: '#4CAF50',
    dirt: '#795548',
    coin: '#FFD700',
    spike: '#D32F2F',
    castle: '#9C27B0',
    flag: '#FFEB3B'
};

const gameState = {
    current: 'start', // start, playing, levelcomplete, gameover, win
    coins: 0,
    lives: 3
};

const keys = { left: false, right: false, up: false };

// --- Audio ---
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;

        function note(freq, t, dur, vol) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol || 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.start(t);
            osc.stop(t + dur);
        }

        function slide(f1, f2, dur, vol) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(f1, now);
            osc.frequency.exponentialRampToValueAtTime(f2, now + dur);
            gain.gain.setValueAtTime(vol || 0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc.start(now);
            osc.stop(now + dur);
        }

        if (type === 'coin') { note(880, now, 0.06); note(1320, now + 0.06, 0.1); }
        else if (type === 'jump') { slide(280, 560, 0.12); }
        else if (type === 'death') { slide(400, 80, 0.45, 0.3); }
        else if (type === 'levelcomplete') { [523, 659, 784].forEach((f, i) => note(f, now + i * 0.13, 0.18)); }
        else if (type === 'win') { [523, 659, 784, 1047].forEach((f, i) => note(f, now + i * 0.15, 0.22)); }
    } catch (e) {}
}

// --- Particles ---
const particles = [];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.velX = (Math.random() - 0.5) * 5;
        this.velY = Math.random() * -4 - 1;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.03;
        this.size = Math.random() * 4 + 2;
        this.color = `hsl(${Math.random() * 50 + 30}, 100%, 60%)`;
    }
    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY += 0.12;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// --- Player ---
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 28;
        this.height = 36;
        this.velX = 0;
        this.velY = 0;
        this.speed = PLAYER_SPEED;
        this.jumpForce = JUMP_FORCE;
        this.grounded = false;
        this.facingRight = true;
        this.jumpPressed = false;
    }

    update(platforms, coins, spikes) {
        if (keys.left) { this.velX = -this.speed; this.facingRight = false; }
        else if (keys.right) { this.velX = this.speed; this.facingRight = true; }
        else { this.velX *= 0.8; }

        if (keys.up && this.grounded && !this.jumpPressed) {
            this.velY = this.jumpForce;
            this.grounded = false;
            this.jumpPressed = true;
            playSound('jump');
        }
        if (!keys.up) this.jumpPressed = false;

        this.velY += GRAVITY;

        // Separate X and Y phases to avoid corner misclassification
        this.x += this.velX;
        if (this.x < 0) this.x = 0;
        for (const p of platforms) {
            if (!this.overlaps(p)) continue;
            if (this.velX > 0) this.x = p.x - this.width;
            else if (this.velX < 0) this.x = p.x + p.width;
            this.velX = 0;
        }

        this.y += this.velY;
        if (this.y > CANVAS_HEIGHT + 100) return 'dead';

        this.grounded = false;
        for (const p of platforms) {
            if (!this.overlaps(p)) continue;
            if (this.velY >= 0) {
                this.y = p.y - this.height;
                this.velY = 0;
                this.grounded = true;
            } else {
                this.y = p.y + p.height;
                this.velY *= -0.3;
            }
        }

        for (let i = coins.length - 1; i >= 0; i--) {
            if (this.overlaps(coins[i])) {
                const cx = coins[i].x + 10;
                const cy = coins[i].y + 10;
                for (let p = 0; p < 8; p++) particles.push(new Particle(cx, cy));
                coins.splice(i, 1);
                gameState.coins++;
                playSound('coin');
                updateUI();
            }
        }

        for (const spike of spikes) {
            if (this.checkSpike(spike)) return 'dead';
        }

        return null;
    }

    overlaps(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    // Tighter hitbox for spikes so they feel fair
    checkSpike(spike) {
        const margin = 5;
        return this.x + margin < spike.x + spike.width - margin &&
               this.x + this.width - margin > spike.x + margin &&
               this.y + margin < spike.y + spike.height &&
               this.y + this.height > spike.y + margin;
    }

    draw(ctx) {
        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const fr = this.facingRight;

        // Legs with walk animation
        const walk = Math.abs(this.velX) > 0.5 ? (Math.floor(Date.now() / 100) % 2 === 0 ? 4 : -4) : 0;
        ctx.fillStyle = '#1565C0';
        ctx.fillRect(x + 6, y + 28, 7, 8 + walk);
        ctx.fillRect(x + this.width - 13, y + 28, 7, 8 - walk);

        // Shoes
        ctx.fillStyle = '#333';
        ctx.fillRect(x + 4, y + 34 + walk, 10, 4);
        ctx.fillRect(x + this.width - 14, y + 34 - walk, 10, 4);

        // Body (blue shirt)
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(x + 4, y + 12, this.width - 8, 16);

        // Collar / neck
        ctx.fillStyle = '#FFCCBC';
        ctx.fillRect(x + 10, y + 10, 8, 4);

        // Head
        ctx.fillStyle = '#FFCCBC';
        ctx.fillRect(x + 6, y + 1, this.width - 12, 12);

        // Hair (brown)
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x + 6, y - 1, this.width - 12, 5);
        ctx.fillRect(x + 5, y + 1, 3, 4); // sideburn left
        ctx.fillRect(x + this.width - 8, y + 1, 3, 4); // sideburn right

        // Eyes
        ctx.fillStyle = '#333';
        const eyeX = fr ? x + 16 : x + 8;
        ctx.fillRect(eyeX, y + 4, 2, 3);

        // Smile
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const smileX = fr ? x + 14 : x + 9;
        ctx.arc(smileX, y + 8, 3, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // Arms
        ctx.fillStyle = '#2196F3';
        if (fr) {
            ctx.fillRect(x + this.width - 4, y + 14, 5, 7);
        } else {
            ctx.fillRect(x - 1, y + 14, 5, 7);
        }
        ctx.fillStyle = '#FFCCBC';
        if (fr) {
            ctx.fillRect(x + this.width - 3, y + 20, 4, 4);
        } else {
            ctx.fillRect(x - 1, y + 20, 4, 4);
        }
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.velX = 0;
        this.velY = 0;
        this.grounded = false;
    }
}

// --- Platform ---
class Platform {
    constructor(x, y, width, height) {
        this.x = x; this.y = y; this.width = width; this.height = height;
    }
    draw(ctx) {
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(this.x, this.y, this.width, 8);
        ctx.fillStyle = COLORS.dirt;
        ctx.fillRect(this.x, this.y + 8, this.width, this.height - 8);
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// --- Coin ---
class Coin {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.width = 20; this.height = 20;
        this.bobOffset = Math.random() * Math.PI * 2;
    }
    update() { this.bobOffset += 0.1; }
    draw(ctx) {
        const bobY = Math.sin(this.bobOffset) * 3;
        ctx.fillStyle = COLORS.coin;
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 10 + bobY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(this.x + 7, this.y + 7 + bobY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FBC02D';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 10 + bobY, 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// --- Spike ---
class Spike {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.width = 24; this.height = 20;
    }
    draw(ctx) {
        ctx.fillStyle = COLORS.spike;
        const sw = this.width / 3;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(this.x + i * sw, this.y + this.height);
            ctx.lineTo(this.x + i * sw + sw / 2, this.y);
            ctx.lineTo(this.x + (i + 1) * sw, this.y + this.height);
            ctx.closePath();
            ctx.fill();
        }
        // Metallic sheen
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(this.x + i * sw + sw * 0.3, this.y + this.height * 0.4);
            ctx.lineTo(this.x + i * sw + sw / 2, this.y + 2);
            ctx.lineTo(this.x + i * sw + sw * 0.5, this.y + this.height * 0.4);
            ctx.closePath();
            ctx.fill();
        }
    }
}

// --- Castle ---
class Castle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.width = 80; this.height = 60;
        this.flagWave = 0;
    }
    update() { this.flagWave += 0.05; }
    draw(ctx) {
        // Castle base
        ctx.fillStyle = COLORS.castle;
        ctx.fillRect(this.x, this.y + 20, this.width, this.height - 20);
        // Towers
        ctx.fillRect(this.x - 10, this.y + 10, 20, this.height - 10);
        ctx.fillRect(this.x + this.width - 10, this.y + 10, 20, this.height - 10);
        // Battlements
        ctx.fillStyle = '#7B1FA2';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(this.x + 5 + i * 18, this.y + 17, 10, 8);
        }
        ctx.fillRect(this.x - 12, this.y + 7, 8, 8);
        ctx.fillRect(this.x + 4, this.y + 7, 8, 8);
        ctx.fillRect(this.x + this.width - 12, this.y + 7, 8, 8);
        ctx.fillRect(this.x + this.width + 4, this.y + 7, 8, 8);
        // Windows
        ctx.fillStyle = '#FFE082';
        ctx.fillRect(this.x + 20, this.y + 30, 10, 12);
        ctx.fillRect(this.x + this.width - 30, this.y + 30, 10, 12);
        // Door
        ctx.fillStyle = '#3E2723';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 5, 10, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(this.x + this.width / 2 - 10, this.y + this.height - 5, 20, 8);
        // Flag pole
        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(this.x + this.width / 2, this.y - 32, 3, 32);
        // Waving flag
        ctx.fillStyle = COLORS.flag;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2 + 3, this.y - 30);
        const w = this.flagWave;
        ctx.bezierCurveTo(
            this.x + this.width / 2 + 13, this.y - 28 + Math.sin(w) * 3,
            this.x + this.width / 2 + 13, this.y - 22 + Math.sin(w + 0.5) * 3,
            this.x + this.width / 2 + 3, this.y - 18
        );
        ctx.closePath();
        ctx.fill();
    }
}

// --- Level Design ---
function createLevel(level) {
    if (level === 2) {
        const platforms = [
            new Platform(0, 400, 400, 50),
            new Platform(480, 380, 150, 70),
            new Platform(700, 360, 250, 90),
            new Platform(1050, 340, 200, 110),
            new Platform(250, 300, 80, 20),
            new Platform(450, 260, 120, 20),
            new Platform(700, 230, 100, 20),
            new Platform(950, 200, 80, 20),
            new Platform(1150, 140, 50, 20),
            new Platform(1230, 110, 60, 20),
            new Platform(1330, 80, 100, 20), // wider final platform, closer to castle
        ];
        const coins = [
            new Coin(150, 360), new Coin(250, 360), new Coin(495, 340),
            new Coin(280, 260), new Coin(510, 220), new Coin(740, 190), new Coin(980, 160),
            new Coin(1175, 100), new Coin(1260, 70), new Coin(1370, 40),
        ];
        const spikes = [
            new Spike(520, 360), new Spike(544, 360), new Spike(568, 360),
            new Spike(1100, 320), new Spike(1124, 320),
        ];
        const castle = new Castle(1450, 260);
        return { platforms, coins, spikes, castle };
    }

    if (level === 3) {
        const platforms = [
            new Platform(0, 400, 200, 50),
            new Platform(300, 400, 200, 50),
            new Platform(600, 400, 200, 50),
            new Platform(900, 380, 150, 70),
            new Platform(1150, 360, 200, 90),
            new Platform(215, 350, 70, 20),
            new Platform(255, 285, 70, 20),
            new Platform(215, 220, 70, 20),
            new Platform(500, 320, 70, 20),
            new Platform(650, 280, 70, 20),
            new Platform(550, 240, 70, 20),
            new Platform(750, 200, 100, 20),
            new Platform(950, 260, 50, 20),
            new Platform(1080, 220, 50, 20),
            new Platform(1200, 180, 80, 20),
            new Platform(1310, 150, 80, 20), // closer to castle
        ];
        const coins = [
            new Coin(100, 360), new Coin(400, 360), new Coin(700, 360),
            new Coin(240, 310), new Coin(280, 245), new Coin(240, 180),
            new Coin(520, 280), new Coin(670, 240), new Coin(570, 200), new Coin(800, 160),
            new Coin(975, 220), new Coin(1105, 180), new Coin(1230, 140), new Coin(1340, 110),
        ];
        const spikes = [
            new Spike(720, 380), new Spike(744, 380), new Spike(950, 360),
        ];
        const castle = new Castle(1400, 260);
        return { platforms, coins, spikes, castle };
    }

    // Level 1
    const platforms = [
        new Platform(0, 400, 300, 50),
        new Platform(350, 380, 200, 70),
        new Platform(600, 350, 200, 100),
        new Platform(850, 320, 200, 130), // extended to reach castle
        new Platform(200, 300, 100, 20),
        new Platform(450, 280, 100, 20),
        new Platform(650, 220, 80, 20),
        new Platform(300, 180, 60, 20),
        new Platform(500, 140, 60, 20),
        new Platform(700, 100, 60, 20),  // added bridge to castle
        new Platform(850, 70, 60, 20),
        new Platform(980, 50, 100, 20),  // platform right at castle
    ];
    const coins = [
        new Coin(150, 360), new Coin(400, 340), new Coin(700, 310),
        new Coin(240, 260), new Coin(500, 240), new Coin(690, 180),
        new Coin(320, 140), new Coin(520, 100), new Coin(730, 60),
        new Coin(880, 30), new Coin(1010, 10),
    ];
    const spikes = [
        new Spike(520, 360), new Spike(544, 360), new Spike(720, 330),
    ];
    const castle = new Castle(1050, 260);
    return { platforms, coins, spikes, castle };
}

// --- Game Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let player;
let levelData;
let animationId = null;

function initGame(resetCoins) {
    player = new Player(50, 320);
    cameraX = 0;
    levelData = createLevel(currentLevel);
    particles.length = 0;
    if (resetCoins) gameState.coins = 0;
    updateUI();
}

// --- Background ---
// Cloud positions are randomized per level but stable during gameplay
const cloudData = [
    { x: 80, y: 70, r: [30, 40, 30] },
    { x: 420, y: 110, r: [35, 45, 35] },
    { x: 660, y: 55, r: [25, 35, 25] },
];
let cloudOffset = 0;

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Slowly drifting clouds (independent of camera)
    cloudOffset = (cloudOffset + 0.1) % CANVAS_WIDTH;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const cloud of cloudData) {
        const bx = ((cloud.x + cloudOffset) % (CANVAS_WIDTH + 200)) - 100;
        ctx.beginPath();
        ctx.arc(bx, cloud.y, cloud.r[0], 0, Math.PI * 2);
        ctx.arc(bx + 40, cloud.y, cloud.r[1], 0, Math.PI * 2);
        ctx.arc(bx + 80, cloud.y, cloud.r[2], 0, Math.PI * 2);
        ctx.fill();
    }

    // Background hills
    ctx.fillStyle = '#A5D6A7';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    ctx.lineTo(200, 340);
    ctx.lineTo(400, CANVAS_HEIGHT);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(350, CANVAS_HEIGHT);
    ctx.lineTo(600, 310);
    ctx.lineTo(850, CANVAS_HEIGHT);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(700, CANVAS_HEIGHT);
    ctx.lineTo(900, 360);
    ctx.lineTo(1100, CANVAS_HEIGHT);
    ctx.fill();
}

// --- Game Loop ---
function update() {
    if (gameState.current !== 'playing') return;

    const status = player.update(levelData.platforms, levelData.coins, levelData.spikes);
    if (status === 'dead') { handleDeath(); return; }

    // Smooth camera: keep player at 1/3 screen width
    const targetX = player.x - CANVAS_WIDTH / 3;
    cameraX += (targetX - cameraX) * 0.1;
    if (cameraX < 0) cameraX = 0;

    // Win: player reaches castle (relative y check so it works for all levels)
    if (player.x + player.width > levelData.castle.x &&
        player.x < levelData.castle.x + levelData.castle.width &&
        player.y + player.height > levelData.castle.y + 20) {
        handleWin();
        return;
    }

    levelData.coins.forEach(c => c.update());
    levelData.castle.update();

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground();

    ctx.save();
    ctx.translate(-cameraX, 0);

    levelData.platforms.forEach(p => p.draw(ctx));
    levelData.spikes.forEach(s => s.draw(ctx));
    levelData.castle.draw(ctx);
    levelData.coins.forEach(c => c.draw(ctx));
    particles.forEach(p => p.draw(ctx));
    player.draw(ctx);

    ctx.restore();
}

function gameLoop() {
    update();
    draw();
    if (gameState.current === 'playing') {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// --- Game Events ---
function handleDeath() {
    gameState.lives--;
    updateUI();
    playSound('death');

    if (gameState.lives <= 0) {
        gameOver();
    } else {
        cameraX = 0;
        player.reset(50, 320);
        // Flash the lives display red briefly
        const livesEl = document.getElementById('livesDisplay');
        livesEl.style.background = 'rgba(255,80,80,0.9)';
        setTimeout(() => { livesEl.style.background = ''; }, 600);
    }
}

function handleWin() {
    if (currentLevel < 3) {
        currentLevel++;
        gameState.current = 'levelcomplete'; // stops the game loop
        playSound('levelcomplete');
        showOverlay(
            `Level ${currentLevel - 1} Complete! 🎉`,
            `Amazing work, Rhys! Get ready for Level ${currentLevel}!<br><br>` +
            `<span style="font-size:16px;opacity:0.8">Coins collected so far: ${gameState.coins} ⭐</span>`,
            'Next Level'
        );
    } else {
        gameState.current = 'win';
        playSound('win');
        const best = saveHighScore(gameState.coins);
        showOverlay(
            'YOU WIN! 🏆',
            `Rhys saved the day and completed all 3 levels!<br><br>` +
            `<span style="font-size:18px">⭐ Total coins: ${gameState.coins} ⭐</span><br>` +
            (gameState.coins >= best ? `<span style="font-size:14px;color:#FFD700">New high score!</span>` :
             `<span style="font-size:14px;opacity:0.8">Best ever: ${best} coins</span>`),
            'Play Again'
        );
    }
}

function gameOver() {
    gameState.current = 'gameover';
    const best = getHighScore();
    showOverlay(
        'Game Over 💀',
        `Don't give up, Rhys! You can do it!<br><br>` +
        `<span style="font-size:16px;opacity:0.8">Coins: ${gameState.coins} | Best: ${best}</span>`,
        'Try Again'
    );
}

// --- High Score ---
function getHighScore() {
    return parseInt(localStorage.getItem('legendOfRhys_best') || '0');
}

function saveHighScore(score) {
    const best = Math.max(score, getHighScore());
    localStorage.setItem('legendOfRhys_best', best.toString());
    return best;
}

// --- UI ---
function showOverlay(title, message, btnLabel) {
    const overlay = document.getElementById('overlay');
    overlay.querySelector('h1').textContent = title;
    overlay.querySelector('p').innerHTML = message;
    document.getElementById('startBtn').textContent = btnLabel;
    overlay.style.display = 'flex';
}

function hideOverlay() {
    document.getElementById('overlay').style.display = 'none';
}

function updateUI() {
    document.getElementById('coinsDisplay').textContent = `⭐ ${gameState.coins}`;
    const hearts = '❤️'.repeat(Math.max(0, gameState.lives)) +
                   '🖤'.repeat(Math.max(0, 3 - gameState.lives));
    document.getElementById('livesDisplay').textContent = hearts;
    document.getElementById('levelDisplay').textContent = `Level ${currentLevel}`;
}

function startGame() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    const isLevelTransition = gameState.current === 'levelcomplete';

    if (!isLevelTransition) {
        currentLevel = 1;
        gameState.lives = 3;
    }

    hideOverlay();
    cancelAnimationFrame(animationId);
    initGame(!isLevelTransition);
    gameState.current = 'playing';
    gameLoop();
}

// --- Input ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA')  keys.left  = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD')  keys.right = true;
    if (e.code === 'ArrowUp'    || e.code === 'Space' || e.code === 'KeyW') {
        keys.up = true;
        e.preventDefault(); // prevent page scroll
    }
    if (e.code === 'ArrowDown') e.preventDefault();
    if (e.code === 'KeyR' && gameState.current !== 'start') startGame();
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA')  keys.left  = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD')  keys.right = false;
    if (e.code === 'ArrowUp'    || e.code === 'Space' || e.code === 'KeyW') keys.up = false;
});

// Touch controls
function setupTouchControls() {
    const map = { 'touch-left': 'left', 'touch-right': 'right', 'touch-jump': 'up' };
    for (const [id, key] of Object.entries(map)) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; }, { passive: false });
        btn.addEventListener('touchend',   (e) => { e.preventDefault(); keys[key] = false; }, { passive: false });
        btn.addEventListener('touchcancel', () => { keys[key] = false; });
    }
}
setupTouchControls();

document.getElementById('startBtn').addEventListener('click', startGame);

// Initial render
initGame(true);
drawBackground();
