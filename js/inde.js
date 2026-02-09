const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- PALETA DE COLORES (Conversión Pantone TPX a Hex) ---
// Estacionamientos: 13-4303 TPX -> #BDC6CA
// Estudios: 14-1107 TPX -> #D0C7BB
// 1 Rec: 17-1113 TPX -> #938172
// 2 Rec: 18-1112 TPX -> #746559

const CATALOG = {
    "parking_std": { w: 2.5, h: 5.0, label: "Est. Std", color: "#BDC6CA" },
    "parking_compact": { w: 2.1, h: 4.5, label: "Est. Comp", color: "#BDC6CA" },

    "studio_a": { w: 4.0, h: 9.0, label: "Estudio A", color: "#D0C7BB" },
    "studio_b": { w: 5.0, h: 7.2, label: "Estudio B", color: "#D0C7BB" },

    "1bed_a": { w: 5.0, h: 9.0, label: "1 Rec A", color: "rgba(156, 123, 56, 1)" },
    "1bed_b": { w: 6.6, h: 7.2, label: "1 Rec B", color: "rgba(156, 123, 56, 1)" },

    "2bed_a": { w: 7.2, h: 9.0, label: "2 Rec A", color: "#746559" },
    "2bed_b": { w: 6.6, h: 9.6, label: "2 Rec B", color: "#746559" }
};

// --- ESTADO ---
let blocks = [];
let bgImage = null;
let pxPerMeter = 1;

let selectedIdx = null;
let isDragging = false;
let isRotating = false;
let dragOffset = { x: 0, y: 0 };
let startAngle = 0;
let blockStartAngle = 0;
let lastValidPos = null;

let isCalib = false;
let calibPts = [];

// --- HISTORIAL (UNDO/REDO) ---
const history = [];
let historyIndex = -1;

function saveState() {
    // Eliminar estados futuros si estamos en medio del historial
    if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
    }
    history.push(JSON.stringify(blocks));
    historyIndex++;
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        blocks = JSON.parse(history[historyIndex]);
        selectedIdx = null; // Deseleccionar para evitar errores
        draw();
        updateUndoRedoButtons();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        blocks = JSON.parse(history[historyIndex]);
        selectedIdx = null;
        draw();
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    // Opcional: Podríamos habilitar/deshabilitar visualmente los botones aquí si tuvieran IDs
}


// --- LOGICA DE CATALOGO ---
function loadPreset() {
    const key = document.getElementById('catalogSelect').value;
    if (key === "custom") {
        document.getElementById('nLabel').value = "";
        document.getElementById('nColor').value = "#555555"; // Gris genérico para custom
        return;
    }

    const data = CATALOG[key];
    if (data) {
        document.getElementById('nW').value = data.w;
        document.getElementById('nH').value = data.h;
        document.getElementById('nLabel').value = data.label;
        document.getElementById('nColor').value = data.color;
    }
}

// --- FISICA (SAT) ---
function getVertices(b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rad = b.angle * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = b.w / 2, dy = b.h / 2;
    return [
        { x: cx + (dx * cos - dy * sin), y: cy + (dx * sin + dy * cos) },
        { x: cx - (dx * cos - dy * sin), y: cy - (dx * sin + dy * cos) },
        { x: cx + (dx * cos + dy * sin), y: cy + (dx * sin - dy * cos) },
        { x: cx - (dx * cos + dy * sin), y: cy - (dx * sin - dy * cos) }
    ];
}

function checkCollision(b1, b2) {
    const poly1 = getVertices(b1);
    const poly2 = getVertices(b2);
    return polygonsIntersect(poly1, poly2);
}

function polygonsIntersect(a, b) {
    const polygons = [a, b];
    for (let i = 0; i < polygons.length; i++) {
        const polygon = polygons[i];
        for (let j = 0; j < polygon.length; j++) {
            const k = (j + 1) % polygon.length;
            const normal = { x: polygon[k].y - polygon[j].y, y: polygon[j].x - polygon[k].x };
            let minA = Infinity, maxA = -Infinity;
            for (let p of a) {
                const proj = normal.x * p.x + normal.y * p.y;
                if (proj < minA) minA = proj; if (proj > maxA) maxA = proj;
            }
            let minB = Infinity, maxB = -Infinity;
            for (let p of b) {
                const proj = normal.x * p.x + normal.y * p.y;
                if (proj < minB) minB = proj; if (proj > maxB) maxB = proj;
            }
            if (maxA < minB || maxB < minA) return false;
        }
    }
    return true;
}

function isCollidingWithAny(idx) {
    for (let i = 0; i < blocks.length; i++) {
        if (i !== idx && checkCollision(blocks[idx], blocks[i])) return true;
    }
    return false;
}

// --- CREACION Y EDICION ---
function addBlock() {
    const w = parseFloat(document.getElementById('nW').value) * pxPerMeter;
    const h = parseFloat(document.getElementById('nH').value) * pxPerMeter;
    const label = document.getElementById('nLabel').value || "Bloque";
    const color = document.getElementById('nColor').value;

    const newBlock = {
        x: canvas.width / 2 - w / 2,
        y: canvas.height / 2 - h / 2,
        w: w, h: h,
        angle: 0,
        label: label,
        color: color
    };

    blocks.push(newBlock);
    if (isCollidingWithAny(blocks.length - 1)) {
        newBlock.x += 20; newBlock.y += 20;
    }
    saveState(); // Guardar estado
    draw();
}

function duplicateSelected() {
    if (selectedIdx === null) return;
    const original = blocks[selectedIdx];
    const copy = { ...original, x: original.x + 20, y: original.y + 20 };
    blocks.push(copy);
    selectedIdx = blocks.length - 1;
    checkAndFixCollision(selectedIdx);
    saveState(); // Guardar estado
    draw();
}

function checkAndFixCollision(idx) {
    if (isCollidingWithAny(idx)) {
        setStatus("⚠️ Objeto encimado - Movimiento revertido");
        if (lastValidPos) {
            blocks[idx].x = lastValidPos.x;
            blocks[idx].y = lastValidPos.y;
            blocks[idx].angle = lastValidPos.angle;
        }
    }
    draw();
}

// --- DIBUJO ---
function draw() {
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bgImage) {
        // Dibujar imagen con un poco de opacidad si se desea, o normal
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#ccc"; ctx.textAlign = "center"; ctx.font = "20px Segoe UI";
        ctx.fillText("Arrastra aquí tu plano de referencia", canvas.width / 2, canvas.height / 2);
    }

    blocks.forEach((b, i) => {
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate(b.angle * Math.PI / 180);

        const isOverlapping = (i === selectedIdx && (isDragging || isRotating)) ? isCollidingWithAny(i) : false;

        // Relleno sólido con la paleta Pantone
        ctx.fillStyle = isOverlapping ? "rgba(192, 57, 43, 0.8)" : b.color;

        // Aplicar opacidad para ver el plano debajo (0.85 = 85% sólido)
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.globalAlpha = 1.0;

        // Borde elegante
        ctx.lineWidth = (i === selectedIdx) ? 2 : 1;
        ctx.strokeStyle = (i === selectedIdx) ? "#fff" : "rgba(0,0,0,0.3)";
        if (isOverlapping) ctx.strokeStyle = "darkred";
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);

        // Texto (Calculamos contraste simple)
        // Para estos colores tierra, el blanco con sombra negra funciona bien en todos
        ctx.fillStyle = "#fff";
        ctx.font = "600 13px Segoe UI";
        ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 3;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(b.label, 0, 0);

        // Indicador de "frente" sutil
        if (i === selectedIdx) {
            ctx.beginPath(); ctx.moveTo(0, -b.h / 2); ctx.lineTo(0, -b.h / 2 - 20);
            ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -b.h / 2 - 20, 4, 0, Math.PI * 2); ctx.fillStyle = "white"; ctx.fill();
        }
        ctx.restore();
    });

    if (isCalib) {
        ctx.fillStyle = "#c0392b";
        calibPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
        // Linea guía
        if (calibPts.length === 2) {
            ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(calibPts[0].x, calibPts[0].y); ctx.lineTo(calibPts[1].x, calibPts[1].y); ctx.stroke();
        }
    }
}

// --- INTERACCION ---
function getMouse(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function hitTest(m, b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rad = -b.angle * Math.PI / 180;
    const dx = m.x - cx, dy = m.y - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return (rx >= -b.w / 2 && rx <= b.w / 2 && ry >= -b.h / 2 && ry <= b.h / 2);
}

canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    const m = getMouse(e);
    console.log("click: ", m);
    if (isCalib) {
        calibPts.push(m);
        draw();
        if (calibPts.length === 2) {
            const dist = Math.hypot(calibPts[1].x - calibPts[0].x, calibPts[1].y - calibPts[0].y);
            // Pequeño timeout para que se dibuje el segundo punto antes del alert
            setTimeout(() => {
                const val = prompt("¿Cuántos METROS representa esa línea roja?", "10");
                if (val && !isNaN(val)) {
                    pxPerMeter = dist / parseFloat(val);
                    document.getElementById('scale-lbl').innerText = `1m = ${pxPerMeter.toFixed(2)} px`;
                    setStatus("Escala calibrada correctamente.");
                } else {
                    setStatus("Calibración cancelada.");
                }
                isCalib = false; canvas.style.cursor = "default"; calibPts = []; draw();
            }, 50);
        }
        return;
    }

    let clicked = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        if (hitTest(m, blocks[i])) { clicked = i; break; }
    }

    if (clicked !== null) {
        selectedIdx = clicked;
        document.getElementById('edit-panel').style.display = 'block';
        document.getElementById('eLabel').value = blocks[selectedIdx].label;
        lastValidPos = { ...blocks[selectedIdx] };

        if (e.button === 2) {
            isRotating = true;
            const cx = blocks[clicked].x + blocks[clicked].w / 2;
            const cy = blocks[clicked].y + blocks[clicked].h / 2;
            startAngle = Math.atan2(m.y - cy, m.x - cx) * 180 / Math.PI;
            blockStartAngle = blocks[clicked].angle;
            setStatus("🔄 Rotando... (Suelta para terminar)");
        } else {
            isDragging = true;
            dragOffset = { x: m.x - blocks[clicked].x, y: m.y - blocks[clicked].y };
            setStatus("🤚 Moviendo...");
        }
    } else {
        selectedIdx = null;
        document.getElementById('edit-panel').style.display = 'none';
    }
    draw();
});

canvas.addEventListener('mousemove', e => {
    const m = getMouse(e);
    if (isDragging && selectedIdx !== null) {
        blocks[selectedIdx].x = m.x - dragOffset.x;
        blocks[selectedIdx].y = m.y - dragOffset.y;
        draw();
    } else if (isRotating && selectedIdx !== null) {
        const cx = blocks[selectedIdx].x + blocks[selectedIdx].w / 2;
        const cy = blocks[selectedIdx].y + blocks[selectedIdx].h / 2;
        const currentAngle = Math.atan2(m.y - cy, m.x - cx) * 180 / Math.PI;
        blocks[selectedIdx].angle = blockStartAngle + (currentAngle - startAngle);
        draw();
    }
});

canvas.addEventListener('mouseup', () => {
    if (selectedIdx !== null && (isDragging || isRotating)) {
        checkAndFixCollision(selectedIdx);
        saveState(); // Guardar estado tras mover/rotar
    }
    isDragging = false; isRotating = false; setStatus("Listo.");
});

document.getElementById('upload').addEventListener('change', e => {
    const r = new FileReader();
    r.onload = ev => {
        bgImage = new Image();
        bgImage.onload = () => draw();
        bgImage.src = ev.target.result;
    };
    r.readAsDataURL(e.target.files[0]);
});

function startCalibration() {
    if (!bgImage) return alert("Carga imagen"); isCalib = true; calibPts = []; canvas.style.cursor = "crosshair";
    setStatus("Haz clic en punto A y luego en punto B");
}
function updateBlockData() {
    if (selectedIdx !== null) {
        blocks[selectedIdx].label = document.getElementById('eLabel').value;
        draw();
        // Nota: No guardamos estado en cada tecla para no saturar historial. 
        // Podríamos agregar onchange al input si fuera necesario.
    }
}
function deleteSelected() {
    if (selectedIdx !== null) {
        blocks.splice(selectedIdx, 1);
        selectedIdx = null;
        document.getElementById('edit-panel').style.display = 'none';
        saveState(); // Guardar estado
        draw();
    }
}
function clearAll() {
    if (confirm("¿Eliminar todos los bloques?")) {
        blocks = [];
        saveState(); // Guardar estado 
        draw();
    }
}
function downloadImage() {
    selectedIdx = null;
    draw();
    const l = document.createElement('a');
    l.download = 'fit_test_plano.png';
    l.href = canvas.toDataURL();
    l.click();
}

function setStatus(msg) {
    document.getElementById('status').innerText = msg;
}
canvas.oncontextmenu = (e) => e.preventDefault();
draw();
saveState(); // Guardar estado inicial