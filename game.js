// The Legend of Rhys - A Platformer Adventure

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GRAVITY = 0.3;
const PLAYER_SPEED = 3.5;
const JUMP_FORCE = -10;
const MAX_LEVEL = 5;

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

const THEMES = {
    1: { skyTop: '#87CEEB', skyBottom: '#E0F6FF', hillColor: '#A5D6A7' },
    2: { skyTop: '#87CEEB', skyBottom: '#E0F6FF', hillColor: '#A5D6A7' },
    3: { skyTop: '#87CEEB', skyBottom: '#E0F6FF', hillColor: '#A5D6A7' },
    4: { skyTop: '#FF6B35', skyBottom: '#FFD166', hillColor: '#D4A017' },  // sunset
    5: { skyTop: '#0D1B2A', skyBottom: '#1B3A4B', hillColor: '#1E3A2F' },  // night
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
        else if (type === 'jump2') { slide(320, 640, 0.10, 0.15); } // softer double-jump
        else if (type === 'stomp') { note(180, now, 0.04, 0.35); note(90, now + 0.04, 0.12, 0.3); }
        else if (type === 'death') { slide(400, 80, 0.45, 0.3); }
        else if (type === 'levelcomplete') { [523, 659, 784].forEach((f, i) => note(f, now + i * 0.13, 0.18)); }
        else if (type === 'win') { [523, 659, 784, 1047].forEach((f, i) => note(f, now + i * 0.15, 0.22)); }
    } catch (e) {}
}

// --- Particles ---
const particles = [];

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.velX = (Math.random() - 0.5) * 5;
        this.velY = Math.random() * -4 - 1;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.03;
        this.size = Math.random() * 4 + 2;
        this.color = color || `hsl(${Math.random() * 50 + 30}, 100%, 60%)`;
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
        this.jumpsLeft = 2; // double jump
    }

    update(platforms, coins, spikes, enemies, movingPlatforms) {
        if (keys.left) { this.velX = -this.speed; this.facingRight = false; }
        else if (keys.right) { this.velX = this.speed; this.facingRight = true; }
        else { this.velX *= 0.8; }

        if (keys.up && this.jumpsLeft > 0 && !this.jumpPressed) {
            const isDoubleJump = !this.grounded;
            this.velY = this.jumpForce;
            this.jumpsLeft--;
            this.grounded = false;
            this.jumpPressed = true;
            playSound(isDoubleJump ? 'jump2' : 'jump');
        }
        if (!keys.up) this.jumpPressed = false;

        this.velY += GRAVITY;

        // X phase
        this.x += this.velX;
        if (this.x < 0) this.x = 0;
        const allPlatforms = movingPlatforms ? [...platforms, ...movingPlatforms] : platforms;
        for (const p of allPlatforms) {
            if (!this.overlaps(p)) continue;
            if (this.velX > 0) this.x = p.x - this.width;
            else if (this.velX < 0) this.x = p.x + p.width;
            this.velX = 0;
        }

        // Y phase
        this.y += this.velY;
        if (this.y > CANVAS_HEIGHT + 100) return 'dead';

        this.grounded = false;
        for (const p of allPlatforms) {
            if (!this.overlaps(p)) continue;
            if (this.velY >= 0) {
                this.y = p.y - this.height;
                this.velY = 0;
                this.grounded = true;
                this.jumpsLeft = 2;
                // Ride moving platforms
                if (p.prevX !== undefined) {
                    this.x += p.x - p.prevX;
                }
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

        // Enemy collision
        if (enemies) {
            for (const enemy of enemies) {
                if (enemy.dead) continue;
                if (!this.overlaps(enemy)) continue;
                // Stomp: player falling, bottom of player was above enemy top last frame
                if (this.velY >= 0 && (this.y + this.height - this.velY) <= enemy.y + 8) {
                    enemy.squish();
                    this.velY = -7;
                    this.jumpsLeft = 2;
                    playSound('stomp');
                    for (let p = 0; p < 10; p++) {
                        particles.push(new Particle(enemy.x + 15, enemy.y + 13, `hsl(${Math.random()*40+100}, 70%, 45%)`));
                    }
                } else {
                    return 'dead';
                }
            }
        }

        return null;
    }

    overlaps(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

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

        const walk = Math.abs(this.velX) > 0.5 ? (Math.floor(Date.now() / 100) % 2 === 0 ? 4 : -4) : 0;
        ctx.fillStyle = '#1565C0';
        ctx.fillRect(x + 6, y + 28, 7, 8 + walk);
        ctx.fillRect(x + this.width - 13, y + 28, 7, 8 - walk);

        ctx.fillStyle = '#333';
        ctx.fillRect(x + 4, y + 34 + walk, 10, 4);
        ctx.fillRect(x + this.width - 14, y + 34 - walk, 10, 4);

        ctx.fillStyle = '#2196F3';
        ctx.fillRect(x + 4, y + 12, this.width - 8, 16);

        ctx.fillStyle = '#FFCCBC';
        ctx.fillRect(x + 10, y + 10, 8, 4);

        ctx.fillStyle = '#FFCCBC';
        ctx.fillRect(x + 6, y + 1, this.width - 12, 12);

        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x + 6, y - 1, this.width - 12, 5);
        ctx.fillRect(x + 5, y + 1, 3, 4);
        ctx.fillRect(x + this.width - 8, y + 1, 3, 4);

        ctx.fillStyle = '#333';
        const eyeX = fr ? x + 16 : x + 8;
        ctx.fillRect(eyeX, y + 4, 2, 3);

        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const smileX = fr ? x + 14 : x + 9;
        ctx.arc(smileX, y + 8, 3, 0.1, Math.PI - 0.1);
        ctx.stroke();

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

        // Double-jump sparkle trail
        if (!this.grounded && this.jumpsLeft === 0) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#80D8FF';
            ctx.beginPath();
            ctx.arc(x + this.width / 2, y + this.height + 4, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.velX = 0;
        this.velY = 0;
        this.grounded = false;
        this.jumpsLeft = 2;
    }
}

// --- Platform ---
class Platform {
    constructor(x, y, width, height) {
        this.x = x; this.y = y; this.width = width; this.height = height;
    }
    grassColor() {
        if (currentLevel === 4) return '#C8830A';
        if (currentLevel === 5) return '#2E7D32';
        return COLORS.grass;
    }
    dirtColor() {
        if (currentLevel === 4) return '#A0522D';
        if (currentLevel === 5) return '#1B5E20';
        return COLORS.dirt;
    }
    draw(ctx) {
        ctx.fillStyle = this.grassColor();
        ctx.fillRect(this.x, this.y, this.width, 8);
        ctx.fillStyle = this.dirtColor();
        ctx.fillRect(this.x, this.y + 8, this.width, this.height - 8);
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// --- Moving Platform ---
class MovingPlatform extends Platform {
    constructor(x, y, width, height, minX, maxX, speed) {
        super(x, y, width, height);
        this.minX = minX;
        this.maxX = maxX;
        this.velX = speed || 1.5;
        this.prevX = x;
    }
    update() {
        this.prevX = this.x;
        this.x += this.velX;
        if (this.x <= this.minX || this.x + this.width >= this.maxX) {
            this.velX *= -1;
        }
    }
    draw(ctx) {
        // Brighter top stripe to distinguish from static
        ctx.fillStyle = currentLevel === 5 ? '#43A047' : (currentLevel === 4 ? '#FFB74D' : '#81C784');
        ctx.fillRect(this.x, this.y, this.width, 8);
        ctx.fillStyle = currentLevel === 4 ? '#8D6E63' : '#6D4C41';
        ctx.fillRect(this.x, this.y + 8, this.width, this.height - 8);
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        // Arrow indicators
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀ ▶', this.x + this.width / 2, this.y + 4);
        ctx.restore();
    }
}

// --- Enemy ---
class Enemy {
    constructor(x, y, minX, maxX, speed) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 26;
        this.velX = speed || 1.2;
        this.minX = minX;
        this.maxX = maxX;
        this.dead = false;
        this.deathTimer = 0;
        this.walkTimer = 0;
        this.walkFrame = 0;
    }
    squish() {
        this.dead = true;
        this.deathTimer = 0;
    }
    update() {
        if (this.dead) { this.deathTimer++; return; }
        this.x += this.velX;
        if (this.x <= this.minX || this.x + this.width >= this.maxX) this.velX *= -1;
        this.walkTimer++;
        if (this.walkTimer % 10 === 0) this.walkFrame = 1 - this.walkFrame;
    }
    draw(ctx) {
        if (this.dead) {
            if (this.deathTimer < 45) {
                ctx.fillStyle = '#388E3C';
                ctx.fillRect(this.x, this.y + this.height - 7, this.width, 7);
                ctx.fillStyle = '#1B5E20';
                ctx.fillRect(this.x + 4, this.y + this.height - 7, 8, 4);
                ctx.fillRect(this.x + this.width - 12, this.y + this.height - 7, 8, 4);
            }
            return;
        }
        const x = this.x, y = this.y;
        // Body dome
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.arc(x + 15, y + 14, 13, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x + 2, y + 12, 26, 14);

        // Feet
        const fo = this.walkFrame === 0 ? 2 : -2;
        ctx.fillStyle = '#1B5E20';
        ctx.fillRect(x + 3,  y + this.height - 7 + fo, 9, 7);
        ctx.fillRect(x + 18, y + this.height - 7 - fo, 9, 7);

        // Eyes (angry white + dark pupils)
        ctx.fillStyle = 'white';
        ctx.fillRect(x + 5, y + 6, 8, 8);
        ctx.fillRect(x + 17, y + 6, 8, 8);
        ctx.fillStyle = '#0D47A1';
        ctx.fillRect(x + 7, y + 9, 4, 4);
        ctx.fillRect(x + 19, y + 9, 4, 4);
        // Angry brows
        ctx.fillStyle = '#1B5E20';
        ctx.save();
        ctx.translate(x + 9, y + 6);  ctx.rotate(0.4);  ctx.fillRect(-5, -2, 9, 3); ctx.restore();
        ctx.save();
        ctx.translate(x + 21, y + 6); ctx.rotate(-0.4); ctx.fillRect(-4, -2, 9, 3); ctx.restore();
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
        ctx.fillStyle = COLORS.castle;
        ctx.fillRect(this.x, this.y + 20, this.width, this.height - 20);
        ctx.fillRect(this.x - 10, this.y + 10, 20, this.height - 10);
        ctx.fillRect(this.x + this.width - 10, this.y + 10, 20, this.height - 10);
        ctx.fillStyle = '#7B1FA2';
        for (let i = 0; i < 4; i++) ctx.fillRect(this.x + 5 + i * 18, this.y + 17, 10, 8);
        ctx.fillRect(this.x - 12, this.y + 7, 8, 8);
        ctx.fillRect(this.x + 4, this.y + 7, 8, 8);
        ctx.fillRect(this.x + this.width - 12, this.y + 7, 8, 8);
        ctx.fillRect(this.x + this.width + 4, this.y + 7, 8, 8);
        ctx.fillStyle = '#FFE082';
        ctx.fillRect(this.x + 20, this.y + 30, 10, 12);
        ctx.fillRect(this.x + this.width - 30, this.y + 30, 10, 12);
        ctx.fillStyle = '#3E2723';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height - 5, 10, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(this.x + this.width / 2 - 10, this.y + this.height - 5, 20, 8);
        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(this.x + this.width / 2, this.y - 32, 3, 32);
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
            new Platform(1330, 80, 100, 20),
        ];
        const movingPlatforms = [
            new MovingPlatform(600, 310, 80, 20, 580, 720, 1.2),
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
        const enemies = [
            new Enemy(160, 364, 0, 390),
            new Enemy(760, 340, 700, 940),
        ];
        const castle = new Castle(1450, 260);
        return { platforms, movingPlatforms, coins, spikes, enemies, castle };
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
            new Platform(1310, 150, 80, 20),
        ];
        const movingPlatforms = [
            new MovingPlatform(380, 340, 80, 20, 300, 490, 1.5),
            new MovingPlatform(830, 260, 60, 20, 810, 900, 1.8),
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
        const enemies = [
            new Enemy(100, 364, 0, 190),
            new Enemy(640, 384, 600, 790),
            new Enemy(960, 260, 900, 1040),
        ];
        const castle = new Castle(1400, 260);
        return { platforms, movingPlatforms, coins, spikes, enemies, castle };
    }

    if (level === 4) {
        // Sunset / desert canyon theme
        const platforms = [
            new Platform(0, 400, 300, 50),
            new Platform(380, 390, 200, 60),
            new Platform(680, 380, 180, 70),
            new Platform(960, 370, 200, 80),
            new Platform(1250, 350, 180, 100),
            new Platform(200, 310, 80, 20),
            new Platform(480, 280, 80, 20),
            new Platform(780, 250, 80, 20),
            new Platform(1060, 220, 60, 20),
            new Platform(1320, 180, 60, 20),
            new Platform(1450, 150, 80, 20),
            new Platform(1580, 120, 100, 20),
        ];
        const movingPlatforms = [
            new MovingPlatform(320, 330, 80, 20, 300, 470, 2.0),
            new MovingPlatform(620, 300, 70, 20, 590, 760, 2.0),
            new MovingPlatform(900, 260, 70, 20, 870, 1040, 1.8),
            new MovingPlatform(1200, 230, 70, 20, 1170, 1340, 2.2),
        ];
        const coins = [
            new Coin(100, 360), new Coin(420, 350), new Coin(720, 340),
            new Coin(230, 270), new Coin(510, 240), new Coin(810, 210),
            new Coin(1090, 180), new Coin(1350, 140), new Coin(1480, 110), new Coin(1610, 80),
        ];
        const spikes = [
            new Spike(610, 360), new Spike(634, 360),
            new Spike(890, 350), new Spike(914, 350),
            new Spike(1170, 330), new Spike(1194, 330),
        ];
        const enemies = [
            new Enemy(100, 364, 0, 290, 1.4),
            new Enemy(430, 374, 380, 570, 1.6),
            new Enemy(720, 364, 680, 850, 1.8),
            new Enemy(1000, 354, 960, 1140, 1.5),
            new Enemy(1290, 334, 1250, 1420, 1.7),
        ];
        const castle = new Castle(1680, 240);
        return { platforms, movingPlatforms, coins, spikes, enemies, castle };
    }

    if (level === 5) {
        // Night sky theme — lots of moving platforms, vertical challenge
        const platforms = [
            new Platform(0, 400, 250, 50),
            new Platform(350, 390, 150, 60),
            new Platform(700, 380, 150, 70),
            new Platform(1050, 360, 120, 90),
            new Platform(1400, 340, 150, 110),
        ];
        const movingPlatforms = [
            new MovingPlatform(220, 330, 80, 20, 200, 370, 1.8),
            new MovingPlatform(440, 290, 70, 20, 350, 600, 2.2),
            new MovingPlatform(640, 250, 70, 20, 600, 800, 2.0),
            new MovingPlatform(820, 210, 70, 20, 780, 980, 2.4),
            new MovingPlatform(1000, 170, 70, 20, 960, 1150, 2.0),
            new MovingPlatform(1170, 130, 70, 20, 1130, 1330, 2.6),
            new MovingPlatform(1350, 90,  70, 20, 1310, 1500, 2.4),
            new MovingPlatform(580, 320, 60, 20, 540, 720, 2.8),
            new MovingPlatform(900, 280, 60, 20, 860, 1060, 2.6),
        ];
        const coins = [
            new Coin(80, 360), new Coin(390, 350), new Coin(740, 340),
            new Coin(255, 290), new Coin(470, 250), new Coin(665, 210), new Coin(845, 170),
            new Coin(1025, 130), new Coin(1195, 90), new Coin(1375, 50),
        ];
        const spikes = [
            new Spike(580, 360), new Spike(604, 360),
            new Spike(930, 340), new Spike(954, 340),
        ];
        const enemies = [
            new Enemy(80,  364, 0,   240, 1.6),
            new Enemy(400, 374, 350, 490, 2.0),
            new Enemy(750, 364, 700, 840, 1.8),
            new Enemy(1090, 344, 1050, 1170, 2.2),
            new Enemy(1440, 324, 1400, 1540, 2.5),
        ];
        const castle = new Castle(1600, 240);
        return { platforms, movingPlatforms, coins, spikes, enemies, castle };
    }

    // Level 1 — original, now with one moving platform intro
    const platforms = [
        new Platform(0, 400, 300, 50),
        new Platform(350, 380, 200, 70),
        new Platform(600, 350, 200, 100),
        new Platform(850, 320, 200, 130),
        new Platform(200, 300, 100, 20),
        new Platform(450, 280, 100, 20),
        new Platform(650, 220, 80, 20),
        new Platform(300, 180, 60, 20),
        new Platform(500, 140, 60, 20),
        new Platform(700, 100, 60, 20),
        new Platform(850, 70, 60, 20),
        new Platform(980, 50, 100, 20),
    ];
    const movingPlatforms = [
        new MovingPlatform(560, 300, 70, 20, 540, 680, 1.0),
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
    const enemies = [
        new Enemy(150, 364, 0, 290),
    ];
    const castle = new Castle(1050, 260);
    return { platforms, movingPlatforms, coins, spikes, enemies, castle };
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
const cloudData = [
    { x: 80,  y: 70,  r: [30, 40, 30] },
    { x: 420, y: 110, r: [35, 45, 35] },
    { x: 660, y: 55,  r: [25, 35, 25] },
];
let cloudOffset = 0;
// Stable star field for level 5
const starField = Array.from({ length: 80 }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT * 0.7,
    r: Math.random() * 1.5 + 0.5,
    twinkle: Math.random() * Math.PI * 2,
}));

function drawBackground() {
    const theme = THEMES[currentLevel] || THEMES[1];
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, theme.skyTop);
    gradient.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (currentLevel === 5) {
        // Twinkling stars
        for (const s of starField) {
            s.twinkle += 0.04;
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin(s.twinkle) * 0.4;
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Crescent moon
        ctx.save();
        ctx.fillStyle = '#FFFDE7';
        ctx.beginPath();
        ctx.arc(680, 60, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.skyTop;
        ctx.beginPath();
        ctx.arc(694, 55, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        // Clouds
        cloudOffset = (cloudOffset + 0.1) % CANVAS_WIDTH;
        ctx.fillStyle = currentLevel === 4 ? 'rgba(255,200,120,0.75)' : 'rgba(255,255,255,0.85)';
        for (const cloud of cloudData) {
            const bx = ((cloud.x + cloudOffset) % (CANVAS_WIDTH + 200)) - 100;
            ctx.beginPath();
            ctx.arc(bx, cloud.y, cloud.r[0], 0, Math.PI * 2);
            ctx.arc(bx + 40, cloud.y, cloud.r[1], 0, Math.PI * 2);
            ctx.arc(bx + 80, cloud.y, cloud.r[2], 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Background hills
    ctx.fillStyle = theme.hillColor;
    ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT); ctx.lineTo(200, 340); ctx.lineTo(400, CANVAS_HEIGHT); ctx.fill();
    ctx.beginPath(); ctx.moveTo(350, CANVAS_HEIGHT); ctx.lineTo(600, 310); ctx.lineTo(850, CANVAS_HEIGHT); ctx.fill();
    ctx.beginPath(); ctx.moveTo(700, CANVAS_HEIGHT); ctx.lineTo(900, 360); ctx.lineTo(1100, CANVAS_HEIGHT); ctx.fill();
}

// --- Game Loop ---
function update() {
    if (gameState.current !== 'playing') return;

    // Update moving platforms before player
    if (levelData.movingPlatforms) {
        for (const mp of levelData.movingPlatforms) mp.update();
    }

    const status = player.update(
        levelData.platforms, levelData.coins, levelData.spikes,
        levelData.enemies, levelData.movingPlatforms
    );
    if (status === 'dead') { handleDeath(); return; }

    // Smooth camera
    const targetX = player.x - CANVAS_WIDTH / 3;
    cameraX += (targetX - cameraX) * 0.1;
    if (cameraX < 0) cameraX = 0;

    // Win: reach castle
    if (player.x + player.width > levelData.castle.x &&
        player.x < levelData.castle.x + levelData.castle.width &&
        player.y + player.height > levelData.castle.y + 20) {
        handleWin();
        return;
    }

    levelData.coins.forEach(c => c.update());
    levelData.castle.update();
    if (levelData.enemies) {
        for (const e of levelData.enemies) e.update();
        // Clean up long-dead enemies
        for (let i = levelData.enemies.length - 1; i >= 0; i--) {
            if (levelData.enemies[i].dead && levelData.enemies[i].deathTimer > 50) {
                levelData.enemies.splice(i, 1);
            }
        }
    }

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
    if (levelData.movingPlatforms) levelData.movingPlatforms.forEach(p => p.draw(ctx));
    levelData.spikes.forEach(s => s.draw(ctx));
    levelData.castle.draw(ctx);
    levelData.coins.forEach(c => c.draw(ctx));
    if (levelData.enemies) levelData.enemies.forEach(e => e.draw(ctx));
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
        const livesEl = document.getElementById('livesDisplay');
        livesEl.style.background = 'rgba(255,80,80,0.9)';
        setTimeout(() => { livesEl.style.background = ''; }, 600);
    }
}

function handleWin() {
    if (currentLevel < MAX_LEVEL) {
        currentLevel++;
        gameState.current = 'levelcomplete';
        playSound('levelcomplete');
        const themes = ['', '', '', '', '🌅 Sunset Canyon', '🌙 Night Sky'];
        const subtitle = currentLevel >= 4 ? `<br><span style="font-size:14px;opacity:0.8">${themes[currentLevel]} awaits!</span>` : '';
        showOverlay(
            `Level ${currentLevel - 1} Complete! 🎉`,
            `Amazing work, Rhys! Get ready for Level ${currentLevel}!${subtitle}<br><br>` +
            `<span style="font-size:16px;opacity:0.8">Coins so far: ${gameState.coins} ⭐</span>`,
            'Next Level'
        );
    } else {
        gameState.current = 'win';
        playSound('win');
        const best = saveHighScore(gameState.coins);
        showOverlay(
            'YOU WIN! 🏆',
            `Rhys conquered all ${MAX_LEVEL} levels and saved the day!<br><br>` +
            `<span style="font-size:18px">⭐ Total coins: ${gameState.coins} ⭐</span><br>` +
            (gameState.coins >= best ?
                `<span style="font-size:14px;color:#FFD700">New high score!</span>` :
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
        e.preventDefault();
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
