const canvas = document.getElementById('game');
const scoreDiv = document.createElement('div');
scoreDiv.style.position = 'absolute';
scoreDiv.style.top = '20px';
scoreDiv.style.color = 'white';
scoreDiv.style.font = 'bold 20px Arial';
scoreDiv.textContent = 'Score: 0';
document.body.appendChild(scoreDiv);

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
                score+=10;
            });
            scoreDiv.textContent='Score: '+score;

            removing = false;
            drop();            // ⬅️ drop ТОЛЬКО ПОСЛЕ удаления
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

    // если идёт shrink-анимация — НИЧЕГО не делаем
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

function swap(a, b) { const t = board[a.y][a.x]; board[a.y][a.x] = board[b.y][b.x]; board[b.y][b.x] = t; }

canvas.onclick = e => {
    if (busy) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / cell);
    const y = Math.floor((e.clientY - r.top) / cell);
    if (!selected) selected = { x, y };
    else {
        const dx = Math.abs(selected.x - x), dy = Math.abs(selected.y - y);
        if (dx + dy === 1) {
            swap(selected, { x, y });
            const m = findMatches();
            if (m.length) {
                removeMatches(m);
            } else {
                swap(selected, { x, y });
            }
        }
        selected = null;
    }
};

function loop() { draw(); updateAnim(); requestAnimationFrame(loop); }

init(); loop();