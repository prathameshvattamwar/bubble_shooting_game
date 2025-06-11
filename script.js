document.addEventListener('DOMContentLoaded', () => {
    const screens = { home: document.getElementById('home-screen'), game: document.getElementById('game-screen') };
    const modals = { pause: document.getElementById('pause-modal'), gameOver: document.getElementById('game-over-modal') };
    const ui = { level: document.getElementById('level'), score: document.getElementById('score'), finalScore: document.getElementById('final-score') };
    const buttons = {
        difficulty: document.querySelectorAll('.difficulty-btn'),
        start: document.getElementById('start-game-btn'),
        pause: document.getElementById('pause-btn'),
        exit: document.getElementById('exit-btn'),
        resume: document.getElementById('resume-btn'),
        exitModal: document.getElementById('exit-modal-btn'),
        playAgain: document.getElementById('play-again-btn'),
    };
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    const sounds = {
        bg: document.getElementById('bg-music'),
        shoot: new Audio('assets/shoot.wav'),
        pop: new Audio('assets/pop.wav'),
        gameOver: new Audio('assets/game-over.wav')
    };
    sounds.bg.volume = 0.2;
    sounds.pop.volume = 0.3;

    let musicStarted = false;
    let animationFrameId;
    
    const BUBBLE_COLORS = ['#ff3b30', '#34c759', '#007aff', '#ff9500', '#af52de', '#5ac8fa'];
    const BUBBLE_DARK_COLORS = ['#a11d15', '#1a6d30', '#004a99', '#995a00', '#672d86', '#2e7a96'];
    const HEX_GRID_CONSTANT = 1.732;

    const config = {
        easy: { rows: 6, cols: 9, shotsToAddRow: 7 },
        medium: { rows: 8, cols: 11, shotsToAddRow: 6 },
        hard: { rows: 10, cols: 13, shotsToAddRow: 5 }
    };
    
    let state = {};

    function resetState() {
        state = {
            difficulty: 'easy',
            level: 1,
            score: 0,
            isPaused: false,
            isGameOver: false,
            grid: [],
            shooterBubble: null,
            nextBubble: null,
            projectile: null,
            aimAngle: -Math.PI / 2,
            shotsUntilNextRow: 0,
            cols: 0,
            bubbleRadius: 0
        };
    }

    function switchScreen(screenName) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    function startMusic() {
        if (!musicStarted) {
            sounds.bg.play().catch(() => {});
            musicStarted = true;
            document.body.removeEventListener('click', startMusic, true);
        }
    }

    function updateUI() {
        ui.level.textContent = state.level;
        ui.score.textContent = state.score;
    }

    function resizeCanvas() {
        const container = document.getElementById('game-canvas-container');
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        
        const difficultyConfig = config[state.difficulty];
        state.cols = difficultyConfig.cols;
        state.bubbleRadius = canvas.width / (state.cols * 2);
    }

    function createBubble(row, col, colorIndex) {
        return { row, col, colorIndex, isPopping: false, animFrame: 0 };
    }
    
    function getBubbleColor() {
        const activeColors = [...new Set(state.grid.flat().filter(b => b).map(b => b.colorIndex))];
        return activeColors.length > 0 ? activeColors[Math.floor(Math.random() * activeColors.length)] : Math.floor(Math.random() * BUBBLE_COLORS.length);
    }

    function generateShooterBubbles() {
        state.shooterBubble = createBubble(-1, -1, getBubbleColor());
        state.nextBubble = createBubble(-1, -1, getBubbleColor());
    }
    
    function createGrid() {
        state.grid = [];
        const initialRows = config[state.difficulty].rows;
        for (let r = 0; r < initialRows; r++) {
            const row = [];
            const colsInRow = state.cols - (r % 2);
            for (let c = 0; c < colsInRow; c++) {
                row.push(createBubble(r, c, Math.floor(Math.random() * BUBBLE_COLORS.length)));
            }
            state.grid.push(row);
        }
        generateShooterBubbles();
    }
    
    function getBubbleCoords(bubble) {
        const isOddRow = bubble.row % 2 !== 0;
        const x = bubble.col * 2 * state.bubbleRadius + (isOddRow ? 2 : 1) * state.bubbleRadius;
        const y = bubble.row * state.bubbleRadius * (HEX_GRID_CONSTANT / 2) + state.bubbleRadius;
        return { x, y };
    }

    function drawBubble(bubble, x, y) {
        if (!bubble) return;
        const color = BUBBLE_COLORS[bubble.colorIndex];
        const darkColor = BUBBLE_DARK_COLORS[bubble.colorIndex];
        ctx.save();
        if(bubble.isPopping) {
            const popScale = 1 + bubble.animFrame * 0.1;
            ctx.translate(x, y);
            ctx.scale(popScale, popScale);
            ctx.globalAlpha = 1 - bubble.animFrame / 5;
            ctx.translate(-x, -y);
        }
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(x - state.bubbleRadius/3, y - state.bubbleRadius/3, 0, x, y, state.bubbleRadius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, darkColor);
        ctx.fillStyle = gradient;
        ctx.arc(x, y, state.bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(x - state.bubbleRadius * 0.4, y - state.bubbleRadius * 0.4, state.bubbleRadius * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    function drawShooter() {
        const shooterX = canvas.width / 2;
        const shooterY = canvas.height - state.bubbleRadius;
        
        if (!state.projectile) {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 8]);
            ctx.moveTo(shooterX, shooterY);
            const lineLength = canvas.height / 2.5;
            const endX = shooterX + lineLength * Math.cos(state.aimAngle);
            const endY = shooterY + lineLength * Math.sin(state.aimAngle);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.save();
        ctx.translate(shooterX, shooterY);
        ctx.rotate(state.aimAngle + Math.PI / 2);
        ctx.fillStyle = '#6c757d';
        ctx.fillRect(-state.bubbleRadius / 4, -state.bubbleRadius * 1.5, state.bubbleRadius / 2, state.bubbleRadius * 1.5);
        ctx.restore();
        
        if (state.shooterBubble) drawBubble(state.shooterBubble, shooterX, shooterY);
        if (state.nextBubble) drawBubble(state.nextBubble, state.bubbleRadius * 2.5, shooterY);
    }
    
    function findNeighbors(bubble) {
        const neighbors = [];
        const isOddRow = bubble.row % 2 !== 0;
        const directions = isOddRow
            ? [[0,-1], [0,1], [-1,0], [-1,1], [1,0], [1,1]]
            : [[0,-1], [0,1], [-1,-1], [-1,0], [1,-1], [1,0]];
            
        for (const [dr, dc] of directions) {
            const nr = bubble.row + dr;
            const nc = bubble.col + dc;
            if (state.grid[nr] && state.grid[nr][nc]) {
                neighbors.push(state.grid[nr][nc]);
            }
        }
        return neighbors;
    }

    function processMatches(startBubble) {
        const cluster = [startBubble];
        const toCheck = [startBubble];
        const checked = new Set([`${startBubble.row},${startBubble.col}`]);

        while (toCheck.length > 0) {
            const current = toCheck.pop();
            findNeighbors(current).forEach(neighbor => {
                const id = `${neighbor.row},${neighbor.col}`;
                if (neighbor.colorIndex === startBubble.colorIndex && !checked.has(id)) {
                    checked.add(id);
                    toCheck.push(neighbor);
                    cluster.push(neighbor);
                }
            });
        }
        
        if (cluster.length >= 3) {
            cluster.forEach(b => b.isPopping = true);
            state.score += cluster.length * 10;
            return true;
        }
        return false;
    }

    function processFloating() {
        const connected = new Set();
        const toCheck = (state.grid[0] || []).filter(b => b);
        toCheck.forEach(b => connected.add(`${b.row},${b.col}`));

        let head = 0;
        while(head < toCheck.length) {
            const current = toCheck[head++];
            findNeighbors(current).forEach(neighbor => {
                const id = `${neighbor.row},${neighbor.col}`;
                if(!connected.has(id)) {
                    connected.add(id);
                    toCheck.push(neighbor);
                }
            });
        }

        let floatingCount = 0;
        state.grid.forEach(row => row.forEach(bubble => {
            if(bubble && !connected.has(`${bubble.row},${bubble.col}`)) {
                bubble.isPopping = true;
                floatingCount++;
            }
        }));
        if(floatingCount > 0) state.score += floatingCount * 20;
    }

    function addRow() {
        state.grid.pop();
        const newRow = [];
        const colsInRow = state.cols - (state.grid.length % 2);
        for(let c = 0; c < colsInRow; c++) {
            newRow.push(createBubble(0,c, Math.floor(Math.random() * BUBBLE_COLORS.length)));
        }
        state.grid.unshift(newRow);
        state.grid.forEach((row, r) => row.forEach(bubble => { if(bubble) bubble.row = r; }));
    }
    
    function snapProjectile() {
        const p = state.projectile;
        state.projectile = null;
        
        let bestPos = { dist: Infinity };
        for (let r = 0; r < state.grid.length + 1; r++) {
            const colsInRow = state.cols - (r % 2);
            for (let c = 0; c < colsInRow; c++) {
                if (state.grid[r] && state.grid[r][c]) continue;
                
                const {x, y} = getBubbleCoords({row: r, col: c});
                const dx = p.x - x;
                const dy = p.y - y;
                const dist = dx * dx + dy * dy;

                if (dist < bestPos.dist) {
                    bestPos = { r, c, dist };
                }
            }
        }
        
        if (!state.grid[bestPos.r]) state.grid[bestPos.r] = [];
        const newBubble = createBubble(bestPos.r, bestPos.c, p.colorIndex);
        state.grid[bestPos.r][bestPos.c] = newBubble;
        
        if (!processMatches(newBubble)) {
            state.shotsUntilNextRow--;
            if (state.shotsUntilNextRow <= 0) {
                addRow();
                state.shotsUntilNextRow = config[state.difficulty].shotsToAddRow;
            }
        }
        generateShooterBubbles();
        updateUI();
    }
    
    function gameLoop() {
        if (!state.isPaused && !state.isGameOver) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (state.projectile) {
                const speed = canvas.height / 60;
                state.projectile.x += Math.cos(state.projectile.angle) * speed;
                state.projectile.y += Math.sin(state.projectile.angle) * speed;
                if (state.projectile.x < state.bubbleRadius || state.projectile.x > canvas.width - state.bubbleRadius) {
                    state.projectile.angle = Math.PI - state.projectile.angle;
                }
                drawBubble(state.projectile, state.projectile.x, state.projectile.y);
                if (state.projectile.y < state.bubbleRadius) {
                    snapProjectile();
                } else {
                    for (const row of state.grid) {
                        for (const bubble of row) {
                            if (bubble && !state.projectile) break;
                            if (bubble && state.projectile) {
                                const {x, y} = getBubbleCoords(bubble);
                                const dx = state.projectile.x - x;
                                const dy = state.projectile.y - y;
                                if (Math.sqrt(dx * dx + dy * dy) < state.bubbleRadius * 1.8) {
                                    snapProjectile();
                                    break;
                                }
                            }
                        }
                        if (!state.projectile) break;
                    }
                }
            }
            
            let animationsFinished = true;
            state.grid.forEach(row => row.forEach(bubble => {
                if (bubble) {
                    const {x,y} = getBubbleCoords(bubble);
                    if (y > canvas.height - state.bubbleRadius) endGame();
                    if (bubble.isPopping) {
                        bubble.animFrame++;
                        if (bubble.animFrame <= 5) animationsFinished = false;
                    }
                    drawBubble(bubble, x, y);
                }
            }));
            
            if (animationsFinished && state.grid.flat().some(b => b && b.isPopping)) {
                state.grid = state.grid.map(row => row.map(b => (b && b.isPopping ? null : b)));
                processFloating();
                sounds.pop.play();
            }
            
            drawShooter();
            ctx.beginPath();
            ctx.moveTo(0, canvas.height - state.bubbleRadius * 2);
            ctx.lineTo(canvas.width, canvas.height - state.bubbleRadius * 2);
            ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 4; ctx.stroke();
        }
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        if(animationFrameId) cancelAnimationFrame(animationFrameId);
        resetState();
        state.difficulty = document.querySelector('.difficulty-btn.selected')?.dataset.difficulty || 'easy';
        state.shotsUntilNextRow = config[state.difficulty].shotsToAddRow;
        switchScreen('game');
        resizeCanvas();
        createGrid();
        updateUI();
        gameLoop();
        startMusic();
    }

    function endGame() {
        if (state.isGameOver) return;
        state.isGameOver = true;
        sounds.bg.pause();
        sounds.gameOver.play();
        ui.finalScore.textContent = state.score;
        modals.gameOver.classList.add('show');
    }
    
    function handleAim(e) {
        if (state.isPaused || state.isGameOver || state.projectile) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const shooterX = canvas.width / 2;
        const shooterY = canvas.height - state.bubbleRadius;
        const angle = Math.atan2(y - shooterY, x - shooterX);
        if(angle > -2.9 && angle < -0.2) state.aimAngle = angle;
    }
    
    function handleShoot() {
        if(state.isPaused || state.isGameOver || !state.shooterBubble || state.projectile) return;
        state.projectile = { 
            ...state.shooterBubble, 
            x: canvas.width / 2, 
            y: canvas.height - state.bubbleRadius,
            angle: state.aimAngle
        };
        sounds.shoot.play();
        state.shooterBubble = state.nextBubble;
        state.nextBubble = createBubble(-1,-1,getBubbleColor());
    }

    function togglePause() {
        state.isPaused = !state.isPaused;
        modals.pause.classList.toggle('show', state.isPaused);
        buttons.pause.innerHTML = state.isPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        if (state.isPaused) { sounds.bg.pause(); } 
        else if(musicStarted) { sounds.bg.play(); }
    }

    buttons.difficulty.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.difficulty.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    buttons.start.addEventListener('click', startGame);
    buttons.pause.addEventListener('click', togglePause);
    buttons.resume.addEventListener('click', togglePause);
    buttons.exit.addEventListener('click', () => { if(animationFrameId) cancelAnimationFrame(animationFrameId); switchScreen('home'); });
    buttons.exitModal.addEventListener('click', () => { if(animationFrameId) cancelAnimationFrame(animationFrameId); switchScreen('home'); });
    buttons.playAgain.addEventListener('click', () => { modals.gameOver.classList.remove('show'); startGame(); });
    
    canvas.addEventListener('mousemove', handleAim);
    canvas.addEventListener('touchmove', handleAim, { passive: true });
    canvas.addEventListener('click', handleShoot);
    canvas.addEventListener('touchend', handleShoot, { passive: true });
    
    window.addEventListener('resize', () => { if (screens.game.classList.contains('active')) { resizeCanvas(); createGrid(); } });
    document.body.addEventListener('click', startMusic, { once: true, capture: true });
    
    buttons.difficulty[0].classList.add('selected');
    resetState();
});
