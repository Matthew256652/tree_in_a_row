const canvas = document.getElementById('game');
const scoreDiv = document.getElementById('score');
const timerDiv = document.getElementById('timer');
const hud = document.getElementById('hud');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDiv = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');

let score = 0;
const ctx = canvas.getContext('2d');

const size = 8;
const cell = 45;
const boardGap = 1.5;
const GAME_DURATION_SECONDS = 180;
const TIMER_WARNING_SECONDS = 20;
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
        const padding = 2;
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
    const radius = 6;

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
    const x = Math.floor((clientX - rect.left) / cell);
    const y = Math.floor((clientY - rect.top) / cell);
    
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

function handleStartOverlayAction(e) {
    e.preventDefault();
    e.stopPropagation();
    if (gameState === 'start') {
        startGame();
    }
}

startScreen.addEventListener('click', handleStartOverlayAction);
startScreen.addEventListener('touchstart', handleStartOverlayAction, { passive: false });

restartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startGame();
});

leaderboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Пока оставляем кнопку без действия.
});

init();
showStartScreen();
updateTimerText();
loop();