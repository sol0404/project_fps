// DOM 기반 HUD
const $ = (id) => document.getElementById(id);

export function showGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

export function setHealth(hp, max) {
  $('hp-text').textContent = Math.max(0, Math.ceil(hp));
  const ratio = Math.max(0, hp / max);
  $('hp-fill').style.width = `${ratio * 100}%`;
  $('hp-fill').style.background = ratio > 0.5 ? '#5fe08a' : ratio > 0.25 ? '#ffd23f' : '#ff4655';
}

export function setWeapon(name) {
  $('weapon-name').textContent = name;
}

export function setAmmo(ammo, mag, reloading) {
  $('ammo-text').textContent = reloading ? '재장전…' : `${ammo} / ${mag}`;
}

export function setAbility(ability, color, remaining) {
  $('ability-name').textContent = ability.name;
  $('ability-cd').textContent = remaining > 0 ? `${remaining.toFixed(1)}s` : '준비됨';
  $('ability-box').classList.toggle('ready', remaining <= 0);
  $('ability-box').style.setProperty('--c', color);
}

export function setStatus(text) {
  $('status').textContent = text;
}

let hitTimer;
export function hitmarker(head, kill) {
  const el = $('hitmarker');
  el.className = `show${head ? ' head' : ''}${kill ? ' kill' : ''}`;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { el.className = ''; }, 60);
}

let flashTimer;
export function damageFlash() {
  $('damage-flash').classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => $('damage-flash').classList.remove('show'), 80);
}

export function addKill(killer, victim, head) {
  const el = document.createElement('div');
  el.className = 'kf';
  const k = document.createElement('b');
  k.style.color = killer.color;
  k.textContent = killer.name;
  const v = document.createElement('b');
  v.style.color = victim.color;
  v.textContent = victim.name;
  el.append(k, head ? ' 🎯 ' : ' ✖ ', v);
  $('killfeed').prepend(el);
  setTimeout(() => el.remove(), 5000);
}

export function showDeath(killerName) {
  $('death').classList.remove('hidden');
  $('death').querySelector('h2').textContent = '사망';
  $('death').querySelector('p').textContent = `${killerName}에게 처치당했습니다 · 잠시 후 부활`;
}

export function hideDeath() {
  $('death').classList.add('hidden');
}

export function setLockHint(visible) {
  $('lock-hint').classList.toggle('hidden', !visible);
}

export function showScoreboard(visible, rows, myId) {
  const el = $('scoreboard');
  el.classList.toggle('hidden', !visible);
  if (!visible) return;
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  el.innerHTML = '<table><tr><th>플레이어</th><th>캐릭터</th><th>K</th><th>D</th></tr></table>';
  const table = el.firstChild;
  for (const r of rows) {
    const tr = table.insertRow();
    if (r.id === myId) tr.className = 'me';
    for (const v of [r.name, r.charName, r.kills, r.deaths]) tr.insertCell().textContent = v;
    tr.cells[1].style.color = r.color;
  }
}

export function setPortrait(src, color) {
  $('portrait').src = src;
  $('portrait').style.borderColor = color;
}

export function buildCharacterSelect(characters, thumbnails, onSelect) {
  const list = $('char-list');
  for (const [id, c] of Object.entries(characters)) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.style.setProperty('--c', c.color);
    card.innerHTML = `
      <img class="thumb" src="${thumbnails[id]}" alt="${c.name}" />
      <h3>${c.name}</h3><div class="role">${c.role}</div>
      <div class="stat">체력 ${c.hp} · 속도 ${c.speed}</div>
      <div class="stat">${c.weapon.name} (${c.weapon.damage} 피해)</div>
      <div class="ab">[E] ${c.ability.name} — ${c.ability.desc}</div>`;
    card.onclick = () => {
      list.querySelectorAll('.char-card').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
      onSelect(id);
    };
    list.appendChild(card);
  }
}
