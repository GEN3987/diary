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
const statTotal = document.getElementById('stat-total');
const statMood = document.getElementById('stat-mood');
const searchInput = document.getElementById('search-input');

const detailOverlay = document.getElementById('detail-overlay');
const detailDescription = document.getElementById('detail-description');
const colorPreview = document.getElementById('color-preview');
const complementaryPreview = document.getElementById('complementary-preview');
const relatedList = document.getElementById('related-list');
const moodIcon = document.getElementById('mood-icon');

let particles = [];
let audioMap = {};
let loadedAudios = {};
let currentAudio = null;
let fadeOutInterval = null;
let typingInterval = null;
let activeAudioParticle = null;
let isStarted = false;
let searchQuery = "";

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

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
});

window.addEventListener('mousedown', (e) => {
    if (!isStarted || detailOverlay.style.display === 'flex' || e.target === searchInput) return;
    const clickedParticle = particles.find(p => {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        const isMatch = !searchQuery || p.data.word.toLowerCase().includes(searchQuery) || (p.data.detail && p.data.detail.toLowerCase().includes(searchQuery));
        return isMatch && Math.sqrt(dx * dx + dy * dy) < (p.radius + 15); 
    });
    if (clickedParticle) openDetail(clickedParticle);
});

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
        if (moodKeys.length > 0) {
            let loadedCount = 0;
            const audioPromises = moodKeys.map(mood => {
                return new Promise((resolve) => {
                    const audio = new Audio();
                    audio.src = audioMap[mood];
                    audio.addEventListener('canplaythrough', () => {
                        loadedCount++;
                        updateProgress(20 + (loadedCount / moodKeys.length) * 75);
                        resolve();
                    }, { once: true });
                    audio.addEventListener('error', resolve, { once: true });
                    audio.load();
                    loadedAudios[mood] = audio;
                });
            });
            await Promise.all(audioPromises);
        }
        
        createParticles(diaryData);
        updateStats(diaryData);
        updateProgress(100);
        
        setTimeout(() => {
            loaderText.textContent = "MEMORIES LOADED";
            enterMsg.style.opacity = '1';
            window.addEventListener('keydown', handleStart);
            window.addEventListener('mousedown', handleStart);
        }, 500);

    } catch (error) {
        console.error("ロード失敗:", error);
        loaderText.textContent = "ERROR: MEMORY CORRUPTED";
    }
}

function handleStart(e) {
    if (isStarted || e.target.closest('#recall-button') || e.target === searchInput) return;
    isStarted = true;
    Object.values(loadedAudios).forEach(a => {
        a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    });
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
    animate();
}

function updateProgress(percent) {
    progressBar.style.width = percent + '%';
}

function updateStats(data) {
    statTotal.textContent = data.length;
    const moodCounts = data.reduce((acc, entry) => {
        acc[entry.mood] = (acc[entry.mood] || 0) + 1;
        return acc;
    }, {});
    const dominant = Object.keys(moodCounts).reduce((a, b) => moodCounts[a] > moodCounts[b] ? a : b, "-");
    statMood.textContent = dominant.toUpperCase();
}

// --- 【挙動修正版】Particleクラス：衝突回避＆境界ガード ---
class Particle {
    constructor(data) {
        this.data = data;
        // 最初から中央寄りに配置
        this.x = canvas.width * 0.2 + Math.random() * canvas.width * 0.6;
        this.y = canvas.height * 0.2 + Math.random() * canvas.height * 0.6;
        this.color = data.color;
        
        this.angle = Math.random() * Math.PI * 2;
        this.velocity = 0.01 + Math.random() * 0.02;
        
        this.baseVx = (Math.random() - 0.5) * 0.3;
        this.baseVy = (Math.random() - 0.5) * 0.3;
        this.vx = this.baseVx;
        this.vy = this.baseVy;
        
        this.baseRadius = 14;
        this.radius = this.baseRadius;
        this.isHovered = false;
        this.friction = 0.95; // 少し粘り気をもたせる
        this.alpha = 0.6;
        
        this.breathPhase = Math.random() * Math.PI * 2;
        this.breathSpeed = 0.02 + Math.random() * 0.03;
    }

    update() {
        if (!isStarted) return;

        const isMatch = !searchQuery || this.data.word.toLowerCase().includes(searchQuery) || (this.data.detail && this.data.detail.toLowerCase().includes(searchQuery));
        
        // 1. 透明度の更新
        const targetAlpha = isMatch ? (this.isHovered ? 1.0 : 0.6) : 0.05;
        this.alpha += (targetAlpha - this.alpha) * 0.1;

        // 2. マウスとのインタラクション
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (isMatch && dist < 120) {
            this.vx += dx * 0.01; 
            this.vy += dy * 0.01;
            this.isHovered = true;
        } else {
            this.isHovered = false;
        }

        // --- 3. 重なり防止（他の粒子と離れる力） ---
        particles.forEach(other => {
            if (this === other) return;
            const odx = other.x - this.x;
            const ody = other.y - this.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);
            // 粒子同士の最小距離（半径＋α）
            const minDist = (this.radius + other.radius) * 1.8; 
            if (oDist < minDist) {
                const force = (minDist - oDist) / minDist;
                const angle = Math.atan2(ody, odx);
                // 相手から遠ざかる方向に力を加える
                this.vx -= Math.cos(angle) * force * 0.5;
                this.vy -= Math.sin(angle) * force * 0.5;
            }
        });

        // --- 4. 境界ガード（端から押し戻す力） ---
        const margin = 100; // 端から100px以内に入ったら
        const pushForce = 0.05;
        if (this.x < margin) this.vx += (margin - this.x) * pushForce;
        if (this.x > canvas.width - margin) this.vx -= (this.x - (canvas.width - margin)) * pushForce;
        if (this.y < margin) this.vy += (margin - this.y) * pushForce;
        if (this.y > canvas.height - margin) this.vy -= (this.y - (canvas.height - margin)) * pushForce;

        // 5. 速度の反映と摩擦
        this.vx *= this.friction;
        this.vy *= this.friction;
        
        // 固有のゆらぎ
        this.angle += this.velocity;
        this.vx += Math.sin(this.angle) * 0.05;
        this.vy += Math.cos(this.angle * 0.8) * 0.05;

        this.x += this.vx;
        this.y += this.vy;

        // 6. 呼吸（サイズ）
        this.breathPhase += this.breathSpeed;
        const breath = Math.sin(this.breathPhase) * 2;
        const targetRadius = isMatch && this.isHovered ? this.baseRadius * 2.5 : this.baseRadius + breath;
        this.radius += (targetRadius - this.radius) * 0.1;
    }

    draw() {
        if (this.alpha < 0.01) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        if (this.isHovered && searchQuery === "") {
            ctx.shadowBlur = 40;
            ctx.shadowColor = this.color;
        }
        ctx.fill();
        ctx.restore();
    }
}

// --- 共通ユーティリティ ---

function typeWriter(text, element) {
    element.textContent = "";
    clearInterval(typingInterval);
    let i = 0;
    typingInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            const container = document.getElementById('detail-text-container');
            container.scrollTop = container.scrollHeight;
        } else { clearInterval(typingInterval); }
    }, 45);
}

function openDetail(p) {
    clearInterval(typingInterval);
    detailDescription.textContent = "";
    const data = p.data;
    const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const dateObj = new Date(data.date);
    document.getElementById('detail-date').textContent = data.date.replace(/-/g, '.');
    document.getElementById('detail-day').textContent = days[dateObj.getDay()];
    document.getElementById('detail-word').textContent = data.word;
    colorPreview.style.backgroundColor = data.color;
    const rgb = hexToRgb(data.color);
    const compRgb = { r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
    complementaryPreview.style.backgroundColor = `rgb(${compRgb.r}, ${compRgb.g}, ${compRgb.b})`;
    
    const iconName = `mood-${data.mood.toLowerCase()}.png`;
    moodIcon.src = `icons/${iconName}`;
    moodIcon.style.display = 'block';

    relatedList.innerHTML = "";
    const relatives = particles.filter(other => other.data.mood === data.mood && other !== p).slice(0, 3);
    relatives.forEach(rel => {
        const item = document.createElement('div');
        item.className = 'related-item';
        item.textContent = rel.data.date.split('-').slice(1).join('.');
        item.style.backgroundColor = rel.data.color;
        item.style.color = '#fff';
        item.onclick = () => { closeDetail(); setTimeout(() => openDetail(rel), 500); };
        relatedList.appendChild(item);
    });

    detailOverlay.style.display = 'flex';
    setTimeout(() => {
        detailOverlay.style.opacity = '1';
        document.getElementById('detail-view').style.transform = 'translateY(0)';
        document.getElementById('bar-r').style.width = (rgb.r / 255 * 100) + '%';
        document.getElementById('bar-g').style.width = (rgb.g / 255 * 100) + '%';
        document.getElementById('bar-b').style.width = (rgb.b / 255 * 100) + '%';
        setTimeout(() => { typeWriter(data.detail || "No additional records.", detailDescription); }, 300);
    }, 10);
}

function closeDetail() {
    clearInterval(typingInterval);
    detailOverlay.style.opacity = '0';
    document.getElementById('detail-view').style.transform = 'translateY(30px)';
    setTimeout(() => { detailOverlay.style.display = 'none'; }, 400);
}

function hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } : { r: 0, g: 0, b: 0 };
}

function drawLiquidBackground() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.fillStyle = '#fdfdfd';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    const time = Date.now() * 0.0004; 
    bgCtx.globalCompositeOperation = 'source-over';
    const recentParticles = particles.slice(-20);
    recentParticles.forEach((p, i) => {
        const offsetX = Math.sin(time + i * 0.5) * 120;
        const offsetY = Math.cos(time * 0.7 + i * 0.5) * 120;
        bgCtx.beginPath();
        const radius = Math.max(bgCanvas.width, bgCanvas.height) * 0.6;
        bgCtx.arc(p.x + offsetX, p.y + offsetY, radius, 0, Math.PI * 2);
        bgCtx.globalAlpha = 0.08;
        bgCtx.fillStyle = p.color;
        bgCtx.fill();
    });
    bgCtx.globalAlpha = 1.0;
}

function drawConnections() {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i], p2 = particles[j];
            if (p1.data.mood === p2.data.mood) {
                const isMatchP1 = !searchQuery || p1.data.word.toLowerCase().includes(searchQuery);
                const isMatchP2 = !searchQuery || p2.data.word.toLowerCase().includes(searchQuery);
                if (!isMatchP1 || !isMatchP2) continue;
                const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                if (dist < 250) {
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    ctx.globalAlpha = (1 - dist / 250) * 0.08;
                    ctx.strokeStyle = "#ccc";
                    ctx.stroke();
                }
            }
        }
    }
    ctx.restore();
}

function animate() {
    drawLiquidBackground();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => p.update());
    drawConnections();
    let hovered = null;
    particles.forEach(p => { 
        p.draw(); 
        const isMatch = !searchQuery || p.data.word.toLowerCase().includes(searchQuery);
        if (p.isHovered && isMatch) hovered = p; 
    });
    if (hovered) { showTooltip(hovered); playAudio(hovered); } else { hideTooltip(); triggerFadeOut(); }
    requestAnimationFrame(animate);
}

function recallRandomMemory() {
    const p = particles[Math.floor(Math.random() * particles.length)];
    mouse.x = p.x; mouse.y = p.y;
    p.vx += (Math.random() - 0.5) * 15; p.vy += (Math.random() - 0.5) * 15;
    playAudio(p);
}

function showTooltip(p) {
    tDate.textContent = p.data.date; tWord.textContent = p.data.word;
    tooltip.style.display = 'block'; 
    tooltip.style.left = `${Math.min(Math.max(mouse.x, 100), window.innerWidth - 100)}px`;
    tooltip.style.top = `${Math.min(Math.max(mouse.y, 100), window.innerHeight - 50)}px`;
    tooltip.style.opacity = '1'; 
    canvas.style.cursor = 'pointer';
}

function hideTooltip() { tooltip.style.opacity = '0'; canvas.style.cursor = 'default'; }

function playAudio(p) {
    const a = loadedAudios[p.data.mood];
    if (!a || activeAudioParticle === p) return;
    if (fadeOutInterval) { clearInterval(fadeOutInterval); fadeOutInterval = null; }
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
    currentAudio = a; currentAudio.volume = 1; currentAudio.play().catch(()=>{});
    activeAudioParticle = p;
}

function triggerFadeOut() {
    if (fadeOutInterval || !currentAudio || currentAudio.paused) return;
    fadeOutInterval = setInterval(() => {
        if (currentAudio && currentAudio.volume > 0.05) currentAudio.volume -= 0.05;
        else { clearInterval(fadeOutInterval); fadeOutInterval = null; if (currentAudio) currentAudio.pause(); activeAudioParticle = null; }
    }, 40);
}

function createParticles(data) { particles = data.map(d => new Particle(d)); }
loadData();