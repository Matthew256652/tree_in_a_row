const canvas = document.getElementById('game');
const scoreDiv = document.getElementById('score');

let score = 0;
const ctx = canvas.getContext('2d');

const size = 8;
const cell = 45;
const colors = ['red', 'blue', 'yellow', 'green'];

let board = [];
let animY = [];
let scale = [];
let removing = false;
let selected = null;
let busy = false;

// Переменные для управления
let touchId = null; // ID текущего касания
let touchStart = null;
let touchStartCell = null;
const SWIPE_THRESHOLD = 20;

function randColor() {
    return colors[Math.floor(Math.random() * colors.length)];
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

function draw() {
    ctx.clearRect(0, 0, 360, 360);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const c = board[y][x];
            if (!c) continue;

            const px = x * cell + cell / 2;
            const py = animY[y][x] * cell + cell / 2;

            ctx.save();
            ctx.translate(px, py);
            ctx.scale(scale[y][x], scale[y][x]);

            ctx.beginPath();
            ctx.arc(0, 0, cell / 2 - 5, 0, Math.PI * 2);
            ctx.fillStyle = c;
            ctx.fill();

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
            scoreDiv.textContent = 'Score: ' + score;

            removing = false;
            drop();
        }
    }, 16);
}

function updateAnim() {
    let moving = false;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (animY[y][x] < y) {
                animY[y][x] += 0.25;
                if (animY[y][x] > y) animY[y][x] = y;
                moving = true;
            }
        }
    }

    if (removing) return;

    if (!moving && busy) {
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

function swap(a, b) {
    const t = board[a.y][a.x];
    board[a.y][a.x] = board[b.y][b.x];
    board[b.y][b.x] = t;
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
        swap(start, end);
        const m = findMatches();
        if (m.length) {
            removeMatches(m);
            return true;
        } else {
            swap(start, end); // Отмена если нет матча
            return false;
        }
    }
    return false;
}

// ========== ОБРАБОТЧИКИ МЫШИ ==========
let mouseDown = false;
let mouseStart = null;
let mouseStartCell = null;

canvas.addEventListener('mousedown', (e) => {
    if (busy) return;

    const rect = canvas.getBoundingClientRect();
    const cellPos = getCellFromCoordinates(e.clientX, e.clientY);
    if (!cellPos) return;

    mouseDown = true;
    mouseStart = { x: e.clientX, y: e.clientY };
    mouseStartCell = cellPos;
    selected = null;
});

canvas.addEventListener('mousemove', (e) => {
    if (!mouseDown || busy) return;

    // Просто обновляем позицию, обработка будет в mouseup
});

canvas.addEventListener('mouseup', (e) => {
    if (!mouseDown || busy || !mouseStart || !mouseStartCell) return;

    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - mouseStart.x;
    const dy = e.clientY - mouseStart.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= SWIPE_THRESHOLD) {
        // Это свап - определяем направление
        let neighbor = { ...mouseStartCell };

        if (Math.abs(dx) > Math.abs(dy)) {
            // Горизонтальный свап
            if (dx > 0 && mouseStartCell.x < size - 1) {
                neighbor.x += 1;
            } else if (dx < 0 && mouseStartCell.x > 0) {
                neighbor.x -= 1;
            }
        } else {
            // Вертикальный свап
            if (dy > 0 && mouseStartCell.y < size - 1) {
                neighbor.y += 1;
            } else if (dy < 0 && mouseStartCell.y > 0) {
                neighbor.y -= 1;
            }
        }

        // Пытаемся свапнуть с соседом
        if (neighbor.x !== mouseStartCell.x || neighbor.y !== mouseStartCell.y) {
            trySwap(mouseStartCell, neighbor);
        }
    } else {
        // Это клик
        const endCell = getCellFromCoordinates(e.clientX, e.clientY);
        if (!endCell) return;

        if (!selected) {
            selected = mouseStartCell;
        } else {
            // Уже есть выбранный круг - пытаемся свапнуть
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
    e.preventDefault();
    if (busy || touchId !== null) return;

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
    if (touchId === null || busy) return;

    // Находим наш тач по ID
    const touch = Array.from(e.touches).find(t => t.identifier === touchId);
    if (!touch) return;

    // Просто предотвращаем скролл, обработка будет в touchend
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (touchId === null || busy || !touchStart || !touchStartCell) return;

    // Находим завершившийся тач
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
        // Это свап - определяем направление
        let neighbor = { ...touchStartCell };

        if (Math.abs(dx) > Math.abs(dy)) {
            // Горизонтальный свап
            if (dx > 0 && touchStartCell.x < size - 1) {
                neighbor.x += 1;
            } else if (dx < 0 && touchStartCell.x > 0) {
                neighbor.x -= 1;
            }
        } else {
            // Вертикальный свап
            if (dy > 0 && touchStartCell.y < size - 1) {
                neighbor.y += 1;
            } else if (dy < 0 && touchStartCell.y > 0) {
                neighbor.y -= 1;
            }
        }

        // Пытаемся свапнуть с соседом
        if (neighbor.x !== touchStartCell.x || neighbor.y !== touchStartCell.y) {
            trySwap(touchStartCell, neighbor);
        }
    } else {
        // Это короткое касание (клик)
        if (!selected) {
            selected = touchStartCell;
        } else {
            // Уже есть выбранный круг - пытаемся свапнуть
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

// Удаляем старый обработчик click, так как теперь клики обрабатываются через mouseup
// canvas.addEventListener('click', ...) - больше не нужно

function loop() {
    draw();
    updateAnim();
    requestAnimationFrame(loop);
}

init();
loop();