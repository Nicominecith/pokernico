// Nicominecith Poker - Game Engine
// ===================================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS_CARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// el() ist in app.js definiert

// ===== DECK & CARD OPERATIONS =====
function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS_CARDS) {
      deck.push({ suit: s, rank: r });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardValue(rank) {
  return RANKS_CARDS.indexOf(rank) + 2;
}

// ===== GAME INITIALIZATION =====
function initGame(mode, config = {}) {
  showScreen('game-screen');
  
  // Sicheres Setzen des Modus-Pills
  const modePill = el('game-mode-pill');
  if (modePill) {
    modePill.textContent = mode === 'local' ? 'Lokal vs Bots' : mode === 'ranked' ? 'Ranked' : 'Online';
  }
  el('win-overlay').style.display = 'none';

  // Ermittle konfigurierte Spieleranzahl aus dem Dropdown (Standard: 4)
  let maxPlayers = 4;
  const selectEl = el('ranked-max-players');
  if (mode === 'ranked' && selectEl) {
    maxPlayers = parseInt(selectEl.value) || 4;
  }

  const startBalance = (mode === 'ranked') ? 500 : (userData.balance || 500);
  
  const allBots = [
    { name: 'BluffMaster', style: 'aggressive' },
    { name: 'Caution Joe', style: 'passive' },
    { name: 'WildCard', style: 'wild' },
    { name: 'AlphaBot', style: 'aggressive' },
    { name: 'FoldMachine', style: 'passive' }
  ];

  // Dynamische Spielerliste bauen basierend auf maxPlayers
  const playersList = [
    { name: streamerMode ? 'Anonym' : (userData.username || 'Du'), isHuman: true, stack: startBalance, cards: [], bet: 0, folded: false, allIn: false, seat: 0 }
  ];

  for (let i = 0; i < maxPlayers - 1; i++) {
    playersList.push({
      name: allBots[i].name,
      isHuman: false,
      stack: startBalance,
      cards: [],
      bet: 0,
      folded: false,
      allIn: false,
      seat: i + 1,
      style: allBots[i].style
    });
  }

  gameState = {
    mode,
    deck: [],
    communityCards: [],
    players: playersList,
    pot: 0,
    currentBet: 0,
    phase: 'preflop',
    currentPlayer: 0,
    dealer: 0,
    smallBlind: config.smallBlind || 10,
    bigBlind: (config.smallBlind || 10) * 2,
    rakeRate: config.rakeRate || 0.05,
    rake: 0,
    round: 1,
    log: [],
    eliminatedThisRound: []
  };

  // UI Sitze vorbereiten (Blende ungenutzte Sitze aus)
  for (let i = 0; i < 6; i++) {
    const seatContainer = el('seat-' + i);
    if (seatContainer) {
      if (i < maxPlayers) {
        seatContainer.style.display = 'flex';
      } else {
        seatContainer.style.display = 'none';
      }
    }
  }

  updateGameBalance();
  setupSeats();
  startRound();
}

function setupSeats() {
  gameState.players.forEach((p, i) => {
    if (el('seat-' + i + '-name')) el('seat-' + i + '-name').textContent = p.name;
    if (el('seat-' + i + '-stack')) el('seat-' + i + '-stack').textContent = formatBalance(p.stack) + currencySymbol();
    if (el('seat-' + i + '-bet')) el('seat-' + i + '-bet').style.display = 'none';
    if (el('seat-' + i)) el('seat-' + i).className = 'seat seat-' + i + (p.isHuman ? ' is-player' : '');
    if (el('seat-' + i + '-cards')) el('seat-' + i + '-cards').innerHTML = '';
    if (el('seat-' + i + '-avatar')) {
      el('seat-' + i + '-avatar').textContent = p.isHuman ? (userData.username?.[0]?.toUpperCase() || '?') : '🤖';
    }
  });
}

function startRound() {
  const g = gameState;
  g.deck = createDeck();
  g.communityCards = [];
  g.pot = 0;
  g.rake = 0;
  g.currentBet = g.bigBlind;
  g.phase = 'preflop';
  g.eliminatedThisRound = [];
  
  g.players.forEach(p => { 
    p.cards = []; 
    p.bet = 0; 
    p.folded = p.stack <= 0; // Wer pleite ist, ist dauerhaft gefaltet/raus
    p.allIn = false; 
  });

  // Nächsten lebendigen Dealer finden
  let safety = 0;
  do {
    g.dealer = (g.dealer + 1) % g.players.length;
    safety++;
  } while (g.players[g.dealer].stack <= 0 && safety < g.players.length);

  // Blinds bestimmen
  let sb = (g.dealer + 1) % g.players.length;
  while (g.players[sb].stack <= 0) sb = (sb + 1) % g.players.length;
  
  let bb = (sb + 1) % g.players.length;
  while (g.players[bb].stack <= 0) bb = (bb + 1) % g.players.length;

  positionDealerBtn(g.dealer);

  // Karten austeilen
  g.players.forEach(p => { 
    if (p.stack > 0) p.cards = [g.deck.pop(), g.deck.pop()]; 
  });

  // Blinds setzen
  placeBet(g.players[sb], g.smallBlind);
  placeBet(g.players[bb], g.bigBlind);

  addLog(`--- Runde ${g.round} ---`, 'phase');
  addLog(`${g.players[sb].name} zahlt Small Blind (${g.smallBlind}€)`, 'action');
  addLog(`${g.players[bb].name} zahlt Big Blind (${g.bigBlind}€)`, 'action');

  renderTable();
  renderPlayerCards();
  updateRakeInfo();

  g.currentPlayer = (bb + 1) % g.players.length;
  while (g.players[g.currentPlayer].folded || g.players[g.currentPlayer].stack <= 0) {
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
  }

  updateGameBalance();
  nextPlayerTurn();
}

function positionDealerBtn(seatIdx) {
  const dBtn = el('dealer-btn');
  if (!dBtn) return;
  dBtn.style.display = 'block';
  const positions = [
    { bottom: '60px', left: '50%', transform: 'translateX(-10px)' },
    { left: '20px', top: '50%', transform: 'translateY(-10px)' },
    { top: '60px', left: '50%', transform: 'translateX(20px)' },
    { right: '20px', top: '50%', transform: 'translateY(20px)' },
    { bottom: '120px', left: '20%' }, // Erweiterte Sitze Fallback
    { bottom: '120px', right: '20%' }
  ];
  const pos = positions[seatIdx] || positions[0];
  Object.assign(dBtn.style, pos);
}

function placeBet(player, amount) {
  const actual = Math.min(amount, player.stack);
  player.stack -= actual;
  player.bet += actual;
  
  // Rake nur berechnen, wenn kein Ranked-Modus aktiv ist
  const rake = (gameState.mode !== 'ranked' && actual > 20) ? Math.floor(actual * gameState.rakeRate) : 0;
  gameState.rake += rake;
  gameState.pot += actual - rake;
  
  if (player.stack === 0) player.allIn = true;
  updateRakeInfo();
}

// ===== RENDERING =====
function renderTable() {
  const g = gameState;
  if (el('pot-display')) el('pot-display').textContent = formatBalance(g.pot) + currencySymbol();
  if (el('game-phase-pill')) {
    el('game-phase-pill').textContent = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' }[g.phase] || g.phase;
  }

  const cc = el('community-cards');
  if (cc) cc.innerHTML = g.communityCards.map(c => renderCard(c)).join('');

  g.players.forEach((p, i) => {
    if (el('seat-' + i + '-stack')) el('seat-' + i + '-stack').textContent = formatBalance(p.stack) + currencySymbol();
    const betEl = el('seat-' + i + '-bet');
    if (betEl) {
      if (p.bet > 0) {
        betEl.style.display = 'block';
        betEl.textContent = p.bet + '€';
      } else {
        betEl.style.display = 'none';
      }
    }
    if (el('seat-' + i)) {
      el('seat-' + i).classList.toggle('active-turn', i === g.currentPlayer && !p.folded);
      el('seat-' + i).classList.toggle('folded', p.folded);
    }
  });
}

function renderPlayerCards() {
  const g = gameState;
  g.players.forEach((p, i) => {
    const container = el('seat-' + i + '-cards');
    if (!container) return;
    if (p.folded || p.stack <= 0) {
      container.innerHTML = '';
      return;
    }
    if (p.isHuman) {
      container.innerHTML = p.cards.map(c => renderCard(c)).join('');
    } else {
      container.innerHTML = p.cards.map(() => renderCardBack()).join('');
    }
  });
}

function renderCard(card) {
  if (!card) return '';
  const isRed = card.suit === '♥' || card.suit === '♦';
  return `<div class="playing-card ${isRed ? 'red-card' : 'black-card'} deal-in">
    <div class="card-corner">${card.rank}<br>${card.suit}</div>
    <div class="card-center">${card.suit}</div>
  </div>`;
}

function renderCardBack() {
  return `<div class="playing-card card-back deal-in"></div>`;
}

// ===== PLAYER TURNS =====
function nextPlayerTurn() {
  const g = gameState;
  let found = false;
  
  for (let tries = 0; tries < g.players.length; tries++) {
    const p = g.players[g.currentPlayer];
    if (!p.folded && !p.allIn && p.stack > 0) {
      found = true;
      break;
    }
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
  }

  if (!found || allActiveFolded()) {
    endRound('fold');
    return;
  }

  const p = g.players[g.currentPlayer];
  renderTable();

  if (p.isHuman) {
    showPlayerActions();
  } else {
    hidePlayerActions();
    const delay = settings.fastplay ? 600 : (1200 + Math.random() * 800);
    setTimeout(() => botAction(g.currentPlayer), delay);
  }
}

function allActiveFolded() {
  const active = gameState.players.filter(p => !p.folded);
  return active.length === 1;
}

function showPlayerActions() {
  const g = gameState;
  const me = g.players[0];
  if (me.folded || me.allIn) {
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
    checkPhaseEnd();
    return;
  }

  const toCall = g.currentBet - me.bet;

  if (el('action-prompt')) el('action-prompt').textContent = `Du bist dran — `;
  if (el('current-bet-display')) {
    el('current-bet-display').textContent = toCall > 0 ? `Callbetrag: ${toCall}€` : 'Kein offener Einsatz';
  }

  if (el('btn-check')) el('btn-check').style.display = toCall === 0 ? 'block' : 'none';
  if (el('btn-call')) {
    el('btn-call').style.display = toCall > 0 ? 'block' : 'none';
    el('btn-call').textContent = `Call ${toCall}€`;
  }

  const slider = el('bet-slider');
  if (slider) {
    const minRaise = g.currentBet > 0 ? g.currentBet + g.bigBlind : g.bigBlind;
    slider.min = Math.min(minRaise, me.stack);
    slider.max = Math.max(me.stack, slider.min);
    slider.value = Math.min(me.stack, minRaise);
    if (el('bet-value-display')) el('bet-value-display').textContent = slider.value + '€';
  }

  if (el('action-buttons')) {
    el('action-buttons').style.opacity = '1';
    el('action-buttons').style.pointerEvents = 'auto';
  }

  startTimer(30);
}

function hidePlayerActions() {
  if (el('action-buttons')) {
    el('action-buttons').style.opacity = '0.4';
    el('action-buttons').style.pointerEvents = 'none';
  }
  if (el('action-prompt')) el('action-prompt').textContent = 'Bot denkt nach...';
  if (el('current-bet-display')) el('current-bet-display').textContent = '';
}

function updateBetDisplay(val) {
  if (el('bet-value-display')) el('bet-value-display').textContent = val + '€';
}

function playerAction(action) {
  clearTimer();
  const g = gameState;
  const me = g.players[0];

  if (action === 'fold') {
    me.folded = true;
    addLog('Du: Fold', 'action');
  } else if (action === 'check') {
    addLog('Du: Check', 'action');
  } else if (action === 'call') {
    const toCall = Math.min(g.currentBet - me.bet, me.stack);
    placeBet(me, toCall);
    addLog(`Du: Call ${toCall}€`, 'action');
  } else if (action === 'raise') {
    const total = parseInt(el('bet-slider').value) || g.bigBlind;
    const raiseAmount = Math.max(0, total - me.bet);
    placeBet(me, Math.min(raiseAmount, me.stack));
    g.currentBet = me.bet;
    addLog(`Du: Raise auf ${me.bet}€`, 'action');
  } else if (action === 'allin') {
    const amount = me.stack;
    placeBet(me, amount);
    if (me.bet > g.currentBet) g.currentBet = me.bet;
    addLog(`Du: ALL-IN ${amount}€`, 'action');
    toast('💥 All-In!', 'info');
  }

  renderTable();
  g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
  checkPhaseEnd();
}

function botAction(seatIdx) {
  const g = gameState;
  const bot = g.players[seatIdx];
  if (bot.folded || bot.allIn || bot.stack <= 0) {
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
    checkPhaseEnd();
    return;
  }

  const toCall = g.currentBet - bot.bet;
  const style = bot.style;
  const rand = Math.random();
  let action = 'check';

  if (style === 'aggressive') {
    if (rand < 0.15) action = 'fold';
    else if (rand < 0.4) action = 'raise';
    else if (toCall > 0) action = 'call';
    else action = 'check';
  } else if (style === 'passive') {
    if (rand < 0.2 && toCall > 0) action = 'fold';
    else if (rand < 0.05) action = 'raise';
    else if (toCall > 0) action = 'call';
    else action = 'check';
  } else {
    if (rand < 0.1) action = 'fold';
    else if (rand < 0.3) action = 'raise';
    else if (rand < 0.6 && toCall > 0) action = 'call';
    else if (rand < 0.02) action = 'allin';
    else action = toCall > 0 ? 'call' : 'check';
  }

  if (action === 'call' && toCall === 0) action = 'check';
  if (action === 'raise' && bot.stack < g.bigBlind) action = toCall > 0 ? 'fold' : 'check';

  if (action === 'fold') {
    bot.folded = true;
    addLog(`${bot.name}: Fold`, 'action');
  } else if (action === 'check') {
    addLog(`${bot.name}: Check`, 'action');
  } else if (action === 'call') {
    const actual = Math.min(toCall, bot.stack);
    placeBet(bot, actual);
    addLog(`${bot.name}: Call ${actual}€`, 'action');
  } else if (action === 'raise') {
    const toCallAmount = Math.max(0, g.currentBet - bot.bet);
    const extra = Math.min(Math.floor(g.bigBlind * (1 + rand * 3)), Math.max(0, bot.stack - toCallAmount));
    const amount = Math.min(bot.stack, toCallAmount + Math.max(extra, g.bigBlind));
    placeBet(bot, amount);
    if (bot.bet > g.currentBet) g.currentBet = bot.bet;
    addLog(`${bot.name}: Raise auf ${bot.bet}€`, 'action');
  } else if (action === 'allin') {
    placeBet(bot, bot.stack);
    if (bot.bet > g.currentBet) g.currentBet = bot.bet;
    addLog(`${bot.name}: ALL-IN`, 'action');
  }

  renderTable();
  g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
  checkPhaseEnd();
}

function checkPhaseEnd() {
  const g = gameState;

  if (allActiveFolded()) {
    endRound('fold');
    return;
  }

  const activePlayers = g.players.filter(p => !p.folded && !p.allIn && p.stack > 0);
  const allCalled = activePlayers.every(p => p.bet === g.currentBet);

  if (allCalled || activePlayers.length === 0) {
    advancePhase();
    return;
  }

  let safetyCount = 0;
  while ((g.players[g.currentPlayer].folded || g.players[g.currentPlayer].allIn || g.players[g.currentPlayer].stack <= 0) && safetyCount < g.players.length) {
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
    safetyCount++;
  }
  nextPlayerTurn();
}

function advancePhase() {
  const g = gameState;
  g.players.forEach(p => { p.bet = 0; });
  g.currentBet = 0;

  if (g.phase === 'preflop') {
    g.phase = 'flop';
    g.communityCards.push(g.deck.pop(), g.deck.pop(), g.deck.pop());
    addLog('--- Flop ---', 'phase');
  } else if (g.phase === 'flop') {
    g.phase = 'turn';
    g.communityCards.push(g.deck.pop());
    addLog('--- Turn ---', 'phase');
  } else if (g.phase === 'turn') {
    g.phase = 'river';
    g.communityCards.push(g.deck.pop());
    addLog('--- River ---', 'phase');
  } else if (g.phase === 'river') {
    g.phase = 'showdown';
    endRound('showdown');
    return;
  }

  renderTable();
  g.currentPlayer = (g.dealer + 1) % g.players.length;
  
  let safetyCount = 0;
  while ((g.players[g.currentPlayer].folded || g.players[g.currentPlayer].allIn || g.players[g.currentPlayer].stack <= 0) && safetyCount < g.players.length) {
    g.currentPlayer = (g.currentPlayer + 1) % g.players.length;
    safetyCount++;
  }
  nextPlayerTurn();
}

// ===== HAND EVALUATION =====
function handRank(cards) {
  let vals = cards.map(c => cardValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  
  const rankCount = {};
  vals.forEach(v => { rankCount[v] = (rankCount[v] || 0) + 1; });
  const counts = Object.values(rankCount).sort((a, b) => b - a);
  const isFlush = new Set(suits).size === 1;
  
  let isStraight = false;
  let uniqueVals = Array.from(new Set(vals));
  if (uniqueVals.length >= 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      isStraight = true;
    } else if (uniqueVals.includes(14) && uniqueVals.includes(2) && uniqueVals.includes(3) && uniqueVals.includes(4) && uniqueVals.includes(5)) {
      isStraight = true;
      vals = [5, 4, 3, 2, 14]; 
    }
  }
  
  const isRoyalStraight = isStraight && vals.includes(14) && vals.includes(10) && !vals.includes(5);

  if (isFlush && isRoyalStraight) return { rank: 9, name: 'Royal Flush', score: 9000 + vals[0] };
  if (isFlush && isStraight) return { rank: 8, name: 'Straight Flush', score: 8000 + vals[0] };
  if (counts[0] === 4) return { rank: 7, name: 'Vierling', score: 7000 + vals[0] };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, name: 'Full House', score: 6000 + vals[0] };
  if (isFlush) return { rank: 5, name: 'Flush', score: 5000 + vals[0] };
  if (isStraight) return { rank: 4, name: 'Straight', score: 4000 + vals[0] };
  if (counts[0] === 3) return { rank: 3, name: 'Drilling', score: 3000 + vals[0] };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, name: 'Zwei Paare', score: 2000 + vals[0] };
  if (counts[0] === 2) return { rank: 1, name: 'Ein Paar', score: 1000 + vals[0] };
  return { rank: 0, name: 'High Card', score: vals[0] };
}

function bestHand(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 5) return handRank(all);
  let best = null;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const five = all.filter((_, k) => k !== i && k !== j);
      const hr = handRank(five);
      if (!best || hr.score > best.score) best = hr;
    }
  }
  return best;
}

function endRound(reason) {
  const g = gameState;
  clearTimer();
  const active = g.players.filter(p => !p.folded);

  let winner;
  if (reason === 'fold' || active.length === 1) {
    winner = active[0];
  } else {
    let bestScore = -1;
    active.forEach(p => {
      const hand = bestHand(p.cards, g.communityCards);
      p._hand = hand;
      if (hand.score > bestScore) {
        bestScore = hand.score;
        winner = p;
      }
    });
    g.players.forEach((p, i) => {
      if (!p.isHuman && !p.folded && el('seat-' + i + '-cards')) {
        el('seat-' + i + '-cards').innerHTML = p.cards.map(c => renderCard(c)).join('');
      }
    });
  }

  winner.stack += g.pot;
  addLog(`🏆 ${winner.name} gewinnt ${g.pot}€!`, 'win');

  const isHumanWinner = winner.isHuman;
  el('win-title').textContent = isHumanWinner ? '🎉 Du gewinnst!' : `${winner.name} gewinnt!`;
  el('win-amount').textContent = (isHumanWinner ? '+' : '') + g.pot + '€';
  el('win-amount').style.color = isHumanWinner ? 'var(--green-light)' : 'var(--red-light)';
  el('win-hand').textContent = winner._hand ? winner._hand.name : '';
  el('win-overlay').style.display = 'flex';

  // ===== DYNAMISCHE RANKED PUNKTE VERTEILUNG =====
  if (currentUser) {
    const updates = {};
    const humanPlayer = g.players[0];

    if (g.mode === 'ranked') {
      // Prüfe, wie viele Spieler noch Chips haben
      const playersAlive = g.players.filter(p => p.stack > 0);
      
      if (playersAlive.length === 1 && playersAlive[0].isHuman) {
        // Human hat das gesamte Match gewonnen (1. Platz)
        const pts = 50;
        updates.rankedPoints = Math.max(0, (userData.rankedPoints || 0) + pts);
        toast(`🏆 Match-Sieg! +${pts} Ranked-Punkte!`, 'info');
      } else if (humanPlayer.stack <= 0) {
        // Human ist ausgeschieden. Platzierung berechnen:
        const totalPlayersCount = g.players.length;
        const aliveCount = playersAlive.length; 
        
        // Wenn nur noch einer lebt, wurde man Zweiter
        if (aliveCount === 1) {
          const pts = 25; // 2. Platz laut Modal
          updates.rankedPoints = Math.max(0, (userData.rankedPoints || 0) + pts);
          toast(`🥈 2. Platz! +${pts} Ranked-Punkte!`, 'info');
        } else {
          const pts = -10; // Ausscheiden davor
          updates.rankedPoints = Math.max(0, (userData.rankedPoints || 0) + pts);
          toast(`❌ Ausgeschieden! ${pts} Ranked-Punkte`, 'warning');
        }
      }
    } else {
      // Normaler Modus speichert Kontostand
      updates.balance = humanPlayer.stack;
    }

    updates.gamesPlayed = (userData.gamesPlayed || 0) + 1;
    if (isHumanWinner) {
      updates.gamesWon = (userData.gamesWon || 0) + 1;
      updates.winStreak = (userData.winStreak || 0) + 1;
    } else if (humanPlayer.stack <= 0) {
      updates.winStreak = 0;
    }

    Object.assign(userData, updates);
    saveUserData(updates);
  }

  updateGameBalance();
  g.round++;
}

function nextRound() {
  el('win-overlay').style.display = 'none';
  const g = gameState;
  const alive = g.players.filter(p => p.stack > 0);
  
  if (alive.length < 2) {
    toast('Spiel vorbei!', 'info');
    leaveGame();
    return;
  }
  
  // Wenn der menschliche Spieler pleite ist, geht es automatisch zurück ins Menü
  if (g.players[0].stack <= 0) {
    toast('Du hast keine Chips mehr! Spiel beendet.', 'warning');
    leaveGame();
    return;
  }

  startRound();
}

function leaveGame() {
  clearTimer();
  if (typeof publicTablesListener === 'function') publicTablesListener();
  if (currentRoom && currentRoom.id) {
    const tableId = currentRoom.id;
    const type = currentRoom.type;
    const path = type === 'public' ? 'publicTables/' + tableId : 'privateTables/' + tableId;
    const ref = firebase.database().ref(path);
    ref.once('value').then(snap => {
      const room = snap.val();
      if (!room) return;
      const newCount = Math.max(0, (room.players || 1) - 1);
      const updates = { players: newCount, lastActive: Date.now() };
      if (newCount === 0) {
        updates.deleteAt = Date.now() + 30000;
      }
      ref.update(updates);
      if (newCount === 0 && typeof scheduleRoomCleanup === 'function') scheduleRoomCleanup(tableId, type);
    });
  }
  currentRoom = null;
  showScreen('menu-screen');
  updateMenuUI();
}

function updateGameBalance() {
  const me = gameState?.players[0];
  if (!me) return;
  if (el('game-balance')) el('game-balance').textContent = streamerMode ? '????' : formatBalance(me.stack);
  if (el('game-currency')) el('game-currency').textContent = streamerMode ? '' : currencySymbol();
}

function updateRakeInfo() {
  if (!gameState) return;
  const amountEl = el('rake-amount');
  const rateEl = el('rake-rate');
  if (amountEl) amountEl.textContent = formatBalance(gameState.rake) + currencySymbol();
  if (rateEl) rateEl.textContent = Math.round((gameState.rakeRate || 0) * 100) + '%';
}

// ===== TIMER =====
function startTimer(seconds) {
  clearTimer();
  let left = seconds;
  const fill = el('timer-fill');
  if (fill) fill.style.width = '100%';
  
  timerInterval = setInterval(() => {
    left--;
    if (fill) fill.style.width = (left / seconds * 100) + '%';
    if (left <= 0) {
      clearTimer();
      playerAction('fold');
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const fill = el('timer-fill');
  if (fill) fill.style.width = '0%';
}

// ===== GAME LOG =====
function addLog(text, type = 'action') {
  const g = gameState;
  if (!g) return;
  g.log.push({ text, type });
  const log = el('game-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry log-' + type;
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function toggleGameLog() {
  const log = el('game-log');
  if (log) log.style.display = log.style.display === 'none' ? 'flex' : 'none';
}

// ===== BLACKJACK GAME =====
let blackjackState = null;

function initBlackjack() {
  showScreen('blackjack-game');
  const isRanked = gameMode === 'ranked-blackjack';
  const pill = el('blackjack-mode-pill');
  if (pill) pill.textContent = isRanked ? 'Blackjack Ranked' : 'Blackjack';
  
  blackjackState = {
    deck: [],
    dealerHand: [],
    playerHand: [],
    dealerValue: 0,
    playerValue: 0,
    pot: 0,
    bet: 0,
    gameOver: false,
    message: 'Hit oder Stand?',
    dealerRevealed: false,
    mode: gameMode,
    pointsAwarded: false,
  };
  
  blackjackState.deck = createDeck();
  updateBlackjackBalance();
  startBlackjackRound();
}

function startBlackjackRound() {
  const bj = blackjackState;
  bj.deck = createDeck();
  bj.dealerHand = [bj.deck.pop(), bj.deck.pop()];
  bj.playerHand = [bj.deck.pop(), bj.deck.pop()];
  bj.dealerValue = calculateBlackjackValue([bj.dealerHand[0]]);
  bj.playerValue = calculateBlackjackValue(bj.playerHand);
  bj.gameOver = false;
  bj.dealerRevealed = false;
  bj.pointsAwarded = false;
  
  renderBlackjackTable();
  
  if (bj.playerValue === 21) {
    bj.message = '🎉 BLACKJACK!';
    setTimeout(dealerTurnBlackjack, 2000);
  } else {
    bj.message = 'Hit oder Stand?';
  }
}

function calculateBlackjackValue(hand) {
  let val = 0;
  let aces = 0;
  
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      val += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      val += 10;
    } else {
      val += parseInt(card.rank);
    }
  }
  
  while (val > 21 && aces > 0) {
    val -= 10;
    aces--;
  }
  
  return val;
}

function renderBlackjackTable() {
  const bj = blackjackState;
  
  let dealerHTML = '';
  bj.dealerHand.forEach((card, i) => {
    if (i === 0 && !bj.dealerRevealed) {
      dealerHTML += `<div class="playing-card card-back"></div>`;
    } else {
      dealerHTML += `<div class="playing-card ${getCardColor(card.suit)}">${card.rank}${card.suit}</div>`;
    }
  });
  el('blackjack-dealer-hand').innerHTML = dealerHTML;
  
  if (bj.dealerRevealed) {
    el('blackjack-dealer-value').textContent = bj.dealerValue;
  } else {
    el('blackjack-dealer-value').textContent = bj.dealerHand.length > 0 ? calculateBlackjackValue([bj.dealerHand[1]]) : '?';
  }
  
  let playerHTML = '';
  bj.playerHand.forEach(card => {
    playerHTML += `<div class="playing-card ${getCardColor(card.suit)}">${card.rank}${card.suit}</div>`;
  });
  el('blackjack-player-hand').innerHTML = playerHTML;
  el('blackjack-player-value').textContent = bj.playerValue;
  
  el('blackjack-message').textContent = bj.message;
  
  const actionButtons = el('blackjack-buttons');
  if (actionButtons) {
    actionButtons.style.display = 'flex';
    actionButtons.querySelectorAll('.btn').forEach(btn => {
      if (btn.id === 'blackjack-replay-btn') return;
      btn.style.display = bj.gameOver ? 'none' : 'inline-flex';
    });
  }
  const replayBtn = el('blackjack-replay-btn');
  if (replayBtn) {
    replayBtn.style.display = bj.gameOver ? 'inline-flex' : 'none';
  }
}

function getCardColor(suit) {
  return ['♥', '♦'].includes(suit) ? 'red-card' : 'black-card';
}

function blackjackHit() {
  const bj = blackjackState;
  if (bj.gameOver) return;
  
  bj.playerHand.push(bj.deck.pop());
  bj.playerValue = calculateBlackjackValue(bj.playerHand);
  
  if (bj.playerValue > 21) {
    bj.message = '💥 BUST! Du hast verloren.';
    bj.gameOver = true;
    renderBlackjackTable();
    awardBlackjackRankResult();
  } else if (bj.playerValue === 21) {
    bj.message = '21! Dealer zieht...' ;
    renderBlackjackTable();
    setTimeout(dealerTurnBlackjack, 800);
  } else {
    renderBlackjackTable();
  }
}

function blackjackStand() {
  const bj = blackjackState;
  if (bj.gameOver) return;
  
  setTimeout(dealerTurnBlackjack, 500);
}

function dealerTurnBlackjack() {
  const bj = blackjackState;
  bj.dealerRevealed = true;
  bj.dealerValue = calculateBlackjackValue(bj.dealerHand);
  
  while (bj.dealerValue < 17) {
    bj.dealerHand.push(bj.deck.pop());
    bj.dealerValue = calculateBlackjackValue(bj.dealerHand);
  }
  
  if (bj.dealerValue > 21) {
    bj.message = '🎉 Dealer BUST! Du gewinnst!';
  } else if (bj.dealerValue > bj.playerValue) {
    bj.message = '😢 Dealer gewinnt. Viel Glück beim nächsten Mal!';
  } else if (bj.dealerValue === bj.playerValue) {
    bj.message = '🤝 Push! Unentschieden.';
  } else {
    bj.message = '🎉 Du gewinnst!';
  }
  
  bj.gameOver = true;
  renderBlackjackTable();
  awardBlackjackRankResult();
}

function playAgainBlackjack() {
  if (!currentUser) {
    showScreen('menu-screen');
    return;
  }
  startBlackjackRound();
}

function leaveBlackjack() {
  showScreen('menu-screen');
  blackjackState = null;
  gameMode = 'local';
}

function updateBlackjackBalance() {
  const balance = userData.balance || 500;
  el('blackjack-balance').textContent = streamerMode ? '????' : formatBalance(balance);
  el('blackjack-currency').textContent = streamerMode ? '' : currencySymbol();
}

function awardBlackjackRankResult() {
  const bj = blackjackState;
  if (!bj || bj.pointsAwarded || bj.mode !== 'ranked-blackjack' || !currentUser) return;
  bj.pointsAwarded = true;

  let pts = 0;
  if (bj.playerValue > 21) {
    pts = -10;
  } else if (bj.dealerValue > 21 || bj.playerValue > bj.dealerValue) {
    pts = 25;
  } else if (bj.playerValue === bj.dealerValue) {
    pts = 5;
  } else {
    pts = -10;
  }

  const newPts = Math.max(0, (userData.rankedPoints || 0) + pts);
  saveUserData({ rankedPoints: newPts });
  userData.rankedPoints = newPts;
  updateMenuUI();
  if (el('ranking-screen') && el('ranking-screen').classList.contains('active')) {
    updateRankDisplay();
    loadLeaderboard();
  }
  toast(pts > 0 ? `+${pts} Ranked-Punkte!` : pts < 0 ? `${pts} Ranked-Punkte` : 'Unentschieden, keine Punkte.', 'info');
  updateBlackjackBalance();
}