/* game.js - logica del gioco + worker solver */
'use strict';

const W=10, H=10;
const moves = [[3,0],[-3,0],[0,3],[0,-3],[2,2],[2,-2],[-2,2],[-2,-2]];
const boardEl = document.getElementById('board');
const logEl = document.getElementById('log');
const timeoutInput = document.getElementById('timeout');
const modeSelect = document.getElementById('modeSelect');

let grid = Array.from({length:H},()=>Array(W).fill(0));
let fixed = Array.from({length:H},()=>Array(W).fill(false));
let worker = null;

function render(){
  boardEl.innerHTML='';
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const d=document.createElement('div');
    d.className='cell'+(grid[y][x]===0?' empty':'')+(fixed[y][x]? ' fixed':'');
    d.dataset.x=x; d.dataset.y=y;
    d.textContent = grid[y][x]===0 ? '' : grid[y][x];
    d.addEventListener('click', onCellClick);
    d.addEventListener('contextmenu', e=>{ e.preventDefault(); clearCell(x,y); });
    boardEl.appendChild(d);
  }
}

function clearCell(x,y){ 
  grid[y][x]=0; 
  fixed[y][x]=false; 
  render(); 
  clearMessages(); 
}
function clearAll(){ 
  grid = Array.from({length:H},()=>Array(W).fill(0)); 
  fixed = Array.from({length:H},()=>Array(W).fill(false)); 
  render(); 
  clearMessages(); 
}

function clearMessages(){ 
  logEl.textContent='Pronto, puoi inserire il prossimo numero.'; 
  document.querySelectorAll('.cell.suggest').forEach(c=>c.classList.remove('suggest')); 
}

function highlightCell(x,y){ 
  document.querySelectorAll('.cell').forEach(c=>c.classList.remove('suggest')); 
  const idx = y*W+x; 
  const el = boardEl.children[idx]; 
  if(el) el.classList.add('suggest'); 
}

function findMaxPlaced(){ 
  let m=0; 
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) 
    if(grid[y][x]>m) m=grid[y][x]; 
  return m; 
}

function gridToFlat(){ 
  const flat = []; 
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) flat.push(grid[y][x]||0); 
  return flat; 
}

function reachableCellsFrom(posIdx){
  const neighbors = [];
  const x0 = posIdx % W;
  const y0 = Math.floor(posIdx / W);
  for(const m of moves){
    const nx = x0 + m[0], ny = y0 + m[1];
    if(nx>=0 && nx<W && ny>=0 && ny<H) neighbors.push(ny*W+nx);
  }
  return neighbors;
}

function onCellClick(e){
  const x=parseInt(e.currentTarget.dataset.x), y=parseInt(e.currentTarget.dataset.y);
  const currentVal = grid[y][x] || 0;
  const mode = modeSelect ? modeSelect.value : 'classic';

  if(mode === 'classic'){
    const s = prompt('Inserisci numero (1..100) o lascia vuoto per cancellare', currentVal||'');
    if(s===null) return;
    const n = parseInt(s);
    if(!isNaN(n) && n>=1 && n<=100){
      // Cancella duplicati
      for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++) 
        if(grid[yy][xx]===n){ grid[yy][xx]=0; fixed[yy][xx]=false; }
      grid[y][x]=n; fixed[y][x]=true;
    } else {
      grid[y][x]=0; fixed[y][x]=false;
    }
    render(); clearMessages();
  } else if(mode === 'game'){
    const maxN = findMaxPlaced();
    const nextN = maxN + 1;

    if(grid[y][x] !== 0){
      logEl.textContent = 'Questa cella è già occupata.';
      return;
    }
    if(nextN === 1){
      grid[y][x] = 1; fixed[y][x] = true;
      render(); clearMessages();
      return;
    }
    let prevPos = null;
    outer: for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){
      if(grid[yy][xx] === maxN){
        prevPos = yy*W+xx;
        break outer;
      }
    }
    if(prevPos === null){
      logEl.textContent = 'Errore: non trovato il numero precedente.';
      return;
    }
    const reachable = reachableCellsFrom(prevPos);
    const clickedPos = y*W+x;
    if(!reachable.includes(clickedPos)){
      logEl.textContent = 'Puoi inserire il numero ' + nextN + ' solo nelle caselle raggiungibili dalla posizione del numero precedente.';
      return;
    }
    grid[y][x] = nextN;
    fixed[y][x] = true;
    render();
    clearMessages();
  }
}

// --- Worker machinery ---

function solverWorkerCode() {
  self.onmessage = function(ev){
    const data = ev.data; 
    const grid = data.grid; 
    const timeoutMs = data.timeoutMs|0;
    const W = 10, H = 10, N = 100;
    const moves = [[3,0],[-3,0],[0,3],[0,-3],[2,2],[2,-2],[-2,2],[-2,-2]];
    const neighbors = Array(N);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const idx=y*W+x; 
      const arr=[]; 
      for(const m of moves){ 
        const nx=x+m[0], ny=y+m[1]; 
        if(nx>=0&&nx<W&&ny>=0&&ny<H) arr.push(ny*W+nx); 
      } 
      neighbors[idx]=arr; 
    }

    const work = new Int16Array(N);
    const occupied = new Uint8Array(N);
    const posInWork = new Int16Array(N+1); 
    for(let i=0;i<=N;i++) posInWork[i]=-1;

    for(let i=0;i<N;i++){
      const v = grid[i] | 0;
      if(v !== 0){ 
        if(posInWork[v] !== -1){ 
          postMessage({type:'invalid', reason:'duplicate'}); 
          return; 
        } 
        posInWork[v] = i; 
        work[i]=v; 
        occupied[i]=1; 
      }
    }

    for(let n=1;n<100;n++){
      if(posInWork[n]!==-1 && posInWork[n+1]!==-1){
        const a = posInWork[n], b = posInWork[n+1]; 
        let ok=false; 
        const neigh = neighbors[a];
        for(let k=0;k<neigh.length;k++) 
          if(neigh[k]===b){ 
            ok=true; 
            break; 
          }
        if(!ok){ 
          postMessage({type:'impossible', reason:'fixed-adjacency'}); 
          return; 
        }
      }
    }

    const startTime = Date.now(); 
    const deadline = startTime + timeoutMs;
    let timedOut = false; 
    let found=false;

    function dfs(n){
      if(found) return true;
      if(Date.now() > deadline){ timedOut = true; return false; }
      if(n>100){
        const sol = Array.from(work);
        postMessage({type:'solution', solution: sol}); 
        found=true; 
        return true;
      }
      const fixedPos = posInWork[n];
      if(fixedPos !== -1){
        if(n>1){ 
          const prev = posInWork[n-1]; 
          if(prev === -1) return false;
          let ok=false; 
          const neigh = neighbors[prev];
          for(let k=0;k<neigh.length;k++) 
            if(neigh[k]===fixedPos){ 
              ok=true; 
              break; 
            }
          if(!ok) return false;
        }
        return dfs(n+1);
      } else {
        let candidates = null;
        if(n===1){ 
          candidates = []; 
          for(let i=0;i<N;i++) 
            if(!occupied[i]) candidates.push(i); 
        }
        else { 
          const prev = posInWork[n-1]; 
          if(prev === -1) return false; 
          const neigh = neighbors[prev]; 
          candidates = [];
          for(let k=0;k<neigh.length;k++){
            const idx=neigh[k]; 
            if(!occupied[idx]) candidates.push(idx); 
          }
        }
        if(candidates.length===0) return false;
        candidates.sort((a,b)=>{
          let ca=0, cb=0;
          const na = neighbors[a]; 
          for(let k=0;k<na.length;k++) 
            if(!occupied[na[k]]) ca++;
          const nb = neighbors[b]; 
          for(let k=0;k<nb.length;k++) 
            if(!occupied[nb[k]]) cb++;
          return ca - cb;
        });
        for(let i=0;i<candidates.length;i++){
          const idx = candidates[i]; 
          occupied[idx]=1; 
          work[idx]=n; 
          posInWork[n]=idx;
          if(dfs(n+1)) return true;
          occupied[idx]=0; 
          work[idx]=0; 
          posInWork[n]=-1;
          if(Date.now() > deadline){ 
            timedOut = true; 
            return false; 
          }
        }
        return false;
      }
    }

    dfs(1);
    if(timedOut){ postMessage({type:'timeout'}); }
    else if(!found){ postMessage({type:'nosolution'}); }
  };
}

function createSolverWorker(){
  const code = solverWorkerCode.toString();
  const body = code.substring(code.indexOf('{')+1, code.lastIndexOf('}'));
  const blob = new Blob([body], {type:'application/javascript'});
  return new Worker(URL.createObjectURL(blob));
}

function startWorker(gridFlat, timeoutMs, onMessage){
  if(worker){ worker.terminate(); worker=null; }
  worker = createSolverWorker();
  const cancelBtn = document.getElementById('cancelBtn');
  if(cancelBtn) cancelBtn.disabled = false;
  worker.onmessage = function(ev){ onMessage(ev.data); };
  worker.onerror = function(err){ 
    logEl.textContent = 'Errore worker: '+err.message; 
    const cancelBtn = document.getElementById('cancelBtn');
    if(cancelBtn) cancelBtn.disabled = true;
    worker.terminate(); 
    worker=null; 
  };
  worker.postMessage({ grid: gridFlat, timeoutMs: timeoutMs });
}

function terminateWorker(){
  if(worker){
    worker.terminate();
    worker=null;
    const cancelBtn = document.getElementById('cancelBtn');
    if(cancelBtn) cancelBtn.disabled = true;
  }
}

function stopWorker(){
  terminateWorker();
  logEl.textContent='Calcolo annullato.';
}

const cancelBtn = document.getElementById('cancelBtn');
if(cancelBtn) cancelBtn.addEventListener('click', stopWorker);

const clearBtn = document.getElementById('clearBtn');
if(clearBtn) clearBtn.addEventListener('click', () => {
  terminateWorker();
  clearAll();
});

const suggestBtn = document.getElementById('suggestBtn');
if(suggestBtn) suggestBtn.addEventListener('click', () => {
  terminateWorker();
  clearMessages();
  const gridFlat = gridToFlat();
  const timeoutMs = parseInt(timeoutInput.value) || 6000;
  startWorker(gridFlat, timeoutMs, function(data){
    if(data.type === 'solution'){
      const sol = data.solution;
      let nextNum = findMaxPlaced() + 1;
      if(nextNum > 100) {
        logEl.textContent = 'Tutti i numeri sono già inseriti.';
        terminateWorker();
        return;
      }
      let idx = -1;
      // grid.flat() used earlier — let's derive a flat original grid to check empties
      const originalFlat = gridToFlat();
      for(let i=0; i<sol.length; i++){
        if(sol[i] === nextNum && originalFlat[i] === 0){
          idx = i; break;
        }
      }
      if(idx >= 0){
        const y = Math.floor(idx/W), x = idx % W;
        highlightCell(x,y);
        logEl.textContent = `Suggerimento: inserisci ${nextNum} nella casella evidenziata.`;
      } else {
        logEl.textContent = 'Nessun suggerimento trovato.';
      }
      terminateWorker();
    } else if(data.type === 'impossible'){
      logEl.textContent = 'Configurazione impossibile da risolvere.';
      terminateWorker();
    } else if(data.type === 'timeout'){
      logEl.textContent = 'Timeout raggiunto, nessuna soluzione trovata.';
      terminateWorker();
    } else if(data.type === 'invalid'){
      logEl.textContent = 'Configurazione non valida: duplicati presenti.';
      terminateWorker();
    } else if(data.type === 'nosolution'){
      logEl.textContent = 'Nessuna soluzione possibile trovata.';
      terminateWorker();
    }
  });
});

const checkBtn = document.getElementById('checkBtn');
if(checkBtn) checkBtn.addEventListener('click', () => {
  terminateWorker();
  clearMessages();
  const gridFlat = gridToFlat();
  const timeoutMs = parseInt(timeoutInput.value) || 6000;
  startWorker(gridFlat, timeoutMs, function(data){
    if(data.type === 'solution'){
      logEl.textContent = 'La configurazione è risolvibile.';
      terminateWorker();
    } else if(data.type === 'impossible'){
      logEl.textContent = 'Configurazione impossibile da risolvere.';
      terminateWorker();
    } else if(data.type === 'timeout'){
      logEl.textContent = 'Timeout raggiunto, impossibile determinare.';
      terminateWorker();
    } else if(data.type === 'invalid'){
      logEl.textContent = 'Configurazione non valida: duplicati presenti.';
      terminateWorker();
    } else if(data.type === 'nosolution'){
      logEl.textContent = 'Nessuna soluzione possibile trovata.';
      terminateWorker();
    }
  });
});

const completeBtn = document.getElementById('completeBtn');
if(completeBtn) completeBtn.addEventListener('click', () => {
  terminateWorker();
  clearMessages();
  const gridFlat = gridToFlat();
  const timeoutMs = parseInt(timeoutInput.value) || 6000;
  startWorker(gridFlat, timeoutMs, function(data){
    if(data.type === 'solution'){
      const sol = data.solution;
      for(let i=0; i<sol.length; i++){
        const y = Math.floor(i/W);
        const x = i % W;
        grid[y][x] = sol[i];
        fixed[y][x] = true;
      }
      render();
      logEl.textContent = 'Griglia completata con soluzione trovata.';
      terminateWorker();
    } else if(data.type === 'impossible'){
      logEl.textContent = 'Configurazione impossibile da risolvere.';
      terminateWorker();
    } else if(data.type === 'timeout'){
      logEl.textContent = 'Timeout raggiunto, soluzione non trovata.';
      terminateWorker();
    } else if(data.type === 'invalid'){
      logEl.textContent = 'Configurazione non valida: duplicati presenti.';
      terminateWorker();
    } else if(data.type === 'nosolution'){
       logEl.textContent = 'Nessuna soluzione possibile trovata.';
      terminateWorker();
    }
  });
});
