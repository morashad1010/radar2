// PRE-TOKEN RADAR — a static board over window.RADAR, written beside the page by main.ts.
// Every figure it shows comes from that one object: no fetch, no network, no framework.

(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  var drawer = document.getElementById('detail');
  var state = { q: '', category: 'all', chain: 'all', watch: false, sort: 'implied', open: null };
  var rowsBySlug = {};
  var controls = {};
  var tbody = null;

  // ------------------------------------------------------------ formatting

  function group(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function exact(n) {
    return '$' + group(n);
  }

  function short(v) {
    var s = v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + short(n / 1e12) + 't';
    if (a >= 1e9) return '$' + short(n / 1e9) + 'b';
    if (a >= 1e6) return '$' + short(n / 1e6) + 'm';
    if (a >= 1e3) return '$' + short(n / 1e3) + 'k';
    return '$' + Math.round(n);
  }

  function pct(n) {
    return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function age(days) {
    if (days === null || days === undefined) return '—';
    return days >= 365 ? (days / 365).toFixed(1) + 'y' : Math.round(days) + 'd';
  }

  function mult(n) {
    return n.toFixed(2) + '×';
  }

  function sourceHost() {
    var parts = DATA.source.split('//');
    return parts.length > 1 ? parts[1].split(/[\/,\s]/)[0] : 'snapshot';
  }

  // ------------------------------------------------------------ DOM helpers

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function bold(text) {
    return el('b', '', text);
  }

  function td(className, child) {
    var cell = el('td', className);
    if (child !== undefined && child !== null) {
      if (typeof child === 'string') cell.textContent = child;
      else cell.appendChild(child);
    }
    return cell;
  }

  function option(value, label) {
    var node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  function field(labelText, control) {
    var label = el('label', 'field');
    label.appendChild(el('span', 'field-label', labelText));
    label.appendChild(control);
    return label;
  }

  function fill(select, allLabel, set) {
    select.appendChild(option('all', allLabel));
    Object.keys(set).sort().forEach(function (value) {
      select.appendChild(option(value, value));
    });
  }

  function makeTable(columns) {
    var table = el('table', '');
    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    columns.forEach(function (pair) {
      var th = el('th', pair[1], pair[0]);
      th.scope = 'col';
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    var body = document.createElement('tbody');
    table.appendChild(body);
    return { table: table, body: body };
  }

  // ------------------------------------------------------------ shell

  function buildMasthead() {
    var header = el('header', 'masthead');
    var left = el('div', 'mast-left');
    left.appendChild(el('h1', 'wordmark', 'Pre-token Radar'));
    left.appendChild(el('p', 'tagline',
      'Protocols that still record no token, ranked by the value their own TVL, seven-day change, age and chain count imply.'));
    var meta = el('div', 'mast-meta');
    meta.appendChild(el('span', '', 'as of ' + DATA.as_of));
    meta.appendChild(el('span', '', sourceHost()));
    header.appendChild(left);
    header.appendChild(meta);
    return header;
  }

  function kpi(label, value) {
    var cell = el('div', 'kpi');
    cell.appendChild(el('span', 'kpi-label', label));
    cell.appendChild(el('strong', 'kpi-value', value));
    return cell;
  }

  function buildKpis() {
    var strip = el('section', 'kpis');
    strip.setAttribute('aria-label', 'Snapshot totals');
    strip.appendChild(kpi('Protocols scanned', String(DATA.stats.protocols)));
    strip.appendChild(kpi('Pre-token ranked', String(DATA.stats.rows)));
    strip.appendChild(kpi('Watchlist covered', DATA.stats.watchlist + '/' + DATA.stats.watchlist));
    strip.appendChild(kpi('Combined TVL', compact(DATA.stats.pre_token_tvl)));
    strip.appendChild(kpi('Median implied multiple', mult(DATA.stats.median_multiple)));
    return strip;
  }

  function buildControls() {
    var bar = el('section', 'controls');
    bar.setAttribute('aria-label', 'Board controls');

    controls.search = document.createElement('input');
    controls.search.type = 'search';
    controls.search.id = 'q';
    controls.search.placeholder = 'Name or slug';
    controls.search.autocomplete = 'off';
    controls.search.setAttribute('aria-label', 'Search by name or slug');
    bar.appendChild(field('Search', controls.search));

    var categories = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      categories[r.category || 'Uncategorised'] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });

    controls.category = document.createElement('select');
    controls.category.id = 'category';
    controls.category.setAttribute('aria-label', 'Filter by category');
    fill(controls.category, 'All categories', categories);
    bar.appendChild(field('Category', controls.category));

    controls.chain = document.createElement('select');
    controls.chain.id = 'chain';
    controls.chain.setAttribute('aria-label', 'Filter by chain');
    fill(controls.chain, 'All chains', chains);
    bar.appendChild(field('Chain', controls.chain));

    var watch = el('label', 'check');
    controls.watch = document.createElement('input');
    controls.watch.type = 'checkbox';
    controls.watch.id = 'watch';
    watch.appendChild(controls.watch);
    watch.appendChild(el('span', '', 'Watchlist only'));
    bar.appendChild(watch);

    controls.sort = document.createElement('select');
    controls.sort.id = 'sort';
    controls.sort.setAttribute('aria-label', 'Sort the board');
    [['implied', 'Implied value'], ['tvl', 'TVL'], ['change', '7-day change'], ['age', 'Age'], ['multiple', 'Multiple']]
      .forEach(function (pair) { controls.sort.appendChild(option(pair[0], pair[1])); });
    bar.appendChild(field('Sort', controls.sort));

    var reset = el('button', 'reset', 'Reset');
    reset.type = 'button';
    reset.id = 'reset';
    reset.addEventListener('click', resetBoard);
    bar.appendChild(reset);

    controls.count = el('span', 'count', '');
    controls.count.id = 'count';
    controls.count.setAttribute('aria-live', 'polite');
    bar.appendChild(controls.count);

    controls.search.addEventListener('input', function () {
      state.q = controls.search.value;
      renderBoard();
    });
    controls.category.addEventListener('change', function () {
      state.category = controls.category.value;
      renderBoard();
    });
    controls.chain.addEventListener('change', function () {
      state.chain = controls.chain.value;
      renderBoard();
    });
    controls.watch.addEventListener('change', function () {
      state.watch = controls.watch.checked;
      renderBoard();
    });
    controls.sort.addEventListener('change', function () {
      state.sort = controls.sort.value;
      renderBoard();
    });
    return bar;
  }

  function buildBoardSection() {
    var section = el('section', 'board-section');
    section.id = 'board';
    var head = el('div', 'section-head');
    head.appendChild(el('h2', 'section-title', 'The board'));
    head.appendChild(el('p', 'section-note', 'Ranked by implied value. Select a row for its breakdown and farm plan.'));
    section.appendChild(head);

    var built = makeTable([
      ['#', 'num'], ['Protocol', ''], ['Category', ''], ['TVL', 'num'],
      ['7d', 'num'], ['Age', 'num'], ['Multiple', 'num'], ['Implied value', 'num']
    ]);
    tbody = built.body;
    tbody.id = 'rows';
    var panel = el('div', 'table-panel');
    panel.appendChild(built.table);
    section.appendChild(panel);
    return section;
  }

  function buildCalibration() {
    var section = el('section', 'calibration');
    section.id = 'calibration';
    section.appendChild(el('h2', 'section-title', 'What a token already trades at'));
    section.appendChild(el('p', 'calib-note',
      'The twelve largest-cap live protocols: their token trades, so market cap over TVL is a fact rather than a claim.'));

    var built = makeTable([['Protocol', ''], ['Category', ''], ['TVL', 'num'], ['Market cap', 'num'], ['MC / TVL', 'num']]);
    built.body.id = 'calib-rows';
    var panel = el('div', 'table-panel calib-panel');
    panel.appendChild(built.table);
    section.appendChild(panel);

    var chips = el('div', 'chips');
    chips.id = 'chips';
    section.appendChild(chips);
    section.appendChild(el('p', 'calib-note',
      'Each median is the base multiple the model starts from. A category with fewer than four live peers falls back to the median across every live protocol.'));
    return section;
  }

  function buildFooter(into) {
    into.appendChild(el('span', 'foot-src', DATA.source));
    into.appendChild(el('span', '', 'as of ' + DATA.as_of));
  }

  // ------------------------------------------------------------ filtering and sorting

  function filterRows(rows) {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      var primary = 0;
      if (state.sort === 'tvl') primary = b.tvl_usd - a.tvl_usd;
      else if (state.sort === 'change') {
        if (a.change_7d === null && b.change_7d === null) primary = 0;
        else if (a.change_7d === null) primary = 1;
        else if (b.change_7d === null) primary = -1;
        else primary = b.change_7d - a.change_7d;
      } else if (state.sort === 'age') {
        if (a.age_days === null && b.age_days === null) primary = 0;
        else if (a.age_days === null) primary = 1;
        else if (b.age_days === null) primary = -1;
        else primary = a.age_days - b.age_days;
      } else if (state.sort === 'multiple') primary = b.multiple - a.multiple;
      else primary = b.implied_value_usd - a.implied_value_usd;
      return primary || a.rank - b.rank;
    });
  }

  // ------------------------------------------------------------ board

  function renderBoard() {
    var rows = sortRows(filterRows(DATA.rows));
    controls.count.textContent = 'showing ' + rows.length + ' of ' + DATA.rows.length;
    tbody.textContent = '';

    if (rows.length === 0) {
      var emptyRow = document.createElement('tr');
      var empty = td('empty', 'No protocol matches these filters. Clear the search or press Reset.');
      empty.colSpan = 8;
      emptyRow.appendChild(empty);
      tbody.appendChild(emptyRow);
      return;
    }

    var max = DATA.stats.max_implied || 1;
    var fragment = document.createDocumentFragment();
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.className = 'row' + (state.open === r.slug ? ' is-open' : '');
      tr.tabIndex = 0;
      tr.dataset.slug = r.slug;
      tr.setAttribute('aria-label', 'Open the detail for ' + r.name);
      if (state.open === r.slug) tr.setAttribute('aria-current', 'true');

      tr.appendChild(td('rank num', String(r.rank)));

      var proto = el('td', 'proto');
      proto.appendChild(el('span', 'pname', r.name));
      proto.appendChild(el('span', 'pslug', r.slug));
      if (r.on_watchlist) proto.appendChild(el('span', 'chip', 'WATCH'));
      tr.appendChild(proto);

      tr.appendChild(td('cat', r.category || '—'));
      var tvl = td('num', compact(r.tvl_usd));
      tvl.title = exact(r.tvl_usd);
      tr.appendChild(tvl);
      tr.appendChild(r.change_7d === null ? td('num muted', '—') : td('num ' + (r.change_7d >= 0 ? 'up' : 'down'), pct(r.change_7d)));
      tr.appendChild(td('num', age(r.age_days)));
      tr.appendChild(td('num muted', mult(r.multiple)));

      var implied = el('td', 'num implied');
      var bar = el('span', 'bar');
      bar.style.width = Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%';
      var value = el('span', 'value', compact(r.implied_value_usd));
      value.title = exact(r.implied_value_usd);
      implied.appendChild(bar);
      implied.appendChild(value);
      tr.appendChild(implied);

      tr.addEventListener('click', function () { openRow(r.slug); });
      tr.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          openRow(r.slug);
        }
      });
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  }

  // ------------------------------------------------------------ detail

  function splitStep(step) {
    var costAt = step.indexOf(' — cost ');
    var timeAt = step.indexOf(' — time ');
    if (costAt < 0 || timeAt < 0 || timeAt < costAt) return { text: step, cost: '', time: '' };
    return { text: step.slice(0, costAt), cost: step.slice(costAt + 8, timeAt), time: step.slice(timeAt + 8).replace(/\.$/, '') };
  }

  function statCell(label, value, title) {
    var box = document.createElement('div');
    box.appendChild(el('span', '', label));
    var strong = el('strong', '', value);
    if (title) strong.title = title;
    box.appendChild(strong);
    return box;
  }

  function stepItem(step, index) {
    var parts = splitStep(step);
    var li = document.createElement('li');
    li.appendChild(el('span', 'step-num', String(index + 1)));
    var body = el('div', 'step-body');
    body.appendChild(el('p', 'step-text', parts.text));
    var meta = el('p', 'step-meta');
    if (parts.cost) meta.appendChild(el('span', '', 'Cost: ' + parts.cost));
    if (parts.time) meta.appendChild(el('span', '', 'Time: ' + parts.time));
    body.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  function renderDetail(row) {
    drawer.textContent = '';

    var head = el('div', 'drawer-head');
    var identity = el('div', '');
    identity.appendChild(el('span', 'kicker', 'Rank ' + row.rank + ' of ' + DATA.stats.rows));
    identity.appendChild(el('h2', '', row.name));
    identity.appendChild(el('p', 'drawer-slug', row.slug));
    head.appendChild(identity);

    var close = el('button', 'drawer-close', 'Close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the detail');
    close.addEventListener('click', closeDrawer);
    head.appendChild(close);
    drawer.appendChild(head);

    var meta = el('p', 'drawer-meta');
    meta.appendChild(el('span', '', row.category || 'Uncategorised'));
    meta.appendChild(el('span', '', '·'));
    meta.appendChild(el('span', '', row.chains.length > 0 ? row.chains.join(', ') : 'No chain recorded'));
    if (row.on_watchlist) meta.appendChild(el('span', 'chip', 'WATCH'));
    drawer.appendChild(meta);

    var stats = el('div', 'stat4');
    stats.appendChild(statCell('TVL', compact(row.tvl_usd), exact(row.tvl_usd)));
    stats.appendChild(statCell('7-day', pct(row.change_7d)));
    stats.appendChild(statCell('Age since listing', age(row.age_days)));
    stats.appendChild(statCell('Implied value', compact(row.implied_value_usd), exact(row.implied_value_usd)));
    drawer.appendChild(stats);

    var breakdown = el('div', 'breakdown');
    var formula = el('div', 'formula');
    formula.appendChild(document.createTextNode('base '));
    formula.appendChild(bold(mult(row.base)));
    formula.appendChild(document.createTextNode(' × growth '));
    formula.appendChild(bold(mult(row.growth)));
    formula.appendChild(document.createTextNode(' × age '));
    formula.appendChild(bold(mult(row.age)));
    formula.appendChild(document.createTextNode(' × chains '));
    formula.appendChild(bold(mult(row.chain_factor)));
    formula.appendChild(document.createTextNode(' = '));
    formula.appendChild(bold(mult(row.multiple)));
    breakdown.appendChild(formula);
    var over = el('div', 'over', 'over TVL ');
    over.appendChild(bold(compact(row.tvl_usd)));
    breakdown.appendChild(over);
    drawer.appendChild(breakdown);

    drawer.appendChild(el('p', 'implied-label', 'Implied value'));
    var big = el('p', 'implied-big', compact(row.implied_value_usd));
    big.title = exact(row.implied_value_usd);
    drawer.appendChild(big);

    var steps = el('ol', 'steps');
    row.farm_steps.forEach(function (step, index) {
      steps.appendChild(stepItem(step, index));
    });
    drawer.appendChild(steps);

    drawer.appendChild(el('p', 'claim',
      'The implied value is this entry\'s own claim from the snapshot\'s figures, not a price and not a forecast that a token is issued.'));
  }

  // ------------------------------------------------------------ calibration

  function renderCalibration() {
    var body = document.getElementById('calib-rows');
    DATA.live_peers.slice(0, 12).forEach(function (peer) {
      var tr = document.createElement('tr');
      tr.appendChild(td('', peer.name));
      tr.appendChild(td('cat', peer.category || '—'));
      var tvl = td('num', compact(peer.tvl_usd));
      tvl.title = exact(peer.tvl_usd);
      tr.appendChild(tvl);
      var mcap = td('num', compact(peer.mcap_usd));
      mcap.title = exact(peer.mcap_usd);
      tr.appendChild(mcap);
      tr.appendChild(td('num', peer.ratio.toFixed(2) + '×'));
      body.appendChild(tr);
    });

    var chips = document.getElementById('chips');
    DATA.category_medians.forEach(function (entry) {
      var chip = el('span', 'chip-med');
      chip.appendChild(document.createTextNode(entry.category + ' '));
      chip.appendChild(bold(entry.median_ratio.toFixed(2) + '×'));
      chips.appendChild(chip);
    });
  }

  // ------------------------------------------------------------ open, close, reset

  function openRow(slug) {
    var row = rowsBySlug[slug];
    if (!row) return;
    state.open = slug;
    renderBoard();
    renderDetail(row);
    drawer.hidden = false;
    var close = drawer.querySelector('.drawer-close');
    if (close) close.focus();
  }

  function closeDrawer() {
    var slug = state.open;
    state.open = null;
    drawer.hidden = true;
    renderBoard();
    if (slug) {
      for (var i = 0; i < tbody.children.length; i++) {
        if (tbody.children[i].dataset.slug === slug) {
          tbody.children[i].focus();
          break;
        }
      }
    }
  }

  function resetBoard() {
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.watch = false;
    state.sort = 'implied';
    state.open = null;
    controls.search.value = '';
    controls.category.value = 'all';
    controls.chain.value = 'all';
    controls.watch.checked = false;
    controls.sort.value = 'implied';
    drawer.hidden = true;
    renderBoard();
  }

  // ------------------------------------------------------------ query parameters

  function hasOption(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  function applyQuery() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q !== null) {
      state.q = q;
      controls.search.value = q;
    }
    var category = params.get('category');
    if (category !== null && hasOption(controls.category, category)) {
      state.category = category;
      controls.category.value = category;
    }
    var chain = params.get('chain');
    if (chain !== null && hasOption(controls.chain, chain)) {
      state.chain = chain;
      controls.chain.value = chain;
    }
    if (params.get('watch') === '1') {
      state.watch = true;
      controls.watch.checked = true;
    }
    var open = params.get('open');
    if (open !== null && rowsBySlug[open]) state.open = open;
  }

  // ------------------------------------------------------------ main

  function main() {
    if (!DATA || !Array.isArray(DATA.rows) || !DATA.stats) {
      app.appendChild(el('p', 'empty', 'No radar data was found beside this page.'));
      document.body.dataset.ready = '1';
      return;
    }

    DATA.rows.forEach(function (r) { rowsBySlug[r.slug] = r; });

    app.appendChild(buildMasthead());
    app.appendChild(buildKpis());
    app.appendChild(buildControls());
    app.appendChild(buildBoardSection());
    app.appendChild(buildCalibration());
    app.appendChild(buildMethod());
    app.appendChild(buildFooter());

    applyQuery();
    renderBoard();
    renderCalibration();

    if (state.open) {
      var row = rowsBySlug[state.open];
      if (row) {
        renderDetail(row);
        drawer.hidden = false;
      }
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !drawer.hidden) {
        event.preventDefault();
        closeDrawer();
      }
    });

    document.body.dataset.ready = '1';
  }

  main();
})();
