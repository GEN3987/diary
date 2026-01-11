const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const loaderText = document.getElementById('loader-text');
const enterMsg = document.getElementById('enter-msg');
const tDate = document.getElementById('t-date');
const tWord = document.getElementById('t-word');

let particles = [];
let audioMap = {};
let loadedAudios = {};
let bgColors = [];
let currentAudio = null;
let currentMood = null;
let fadeOutInterval = null;
let tick = 0;
let activeAudioParticle = null;
let isStarted = false; // サイトが開始されたかどうかのフラグ

const mouse = { x: -1000, y: -1000 };

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// --- 1. データのロード ---
async function loadData() {
    updateProgress(5); 

    try {
        const [diaryRes, soundsRes] = await Promise.all([
            fetch('diary.json'),
            fetch('sounds.json')
        ]);
        const diaryData = await diaryRes.json();
        audioMap = await soundsRes.json();
        
        updateProgress(20);

        const moodKeys = Object.keys(audioMap);
        const totalAudios = moodKeys.length;
        let loadedCount = 0;

        if (totalAudios > 0) {
            const audioPromises = moodKeys.map(mood => {
                return new Promise((resolve) => {
                    const audio = new Audio();
                    audio.src = audioMap[mood];
                    audio.addEventListener('canplaythrough', () => {
                        loadedCount++;
                        updateProgress(20 + (loadedCount / totalAudios) * 75);
                        resolve();
                    }, { once: true });
                    audio.addEventListener('error', () => {
                        loadedCount++;
                        resolve();
                    }, { once: true });
                    audio.load();
                    loadedAudios[mood] = audio;
                });
            });
            await Promise.all(audioPromises);
        }

        bgColors = diaryData.map(d => d.color);
        createParticles(diaryData);
        
        updateProgress(100);
        
        // ロード完了後の処理
        setTimeout(() => {
            loaderText.textContent = "MEMORIES LOADED";
            enterMsg.style.opacity = '1';
            
            // Enterキーとクリックの両方を待ち受ける
            window.addEventListener('keydown', handleStart);
            window.addEventListener('mousedown', handleStart);
        }, 500);

    } catch (error) {
        console.error("ロード失敗:", error);
        loaderText.textContent = "ERROR: MEMORY CORRUPTED";
    }
}

// 開始ボタン（Enterキー or クリック）が押された時の処理
function handleStart(e) {
    // Enterキーか、マウスの左クリックであれば開始
    if (e.type === 'mousedown' || e.key === 'Enter') {
        if (isStarted) return;
        isStarted = true;

        // 音声の制限を解除するために一度無音を流す（ブラウザ対策）
        Object.values(loadedAudios).forEach(a => {
            a.play().then(() => {
                a.pause();
                a.currentTime = 0;
            }).catch(() => {});
        });

        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        
        // イベントリスナーを解除
        window.removeEventListener('keydown', handleStart);
        window.removeEventListener('mousedown', handleStart);
        
        animate();
    }
}

function updateProgress(percent) {
    progressBar.style.width = percent + '%';
}

// --- 2. 粒子クラス ---
class Particle {
    constructor(data) {
        this.data = data;
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.color = data.color;
        this.baseVx = (Math.random() - 0.5) * 0.4;
        this.baseVy = (Math.random() - 0.5) * 0.4;
        this.vx = this.baseVx;
        this.vy = this.baseVy;
        this.baseRadius = 14;
        this.radius = this.baseRadius;
        this.isHovered = false;
        this.friction = 0.92;
    }

    update() {
        if (!isStarted) return;
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const magnetDist = 70;
        const pushDist = 160;

        if (dist < magnetDist) {
            this.vx += dx * 0.12;
            this.vy += dy * 0.12;
            this.isHovered = true;
        } else if (dist < pushDist) {
            const force = (pushDist - dist) / pushDist;
            const angle = Math.atan2(dy, dx);
            this.vx -= Math.cos(angle) * force * 1.5;
            this.vy -= Math.sin(angle) * force * 1.5;
            this.isHovered = false;
        } else {
            this.isHovered = false;
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vx += this.baseVx * 0.08;
        this.vy += this.baseVy * 0.08;

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        const targetRadius = this.isHovered ? this.baseRadius * 2.5 : this.baseRadius;
        this.radius += (targetRadius - this.radius) * 0.1;
        this.draw();
    }

    draw() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.globalAlpha = this.isHovered ? 1.0 : 0.6;
        ctx.fillStyle = this.color;
        if (this.isHovered) {
            ctx.shadowBlur = 40;
            ctx.shadowColor = this.color;
        }
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(data) {
    particles = data.map(entry => new Particle(entry));
}

function drawLiquidBackground() {
    tick += 0.001;
    bgCtx.globalCompositeOperation = 'source-over';
    bgCtx.globalAlpha = 1.0;
    bgCtx.fillStyle = '#fdfdfd';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgCtx.globalCompositeOperation = 'darken'; 
    bgColors.forEach((color, i) => {
        const moveRange = 0.5;
        const x = bgCanvas.width * (0.5 + moveRange * Math.cos(tick + i * 1.5));
        const y = bgCanvas.height * (0.5 + moveRange * Math.sin(tick * 0.8 + i * 2.2));
        const gradientSize = Math.max(bgCanvas.width, bgCanvas.height) * 0.8;
        const gradient = bgCtx.createRadialGradient(x, y, 0, x, y, gradientSize);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        bgCtx.globalAlpha = 0.25;
        bgCtx.fillStyle = gradient;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    });
}

function animate() {
    drawLiquidBackground();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let hoveredNow = null;
    particles.forEach(p => {
        p.update();
        if (p.isHovered) hoveredNow = p;
    });
    if (hoveredNow) {
        showTooltip(hoveredNow, mouse.x, mouse.y);
        playAudio(hoveredNow);
    } else {
        hideTooltip();
        triggerFadeOut();
        activeAudioParticle = null;
    }
    requestAnimationFrame(animate);
}

function showTooltip(p, x, y) {
    tDate.textContent = p.data.date;
    tWord.textContent = p.data.word;
    tooltip.style.display = 'block';
    const posX = Math.min(Math.max(x, 100), window.innerWidth - 100);
    const posY = Math.min(Math.max(y, 100), window.innerHeight - 50);
    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
    tooltip.style.opacity = '1';
    canvas.style.cursor = 'pointer';
}

function hideTooltip() {
    tooltip.style.opacity = '0';
    setTimeout(() => { if(tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 300);
    canvas.style.cursor = 'default';
}

function playAudio(particle) {
    if (!isStarted) return;
    const mood = particle.data.mood;
    const audioObj = loadedAudios[mood];
    if (!audioObj) return;

    if (fadeOutInterval) { 
        clearInterval(fadeOutInterval); 
        fadeOutInterval = null; 
    }
    if (activeAudioParticle === particle) return;
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = audioObj;
    currentAudio.loop = false;
    currentAudio.volume = 1.0;
    currentAudio.play().catch(() => {});
    
    currentMood = mood;
    activeAudioParticle = particle;
}

function triggerFadeOut() {
    if (fadeOutInterval || !currentAudio || currentAudio.paused) return;
    fadeOutInterval = setInterval(() => {
        if (currentAudio && currentAudio.volume > 0.05) {
            currentAudio.volume = Math.max(0, currentAudio.volume - 0.05);
        } else {
            clearInterval(fadeOutInterval);
            fadeOutInterval = null;
            if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
            currentMood = null;
            activeAudioParticle = null;
        }
    }, 40);
}

loadData();