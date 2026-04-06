const canvas = document.getElementById('game');
const scoreDiv = document.getElementById('score');
const timerDiv = document.getElementById('timer');
const hud = document.getElementById('hud');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDiv = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardCloseBtn = document.getElementById('leaderboard-close-btn');
const leaderboardContent = document.getElementById('leaderboard-content');
const gameWrap = document.querySelector('.game-wrap');

let score = 0;
const ctx = canvas.getContext('2d');

const size = 8;
let cell = 45;
let boardGap = 1.5;
const GAME_DURATION_SECONDS = 180;
const TIMER_WARNING_SECONDS = 20;
const LEADERBOARD_API_URL = 'https://script.google.com/macros/s/AKfycbzJFmEX9X6zP9Pv7Z_jBgGukEhzbcXWc7eVnqc4l9JCZKPEwDZGGEi1Ki6Icc0uiq4-YA/exec';
const tileTypes = ['gem1', 'gem2', 'gem3', 'gem4', 'gem5'];
const fallbackColors = {
    gem1: '#f44336',
    gem2: '#2196f3',
    gem3: '#ffeb3b',
    gem4: '#4caf50',
    gem5: '#9c27b0'
};
const tileImages = {};
let gameState = 'start'; // start | playing | gameover
let timeLeft = GAME_DURATION_SECONDS;
let timerIntervalId = null;
let isSubmittingScore = false;
let leaderboardLoadingAnimationId = null;
let leaderboardIsOpen = false;

function loadImageWithFallbacks(candidates) {
    const img = new Image();
    let index = 0;

    function tryNext() {
        if (index >= candidates.length) return;
        img.src = candidates[index];
        index += 1;
    }

    img.onerror = tryNext;
    tryNext();
    return img;
}

tileTypes.forEach((type) => {
    // Поддерживаем обе структуры: assets/gems/gemX.png и assets/gemX.png
    tileImages[type] = loadImageWithFallbacks([
        `assets/gems/${type}.png`,
        `assets/${type}.png`
    ]);
});

let board = [];
let animY = [];
let scale = [];
let removing = false;
let selected = null;
let busy = false;
let swapping = false;
let swapAnimation = null;

// Переменные для управления
let touchId = null;
let touchStart = null;
let touchStartCell = null;
const SWIPE_THRESHOLD = 20;

function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function updateTimerText() {
    timerDiv.textContent = `Время: ${formatTime(timeLeft)}`;
    timerDiv.classList.toggle('warning', timeLeft <= TIMER_WARNING_SECONDS);
}

function clearTimer() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}

function resizeBoard() {
    const wrapWidth = gameWrap?.getBoundingClientRect().width || 360;
    const boardSize = Math.max(240, Math.round(wrapWidth));
    canvas.width = boardSize;
    canvas.height = boardSize;
    cell = boardSize / size;
    boardGap = Math.max(1, cell * 0.03);
}

function getTgUser() {
    const tg = (typeof Telegram !== 'undefined') ? Telegram : undefined;
    const u = tg?.WebApp?.initDataUnsafe?.user;
    return u || null;
}

function getTgId() {
    const user = getTgUser();
    return user?.id ? String(user.id) : '';
}

function getTgUsername() {
    const user = getTgUser();
    if (!user) return '';
    if (user.username) return '@' + user.username;
    const fn = user.first_name || '';
    const ln = user.last_name || '';
    const combo = (fn + ' ' + ln).trim();
    return combo || 'Игрок';
}

function formatMoscowDateTime(date = new Date()) {
    const parts = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);
    const map = {};
    parts.forEach((p) => {
        map[p.type] = p.value;
    });
    return `${map.day}.${map.month}.${map.year} ${map.hour}:${map.minute}`;
}

function renderLeaderboardRows(topList) {
    leaderboardContent.innerHTML = '';
    const total = Math.max(topList.length - 1, 1);
    topList.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        if (index < 3) {
            row.classList.add(`place-${index + 1}`);
        } else {
            const progress = (index - 3) / Math.max(total - 3, 1);
            const startColor = [107, 181, 255];
            const endColor = [172, 178, 191];
            const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * progress);
            const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * progress);
            const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * progress);
            row.style.background = `rgb(${r}, ${g}, ${b})`;
        }

        const place = Number(item.place || (index + 1));
        const username = item.username || 'Игрок';
        const value = Number(item.score || 0);

        row.innerHTML = `
            <span class="place">#${place}</span>
            <span class="user">${username}</span>
            <span class="score">${value}</span>
        `;
        leaderboardContent.appendChild(row);
    });
}

function stopLeaderboardLoadingAnimation() {
    if (leaderboardLoadingAnimationId) {
        clearInterval(leaderboardLoadingAnimationId);
        leaderboardLoadingAnimationId = null;
    }
}

function startLeaderboardLoadingAnimation() {
    let dots = 0;
    stopLeaderboardLoadingAnimation();
    leaderboardLoadingAnimationId = setInterval(() => {
        if (!leaderboardIsOpen) return;
        dots = (dots + 1) % 4;
        const loadingEl = leaderboardContent.querySelector('.leaderboard-loading');
        if (loadingEl) loadingEl.textContent = `Загрузка${'.'.repeat(dots)}`;
    }, 350);
}

function openLeaderboardModal() {
    leaderboardIsOpen = true;
    leaderboardModal.classList.remove('hidden');
}

function closeLeaderboardModal() {
    leaderboardIsOpen = false;
    leaderboardModal.classList.add('hidden');
    stopLeaderboardLoadingAnimation();
}

async function submitScoreIfPossible() {
    const tgId = getTgId();
    if (!tgId || isSubmittingScore) return;

    isSubmittingScore = true;
    try {
        const url = new URL(LEADERBOARD_API_URL);
        url.searchParams.set('function', 'AddRecord');
        url.searchParams.set('date_time', formatMoscowDateTime(new Date()));
        url.searchParams.set('username', getTgUsername() || 'Игрок');
        url.searchParams.set('score', String(Number(score)));
        url.searchParams.set('tg_id', String(Number(tgId)));
        await fetch(url.toString(), { method: 'GET' });
    } catch (error) {
        console.error('Score submit failed:', error);
    } finally {
        isSubmittingScore = false;
    }
}

async function loadLeaderboard() {
    openLeaderboardModal();
    leaderboardContent.innerHTML = '<div class="leaderboard-loading">Загрузка</div>';
    startLeaderboardLoadingAnimation();

    try {
        const url = new URL(LEADERBOARD_API_URL);
        url.searchParams.set('function', 'GetTop10');
        const response = await fetch(url.toString(), { method: 'GET' });
        const data = await response.json();
        const top = Array.isArray(data?.top) ? data.top : [];

        if (!leaderboardIsOpen) return;
        stopLeaderboardLoadingAnimation();
        if (!data?.ok || top.length === 0) {
            leaderboardContent.innerHTML = '<div class="leaderboard-empty">Пока нет рекордов</div>';
            return;
        }

        renderLeaderboardRows(top);
    } catch (error) {
        if (!leaderboardIsOpen) return;
        stopLeaderboardLoadingAnimation();
        leaderboardContent.innerHTML = '<div class="leaderboard-empty">Не удалось загрузить</div>';
        console.error('Leaderboard load failed:', error);
    }
}

function showStartScreen() {
    hud.classList.add('hidden');
    startScreen.classList.remove('hidden');
}

function hideStartScreen() {
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
}

function showGameOverScreen() {
    finalScoreDiv.textContent = `Твой результат: ${score} баллов`;
    gameOverScreen.classList.remove('hidden');
}

function hideGameOverScreen() {
    gameOverScreen.classList.add('hidden');
}

function endGame() {
    gameState = 'gameover';
    clearTimer();
    updateTimerText();
    showGameOverScreen();
    submitScoreIfPossible();
}

function startTimer() {
    clearTimer();
    updateTimerText();
    timerIntervalId = setInterval(() => {
        if (gameState !== 'playing') return;
        timeLeft -= 1;
        updateTimerText();
        if (timeLeft <= 0) {
            timeLeft = 0;
            endGame();
        }
    }, 1000);
}

function resetBoardState() {
    selected = null;
    busy = false;
    swapping = false;
    removing = false;
    swapAnimation = null;
    mouseDown = false;
    mouseStart = null;
    mouseStartCell = null;
    touchId = null;
    touchStart = null;
    touchStartCell = null;
}

function startGame() {
    closeLeaderboardModal();
    resizeBoard();
    score = 0;
    scoreDiv.textContent = `Счёт: ${score}`;
    timeLeft = GAME_DURATION_SECONDS;
    resetBoardState();
    init();
    hideStartScreen();
    hideGameOverScreen();
    gameState = 'playing';
    startTimer();
}

function randColor() {
    return tileTypes[Math.floor(Math.random() * tileTypes.length)];
}

function hasMatchAt(x, y) {
    const c = board[y][x];
    if (!c) return false;
    if (x >= 2 && board[y][x - 1] === c && board[y][x - 2] === c) return true;
    if (y >= 2 && board[y - 1][x] === c && board[y - 2][x] === c) return true;
    return false;
}

function init() {
    board = [];
    animY = [];
    scale = [];

    for (let y = 0; y < size; y++) {
        board[y] = [];
        animY[y] = [];
        scale[y] = [];

        for (let x = 0; x < size; x++) {
            let c;
            do {
                c = randColor();
                board[y][x] = c;
            } while (hasMatchAt(x, y));

            animY[y][x] = y;
            scale[y][x] = 1;
        }
    }
}

function drop() {
    busy = true;

    for (let x = 0; x < size; x++) {
        for (let y = size - 1; y >= 0; y--) {
            if (!board[y][x]) {
                for (let k = y - 1; k >= 0; k--) {
                    if (board[k][x]) {
                        board[y][x] = board[k][x];
                        animY[y][x] = animY[k][x];
                        scale[y][x] = scale[k][x];

                        board[k][x] = null;
                        scale[k][x] = 1;
                        break;
                    }
                }
            }
        }

        for (let y = 0; y < size; y++) {
            if (!board[y][x]) {
                board[y][x] = randColor();
                animY[y][x] = -1;
                scale[y][x] = 1;
            }
        }
    }
}

function drawTile(tileType) {
    const sprite = tileImages[tileType];

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const padding = Math.max(1.5, cell * 0.045);
        ctx.drawImage(sprite, -cell / 2 + padding, -cell / 2 + padding, cell - padding * 2, cell - padding * 2);
        return;
    }

    // Fallback на случай, если картинка не успела загрузиться.
    ctx.beginPath();
    ctx.arc(0, 0, cell / 2 - 5, 0, Math.PI * 2);
    ctx.fillStyle = fallbackColors[tileType] || '#888';
    ctx.fill();
}

function drawBoardGrid() {
    const innerCell = cell - boardGap;
    const radius = Math.max(4, cell * 0.13);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = x * cell + boardGap / 2;
            const top = y * cell + boardGap / 2;
            const width = innerCell;
            const height = innerCell;

            ctx.beginPath();
            ctx.moveTo(left + radius, top);
            ctx.lineTo(left + width - radius, top);
            ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
            ctx.lineTo(left + width, top + height - radius);
            ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
            ctx.lineTo(left + radius, top + height);
            ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
            ctx.lineTo(left, top + radius);
            ctx.quadraticCurveTo(left, top, left + radius, top);
            ctx.closePath();

            ctx.fillStyle = '#d6d3ed';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBoardGrid();

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let c = board[y][x];
            if (!c) continue;

            let px = x * cell + cell / 2;
            let py = animY[y][x] * cell + cell / 2;

            // Анимация свапа
            if (swapping && swapAnimation) {
                const { cell1, cell2, progress, reverse, originalColors } = swapAnimation;
                
                // Определяем, какой это круг в анимации
                if (x === cell1.x && y === cell1.y) {
                    // Первый круг
                    const dx = cell2.x - cell1.x;
                    const dy = cell2.y - cell1.y;
                    const animProgress = reverse ? (1 - progress) : progress;
                    px += dx * cell * animProgress;
                    py += dy * cell * animProgress;
                    
                    // Используем правильный цвет из оригинальных цветов
                    if (reverse) {
                        // При обратной анимации первый круг должен быть цветом второго круга
                        c = originalColors[1];
                    } else {
                        // При прямой анимации первый круг остаётся своим цветом
                        c = originalColors[0];
                    }
                } else if (x === cell2.x && y === cell2.y) {
                    // Второй круг
                    const dx = cell1.x - cell2.x;
                    const dy = cell1.y - cell2.y;
                    const animProgress = reverse ? (1 - progress) : progress;
                    px += dx * cell * animProgress;
                    py += dy * cell * animProgress;
                    
                    // Используем правильный цвет из оригинальных цветов
                    if (reverse) {
                        // При обратной анимации второй круг должен быть цветом первого круга
                        c = originalColors[0];
                    } else {
                        // При прямой анимации второй круг остаётся своим цветом
                        c = originalColors[1];
                    }
                }
            }

            ctx.save();
            ctx.translate(px, py);
            ctx.scale(scale[y][x], scale[y][x]);

            drawTile(c);

            // Подсветка выбранного элемента
            if (selected && selected.x === x && selected.y === y) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'white';
                ctx.stroke();
            }

            ctx.restore();
        }
    }
}

function findMatches() {
    const m = [];
    for (let y = 0; y < size; y++) {
        let cnt = 1;
        for (let x = 1; x <= size; x++) {
            if (x < size && board[y][x] === board[y][x - 1]) cnt++;
            else { if (cnt >= 3 && board[y][x - 1]) for (let i = 0; i < cnt; i++) m.push({ x: x - 1 - i, y }); cnt = 1; }
        }
    }
    for (let x = 0; x < size; x++) {
        let cnt = 1;
        for (let y = 1; y <= size; y++) {
            if (y < size && board[y][x] === board[y - 1][x]) cnt++;
            else { if (cnt >= 3 && board[y - 1][x]) for (let i = 0; i < cnt; i++) m.push({ x, y: y - 1 - i }); cnt = 1; }
        }
    }
    return m;
}

function removeMatches(matches) {
    removing = true;

    matches.forEach(p => {
        scale[p.y][p.x] = 1;
    });

    const shrink = setInterval(() => {
        let done = true;

        matches.forEach(p => {
            scale[p.y][p.x] -= 0.1;
            if (scale[p.y][p.x] > 0) done = false;
        });

        if (done) {
            clearInterval(shrink);

            matches.forEach(p => {
                board[p.y][p.x] = null;
                scale[p.y][p.x] = 1;
                score += 10;
            });
            scoreDiv.textContent = 'Счёт: ' + score;

            removing = false;
            drop();
        }
    }, 16);
}

function updateAnim() {
    let moving = false;

    // Анимация падения (скорость 0.25)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (animY[y][x] < y) {
                animY[y][x] += 0.25;
                if (animY[y][x] > y) animY[y][x] = y;
                moving = true;
            }
        }
    }

    // Анимация свапа (скорость 0.125 - в 2 раза медленнее)
    if (swapping && swapAnimation) {
        const { reverse, callback } = swapAnimation;
        
        if (!reverse) {
            // Прямая анимация (вперёд)
            swapAnimation.progress += 0.125;
            if (swapAnimation.progress >= 1) {
                swapAnimation.progress = 1;
                swapping = false;
                if (callback) callback();
            }
        } else {
            // Обратная анимация (назад)
            swapAnimation.progress -= 0.125;
            if (swapAnimation.progress <= 0) {
                swapAnimation.progress = 0;
                swapping = false;
                if (callback) callback();
            }
        }
    }

    if (removing) return;

    if (!moving && busy && !swapping) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                animY[y][x] = y;
            }
        }

        busy = false;

        const matches = findMatches();
        if (matches.length) {
            removeMatches(matches);
        }
    }
}

function swapCells(a, b) {
    const t = board[a.y][a.x];
    board[a.y][a.x] = board[b.y][b.x];
    board[b.y][b.x] = t;
}

function animateSwap(cell1, cell2, reverse = false, callback = null) {
    swapping = true;
    
    // Сохраняем исходные цвета ДО любых изменений
    const originalColor1 = board[cell1.y][cell1.x];
    const originalColor2 = board[cell2.y][cell2.x];
    
    swapAnimation = {
        cell1: { ...cell1 },
        cell2: { ...cell2 },
        progress: reverse ? 1 : 0,
        reverse: reverse,
        originalColors: [originalColor1, originalColor2], // Сохраняем исходные цвета
        callback: callback
    };
}

function getCellFromCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const localX = (clientX - rect.left) * scaleX;
    const localY = (clientY - rect.top) * scaleY;
    const x = Math.floor(localX / cell);
    const y = Math.floor(localY / cell);
    
    if (x < 0 || x >= size || y < 0 || y >= size) {
        return null;
    }
    
    return { x, y };
}

function trySwap(start, end) {
    const dx = Math.abs(start.x - end.x);
    const dy = Math.abs(start.y - end.y);
    
    if (dx + dy === 1) {
        // Запускаем анимацию свапа ВПЕРЁД
        animateSwap(start, end, false, () => {
            // После завершения анимации вперёд, меняем круги местами в данных
            swapCells(start, end);
            
            // Проверяем совпадения
            const m = findMatches();
            if (m.length) {
                // Если есть совпадения - запускаем удаление
                removeMatches(m);
            } else {
                // Если нет совпадений, запускаем обратную анимацию
                setTimeout(() => {
                    // Перед обратной анимацией меняем круги обратно в данных
                    swapCells(start, end);
                    // Запускаем обратную анимацию
                    animateSwap(start, end, true);
                }, 100);
            }
        });
        
        return true;
    }
    return false;
}

// ========== ОБРАБОТЧИКИ МЫШИ ==========
let mouseDown = false;
let mouseStart = null;
let mouseStartCell = null;

canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'playing') return;
    if (busy || swapping) return;
    
    const rect = canvas.getBoundingClientRect();
    const cellPos = getCellFromCoordinates(e.clientX, e.clientY);
    if (!cellPos) return;
    
    mouseDown = true;
    mouseStart = { x: e.clientX, y: e.clientY };
    mouseStartCell = cellPos;
    selected = null;
});

canvas.addEventListener('mousemove', (e) => {
    if (!mouseDown || busy || swapping) return;
});

canvas.addEventListener('mouseup', (e) => {
    if (gameState !== 'playing') return;
    if (!mouseDown || busy || swapping || !mouseStart || !mouseStartCell) return;
    
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - mouseStart.x;
    const dy = e.clientY - mouseStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance >= SWIPE_THRESHOLD) {
        let neighbor = {...mouseStartCell};
        
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0 && mouseStartCell.x < size - 1) {
                neighbor.x += 1;
            } else if (dx < 0 && mouseStartCell.x > 0) {
                neighbor.x -= 1;
            }
        } else {
            if (dy > 0 && mouseStartCell.y < size - 1) {
                neighbor.y += 1;
            } else if (dy < 0 && mouseStartCell.y > 0) {
                neighbor.y -= 1;
            }
        }
        
        if (neighbor.x !== mouseStartCell.x || neighbor.y !== mouseStartCell.y) {
            trySwap(mouseStartCell, neighbor);
        }
    } else {
        const endCell = getCellFromCoordinates(e.clientX, e.clientY);
        if (!endCell) return;
        
        if (!selected) {
            selected = mouseStartCell;
        } else {
            trySwap(selected, mouseStartCell);
            selected = null;
        }
    }
    
    mouseDown = false;
    mouseStart = null;
    mouseStartCell = null;
});

canvas.addEventListener('mouseleave', () => {
    mouseDown = false;
    mouseStart = null;
    mouseStartCell = null;
});

// ========== ОБРАБОТЧИКИ ТАЧА ==========
canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'playing') return;
    e.preventDefault();
    if (busy || swapping || touchId !== null) return;
    
    const touch = e.touches[0];
    touchId = touch.identifier;
    
    const rect = canvas.getBoundingClientRect();
    const cellPos = getCellFromCoordinates(touch.clientX, touch.clientY);
    if (!cellPos) {
        touchId = null;
        return;
    }
    
    touchStart = { x: touch.clientX, y: touch.clientY };
    touchStartCell = cellPos;
    selected = null;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touchId === null || busy || swapping) return;
    
    const touch = Array.from(e.touches).find(t => t.identifier === touchId);
    if (!touch) return;
});

canvas.addEventListener('touchend', (e) => {
    if (gameState !== 'playing') return;
    e.preventDefault();
    if (touchId === null || busy || swapping || !touchStart || !touchStartCell) return;
    
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
    if (!touch) {
        touchId = null;
        touchStart = null;
        touchStartCell = null;
        return;
    }
    
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance >= SWIPE_THRESHOLD) {
        let neighbor = {...touchStartCell};
        
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0 && touchStartCell.x < size - 1) {
                neighbor.x += 1;
            } else if (dx < 0 && touchStartCell.x > 0) {
                neighbor.x -= 1;
            }
        } else {
            if (dy > 0 && touchStartCell.y < size - 1) {
                neighbor.y += 1;
            } else if (dy < 0 && touchStartCell.y > 0) {
                neighbor.y -= 1;
            }
        }
        
        if (neighbor.x !== touchStartCell.x || neighbor.y !== touchStartCell.y) {
            trySwap(touchStartCell, neighbor);
        }
    } else {
        if (!selected) {
            selected = touchStartCell;
        } else {
            trySwap(selected, touchStartCell);
            selected = null;
        }
    }
    
    touchId = null;
    touchStart = null;
    touchStartCell = null;
});

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    touchId = null;
    touchStart = null;
    touchStartCell = null;
});

function loop() {
    draw();
    updateAnim();
    requestAnimationFrame(loop);
}

function handleStartOverlayAction() {
    if (gameState !== 'start') return;
    startGame();
}

// Telegram WebApp может по-разному отдавать события тапа.
startScreen.addEventListener('click', handleStartOverlayAction);
startScreen.addEventListener('touchend', handleStartOverlayAction);
startScreen.addEventListener('pointerdown', handleStartOverlayAction);

// Fallback: если оверлей не получил событие, стартуем по первому тапу.
window.addEventListener('click', handleStartOverlayAction, true);
window.addEventListener('touchend', handleStartOverlayAction, true);
window.addEventListener('pointerdown', handleStartOverlayAction, true);

restartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startGame();
});

leaderboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadLeaderboard();
});

leaderboardCloseBtn.addEventListener('click', () => {
    closeLeaderboardModal();
});

leaderboardModal.addEventListener('click', (e) => {
    if (e.target === leaderboardModal) closeLeaderboardModal();
});

window.addEventListener('resize', resizeBoard);
window.addEventListener('orientationchange', resizeBoard);

resizeBoard();
init();
showStartScreen();
updateTimerText();
loop();