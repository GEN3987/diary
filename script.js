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

// 詳細表示用
const detailOverlay = document.getElementById('detail-overlay');
const detailDescription = document.getElementById('detail-description');
const colorPreview = document.getElementById('color-preview');
const complementaryPreview = document.getElementById('complementary-preview');
const relatedList = document.getElementById('related-list');
const moodIcon = document.getElementById('mood-icon');

let particles = [];
let audioMap = {};
let loadedAudios = {};
let bgColors = [];
let currentAudio = null;
let fadeOutInterval = null;
let typingInterval = null;
let tick = 0;
let activeAudioParticle = null;
let isStarted = false;
let searchQuery = ""; // 検索ワード保持

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

// 検索入力イベント
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
});

window.addEventListener('mousedown', (e) => {
    if (!isStarted || detailOverlay.style.display === 'flex' || e.target === searchInput) return;
    const clickedParticle = particles.find(p => {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        // 検索で除外されている粒子はクリック不可にする
        const isMatch = !searchQuery || p.data.word.toLowerCase().includes(searchQuery) || (p.data.detail && p.data.detail.toLowerCase().includes(searchQuery));
        return isMatch && Math.sqrt(dx * dx + dy * dy) < (p.radius + 5); 
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

        bgColors = diaryData.map(d => d.color);
        if (bgColors.length === 0) bgColors = ['#f0f9ff', '#fff1f2'];
        
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
        this.alpha = 0.6; // 透明度の初期値
    }
    update() {
        if (!isStarted) return;

        // 検索マッチング判定
        const isMatch = !searchQuery || 
                        this.data.word.toLowerCase().includes(searchQuery) || 
                        (this.data.detail && this.data.detail.toLowerCase().includes(searchQuery));

        // 透明度のターゲット設定
        const targetAlpha = isMatch ? (this.isHovered ? 1.0 : 0.6) : 0.05;
        this.alpha += (targetAlpha - this.alpha) * 0.1;

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (isMatch && dist < 70) {
            this.vx += dx * 0.12; this.vy += dy * 0.12;
            this.isHovered = true;
        } else if (dist < 160) {
            const force = (160 - dist) / 160;
            const angle = Math.atan2(dy, dx);
            this.vx -= Math.cos(angle) * force * 1.5;
            this.vy -= Math.sin(angle) * force * 1.5;
            this.isHovered = false;
        } else { this.isHovered = false; }

        this.vx *= this.friction; this.vy *= this.friction;
        this.vx += this.baseVx * 0.08; this.vy += this.baseVy * 0.08;
        this.x += this.vx; this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        const targetRadius = isMatch && this.isHovered ? this.baseRadius * 2.5 : this.baseRadius;
        this.radius += (targetRadius - this.radius) * 0.1;
    }
    draw() {
        if (this.alpha < 0.01) return; // ほぼ透明なら描画しない
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        if (this.isHovered && searchQuery === "") { ctx.shadowBlur = 40; ctx.shadowColor = this.color; }
        // 検索マッチ時はさらに光らせる
        if (searchQuery !== "" && this.alpha > 0.5) { ctx.shadowBlur = 20; ctx.shadowColor = "#fff"; }
        ctx.fill();
        ctx.restore();
    }
}

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
    const defaultIconPath = 'icons/mood-default.png'; 
    moodIcon.onerror = () => {
        if (moodIcon.src.includes(iconName)) { moodIcon.src = defaultIconPath; } else { moodIcon.style.display = 'none'; moodIcon.onerror = null; }
    };
    moodIcon.src = `icons/${iconName}`;
    moodIcon.style.display = 'block';

    relatedList.innerHTML = "";
    const relatives = particles.filter(other => other.data.mood === data.mood && other !== p).slice(0, 3);
    if (relatives.length > 0) {
        relatives.forEach(rel => {
            const item = document.createElement('div');
            item.className = 'related-item';
            item.textContent = rel.data.date.split('-').slice(1).join('.');
            item.style.backgroundColor = rel.data.color;
            item.style.color = '#fff';
            item.onclick = () => { closeDetail(); setTimeout(() => openDetail(rel), 500); };
            relatedList.appendChild(item);
        });
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.fontSize = '10px'; emptyMsg.style.color = '#ccc';
        emptyMsg.innerHTML = 'Only this moment remains...';
        relatedList.appendChild(emptyMsg);
    }

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
    document.getElementById('detail-view').style.transform = 'translateY(20px)';
    setTimeout(() => { detailOverlay.style.display = 'none'; detailDescription.textContent = ""; }, 400);
}

function hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } : { r: 0, g: 0, b: 0 };
}

function drawLiquidBackground() {
    tick += 0.001;
    bgCtx.globalCompositeOperation = 'source-over';
    bgCtx.globalAlpha = 1.0;
    bgCtx.fillStyle = '#fdfdfd';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.globalCompositeOperation = 'darken'; 
    bgColors.forEach((color, i) => {
        const x = bgCanvas.width * (0.5 + 0.5 * Math.cos(tick + i * 1.5));
        const y = bgCanvas.height * (0.5 + 0.5 * Math.sin(tick * 0.8 + i * 2.2));
        const gradient = bgCtx.createRadialGradient(x, y, 0, x, y, Math.max(bgCanvas.width, bgCanvas.height) * 0.8);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        bgCtx.globalAlpha = 0.2;
        bgCtx.fillStyle = gradient;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    });
    bgCtx.globalCompositeOperation = 'source-over';
}

function drawConnections() {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i], p2 = particles[j];
            if (p1.data.mood === p2.data.mood) {
                const isMatchP1 = !searchQuery || p1.data.word.toLowerCase().includes(searchQuery);
                const isMatchP2 = !searchQuery || p2.data.word.toLowerCase().includes(searchQuery);
                if (!isMatchP1 || !isMatchP2) continue; // 検索に合わない粒子の線は描かない

                const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                if (dist < 300) {
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    ctx.globalAlpha = (1 - dist / 300) * 0.1;
                    ctx.strokeStyle = Math.hypot(p1.x - mouse.x, p1.y - mouse.y) < 150 ? p1.color : "#888";
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
    p.vx += (Math.random() - 0.5) * 20; p.vy += (Math.random() - 0.5) * 20;
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