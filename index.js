// Budget : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Budget</span><span class=\"hint\">clic sur un montant : écrire le solde de ta banque</span></div>\n      <div class=\"sysGrid\" id=\"bdTiles\"></div>\n      <div class=\"sysCard px\"><span class=\"label\">Ajouter une opération</span>\n        <div class=\"bdForm\">\n          <select class=\"f\" id=\"bdKind\"><option value=\"depense\">Dépense</option><option value=\"rentree\">Rentrée d'argent</option><option value=\"virement\">Virement</option></select>\n          <select class=\"f\" id=\"bdAcc\" title=\"Compte\"></select>\n          <select class=\"f\" id=\"bdTo\" title=\"Compte qui reçoit\"></select>\n          <input class=\"f\" id=\"bdLabel\" placeholder=\"Libellé (facultatif : courses, salaire…)\" spellcheck=\"false\">\n          <input class=\"f\" id=\"bdAmount\" placeholder=\"Montant €\" inputmode=\"decimal\">\n          <button class=\"btn main px\" id=\"bdAdd\">Ajouter</button>\n        </div>\n      </div>\n      <div class=\"stCols\">\n        <div class=\"sysCard px\"><span class=\"label\">Dernières opérations</span><div id=\"bdTx\"></div></div>\n        <div class=\"sysCard px\"><span class=\"label\">Prévoir mon épargne</span>\n          <div class=\"bdPlan\">Je mets de côté <input class=\"f\" id=\"bdPlanMonthly\" inputmode=\"decimal\" placeholder=\"150\"> € par mois sur le <select class=\"f\" id=\"bdPlanTo\"></select></div>\n          <div class=\"bdPlan\">Objectif (facultatif) <input class=\"f\" id=\"bdPlanTarget\" inputmode=\"decimal\" placeholder=\"ex : 3000\"> €</div>\n          <div id=\"bdPlanOut\"></div>\n          <span class=\"label\" style=\"margin-top:6px\">Livrets · 12 prochains mois</span>\n          <div id=\"bdChart\" class=\"colChart\"></div>\n        </div>\n      </div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.bdForm{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#bdKind{width:170px}
#bdAcc,#bdTo{width:190px}
#bdLabel{flex:1;min-width:200px}
#bdAmount{width:120px}
.bdBal{cursor:text}
.bdBal:hover{color:var(--pink)}
.bdBalInput{font:20px var(--title);padding:6px 10px}
.bdPlan{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:16px;color:var(--lilac)}
.bdPlan .f{width:110px;font-size:15px;padding:7px 10px}
.bdPlan select.f{width:160px}
#bdPlanOut .advice{display:block}
.bdForm .f{font-size:15px;padding:9px 12px}
.bdForm .btn{height:40px}
.advice{display:flex;gap:12px;align-items:baseline;padding:7px 0;font-size:15px;line-height:1.45;color:var(--lilac)}
.advice+.advice{border-top:1px solid rgba(255,255,255,.06)}
.advice .badge{flex:none;min-width:84px;text-align:center}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = ctx.host;
  const nbConfirm = ctx.host.confirm;  // la boîte de confirmation de NeoBase, à la place de celle de Windows
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "budgetApp" ? view : view.querySelector('#' + id);  // les identifiants de ta vue, sans toucher à ceux du reste de NeoBase
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const LEGACY_API = ["budget"];
  const api = async (n, data) => {
    if (data !== undefined) { await folder.write(n, data); return true; }
    let v = await doc(n);
    if (v == null && legacy.api && LEGACY_API.includes(n)) { v = await legacy.api(n).catch(() => null); if (v != null) await folder.write(n, v); }  // première ouverture : tu retrouves tes données d'avant
    return v;
  };
  // ---- ton code d'origine ----
  /* ---------- Budget app, kept simple: budget.json = {accounts: [{id, name, balance, cap}], ops: [{id, date, acc, label, amount, group}], plan: {monthly, to, target}}
     balance is the account's current balance: adding an operation changes it right away, deleting the operation undoes it.
     A transfer is two operations sharing a `group` (minus on one account, plus on the other). ---------- */
  // ceilings set by law for these two livrets
  const BD_ACCOUNTS = [{id: 'courant', name: 'Compte principal', balance: 0}, {id: 'livretA', name: 'Livret A', balance: 0, cap: 22950}, {id: 'livretJeune', name: 'Livret Jeune', balance: 0, cap: 1600}];
  let budget = null;
  const saveBudget = () => api('budget', budget).catch(e => toast('Sauvegarde du budget impossible : ' + e.message, true));
  function loadBudget(d) {
    budget = d?.ops ? d : {accounts: BD_ACCOUNTS.map(a => ({...a})), ops: [], plan: {monthly: 150, to: 'livretJeune', target: 0}};  // older formats held no money yet
  }
  api('budget').then(d => { loadBudget(d); if (!(!view.classList.contains('on'))) renderBudget(); }).catch(e => toast('Budget indisponible : ' + e.message, true));
  const eur = v => v.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'});
  const money = s => { const v = parseFloat(String(s).replace(/[\s  €]/g, '').replace(',', '.')); return isFinite(v) ? Math.round(v * 100) / 100 : NaN; };
  const accOf = id => budget.accounts.find(a => a.id === id);
  const livrets = () => budget.accounts.filter(a => a.cap);
  const r2 = v => Math.round(v * 100) / 100;
  // savings forecast: `monthly` € a month on `to`; a full livret overflows into the other one. -> [{m: 'YYYY-MM', bal: {id: €}, total}]
  function forecast(months = 12) {
    const bal = Object.fromEntries(livrets().map(a => [a.id, a.balance])), out = [], {monthly, to} = budget.plan, d = new Date();
    for (let i = 1; i <= months; i++) {
      let left = monthly;
      for (const a of [accOf(to), ...livrets().filter(a => a.id !== to)].filter(Boolean)) {
        const put = Math.min(left, Math.max(0, a.cap - bal[a.id])); bal[a.id] = r2(bal[a.id] + put); left = r2(left - put);
      }
      d.setDate(15); d.setMonth(d.getMonth() + 1);
      out.push({m: ymd(d).slice(0, 7), bal: {...bal}, total: r2(Object.values(bal).reduce((s, v) => s + v, 0)), left});
    }
    return out;
  }
  {  // self-check: money parsing and the overflow of a full Livret Jeune into the Livret A
    const keep = budget;
    loadBudget(null); budget.accounts[2].balance = 1500; budget.plan = {monthly: 150, to: 'livretJeune', target: 0};
    const f = forecast(2);
    console.assert(f[0].bal.livretJeune === 1600 && f[0].bal.livretA === 50 && f[1].bal.livretA === 200 && f[1].total === 1800, 'forecast');
    console.assert(money('12,50 €') === 12.5 && money('1 234,5') === 1234.5 && isNaN(money('abc')), 'money');
    budget = keep;
  }
  const monthLong = m => new Date(m + '-15').toLocaleDateString('fr-FR', {month: 'long', year: 'numeric'});

  function renderBudget() {
    if (!budget) return;
    // accounts: click the amount to type the balance shown by the bank, right there (Enter or click elsewhere: saved, Escape: cancelled)
    const tile = a => {
      const c = el('div', 'sysCard px'), big = el('div', 'sysBig bdBal', eur(a.balance));
      c.append(el('span', 'label', a.name), big);
      if (a.cap) { const bar = el('div', 'dlBar'), f = el('i'); f.style.width = Math.min(100, a.balance / a.cap * 100) + '%'; bar.append(f); c.append(bar, el('div', 'hint', 'plafond ' + eur(a.cap) + (a.balance >= a.cap ? ' · plein' : ' · encore ' + eur(a.cap - a.balance)))); }
      else c.append(el('div', 'hint', 'clic sur le montant : le modifier'));
      big.title = 'Clic : écrire le solde affiché par ta banque';
      big.onclick = () => {
        const inp = el('input', 'f bdBalInput');
        inp.value = String(a.balance).replace('.', ','); inp.inputMode = 'decimal';
        big.replaceWith(inp); window.neo?.win('focus'); inp.focus(); inp.select();
        let done = false;
        const end = keep => {
          if (done) return; done = true;
          const v = money(inp.value);
          if (keep && !isNaN(v) && v !== a.balance) { a.balance = v; saveBudget(); }
          renderBudget();
        };
        inp.onkeydown = e => { if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); };
        inp.onblur = () => end(true);
      };
      return c;
    };
    const total = budget.accounts.reduce((s, a) => s + a.balance, 0), sum = el('div', 'sysCard px');
    sum.append(el('span', 'label', 'Total'), el('div', 'sysBig', eur(r2(total))), el('div', 'hint', eur(r2(total - accOf('courant').balance)) + ' sur les livrets'));
    $('bdTiles').replaceChildren(...budget.accounts.map(tile), sum);
    // operations, newest first
    const ops = [...budget.ops].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 60);
    $('bdTx').replaceChildren(...(ops.length ? ops.map(o => {
      const r = el('div', 'txRow'), n = el('div', 'tn'), del = el('button', 'x', 'X');
      n.append(o.label || (o.amount < 0 ? 'Dépense' : 'Rentrée'), el('small', '', accOf(o.acc)?.name || ''));
      del.title = 'Supprimer (le solde est remis comme avant)';
      del.onclick = async () => {
        const all = budget.ops.filter(x => o.group ? x.group === o.group : x === o);
        if (!await nbConfirm('Supprimer « ' + (o.label || 'cette opération') + ' » ? ' + (all.length > 1 ? 'Les deux côtés du virement sont annulés.' : 'Le solde du compte est remis comme avant.'))) return;
        for (const x of all) { const a = accOf(x.acc); if (a) a.balance = r2(a.balance - x.amount); }
        budget.ops = budget.ops.filter(x => !all.includes(x)); saveBudget(); renderBudget();
      };
      r.append(el('span', 'd', o.date.slice(8) + '/' + o.date.slice(5, 7)), n, el('span', 'amt' + (o.amount > 0 ? ' in' : ''), (o.amount > 0 ? '+' : '−') + eur(Math.abs(o.amount))), del);
      return r;
    }) : [el('div', 'hint', 'Aucune opération. Ajoute une dépense, une rentrée d\'argent ou un virement vers un livret.')]));
    // form choices
    if (!$('bdAcc').options.length) {
      $('bdAcc').replaceChildren(...budget.accounts.map(a => new Option(a.name, a.id)));
      $('bdTo').replaceChildren(...budget.accounts.map(a => new Option('vers ' + a.name, a.id)));
      $('bdTo').value = budget.plan.to;
      $('bdPlanTo').replaceChildren(...livrets().map(a => new Option(a.name, a.id)));
    }
    $('bdKind').onchange();
    // savings plan
    const p = budget.plan, f = forecast(120), at = k => f[k - 1];
    $('bdPlanMonthly').value = p.monthly ? String(p.monthly).replace('.', ',') : ''; $('bdPlanTo').value = p.to; $('bdPlanTarget').value = p.target ? String(p.target).replace('.', ',') : '';
    const lines = [];
    const now = livrets().reduce((s, a) => s + a.balance, 0);
    if (!p.monthly) lines.push('Indique combien tu veux mettre de côté chaque mois.');
    else {
      lines.push(`Sur tes livrets aujourd'hui : ${eur(r2(now))}. Avec ${eur(p.monthly)} par mois : ${eur(at(3).total)} dans 3 mois, ${eur(at(6).total)} dans 6 mois, ${eur(at(12).total)} dans 1 an.`);
      for (const a of livrets()) {
        const full = f.findIndex(x => x.bal[a.id] >= a.cap);
        if (a.balance < a.cap && full >= 0 && full < 24 && (a.id === p.to || full > 0)) lines.push(`Le ${a.name} sera plein en ${monthLong(f[full].m)} (plafond ${eur(a.cap)}) : la suite ira ${livrets().length > 1 ? 'sur l\'autre livret' : 'nulle part'}.`);
      }
      if (f[0].left > 0) lines.push(`Tes livrets sont pleins : ${eur(f[0].left)} par mois ne peuvent plus y aller.`);
      if (p.target) {
        const k = f.findIndex(x => x.total >= p.target);
        lines.push(now >= p.target ? `Objectif de ${eur(p.target)} déjà atteint.` : k >= 0 ? `Objectif de ${eur(p.target)} atteint en ${monthLong(f[k].m)}, dans ${k + 1} mois.` : `Objectif de ${eur(p.target)} : plus de 10 ans à ce rythme.`);
      }
    }
    $('bdPlanOut').replaceChildren(...lines.map(t => el('div', 'advice', t)));
    const year = f.slice(0, 12), max = Math.max(1, ...year.map(x => x.total), p.target || 0);
    $('bdChart').replaceChildren(...year.map((x, i) => {
      const c = el('div', 'col' + (p.target && x.total >= p.target ? ' today' : '')), b = el('div', 'bar');
      b.style.height = x.total / max * 140 + 'px';
      c.title = monthLong(x.m) + ' : ' + eur(x.total) + ' sur les livrets (' + livrets().map(a => a.name + ' ' + eur(x.bal[a.id])).join(', ') + ')';
      c.append(b, el('span', '', new Date(x.m + '-15').toLocaleDateString('fr-FR', {month: 'short'}).replace('.', '').toUpperCase()));
      return c;
    }));
  }
  $('bdKind').onchange = () => { $('bdTo').style.display = $('bdKind').value === 'virement' ? '' : 'none'; };
  $('bdAdd').onclick = () => {
    const amount = money($('bdAmount').value), kind = $('bdKind').value, acc = $('bdAcc').value, to = $('bdTo').value, label = $('bdLabel').value.trim(), date = ymd(new Date());
    if (!(amount > 0)) return toast('Indique un montant (ex : 12,50)', true);
    if (kind === 'virement' && to === acc) return toast('Choisis deux comptes différents', true);
    const add = (a, v, l, group) => { budget.ops.push({id: crypto.randomUUID(), date, acc: a, label: l, amount: v, ...(group ? {group} : {})}); accOf(a).balance = r2(accOf(a).balance + v); };
    if (kind === 'virement') { const g = crypto.randomUUID(); add(acc, -amount, label || 'Virement vers ' + accOf(to).name, g); add(to, amount, label || 'Virement depuis ' + accOf(acc).name, g); }
    else add(acc, kind === 'depense' ? -amount : amount, label);
    $('bdLabel').value = $('bdAmount').value = ''; $('bdAmount').focus();
    saveBudget(); renderBudget();
  };
  $('bdAmount').onkeydown = $('bdLabel').onkeydown = e => { if (e.key === 'Enter') $('bdAdd').click(); };
  $('bdPlanMonthly').onchange = $('bdPlanTo').onchange = $('bdPlanTarget').onchange = () => {
    budget.plan = {monthly: Math.max(0, money($('bdPlanMonthly').value) || 0), to: $('bdPlanTo').value, target: Math.max(0, money($('bdPlanTarget').value) || 0)};
    saveBudget(); renderBudget();
  };
  // ---- fin ----
  ctx.onOpen(() => { renderBudget(); });
}
