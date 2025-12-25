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

// Добавляем переменные для drag-n-drop
let isDragging = false;
let dragStart = null;
let dragCurrent = null;
const SWIPE_THRESHOLD = 20; // Минимальное расстояние для свапа

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

            // Подсветка при драге
            if (isDragging && dragStart && dragStart.x === x && dragStart.y === y) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    // Рисуем линию при драге
    /*if (isDragging && dragStart && dragCurrent) {
        const startX = dragStart.x * cell + cell / 2;
        const startY = dragStart.y * cell + cell / 2;
        const endX = dragCurrent.x * cell + cell / 2;
        const endY = dragCurrent.y * cell + cell / 2;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Стрелочка
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.save();
        ctx.translate(endX, endY);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fill();
        ctx.restore();
    }*/
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

function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const x = Math.floor((clientX - rect.left) / cell);
    const y = Math.floor((clientY - rect.top) / cell);
    
    // Проверка выхода за границы
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

// Обработчики для мыши
canvas.addEventListener('mousedown', (e) => {
    if (busy) return;
    
    const cellPos = getCellFromEvent(e);
    if (!cellPos) return;
    
    isDragging = true;
    dragStart = cellPos;
    dragCurrent = { ...cellPos };
    selected = null;
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || busy) return;
    
    const cellPos = getCellFromEvent(e);
    if (cellPos) {
        dragCurrent = cellPos;
    }
});

canvas.addEventListener('mouseup', () => {
    if (!isDragging || busy) return;
    
    if (dragStart && dragCurrent) {
        const dx = Math.abs(dragStart.x - dragCurrent.x);
        const dy = Math.abs(dragStart.y - dragCurrent.y);
        
        // Проверяем, достаточно ли протянули для свапа
        if (dx + dy === 1) {
            trySwap(dragStart, dragCurrent);
        }
    }
    
    isDragging = false;
    dragStart = null;
    dragCurrent = null;
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    dragStart = null;
    dragCurrent = null;
});

// Обработчики для тач-устройств
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (busy) return;
    
    const cellPos = getCellFromEvent(e);
    if (!cellPos) return;
    
    isDragging = true;
    dragStart = cellPos;
    dragCurrent = { ...cellPos };
    selected = null;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDragging || busy) return;
    
    const cellPos = getCellFromEvent(e);
    if (cellPos) {
        dragCurrent = cellPos;
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!isDragging || busy) return;
    
    if (dragStart && dragCurrent) {
        const dx = Math.abs(dragStart.x - dragCurrent.x);
        const dy = Math.abs(dragStart.y - dragCurrent.y);
        
        // Для тача используем порог свапа
        if (dx + dy === 1) {
            trySwap(dragStart, dragCurrent);
        } else if (dx === 0 && dy === 0) {
            // Простое нажатие (для совместимости)
            if (!selected) {
                selected = dragStart;
            } else {
                trySwap(selected, dragStart);
                selected = null;
            }
        }
    }
    
    isDragging = false;
    dragStart = null;
    dragCurrent = null;
});

// Сохраняем старый обработчик клика для совместимости
canvas.addEventListener('click', (e) => {
    if (isDragging) return; // Если был драг, игнорируем клик
    
    if (busy) return;
    const cellPos = getCellFromEvent(e);
    if (!cellPos) return;
    
    if (!selected) {
        selected = cellPos;
    } else {
        const dx = Math.abs(selected.x - cellPos.x);
        const dy = Math.abs(selected.y - cellPos.y);
        if (dx + dy === 1) {
            trySwap(selected, cellPos);
        }
        selected = null;
    }
});

function loop() {
    draw();
    updateAnim();
    requestAnimationFrame(loop);
}

init();
loop();