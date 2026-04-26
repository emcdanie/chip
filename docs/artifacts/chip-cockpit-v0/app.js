(function () {
  var root = document.documentElement;
  var body = document.body;
  var splash = document.getElementById('splash');
  var enterBtn = document.getElementById('enter-btn');
  var themeBtn = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var crumb = document.getElementById('crumb');

  var meter = document.getElementById('on-spec-meter');
  var meterText = document.getElementById('meter-value-text');
  var meterDelta = document.getElementById('meter-delta');
  var btnDrift = document.getElementById('btn-drift');
  var btnReset = document.getElementById('btn-reset');
  var btnApprove = document.getElementById('btn-approve');
  var btnReject = document.getElementById('btn-reject');
  var btnModify = document.getElementById('btn-modify');
  var btnExpand = document.getElementById('btn-expand');
  var auditList = document.getElementById('audit-log');
  var auditEmpty = document.getElementById('audit-empty');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TWEEN_MS = 1200;

  // Audit copy — Tier 1.2 cross-platform reframe

  var rafId = null;
  var meterCurrent = 38;   // initial parity (Tier 1.2)

  var SPACE_TITLES = {
    cockpit: 'Bridge',
    research: 'Research library',
    friction: 'Friction log',
    bella: 'AI-native BELLA',
    component: 'Component map',
    map: 'System map',
    steward: 'Coming up'
  };

  // --- splash dismissal ---
  function login() {
    body.setAttribute('data-logged-in', 'true');
    setTimeout(function () { splash.style.display = 'none'; }, 400);
    // Seed the audit ribbon with the cross-space layout patch CHIP filed
    // on this dashboard. This is the artefact of the audit-then-approve loop.
    setTimeout(function () {
      if (typeof AUDIT_LAYOUT_FIX === 'string') appendAuditEntry(AUDIT_LAYOUT_FIX);
    }, 600);
  }
  enterBtn.addEventListener('click', login);

  // --- theme ---
  function setTheme(mode) {
    root.setAttribute('data-theme', mode);
    themeBtn.setAttribute('aria-pressed', mode === 'dark');
    themeLabel.textContent = mode === 'dark' ? 'Dark' : 'Light';
  }
  themeBtn.addEventListener('click', function () {
    setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // --- space switching ---
  function setSpace(name) {
    body.setAttribute('data-space', name);
    crumb.textContent = SPACE_TITLES[name] || name;
    document.querySelectorAll('[data-space-target]').forEach(function (el) {
      if (el.getAttribute('data-space-target') === name) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    if (name === 'research') primeTimeline();
  }
  document.querySelectorAll('[data-space-target]').forEach(function (el) {
    el.addEventListener('click', function () {
      if (el.disabled) return;
      setSpace(el.getAttribute('data-space-target'));
    });
  });

  // --- meter tween (drift demo logic preserved) ---
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function applyMeter(val) {
    meterCurrent = val;
    var rounded = Math.round(val);
    meter.style.setProperty('--meter-value', val);
    meter.setAttribute('aria-valuenow', rounded);
    meterText.textContent = rounded + '%';
  }
  function tweenMeter(to) {
    if (rafId) cancelAnimationFrame(rafId);
    if (reducedMotion.matches) { applyMeter(to); return; }
    var from = meterCurrent;
    if (Math.abs(to - from) < 0.5) { applyMeter(to); return; }
    var start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / TWEEN_MS);
      applyMeter(from + (to - from) * easeOutCubic(t));
      if (t < 1) rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }

  // --- audit ---
  function appendAuditEntry(text) {
    if (auditEmpty) { auditEmpty.remove(); auditEmpty = null; }
    var li = document.createElement('li');
    li.className = 'audit__entry';
    li.textContent = text;
    auditList.insertBefore(li, auditList.firstChild);
  }
  function clearAudit() {
    auditList.innerHTML = '';
    auditEmpty = document.createElement('li');
    auditEmpty.className = 'audit__empty';
    auditEmpty.id = 'audit-empty';
    auditEmpty.textContent = 'No approvals yet today.';
    auditList.appendChild(auditEmpty);
  }

  // --- phase machine (Tier 1.2 reframe; drift loop preserved) ---
  // loaded:   meter 38, no diag, no delta pill, audit empty
  // drift:    meter stays 38 (no tween — parity is already known), diag visible,
  //           delta pill "−56% since landscape shipped" appears, audit logs
  // approved: meter projects toward 94 (roadmap accepted, return to parity),
  //           resolved variant shows, audit logs again, fill becomes sage
  // Stage 18.6 — per-platform parity targets, drift→approved transition
  function updateParityBreakdown(phase) {
    var rows = document.querySelectorAll('.parity-breakdown__row');
    rows.forEach(function (row) {
      var fill = row.querySelector('.parity-breakdown__fill');
      var count = row.querySelector('.parity-breakdown__count');
      var chip = row.querySelector('.parity-breakdown__chip');
      var platform = row.getAttribute('data-platform');
      var p, c, label, cls;
      if (phase === 'approved') {
        p = 100; c = '47 / 47'; label = 'In sync'; cls = 'chip--success';
      } else {
        if (platform === 'web')      { p = 100; c = '47 / 47'; label = 'In sync'; cls = 'chip--success'; }
        else if (platform === 'ios') { p = 49;  c = '23 / 47'; label = 'Drift';   cls = 'chip--accent';  }
        else                         { p = 0;   c = '0 / 47';  label = 'Drift';   cls = 'chip--accent';  }
      }
      if (fill)  fill.style.setProperty('--p', p);
      if (count) count.textContent = c;
      if (chip) {
        chip.classList.remove('chip--success', 'chip--accent', 'chip--info', 'chip--muted');
        chip.classList.add(cls);
        chip.textContent = label;
      }
    });
    // Components-in-spec summary numbers
    var summary = document.querySelector('.parity-summary');
    if (summary) {
      var nums = summary.querySelectorAll('.parity-summary__num');
      if (phase === 'approved') {
        if (nums[0]) nums[0].textContent = '47';
        if (nums[1]) nums[1].textContent = '0';
        if (nums[2]) nums[2].textContent = '0';
      } else {
        if (nums[0]) nums[0].textContent = '12';
        if (nums[1]) nums[1].textContent = '24';
        if (nums[2]) nums[2].textContent = '11';
      }
    }
  }

  function setPhase(phase) {
    var prev = body.getAttribute('data-phase');
    if (phase === prev) return;
    body.setAttribute('data-phase', phase);
    btnDrift.disabled = phase !== 'loaded';
    btnReset.disabled = phase === 'loaded';
    if (phase === 'drift')         tweenMeter(38);
    else if (phase === 'approved') tweenMeter(94);
    else                           tweenMeter(38);
    if (phase === 'drift') appendAuditEntry(AUDIT_DRIFT);
    else if (phase === 'approved') appendAuditEntry(AUDIT_APPROVED);
    else if (phase === 'loaded') clearAudit();
    // Stage 5 — MAPE-K phase + inclusion reset on phase change
    if (phase === 'loaded') {
      setMapek('monitor');
      setInclusion('pass'); // reset gate when restarting demo
    }
    else if (phase === 'drift')    setMapek('analyze');
    else if (phase === 'approved') {
      setMapek('execute');
      // settle on Knowledge after the audit ribbon entry lands
      setTimeout(function () { setMapek('knowledge'); }, 800);
    }
    updateApproveAvailability();
    updateParityBreakdown(phase);

    // Stage 18.6 — when entering drift, scroll the proposal into view so the
    // operator doesn't have to hunt for it.
    if (phase === 'drift') {
      setTimeout(function () {
        var diag = document.getElementById('diag-card') || document.querySelector('.diag');
        if (diag && diag.scrollIntoView) {
          diag.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 80);
    }
  }

  // ============ Stage 18.5 — Action feedback panels ============
  // Approve / Reject / Modify each open an inline feedback panel.
  // Approve  → confirmation summary of what just happened.
  // Reject   → form for the rejection reason → confirmation.
  // Modify   → form for change notes → confirmation.
  // Every action writes a timestamped audit-ribbon entry.
  var actionFb        = document.getElementById('action-fb');
  var rejectForm      = document.getElementById('reject-form');
  var modifyForm      = document.getElementById('modify-form');
  var fbConfirm       = document.getElementById('action-fb-confirm');
  var fbEyebrow       = document.getElementById('action-fb-eyebrow');
  var fbHeadline      = document.getElementById('action-fb-headline');
  var fbList          = document.getElementById('action-fb-list');
  var fbNote          = document.getElementById('action-fb-note');
  var fbReset         = document.getElementById('action-fb-reset');
  var rejectReasonEl  = document.getElementById('reject-reason');
  var modifyNotesEl   = document.getElementById('modify-notes');

  function nowHHMM() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  }

  function hideAllFbForms() {
    if (rejectForm) rejectForm.hidden = true;
    if (modifyForm) modifyForm.hidden = true;
    if (fbConfirm)  fbConfirm.hidden  = true;
  }
  function closeFb() {
    body.removeAttribute('data-action-state');
    actionFb.hidden = true;
    actionFb.removeAttribute('data-state');
    hideAllFbForms();
  }

  function showFbConfirm(state, eyebrow, headline, items, note) {
    hideAllFbForms();
    actionFb.hidden = false;
    actionFb.setAttribute('data-state', state);
    body.setAttribute('data-action-state', state);
    fbEyebrow.textContent = eyebrow;
    fbHeadline.textContent = headline;
    fbList.innerHTML = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      if (state === 'rejected') li.className = 'action-fb__list-item--rejected';
      else if (state === 'modified') li.className = 'action-fb__list-item--modify';
      li.textContent = item;
      fbList.appendChild(li);
    });
    if (note) { fbNote.textContent = note; fbNote.hidden = false; }
    else      { fbNote.hidden = true; }
    fbConfirm.hidden = false;
    actionFb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function approve() {
    if (body.getAttribute('data-phase') !== 'drift') return;
    if (btnApprove.disabled) return;
    setPhase('approved');                                  // existing phase machine + audit ribbon
    var ts = nowHHMM();
    showFbConfirm(
      'approved',
      ts + ' · Approved by Elleta · Trust: Junior',
      'Roadmap approved. CHIP is filing the work.',
      [
        '23 Jira tickets templated and filed (BELLA-1234 → BELLA-1256)',
        '3 dev leads notified — Web Lead, iOS Lead, Android Lead',
        'Storybook update queued — 47 components on next deploy',
        'Audit ribbon entry written below'
      ],
      'auto-merge withheld pending platform CI green; CHIP will report back when the parity meter clears 90%.'
    );
  }

  function openReject() {
    if (body.getAttribute('data-phase') !== 'drift') return;
    body.setAttribute('data-action-state', 'rejecting');
    actionFb.hidden = false;
    actionFb.removeAttribute('data-state');
    hideAllFbForms();
    rejectForm.hidden = false;
    if (rejectReasonEl) { rejectReasonEl.value = ''; rejectReasonEl.focus(); }
    actionFb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openModify() {
    if (body.getAttribute('data-phase') !== 'drift') return;
    body.setAttribute('data-action-state', 'modifying');
    actionFb.hidden = false;
    actionFb.removeAttribute('data-state');
    hideAllFbForms();
    modifyForm.hidden = false;
    if (modifyNotesEl) { modifyNotesEl.value = ''; modifyNotesEl.focus(); }
    actionFb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function submitReject(e) {
    e.preventDefault();
    var reason = (rejectReasonEl && rejectReasonEl.value || '').trim();
    if (!reason) { rejectReasonEl.focus(); return; }
    var ts = nowHHMM();
    appendAuditEntry(ts + ' · Roadmap rejected · reason recorded · Operator: Elleta');
    showFbConfirm(
      'rejected',
      ts + ' · Rejected by Elleta',
      'Proposal rejected. CHIP will re-evaluate.',
      [
        'No tickets filed, no leads notified',
        'Reason captured in the audit ribbon below',
        'CHIP will hold landscape rollout pending re-analysis'
      ],
      reason
    );
  }

  function submitModify(e) {
    e.preventDefault();
    var notes = (modifyNotesEl && modifyNotesEl.value || '').trim();
    if (!notes) { modifyNotesEl.focus(); return; }
    var ts = nowHHMM();
    appendAuditEntry(ts + ' · Roadmap modified · constraints noted · Operator: Elleta');
    showFbConfirm(
      'modified',
      ts + ' · Modified by Elleta',
      'Constraints noted. CHIP will re-propose with these guardrails.',
      [
        'Original proposal paused',
        'Modification notes captured in audit ribbon',
        'CHIP will re-run analysis and surface a revised roadmap'
      ],
      notes
    );
  }

  btnDrift.addEventListener('click', function () { setPhase('drift'); closeFb(); });
  btnReset.addEventListener('click', function () { setPhase('loaded'); closeFb(); });
  btnApprove.addEventListener('click', approve);
  btnReject.addEventListener('click', openReject);
  btnModify.addEventListener('click', openModify);
  btnExpand.addEventListener('click', function () { console.log('[CHIP] full roadmap requested'); });

  if (rejectForm) rejectForm.addEventListener('submit', submitReject);
  if (modifyForm) modifyForm.addEventListener('submit', submitModify);
  if (fbReset)    fbReset.addEventListener('click', function () { setPhase('loaded'); closeFb(); });
  // Cancel buttons in the forms
  document.querySelectorAll('[data-action-cancel]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeFb(); });
  });

  // ============ Stage 5 — MAPE-K loop indicator ============
  var mapekPhases = document.querySelectorAll('[data-phase-marker]');
  function setMapek(name) {
    mapekPhases.forEach(function (el) {
      el.classList.toggle('mapek__phase--active', el.getAttribute('data-phase-marker') === name);
    });
  }

  // ============ Stage 5 — Inclusion gate ============
  var inclusionChip      = document.getElementById('inclusion-chip');
  var inclusionIssues    = document.getElementById('inclusion-issues');
  var btnTighten         = document.getElementById('btn-tighten');
  var btnOverride        = document.getElementById('btn-override');

  function setInclusion(state) {
    body.setAttribute('data-inclusion', state);
    inclusionChip.classList.remove('chip--success', 'chip--accent', 'chip--info', 'chip--muted');
    if (state === 'pass') {
      inclusionChip.classList.add('chip--success');
      inclusionChip.textContent = 'Inclusion · pass';
      inclusionChip.setAttribute('title', 'A11y AA · 24 languages · ethics review clear');
      if (inclusionIssues) inclusionIssues.removeAttribute('open');
    } else if (state === 'fail') {
      inclusionChip.classList.add('chip--accent');
      inclusionChip.textContent = 'Inclusion · 3 issues';
      inclusionChip.setAttribute('title', 'A11y AA · 1 contrast issue · 1 motion issue · 3 missing translations');
      if (inclusionIssues) inclusionIssues.setAttribute('open', '');
    } else if (state === 'overridden') {
      inclusionChip.classList.add('chip--muted');
      inclusionChip.textContent = 'Inclusion · overridden';
      inclusionChip.setAttribute('title', '3 issues acknowledged by operator; logged in audit ribbon');
    }
    updateApproveAvailability();
  }

  function updateApproveAvailability() {
    var phase = body.getAttribute('data-phase');
    var inclusion = body.getAttribute('data-inclusion');
    var blocked = (inclusion === 'fail');
    btnApprove.disabled = blocked || phase !== 'drift';
    btnApprove.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }

  if (btnTighten) {
    btnTighten.addEventListener('click', function () {
      setInclusion(body.getAttribute('data-inclusion') === 'fail' ? 'pass' : 'fail');
    });
  }
  if (btnOverride) {
    btnOverride.addEventListener('click', function () {
      setInclusion('overridden');
      appendAuditEntry(AUDIT_INCLUSION_OVERRIDE);
    });
  }

  // --- keyboard ---
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;

    // splash dismiss
    if (body.getAttribute('data-logged-in') !== 'true') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); login(); }
      return;
    }

    var phase = body.getAttribute('data-phase');
    var space = body.getAttribute('data-space');

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      if (phase === 'drift' && space === 'cockpit') { e.preventDefault(); approve(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (phase !== 'drift' || space !== 'cockpit') return;
    var k = e.key.toLowerCase();
    if (k === 'a')      { e.preventDefault(); approve(); }
    else if (k === 'r') { e.preventDefault(); openReject(); }
    else if (k === 'm') { e.preventDefault(); openModify(); }
  });

  // ============ Stage 4 — System Map deepening ============
  var mapSection       = document.querySelector('.space--map');
  var mapDetailEmpty   = document.getElementById('map-detail-empty');
  var mapDetailContent = document.getElementById('map-detail-content');
  var mapNodes         = document.querySelectorAll('.map__node');
  var mapEdges         = document.querySelectorAll('.map__edge-group');
  var matrixRows       = document.querySelectorAll('.components-matrix__row');
  var mapSvg           = document.getElementById('map-svg');



  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderDetail(data) {
    if (!data) {
      mapDetailEmpty.style.display = '';
      mapDetailContent.innerHTML = '';
      return;
    }
    mapDetailEmpty.style.display = 'none';
    var html = '<p class="map-detail__title">' + escapeHtml(data.title) + '</p>';
    html += '<ul class="map-detail__rows">';
    data.rows.forEach(function (r) {
      html += '<li><span>' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></li>';
    });
    html += '</ul>';
    mapDetailContent.innerHTML = html;
  }

  function clearMapSelection() {
    mapSection.setAttribute('data-selected', '');
    mapNodes.forEach(function (n) { n.classList.remove('map__node--selected'); });
    mapEdges.forEach(function (e) { e.classList.remove('map__edge-group--connected'); });
    matrixRows.forEach(function (r) { r.classList.remove('components-matrix__row--selected'); });
    renderDetail(null);
  }

  function selectNode(nodeId) {
    matrixRows.forEach(function (r) { r.classList.remove('components-matrix__row--selected'); });
    mapSection.setAttribute('data-selected', nodeId);
    mapNodes.forEach(function (n) {
      if (n.getAttribute('data-node') === nodeId) n.classList.add('map__node--selected');
      else n.classList.remove('map__node--selected');
    });
    mapEdges.forEach(function (e) {
      var from = e.getAttribute('data-from');
      var to   = e.getAttribute('data-to');
      if (from === nodeId || to === nodeId) e.classList.add('map__edge-group--connected');
      else e.classList.remove('map__edge-group--connected');
    });
    renderDetail(NODE_DATA[nodeId]);
  }

  function selectComponent(componentId) {
    mapSection.setAttribute('data-selected', '');
    mapNodes.forEach(function (n) { n.classList.remove('map__node--selected'); });
    mapEdges.forEach(function (e) { e.classList.remove('map__edge-group--connected'); });
    matrixRows.forEach(function (r) {
      if (r.getAttribute('data-component') === componentId) r.classList.add('components-matrix__row--selected');
      else r.classList.remove('components-matrix__row--selected');
    });
    renderDetail(COMPONENT_DATA[componentId]);
  }

  mapNodes.forEach(function (n) {
    n.addEventListener('click', function () { selectNode(n.getAttribute('data-node')); });
    n.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectNode(n.getAttribute('data-node'));
      }
    });
  });

  matrixRows.forEach(function (r) {
    r.addEventListener('click', function () { selectComponent(r.getAttribute('data-component')); });
    r.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectComponent(r.getAttribute('data-component'));
      }
    });
  });

  if (mapSvg) {
    mapSvg.addEventListener('click', function (e) {
      if (e.target === mapSvg) clearMapSelection();
    });
  }

  // Esc clears selection when on the map space
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key !== 'Escape') return;
    if (body.getAttribute('data-space') !== 'map') return;
    if (body.getAttribute('data-logged-in') !== 'true') return;
    if (mapSection.getAttribute('data-selected') === '' &&
        !document.querySelector('.components-matrix__row--selected')) return;
    clearMapSelection();
  });

  // --- Tier 2.3 — Research timeline IntersectionObserver fade-ins ---
  var timelineEntries = document.querySelectorAll('.timeline__entry');
  var timelineObserver = null;
  var timelinePrimed = false;

  function primeTimeline() {
    if (timelinePrimed) return;
    timelinePrimed = true;
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      timelineEntries.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    timelineObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          timelineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    timelineEntries.forEach(function (el) { timelineObserver.observe(el); });
  }

  // ============ Stage 5 — Research entry interactions ============
  var researchDetailEmpty   = document.getElementById('research-detail-empty');
  var researchDetailContent = document.getElementById('research-detail-content');


  function renderResearchDetail(id) {
    var data = RESEARCH_DATA[id];
    if (!data) {
      researchDetailEmpty.style.display = '';
      researchDetailContent.innerHTML = '';
      return;
    }
    researchDetailEmpty.style.display = 'none';
    var html = '';
    html += '<p class="research-detail__eyebrow">' + escapeHtml(data.date) + ' · ' + escapeHtml(data.author) + '</p>';
    html += '<h3 class="research-detail__title">' + escapeHtml(data.title) + '</h3>';
    html += '<p class="research-detail__quote">' + escapeHtml(data.quote) + '</p>';
    html += '<ul class="research-detail__meta">';
    data.meta.forEach(function (m) {
      html += '<li><span>' + escapeHtml(m[0]) + '</span><span>' + escapeHtml(m[1]) + '</span></li>';
    });
    html += '</ul>';
    if (data.connections && data.connections.length) {
      html += '<p class="research-detail__connections-title">Connected entries</p>';
      html += '<ul class="research-detail__connections">';
      data.connections.forEach(function (cid) {
        var c = RESEARCH_DATA[cid];
        if (!c) return;
        html += '<li><button type="button" class="research-detail__connection" data-connection="' + escapeHtml(cid) + '">' +
                escapeHtml(c.title) +
                ' <span class="research-detail__connection-author">— ' + escapeHtml(c.author) + '</span>' +
                '</button></li>';
      });
      html += '</ul>';
    }
    html += '<p class="research-detail__summary">' + escapeHtml(data.summary) + '</p>';
    researchDetailContent.innerHTML = html;
    researchDetailContent.querySelectorAll('[data-connection]').forEach(function (el) {
      el.addEventListener('click', function () { selectResearch(el.getAttribute('data-connection')); });
    });
  }

  function selectResearch(id) {
    var entry = RESEARCH_DATA[id];
    if (!entry) return;
    timelineEntries.forEach(function (el) {
      var elId = el.getAttribute('data-research');
      if (elId === id) {
        el.classList.add('timeline__entry--selected');
        el.classList.remove('timeline__entry--connected');
      } else if (entry.connections && entry.connections.indexOf(elId) !== -1) {
        el.classList.add('timeline__entry--connected');
        el.classList.remove('timeline__entry--selected');
      } else {
        el.classList.remove('timeline__entry--selected');
        el.classList.remove('timeline__entry--connected');
      }
    });
    renderResearchDetail(id);
    drawConnectionLines(id);
  }

  function clearResearchSelection() {
    timelineEntries.forEach(function (el) {
      el.classList.remove('timeline__entry--selected');
      el.classList.remove('timeline__entry--connected');
    });
    renderResearchDetail(null);
    drawConnectionLines(null);
  }

  timelineEntries.forEach(function (el) {
    if (el.getAttribute('data-research')) {
      el.addEventListener('click', function () { selectResearch(el.getAttribute('data-research')); });
    }
  });

  // ============ Stage 7.5 — connection lines (SVG overlay over timeline) ============
  var timelineEl    = document.getElementById('timeline');
  var timelineLines = document.getElementById('timeline-lines');
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function drawConnectionLines(selectedId) {
    if (!timelineLines || !timelineEl) return;
    while (timelineLines.firstChild) timelineLines.removeChild(timelineLines.firstChild);
    if (!selectedId) return;
    var entry = RESEARCH_DATA[selectedId];
    if (!entry || !entry.connections) return;
    var fromEl = document.querySelector('[data-research="' + selectedId + '"]');
    if (!fromEl) return;
    var fromY = fromEl.offsetTop + 14 + 6;
    var timelineH = timelineEl.offsetHeight;
    timelineLines.setAttribute('viewBox', '0 0 60 ' + timelineH);
    timelineLines.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    timelineLines.style.height = timelineH + 'px';
    entry.connections.forEach(function (cid, idx) {
      var toEl = document.querySelector('[data-research="' + cid + '"]');
      if (!toEl) return;
      var toY = toEl.offsetTop + 14 + 6;
      var apex = 38 + idx * 7;
      var midY = (fromY + toY) / 2;
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'timeline__line');
      path.setAttribute('d', 'M 10 ' + fromY + ' Q ' + apex + ' ' + midY + ' 10 ' + toY);
      timelineLines.appendChild(path);
    });
    requestAnimationFrame(function () {
      timelineLines.querySelectorAll('.timeline__line').forEach(function (l) {
        l.classList.add('is-visible');
      });
    });
  }

  // ============ Stage 7.3 — components matrix filter chips ============
  var matrixFilters = { platform: 'all', status: 'all', type: 'all' };
  var matrixRowsForFilter = document.querySelectorAll('.components-matrix__row[data-component]');
  var PLATFORM_INDEX = { web: 0, ios: 1, android: 2, figma: 3, storybook: 4 };

  function applyMatrixFilters() {
    matrixRowsForFilter.forEach(function (row) {
      var cells = row.querySelectorAll('.components-matrix__cell');
      var passType = matrixFilters.type === 'all' ||
                     row.getAttribute('data-type') === matrixFilters.type;
      var passPlatform = true;
      var passStatus = true;
      var platformIdx = PLATFORM_INDEX[matrixFilters.platform];

      if (matrixFilters.platform === 'all' && matrixFilters.status !== 'all') {
        passStatus = false;
        cells.forEach(function (c) {
          if (c.classList.contains('components-matrix__cell--' + matrixFilters.status)) passStatus = true;
        });
      } else if (matrixFilters.platform !== 'all' && matrixFilters.status === 'all') {
        var c = cells[platformIdx];
        passPlatform = c && !c.classList.contains('components-matrix__cell--na');
      } else if (matrixFilters.platform !== 'all' && matrixFilters.status !== 'all') {
        var c2 = cells[platformIdx];
        passPlatform = c2 && c2.classList.contains('components-matrix__cell--' + matrixFilters.status);
      }
      var match = passType && passPlatform && passStatus;
      row.classList.toggle('components-matrix__row--filtered', !match);
    });
  }

  document.querySelectorAll('.matrix-filters__chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var groupEl = chip.closest('[data-filter-group]');
      if (!groupEl) return;
      var group = groupEl.getAttribute('data-filter-group');
      var value = chip.getAttribute('data-filter-value');
      matrixFilters[group] = value;
      groupEl.querySelectorAll('.matrix-filters__chip').forEach(function (c) {
        var active = c.getAttribute('data-filter-value') === value;
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
        c.classList.toggle('chip--info', active);
        c.classList.toggle('chip--muted', !active);
      });
      applyMatrixFilters();
    });
  });

  // Esc clears selection on the research space
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key !== 'Escape') return;
    if (body.getAttribute('data-space') !== 'research') return;
    if (body.getAttribute('data-logged-in') !== 'true') return;
    if (!document.querySelector('.timeline__entry--selected')) return;
    clearResearchSelection();
  });

  // ============ Stage 8.7 — Components matrix single-input filter ============
  var matrixFilterInput = document.getElementById('matrix-filter-input');
  var matrixFilterCount = document.getElementById('matrix-filter-count');
  var PLATFORM_NAMES = ['web', 'ios', 'android', 'figma', 'storybook'];
  var STATUS_TERMS = {
    'in spec': 'sync', 'spec': 'sync',
    'attention': 'drift', 'drift': 'drift',
    'critical': 'missing', 'missing': 'missing',
    'sync': 'sync', 'in sync': 'sync'
  };
  function applyMatrixFilter() {
    if (!matrixFilterInput) return;
    var q = matrixFilterInput.value.trim().toLowerCase();
    var visible = 0;
    matrixRowsForFilter.forEach(function (row) {
      var match = !q;
      if (q) {
        var name = ((row.querySelector('.components-matrix__name') || {}).textContent || '').toLowerCase();
        var type = (row.getAttribute('data-type') || '').toLowerCase();
        if (name.indexOf(q) !== -1) match = true;
        if (!match && (type.indexOf(q) !== -1 || (q === 'ai' && type === 'ai-primitive'))) match = true;
        if (!match) {
          for (var i = 0; i < PLATFORM_NAMES.length; i++) {
            if (q.indexOf(PLATFORM_NAMES[i]) !== -1) {
              var cell = row.querySelectorAll('.components-matrix__cell')[i];
              if (cell && !cell.classList.contains('components-matrix__cell--na')) { match = true; break; }
            }
          }
        }
        if (!match) {
          var statusMod = STATUS_TERMS[q];
          if (statusMod) {
            row.querySelectorAll('.components-matrix__cell').forEach(function (c) {
              if (c.classList.contains('components-matrix__cell--' + statusMod)) match = true;
            });
          }
        }
      }
      row.classList.toggle('components-matrix__row--filtered', !match);
      if (match) visible++;
    });
    if (matrixFilterCount) matrixFilterCount.textContent = q ? (visible + ' of ' + matrixRowsForFilter.length) : '';
  }
  if (matrixFilterInput) matrixFilterInput.addEventListener('input', applyMatrixFilter);

  // ============ Stage 8.1 — Sticky parity strip ============
  var parityStrip = document.getElementById('parity-strip');
  var parityStripBtn = document.getElementById('parity-strip-btn');
  var meterCard = document.querySelector('.meter-card');
  if (parityStrip && meterCard && 'IntersectionObserver' in window) {
    var meterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var visible = !e.isIntersecting;
        parityStrip.classList.toggle('parity-strip--visible', visible);
        parityStrip.setAttribute('aria-hidden', visible ? 'false' : 'true');
      });
    }, { rootMargin: '-' + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56) + 'px 0px 0px 0px' });
    meterObserver.observe(meterCard);
  }
  if (parityStripBtn && meterCard) {
    parityStripBtn.addEventListener('click', function () {
      meterCard.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // ============ Stage 8.5 — Research search / filter / sort ============
  var researchSearch = document.getElementById('research-search');
  var researchSort   = document.getElementById('research-sort');
  var researchClear  = document.getElementById('research-clear');
  var researchEmpty  = document.getElementById('research-empty');
  var researchToolbarChips = document.querySelectorAll('.research-toolbar__chip');
  var researchFilters = { voice: 'all', tag: 'all', search: '' };
  var timelineContainer = document.getElementById('timeline');
  var originalEntryOrder = Array.prototype.slice.call(timelineEntries);

  function entryMatches(el) {
    var id = el.getAttribute('data-research'); if (!id) return false;
    var data = RESEARCH_DATA[id]; if (!data) return false;
    if (researchFilters.voice !== 'all' && id !== researchFilters.voice) return false;
    if (researchFilters.tag !== 'all') {
      var tags = ((el.querySelector('.timeline__tags') || { textContent: '' }).textContent).toLowerCase();
      if (tags.indexOf(researchFilters.tag.toLowerCase()) === -1) return false;
    }
    if (researchFilters.search) {
      var hay = (data.title + ' ' + data.author + ' ' + data.quote + ' ' +
                 (el.querySelector('.timeline__tags') || {textContent: ''}).textContent).toLowerCase();
      if (hay.indexOf(researchFilters.search) === -1) return false;
    }
    return true;
  }
  function applyResearchFilters() {
    var anyVisible = false;
    timelineEntries.forEach(function (el) {
      var visible = entryMatches(el);
      el.classList.toggle('timeline__entry--filtered', !visible);
      if (visible) anyVisible = true;
    });
    if (researchEmpty) researchEmpty.hidden = anyVisible;
    var anyActive = researchFilters.voice !== 'all' || researchFilters.tag !== 'all' || !!researchFilters.search;
    if (researchClear) researchClear.hidden = !anyActive;
  }
  function applyResearchSort() {
    if (!timelineContainer || !researchSort) return;
    var mode = researchSort.value;
    var arr = originalEntryOrder.slice();
    if (mode === 'oldest') arr.reverse();
    else if (mode === 'alpha') arr.sort(function (a, b) {
      var ad = RESEARCH_DATA[a.getAttribute('data-research')] || {};
      var bd = RESEARCH_DATA[b.getAttribute('data-research')] || {};
      return (ad.author || '').localeCompare(bd.author || '');
    });
    else if (mode === 'connections') arr.sort(function (a, b) {
      var ad = RESEARCH_DATA[a.getAttribute('data-research')] || { connections: [] };
      var bd = RESEARCH_DATA[b.getAttribute('data-research')] || { connections: [] };
      return (bd.connections || []).length - (ad.connections || []).length;
    });
    arr.forEach(function (el) { timelineContainer.appendChild(el); });
  }
  researchToolbarChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var groupEl = chip.closest('[data-filter-group]'); if (!groupEl) return;
      var group = groupEl.getAttribute('data-filter-group');
      var value = chip.getAttribute('data-filter-value');
      researchFilters[group] = value;
      groupEl.querySelectorAll('.research-toolbar__chip').forEach(function (c) {
        var active = c.getAttribute('data-filter-value') === value;
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
        c.classList.toggle('chip--info', active);
        c.classList.toggle('chip--muted', !active);
      });
      applyResearchFilters();
    });
  });
  if (researchSearch) researchSearch.addEventListener('input', function () {
    researchFilters.search = researchSearch.value.trim().toLowerCase();
    applyResearchFilters();
  });
  if (researchSort) researchSort.addEventListener('change', applyResearchSort);
  if (researchClear) researchClear.addEventListener('click', function () {
    researchFilters = { voice: 'all', tag: 'all', search: '' };
    if (researchSearch) researchSearch.value = '';
    document.querySelectorAll('.research-toolbar__chip').forEach(function (c) {
      var active = c.getAttribute('data-filter-value') === 'all';
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
      c.classList.toggle('chip--info', active);
      c.classList.toggle('chip--muted', !active);
    });
    applyResearchFilters();
  });

  // ============ Stage 8.6 — Friction correlation panel ============
  var frictionDetailEmpty   = document.getElementById('friction-detail-empty');
  var frictionDetailContent = document.getElementById('friction-detail-content');
  var frictionEntries       = document.querySelectorAll('.friction__entry[data-friction]');

  function renderFrictionDetail(id) {
    var data = (typeof FRICTION_DATA !== 'undefined') ? FRICTION_DATA[id] : null;
    if (!data || !frictionDetailContent) {
      if (frictionDetailEmpty) frictionDetailEmpty.style.display = '';
      if (frictionDetailContent) frictionDetailContent.innerHTML = '';
      return;
    }
    if (frictionDetailEmpty) frictionDetailEmpty.style.display = 'none';
    var html = '';
    html += '<p class="friction-detail__eyebrow">' + escapeHtml(data.eyebrow) + '</p>';
    html += '<h3 class="friction-detail__title">' + escapeHtml(data.title) + '</h3>';
    if (data.related && data.related.length) {
      html += '<p class="friction-detail__section-label">Related to</p>';
      html += '<ul class="friction-detail__related">';
      data.related.forEach(function (r) { html += '<li>' + escapeHtml(r) + '</li>'; });
      html += '</ul>';
    }
    if (data.rows && data.rows.length) {
      html += '<ul class="friction-detail__rows">';
      data.rows.forEach(function (r) {
        html += '<li><span>' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></li>';
      });
      html += '</ul>';
    }
    frictionDetailContent.innerHTML = html;
  }
  function selectFriction(id) {
    frictionEntries.forEach(function (el) {
      el.classList.toggle('friction__entry--selected', el.getAttribute('data-friction') === id);
    });
    renderFrictionDetail(id);
  }
  function clearFrictionSelection() {
    frictionEntries.forEach(function (el) { el.classList.remove('friction__entry--selected'); });
    renderFrictionDetail(null);
  }
  frictionEntries.forEach(function (el) {
    el.addEventListener('click', function () { selectFriction(el.getAttribute('data-friction')); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectFriction(el.getAttribute('data-friction'));
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key !== 'Escape') return;
    if (body.getAttribute('data-space') !== 'friction') return;
    if (body.getAttribute('data-logged-in') !== 'true') return;
    if (!document.querySelector('.friction__entry--selected')) return;
    clearFrictionSelection();
  });

  // ============ Stage 9.3 — Audit ribbon entry expansion ============
  function entryProvenance(text) {
    if (text.indexOf('drift detected') !== -1) {
      return [
        ['Source', 'BELLA design system'],
        ['Trigger', 'Landscape mode shipped on Web only'],
        ['Affected', 'iOS (23 components), Android (47 components)'],
        ['Detected by', 'Auto monitor · MAPE-K Monitor phase']
      ];
    }
    if (text.indexOf('Roadmap approved') !== -1) {
      var inclusion = body.getAttribute('data-inclusion') === 'overridden'
        ? 'Override · 3 issues acknowledged' : 'Pass';
      return [
        ['Approved by', 'Elleta · Trust level: Junior'],
        ['Inclusion', inclusion],
        ['Files filed', '23 Jira tickets · BELLA-1234..1256'],
        ['Notified', 'Web Lead · iOS Lead · Android Lead'],
        ['Commit', 'cdd396d']
      ];
    }
    if (text.indexOf('Inclusion override') !== -1) {
      return [
        ['Operator', 'Elleta'],
        ['Issues acknowledged', '3 — focus contrast, motion duration, missing translations'],
        ['Logged at', '2026-04-26 13:51'],
        ['Reviewable at', 'Friday review · Wed 10:00 friction triage']
      ];
    }
    return [['Source', 'Cockpit']];
  }
  function decorateAuditEntry(li) {
    if (!li || li.classList.contains('audit__empty')) return;
    if (li.dataset.decorated) return;
    li.dataset.decorated = 'true';
    var summaryText = li.textContent;
    li.innerHTML = '';
    var summary = document.createElement('span');
    summary.className = 'audit__entry__summary';
    summary.textContent = summaryText;
    li.appendChild(summary);
    var prov = document.createElement('div');
    prov.className = 'audit__entry__provenance';
    var dl = document.createElement('dl');
    entryProvenance(summaryText).forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    prov.appendChild(dl);
    li.appendChild(prov);
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'button');
    li.setAttribute('aria-expanded', 'false');
    li.addEventListener('click', function () { toggleAuditEntry(li); });
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAuditEntry(li); }
    });
  }
  function toggleAuditEntry(li) {
    var willOpen = li.getAttribute('aria-expanded') !== 'true';
    auditList.querySelectorAll('.audit__entry').forEach(function (el) {
      el.setAttribute('aria-expanded', 'false');
    });
    if (willOpen) li.setAttribute('aria-expanded', 'true');
  }
  // Wrap appendAuditEntry so new entries auto-decorate
  var _origAppendAuditEntry = appendAuditEntry;
  appendAuditEntry = function (text) {
    _origAppendAuditEntry(text);
    auditList.querySelectorAll('.audit__entry').forEach(decorateAuditEntry);
  };

  // ============ Stage 9.1 / 9.2 / 9.4 — Modals ============
  var settingsBtn = document.getElementById('settings-btn');
  var openAboutLink = document.getElementById('open-about');
  var modalIds = { settings: 'modal-settings', help: 'modal-help', about: 'modal-about' };
  var lastFocusedBeforeModal = null;

  function openModal(name) {
    var el = document.getElementById(modalIds[name]); if (!el) return;
    lastFocusedBeforeModal = document.activeElement;
    el.hidden = false;
    var first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
  }
  function closeModal(name) {
    var el = document.getElementById(modalIds[name]); if (!el) return;
    el.hidden = true;
    if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus) lastFocusedBeforeModal.focus();
  }
  function closeAllModals() { Object.keys(modalIds).forEach(closeModal); }

  if (settingsBtn) settingsBtn.addEventListener('click', function () { openModal('settings'); });
  if (openAboutLink) openAboutLink.addEventListener('click', function () {
    closeModal('settings'); openModal('about');
  });
  document.querySelectorAll('[data-modal-close]').forEach(function (el) {
    el.addEventListener('click', function () { closeModal(el.getAttribute('data-modal-close')); });
  });

  // Segmented controls
  document.querySelectorAll('.seg').forEach(function (seg) {
    var opts = seg.querySelectorAll('.seg__opt');
    opts.forEach(function (opt) {
      opt.addEventListener('click', function () {
        opts.forEach(function (o) { o.classList.remove('seg__opt--active'); });
        opt.classList.add('seg__opt--active');
        var setting = opt.getAttribute('data-setting');
        var value = opt.getAttribute('data-value');
        if (setting === 'theme') setTheme(value);
        else body.setAttribute('data-' + setting, value);
      });
    });
  });

  // Font size slider
  var fontSlider = document.getElementById('set-fontsize');
  var fontReadout = document.getElementById('set-fontsize-readout');
  if (fontSlider) {
    fontSlider.addEventListener('input', function () {
      var pct = parseInt(fontSlider.value, 10);
      document.documentElement.style.fontSize = pct + '%';
      if (fontReadout) fontReadout.textContent = pct + '%';
    });
  }

  // ?, comma, Esc handling for modals
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (body.getAttribute('data-logged-in') !== 'true') return;
    if (e.key === 'Escape') {
      var anyOpen = document.querySelector('.modal:not([hidden])');
      if (anyOpen) { e.preventDefault(); closeAllModals(); return; }
    }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      var helpEl = document.getElementById(modalIds.help);
      if (helpEl && helpEl.hidden) openModal('help'); else closeModal('help');
      return;
    }
    if (e.key === ',' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var anyOpen2 = document.querySelector('.modal:not([hidden])');
      if (!anyOpen2) { e.preventDefault(); openModal('settings'); }
    }
  });

  // Focus-trap Tab cycling within open modal
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var openEl = document.querySelector('.modal:not([hidden])'); if (!openEl) return;
    var focusables = openEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    var first = focusables[0]; var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ============ Stage 10.1 — scroll map detail into view on selection ============
  var mapDetailEl = document.getElementById('map-detail');
  function nudgeMapDetailIntoView() {
    if (!mapDetailEl) return;
    if (body.getAttribute('data-space') !== 'map') return;
    var rect = mapDetailEl.getBoundingClientRect();
    var top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56;
    if (rect.top < top || rect.top > window.innerHeight - 100) {
      mapDetailEl.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }
  }
  // Wrap the existing renderDetail so any selection nudges the panel into view
  if (typeof renderDetail === 'function') {
    var _origRenderDetail = renderDetail;
    renderDetail = function (data) {
      _origRenderDetail(data);
      if (data) nudgeMapDetailIntoView();
    };
  }

  // ============ Stage 10.2 — Agent ask form (Cloud Managed Agent) ============
  var agentAsk      = document.getElementById('agent-ask');
  var agentAskInput = document.getElementById('agent-ask-input');
  var askToast      = document.getElementById('ask-toast');
  var askChat       = document.getElementById('ask-chat');

  var ASK_SESSION_KEY = 'chip:askSessionId';
  var ASK_MAX_TURNS   = 5;
  var askTurns        = [];   // { role: 'operator'|'agent', text }

  // Tiny safe markdown renderer for agent replies.
  // Input must already be HTML-escaped — we only convert markdown tokens
  // (**bold**, _italic_, `code`, [link](url), tables, "- " bullets,
  // paragraph breaks) into tags.
  function isSafeUrl(url) {
    return /^(https?:|mailto:)/i.test(url);
  }
  function applyInline(s) {
    // bold first so it doesn't get eaten by italic
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // inline code `text`
    s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    // markdown links [text](url) — only allow http/https/mailto schemes
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_m, text, url) {
      if (!isSafeUrl(url)) return text;   // strip unsafe links, keep text
      return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
    });
    // italic — *single* or _single_ — but not mid-word
    s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
    return s;
  }
  function renderMarkdown(escaped) {
    var lines = escaped.split('\n');
    var out = [];
    var inList = false;
    var para = [];
    function flushPara() {
      if (para.length) { out.push('<p>' + applyInline(para.join(' ')) + '</p>'); para = []; }
    }
    function closeList() {
      if (inList) { out.push('</ul>'); inList = false; }
    }
    function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
    function isTableSep(line) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line); }
    function splitRow(line) {
      // strip leading/trailing pipe, split on pipe, trim each cell
      var trimmed = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
      return trimmed.split('|').map(function (c) { return c.trim(); });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');

      // Table — header row + separator + body rows
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara(); closeList();
        var headerCells = splitRow(line);
        var bodyRows = [];
        var j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) {
          bodyRows.push(splitRow(lines[j]));
          j++;
        }
        var thead = '<thead><tr>' + headerCells.map(function (c) {
          return '<th>' + applyInline(c) + '</th>';
        }).join('') + '</tr></thead>';
        var tbody = '<tbody>' + bodyRows.map(function (row) {
          return '<tr>' + row.map(function (c) {
            return '<td>' + applyInline(c) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody>';
        out.push('<table class="md-table">' + thead + tbody + '</table>');
        i = j - 1;
        continue;
      }

      // Blockquote — collect consecutive "> " lines into a single <blockquote>
      if (/^\s*>\s?/.test(line)) {
        flushPara(); closeList();
        var quoteLines = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        i--;
        out.push('<blockquote>' + applyInline(quoteLines.join(' ')) + '</blockquote>');
        continue;
      }
      // Markdown headings (# H1, ## H2, ### H3)
      var h = line.match(/^\s*(#{1,3})\s+(.*)$/);
      if (h) {
        flushPara(); closeList();
        out.push('<h' + h[1].length + ' class="md-h">' + applyInline(h[2]) + '</h' + h[1].length + '>');
        continue;
      }
      if (/^\s*-\s+/.test(line)) {
        flushPara();
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + applyInline(line.replace(/^\s*-\s+/, '')) + '</li>');
      } else if (line === '') {
        flushPara(); closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara(); closeList();
    return out.join('');
  }

  function updateChatControls() {
    var ctrls = document.getElementById('ask-controls');
    var meta = document.getElementById('ask-meta');
    if (!ctrls) return;
    var hasTurns = askTurns.length > 0;
    ctrls.hidden = !hasTurns;
    if (meta) {
      var sid = '';
      try { sid = localStorage.getItem(ASK_SESSION_KEY) || ''; } catch (_) {}
      meta.textContent = sid ? 'Session ' + sid.slice(0, 12) + '…' : '';
    }
  }

  function resetChat() {
    askTurns = [];
    try { localStorage.removeItem(ASK_SESSION_KEY); } catch (_) {}
    if (askChat) askChat.innerHTML = '';
    updateChatControls();
    if (agentAskInput) { agentAskInput.disabled = false; agentAskInput.focus(); }
    appendAuditEntry(nowTs() + ' · New conversation started · session cleared · Operator: Elleta');
  }
  var btnNewChat = document.getElementById('btn-new-chat');
  if (btnNewChat) btnNewChat.addEventListener('click', resetChat);

  function renderTurns() {
    if (!askChat) return;
    updateChatControls();
    var html = askTurns.slice(-ASK_MAX_TURNS).map(function (t) {
      if (t.role === 'operator') {
        return '<div class="ask-turn">' +
          '<p class="ask-turn__label">You</p>' +
          '<p class="ask-turn__text--operator">' + escapeHtml(t.text) + '</p>' +
          '</div>';
      }
      return '<div class="ask-turn">' +
        '<p class="ask-turn__label">' +
          '<span class="chip chip--muted" style="font-size:var(--fs-meta);padding:1px var(--s2)">Auto</span>' +
          '<span>CHIP</span>' +
        '</p>' +
        '<div class="ask-turn__text--agent">' + renderMarkdown(escapeHtml(t.text)) + '</div>' +
        '</div>';
    }).join('');
    askChat.innerHTML = html;
    askChat.scrollTop = askChat.scrollHeight;
  }

  function showSkeleton() {
    if (!askChat) return;
    var el = document.createElement('p');
    el.className = 'ask-skeleton';
    el.id = 'ask-skeleton';
    el.textContent = 'Thinking…';
    askChat.appendChild(el);
    askChat.scrollTop = askChat.scrollHeight;
  }

  function removeSkeleton() {
    var el = document.getElementById('ask-skeleton');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showError(msg, retryFn) {
    if (!askChat) return;
    var id = 'ask-err-' + Date.now();
    var p = document.createElement('p');
    p.className = 'ask-error';
    p.id = id;
    p.innerHTML = escapeHtml(msg) +
      ' <button type="button" class="ask-error__retry">Retry</button>';
    askChat.appendChild(p);
    p.querySelector('.ask-error__retry').addEventListener('click', function () {
      if (p.parentNode) p.parentNode.removeChild(p);
      if (retryFn) retryFn();
    });
  }

  // Stage 18.8 — gather the visible cockpit state and prepend it to the
  // user message as a [cockpit state] block. The agent uses it to ground
  // answers to "what needs my attention" / "what's blocked" / etc. without
  // requiring live Jira/Slack/Storybook MCPs.
  function gatherCockpitState() {
    var parity = document.getElementById('meter-value-text');
    var phaseAttr = document.body.getAttribute('data-phase') || 'loaded';
    var auditCount = document.querySelectorAll('#audit-log .audit__entry').length;
    var rows = document.querySelectorAll('.parity-breakdown__row');
    var platforms = [];
    rows.forEach(function (r) {
      var label = r.querySelector('.parity-breakdown__label');
      var count = r.querySelector('.parity-breakdown__count');
      var chip  = r.querySelector('.parity-breakdown__chip');
      if (label && count && chip) {
        platforms.push(label.textContent.trim() + ' ' + count.textContent.trim() + ' (' + chip.textContent.trim() + ')');
      }
    });
    var space = document.body.getAttribute('data-space') || 'cockpit';
    return {
      space:        space,
      phase:        phaseAttr,
      parity:       parity ? parity.textContent.trim() : null,
      platforms:    platforms,
      audit_count:  auditCount,
    };
  }
  function buildAskMessage(userMessage) {
    var s = gatherCockpitState();
    var ctx = '[cockpit state · for grounding · do not echo verbatim]\n' +
      '- Space: ' + s.space + '\n' +
      '- Phase: ' + s.phase + ' (' +
        (s.phase === 'drift' ? 'audit open, awaiting approval' :
         s.phase === 'approved' ? 'roadmap approved, work filed' :
         'monitoring') + ')\n' +
      '- Parity: ' + (s.parity || 'unknown') + '\n' +
      (s.platforms.length ? '- Platforms: ' + s.platforms.join(' · ') + '\n' : '') +
      '- Audit entries today: ' + s.audit_count + '\n' +
      '- Pending: 1 proposal awaiting approval, 3 inbox replies, 3 events today, 6 items in Coming up\n\n' +
      'Operator question:\n' + userMessage;
    return ctx;
  }

  function doAsk(message) {
    var sessionId;
    try { sessionId = localStorage.getItem(ASK_SESSION_KEY) || undefined; } catch (_) {}

    if (agentAskInput) agentAskInput.disabled = true;
    askTurns.push({ role: 'operator', text: message });   // operator sees their original question
    renderTurns();
    showSkeleton();

    var payloadMessage = buildAskMessage(message);

    fetch('http://localhost:3000/ask', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: payloadMessage, sessionId: sessionId }),
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      removeSkeleton();
      if (data.error) {
        showError(data.error, function () { doAsk(message); });
      } else {
        askTurns.push({ role: 'agent', text: data.reply });
        try { if (data.sessionId) localStorage.setItem(ASK_SESSION_KEY, data.sessionId); } catch (_) {}
        renderTurns();
      }
      if (agentAskInput) { agentAskInput.disabled = false; agentAskInput.focus(); }
    })
    .catch(function () {
      removeSkeleton();
      showError(
        'Agent server not running. Start with: cd server && npm start.',
        function () { doAsk(message); }
      );
      if (agentAskInput) { agentAskInput.disabled = false; agentAskInput.focus(); }
    });
  }

  // Stage 18.13 — predefined suggestion chips: clicking one fills the input
  // with the canonical question and submits it. Operator can edit if they
  // want — clicking just kicks off the ask.
  document.querySelectorAll('.agent-card__suggestion').forEach(function (b) {
    b.addEventListener('click', function () {
      var q = b.getAttribute('data-suggestion');
      if (!q || !agentAskInput) return;
      agentAskInput.value = q;
      // submit via the form so the existing handler runs
      if (agentAsk) agentAsk.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

  if (agentAsk) {
    agentAsk.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = agentAskInput && agentAskInput.value.trim();
      if (!msg) return;
      agentAskInput.value = '';
      doAsk(msg);
    });
  }

  // ============ Stage 18.15 — PRISM-style dependency tree ============
  // Click any tree node → detail side panel populates with description,
  // metrics, last update / next review, sparkline, availability bar.
  var DEP_NODE_DATA = {
    bella: {
      title: 'BELLA design system',
      meta:  'Web · iOS · Android · live',
      chip:  { label: 'Healthy',  cls: 'dep-node__chip--healthy'  },
      desc:  'The full design system: tokens, primitives, patterns, and platform implementations. CHIP watches every surface for divergence and surfaces it here.',
      updated: '14m ago',
      next:    'Friday 10:00',
      spark: '0,40 30,38 60,32 90,30 120,28 150,22 180,18 200,12',
      sparkColor: 'var(--sage)',
      avail: 38,
      metrics: [['Components', '12'], ['In sync', '1 / 3 platforms'], ['Open alerts', '4'], ['Audit entries today', '1']],
    },
    components: {
      title: 'Component library',
      meta:  '12 components · atoms / molecules / organisms',
      chip:  { label: 'Drift', cls: 'dep-node__chip--warning' },
      desc:  'Atomic-design layers. Drift detected on iOS and Android implementations of Button, Card, Input, Modal, Badge, and Nav link.',
      updated: '14m ago',
      next:    'Friday 10:00 · Parity review',
      spark: '0,28 30,30 60,32 90,28 120,30 150,32 180,34 200,36',
      sparkColor: 'var(--amber)',
      avail: 66,
      metrics: [['Atoms', '6 · 4 drifting'], ['Molecules', '3 · 1 drifting'], ['Organisms', '3 · all in sync'], ['Critical', '0']],
    },
    platforms: {
      title: 'Platform repos',
      meta:  'react-bella-web · ios-bella · android-bella',
      chip:  { label: 'Critical', cls: 'dep-node__chip--critical' },
      desc:  'Three platform implementations of BELLA. Web is in sync. iOS is 23 components behind master. Android is 47 components behind — landscape mode shipped without parity check.',
      updated: '2h ago',
      next:    'Friday 14:00 · Parity sync',
      spark: '0,18 30,22 60,28 90,32 120,36 150,40 180,44 200,48',
      sparkColor: 'var(--rust)',
      avail: 38,
      metrics: [['Web', '47 / 47 in sync'], ['iOS', '23 / 47'], ['Android', '0 / 47'], ['Open critical', '1']],
    },
    sources: {
      title: 'Sources of truth',
      meta:  'Figma · Storybook · Zeroheight',
      chip:  { label: 'Stale', cls: 'dep-node__chip--warning' },
      desc:  'Canonical references. Figma library and Storybook are in sync. Zeroheight docs are 6 days behind the latest Storybook deploy — Card v2.14.3 not reflected.',
      updated: '6 days ago',
      next:    'Monday 09:00 · Publish queue',
      spark: '0,30 30,28 60,30 90,32 120,30 150,34 180,40 200,44',
      sparkColor: 'var(--amber)',
      avail: 76,
      metrics: [['Figma', 'master clean'], ['Storybook', '89 stories · 2h ago'], ['Zeroheight', '3 pages out of date'], ['Pending publish', '2']],
    },
    connected: {
      title: 'Connected systems',
      meta:  'Notion live · Slack / Gmail / Jira pending v1',
      chip:  { label: 'Healthy', cls: 'dep-node__chip--healthy' },
      desc:  'External MCP integrations. Notion is fully wired to the Cloud Managed Agent and returns real research-library queries. Slack, Gmail, Jira are post-submission engineering — same pattern, OAuth + credential vault.',
      updated: '14m ago',
      next:    'v1 wiring',
      spark: '0,36 30,34 60,32 90,30 120,28 150,26 180,24 200,22',
      sparkColor: 'var(--sage)',
      avail: 25,
      metrics: [['Notion MCP', 'live · 47 sources reachable'], ['Slack', 'v1 planned'], ['Gmail', 'v1 planned'], ['Jira', 'v1 planned']],
    },
    // Grandchildren — Component library
    'comp-atoms': {
      title: 'Atoms', meta: '6 components · button · card · input · chip · eyebrow · nav link',
      chip: { label: 'Drift', cls: 'dep-node__chip--warning' },
      desc: '6 atomic primitives. Button, Card, Input, Nav link drifting on Android. Chip and Eyebrow have minor letter-spacing divergence on iOS.',
      updated: '2h ago', next: 'Friday 10:00 · Parity review',
      spark: '0,30 30,28 60,26 90,28 120,30 150,32 180,30 200,28',
      sparkColor: 'var(--amber)', avail: 66,
      metrics: [['In spec', '2 / 6'], ['Drifting', '3 / 6'], ['Missing', '1 / 6 (Android)'], ['Linked', 'Component map']],
    },
    'comp-molecules': {
      title: 'Molecules', meta: '3 components · modal · avatar · badge',
      chip: { label: 'In sync', cls: 'dep-node__chip--healthy' },
      desc: '3 molecule patterns. Modal, Avatar, Badge. Avatar is fully in spec across all platforms. Modal has a minor Android landscape gap.',
      updated: '6h ago', next: 'Friday 10:00',
      spark: '0,20 30,22 60,24 90,22 120,24 150,26 180,28 200,30',
      sparkColor: 'var(--sage)', avail: 92,
      metrics: [['In spec', '2.5 / 3'], ['Partial', 'Modal Android'], ['Avatar', '100% all platforms'], ['Badge', '87% avg']],
    },
    'comp-organisms': {
      title: 'Organisms', meta: '3 components · AI Card · AI Diff · AI Meter',
      chip: { label: 'In sync', cls: 'dep-node__chip--healthy' },
      desc: 'AI-native surfaces. Web only at v0. iOS + Android planned for v1. Storybook stories partially complete.',
      updated: '1h ago', next: 'v1 platform expansion',
      spark: '0,40 30,38 60,36 90,34 120,32 150,30 180,32 200,34',
      sparkColor: 'var(--sage)', avail: 95,
      metrics: [['Web', '95% (3/3)'], ['iOS', 'v1 planned'], ['Android', 'v1 planned'], ['Storybook', '73%']],
    },
    // Grandchildren — Platform repos
    'plat-web': {
      title: 'Web · react-bella-web', meta: '100% in sync · main branch clean',
      chip: { label: 'In sync', cls: 'dep-node__chip--healthy' },
      desc: 'React implementation of BELLA. Storybook at 89 stories, CI green. All 47 components in spec.',
      updated: '14m ago', next: 'Friday 14:00 · Deploy',
      spark: '0,20 30,18 60,20 90,18 120,16 150,18 180,20 200,18',
      sparkColor: 'var(--sage)', avail: 100,
      metrics: [['Components', '47 / 47'], ['CI', 'green'], ['Last deploy', '14m ago'], ['Storybook', '89 stories']],
    },
    'plat-ios': {
      title: 'iOS · ios-bella', meta: '49% drift · 23 components behind',
      chip: { label: 'Drift', cls: 'dep-node__chip--warning' },
      desc: 'Swift/UIKit implementation. 23 components drifting from master. Focus-order divergence flagged on Modal landscape variant.',
      updated: '2h ago', next: 'Friday 14:00 · iOS Lead sync',
      spark: '0,30 30,32 60,34 90,36 120,38 150,40 180,42 200,44',
      sparkColor: 'var(--amber)', avail: 49,
      metrics: [['In spec', '24 / 47'], ['Drifting', '23 / 47'], ['Critical', 'focus-order (Modal)'], ['Next sync', 'Friday']],
    },
    'plat-android': {
      title: 'Android · android-bella', meta: '0% · 47 components behind master',
      chip: { label: 'Critical', cls: 'dep-node__chip--critical' },
      desc: 'Kotlin implementation. Landscape mode shipped without parity check — 47 components diverged. BELLA-1267 open.',
      updated: '2h ago', next: 'Block until parity check',
      spark: '0,50 30,52 60,54 90,56 120,58 150,56 180,54 200,52',
      sparkColor: 'var(--rust)', avail: 0,
      metrics: [['In spec', '0 / 47'], ['Critical alerts', '1'], ['JIRA ticket', 'BELLA-1267'], ['Blocked', 'landscape merge']],
    },
    // Grandchildren — Sources of truth
    'src-figma': {
      title: 'Figma', meta: 'master clean · library published',
      chip: { label: 'In sync', cls: 'dep-node__chip--healthy' },
      desc: 'Figma design library. Master branch clean. All tokens published. Component frames match Storybook.',
      updated: '14m ago', next: 'Monday · Library review',
      spark: '0,18 30,16 60,18 90,16 120,14 150,16 180,18 200,16',
      sparkColor: 'var(--sage)', avail: 100,
      metrics: [['Library', 'published'], ['Tokens', '138 in sync'], ['Components', '12 frames'], ['Last push', '14m ago']],
    },
    'src-storybook': {
      title: 'Storybook', meta: '89 stories · CI green',
      chip: { label: 'In sync', cls: 'dep-node__chip--healthy' },
      desc: 'Storybook component library. 89 stories across 12 components. CI pipeline green. v2.14.3 deployed.',
      updated: '2h ago', next: 'Continuous',
      spark: '0,20 30,22 60,20 90,22 120,24 150,22 180,20 200,22',
      sparkColor: 'var(--sage)', avail: 100,
      metrics: [['Stories', '89 (12 components)'], ['CI', 'green'], ['Version', 'v2.14.3'], ['Deploy', '2h ago']],
    },
    'src-zeroheight': {
      title: 'Zeroheight', meta: 'docs · 6d behind Storybook',
      chip: { label: 'Stale', cls: 'dep-node__chip--warning' },
      desc: 'ZeroHeight documentation. Card v2.14.3 not reflected — 6 pages out of date. Publish queue has 2 pending items.',
      updated: '6d ago', next: 'Monday 09:00 · Publish queue',
      spark: '0,30 30,32 60,34 90,36 120,38 150,40 180,42 200,44',
      sparkColor: 'var(--amber)', avail: 76,
      metrics: [['Pages', '3 of 15 stale'], ['Pending publish', '2'], ['Last sync', '6d ago'], ['Alert', 'Card v2.14.3 missing']],
    },
    // Grandchildren — Connected systems
    'conn-notion': {
      title: 'Notion', meta: 'live MCP · 47 sources reachable',
      chip: { label: 'Live', cls: 'dep-node__chip--healthy' },
      desc: 'Notion MCP wired to CHIP’s Cloud Managed Agent. 47 research library sources reachable via credential vault.',
      updated: '14m ago', next: 'Continuous',
      spark: '0,16 30,14 60,16 90,14 120,12 150,14 180,16 200,14',
      sparkColor: 'var(--sage)', avail: 95,
      metrics: [['Sources', '47 reachable'], ['MCP', 'credential vault'], ['Agent', 'Opus 4.7'], ['Latency', '~2s avg']],
    },
    'conn-slack': {
      title: 'Slack', meta: 'v1 planned · same pattern as Notion',
      chip: { label: 'Pending', cls: 'dep-node__chip--muted' },
      desc: 'Slack MCP integration planned for v1. OAuth + credential vault, same pattern as Notion. Not yet wired.',
      updated: '—', next: 'v1 engineering',
      spark: '0,50 30,50 60,50 90,50 120,50 150,50 180,50 200,50',
      sparkColor: 'var(--border)', avail: 0,
      metrics: [['Status', 'planned'], ['Pattern', 'OAuth + vault'], ['ETA', 'v1'], ['Blocker', 'none']],
    },
    'conn-gmail': {
      title: 'Gmail', meta: 'v1 planned',
      chip: { label: 'Pending', cls: 'dep-node__chip--muted' },
      desc: 'Gmail MCP planned for v1 — primarily for sending parity-report digests to platform leads.',
      updated: '—', next: 'v1 engineering',
      spark: '0,50 30,50 60,50 90,50 120,50 150,50 180,50 200,50',
      sparkColor: 'var(--border)', avail: 0,
      metrics: [['Status', 'planned'], ['Use case', 'digest reports'], ['ETA', 'v1'], ['Blocker', 'none']],
    },
    'conn-jira': {
      title: 'Jira', meta: 'v1 planned',
      chip: { label: 'Pending', cls: 'dep-node__chip--muted' },
      desc: 'Jira MCP planned for v1 — auto-file parity tickets (e.g. BELLA-1267) directly from CHIP alert recommendations.',
      updated: '—', next: 'v1 engineering',
      spark: '0,50 30,50 60,50 90,50 120,50 150,50 180,50 200,50',
      sparkColor: 'var(--border)', avail: 0,
      metrics: [['Status', 'planned'], ['Use case', 'auto-file parity tickets'], ['ETA', 'v1'], ['Blocker', 'none']],
    },
  };

  function selectDepNode(nodeId) {
    var data = DEP_NODE_DATA[nodeId];
    if (!data) return;
    // Visual state
    document.querySelectorAll('.dep-node').forEach(function (n) {
      n.classList.remove('dep-node--active');
      n.setAttribute('aria-selected', 'false');
    });
    var btn = document.querySelector('[data-dep-node="' + nodeId + '"]');
    if (btn) { btn.classList.add('dep-node--active'); btn.setAttribute('aria-selected', 'true'); }

    // Populate detail
    var $ = function (id) { return document.getElementById(id); };
    if ($('dep-detail-title'))    $('dep-detail-title').textContent    = data.title;
    if ($('dep-detail-meta'))     $('dep-detail-meta').textContent     = data.meta;
    if ($('dep-detail-chip'))     {
      var chip = $('dep-detail-chip');
      chip.className = 'dep-node__chip ' + data.chip.cls;
      chip.textContent = data.chip.label;
    }
    if ($('dep-detail-desc'))     $('dep-detail-desc').textContent     = data.desc;
    if ($('dep-detail-updated'))  $('dep-detail-updated').textContent  = data.updated;
    if ($('dep-detail-next'))     $('dep-detail-next').textContent     = data.next;
    if ($('dep-detail-avail-pct'))$('dep-detail-avail-pct').textContent= data.avail + '%';
    if ($('dep-detail-bar-fill')) $('dep-detail-bar-fill').style.width = data.avail + '%';
    if ($('dep-detail-spark')) {
      $('dep-detail-spark').innerHTML =
        '<polyline points="' + data.spark + '" fill="none" stroke="' + data.sparkColor + '" stroke-width="2" />';
    }
    if ($('dep-detail-metrics')) {
      $('dep-detail-metrics').innerHTML = data.metrics.map(function (m) {
        return '<div><dt>' + escapeHtml(m[0]) + '</dt><dd>' + escapeHtml(m[1]) + '</dd></div>';
      }).join('');
    }
  }

  document.querySelectorAll('[data-dep-node]').forEach(function (node) {
    node.addEventListener('click', function () {
      selectDepNode(node.getAttribute('data-dep-node'));
    });
  });

  // Grandchild space-link: clicking an atom/molecule/organism node navigates to Component map
  document.querySelectorAll('[data-dep-space-link]').forEach(function (node) {
    node.addEventListener('click', function (e) {
      var target = node.getAttribute('data-dep-space-link');
      if (target && typeof setSpace === 'function') {
        e.stopPropagation();
        setSpace(target);
      }
    });
  });

  // Alert dot click: navigate to Bridge and scroll to alerts panel
  document.querySelectorAll('[data-alert-nav]').forEach(function (dot) {
    dot.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof setSpace === 'function') setSpace('cockpit');
      setTimeout(function () {
        var alertsEl = document.querySelector('.alerts-panel');
        if (alertsEl) alertsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    });
  });

  // Default-select root on load so the detail isn't empty
  if (document.querySelector('[data-dep-node="bella"]')) {
    selectDepNode('bella');
  }

  // ============ Stage 18.7 — Inbox compose + audit ============
  // Reply opens an inline composition panel with a prefilled draft.
  // Defer / Done write audit entries and visually mark the row.
  // In v1 these route through Slack / Gmail MCP servers the same way
  // Notion does — for now they record the operator's intent and decision
  // path through the cockpit.
  function getRowMeta(row) {
    var src = row.querySelector('.inbox-card__source');
    var quote = row.querySelector('.inbox-card__quote');
    var meta = row.querySelector('.inbox-card__meta');
    return {
      source:  src ? src.textContent.trim() : 'Inbox',
      quote:   quote ? quote.textContent.trim().replace(/^"|"$/g, '') : '',
      meta:    meta ? meta.textContent.trim() : '',
    };
  }

  function draftFor(rowMeta) {
    // Minimal heuristic: if it's a question, draft a direct answer template;
    // otherwise acknowledge + propose a next step.
    var q = rowMeta.quote;
    if (/[?]\s*$/.test(q)) {
      // Question — propose a yes/no/sync framing
      if (/sync/i.test(q))   return 'Yes — Friday at 14:00 works. I\'ll bring the focus-ring fix; can you bring the iOS focus order audit?';
      if (/shipping/i.test(q)) return 'Modal landscape variant: shipping next sprint. Holding this sprint until the iOS focus-order parity is signed off — should land in BELLA-1247.';
      if (/good\?/i.test(q)) return 'Good on Web and iOS, Android still missing 47 components. Component freeze for Q3 is fine if Android catches up by parity review (Friday 10:00).';
    }
    return 'Acknowledged — looking now. Will reply with a concrete next step within 30 min.';
  }

  function nowTs() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  }

  function closeCompose(row) {
    var cmp = row.querySelector('[data-compose]');
    if (cmp) { cmp.hidden = true; cmp.innerHTML = ''; }
    row.removeAttribute('data-row-state');
  }

  function openReply(row) {
    var cmp = row.querySelector('[data-compose]');
    if (!cmp) return;
    var meta = getRowMeta(row);
    var draft = draftFor(meta);
    var channel = meta.source.split('·')[0].trim();      // "Slack · #ds-leads" → "Slack"
    cmp.hidden = false;
    cmp.innerHTML =
      '<form class="compose" data-compose-form>' +
        '<p class="compose__eyebrow">Reply via ' + escapeHtml(channel) +
          ' <span class="chip chip--muted" style="font-size:var(--fs-meta);padding:1px var(--s2)">v1 routes through MCP</span></p>' +
        '<textarea class="compose__textarea" rows="3" required>' + escapeHtml(draft) + '</textarea>' +
        '<div class="compose__row">' +
          '<button type="button" class="btn btn--sm btn--neutral" data-compose-cancel>Cancel</button>' +
          '<button type="submit" class="btn btn--sm btn--primary">Send</button>' +
        '</div>' +
      '</form>';
    row.setAttribute('data-row-state', 'composing');
    var ta = cmp.querySelector('textarea');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }

    cmp.querySelector('[data-compose-cancel]').addEventListener('click', function () {
      closeCompose(row);
    });
    cmp.querySelector('[data-compose-form]').addEventListener('submit', function (e) {
      e.preventDefault();
      var sent = (ta && ta.value || '').trim();
      if (!sent) return;
      var ts = nowTs();
      appendAuditEntry(ts + ' · Reply drafted via ' + channel + ' · ready to send when MCP wired · Operator: Elleta');
      // Replace compose form with a sent confirmation
      cmp.innerHTML =
        '<div class="compose compose--sent">' +
          '<p class="compose__eyebrow">' + escapeHtml(ts) + ' · Drafted via ' + escapeHtml(channel) + '</p>' +
          '<p class="compose__sent-headline">Reply queued. CHIP will send it once the ' + escapeHtml(channel) + ' MCP is connected.</p>' +
          '<blockquote class="compose__sent-body">' + escapeHtml(sent) + '</blockquote>' +
          '<p class="compose__sent-note">Audit entry written below. Reply state recorded; mark Done when delivered.</p>' +
        '</div>';
      row.setAttribute('data-row-state', 'sent');
    });
  }

  function defer(row) {
    var meta = getRowMeta(row);
    var channel = meta.source.split('·')[0].trim();
    var ts = nowTs();
    appendAuditEntry(ts + ' · Deferred ' + channel + ' reply · re-surface tomorrow 09:00 · Operator: Elleta');
    var cmp = row.querySelector('[data-compose]');
    if (cmp) {
      cmp.hidden = false;
      cmp.innerHTML =
        '<div class="compose compose--deferred">' +
          '<p class="compose__eyebrow">' + escapeHtml(ts) + ' · Deferred</p>' +
          '<p class="compose__sent-headline">Re-surface tomorrow 09:00. CHIP will remind you.</p>' +
        '</div>';
    }
    row.setAttribute('data-row-state', 'deferred');
  }

  function markDone(row) {
    var meta = getRowMeta(row);
    var channel = meta.source.split('·')[0].trim();
    var ts = nowTs();
    appendAuditEntry(ts + ' · Marked done · ' + channel + ' · no reply needed · Operator: Elleta');
    var cmp = row.querySelector('[data-compose]');
    if (cmp) {
      cmp.hidden = false;
      cmp.innerHTML =
        '<div class="compose compose--done">' +
          '<p class="compose__eyebrow">' + escapeHtml(ts) + ' · Done</p>' +
          '<p class="compose__sent-headline">Marked complete. No outbound reply.</p>' +
        '</div>';
    }
    row.setAttribute('data-row-state', 'done');
  }

  document.querySelectorAll('[data-inbox-action]').forEach(function (b) {
    b.addEventListener('click', function () {
      var row = b.closest('.inbox-card__row');
      if (!row) return;
      var action = b.getAttribute('data-inbox-action');
      if (action === 'reply')      openReply(row);
      else if (action === 'defer') defer(row);
      else if (action === 'done')  markDone(row);
    });
  });

  // ============ Today card · Open events ============
  document.querySelectorAll('.today-card__open').forEach(function (b) {
    b.addEventListener('click', function () {
      var title = b.getAttribute('data-event-title') || 'event';
      var time = b.getAttribute('data-event-time') || '';
      var atts = b.getAttribute('data-event-attendees') || '';
      var ts = nowTs();
      appendAuditEntry(ts + ' · Opened "' + title + '" (' + time + ') · ' + atts + ' · Operator: Elleta');
      // Briefly mark the button state for visual feedback
      var orig = b.textContent;
      b.textContent = 'Opened ✓';
      b.disabled = true;
      setTimeout(function () { b.textContent = orig; b.disabled = false; }, 1400);
    });
  });

  // ============ Stage 10.5 — Surfaces compact toggle ============
  var surfacesCard = document.querySelector('.card.surfaces');
  var surfacesToggle = document.getElementById('surfaces-toggle');
  function applySurfacesMode(mode) {
    if (!surfacesCard) return;
    var compact = mode === 'compact';
    surfacesCard.classList.toggle('surfaces--compact', compact);
    if (surfacesToggle) {
      surfacesToggle.setAttribute('aria-pressed', compact ? 'true' : 'false');
      surfacesToggle.textContent = compact ? 'Full mode' : 'Compact';
    }
  }
  try {
    var savedMode = localStorage.getItem('chip:surfacesMode');
    if (savedMode) applySurfacesMode(savedMode);
  } catch (_) {}
  if (surfacesToggle) {
    surfacesToggle.addEventListener('click', function () {
      var current = surfacesCard && surfacesCard.classList.contains('surfaces--compact') ? 'compact' : 'full';
      var next = current === 'compact' ? 'full' : 'compact';
      applySurfacesMode(next);
      try { localStorage.setItem('chip:surfacesMode', next); } catch (_) {}
    });
  }

  // ============ Stage 10.6 — Audit count chip in topbar ============
  var auditCountChip = document.getElementById('audit-count-chip');
  var auditCountNum  = document.getElementById('audit-count-num');
  function refreshAuditCount() {
    if (!auditCountChip || !auditCountNum) return;
    var n = auditList.querySelectorAll('.audit__entry').length;
    if (n === 0) {
      auditCountChip.hidden = true;
    } else {
      auditCountChip.hidden = false;
      // Stage 14.5 — render full string in JS to avoid any whitespace stripping
      auditCountChip.textContent = 'Audit · ' + n + ' today';
    }
  }
  if (auditCountChip) {
    auditCountChip.addEventListener('click', function () {
      var ribbon = document.querySelector('.audit');
      if (ribbon) ribbon.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }
  // Wrap appendAuditEntry once more for count refresh
  var _origAppend2 = appendAuditEntry;
  appendAuditEntry = function (text) {
    _origAppend2(text);
    refreshAuditCount();
  };
  // Wrap clearAudit too
  var _origClearAudit = clearAudit;
  clearAudit = function () { _origClearAudit(); refreshAuditCount(); };
  refreshAuditCount();

  // Cmd+K focuses Ask CHIP input (stage 10.2 hook; full palette is Stage 13)
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      // Stage 13 palette overrides this; only run if palette doesn't exist yet
      if (!document.getElementById('palette-modal')) {
        if (agentAskInput && body.getAttribute('data-space') === 'cockpit') {
          e.preventDefault();
          agentAskInput.focus();
        }
      }
    }
  });

  // ============ Stage 11.1 — Components matrix sortable headers ============
  var matrixListEl = document.querySelector('.components-matrix__list');
  var matrixSortBtns = document.querySelectorAll('.components-matrix__sort');
  var matrixOriginalOrder = matrixListEl ? Array.prototype.slice.call(matrixListEl.querySelectorAll('.components-matrix__row')) : [];

  function cellScore(row, colIdx) {
    if (colIdx === 0) {
      var n = row.querySelector('.components-matrix__name');
      return n ? n.textContent.trim().toLowerCase() : '';
    }
    var c = row.querySelectorAll('.components-matrix__cell')[colIdx - 1];
    if (!c) return -1;
    if (c.classList.contains('components-matrix__cell--na')) return -1;
    var v = parseFloat(c.textContent);
    return isNaN(v) ? -1 : v;
  }
  function applyMatrixSort(col, dir) {
    if (!matrixListEl) return;
    if (col == null) {
      matrixOriginalOrder.forEach(function (row) { matrixListEl.appendChild(row); });
      return;
    }
    var arr = matrixOriginalOrder.slice();
    arr.sort(function (a, b) {
      var av = cellScore(a, col), bv = cellScore(b, col);
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      return dir === 'asc' ? av - bv : bv - av;
    });
    arr.forEach(function (row) { matrixListEl.appendChild(row); });
  }
  var matrixSortState = { col: null, dir: null };
  try {
    var saved = localStorage.getItem('chip:matrixSort');
    if (saved) {
      var p = JSON.parse(saved);
      if (p && typeof p.col === 'number') {
        matrixSortState = p;
        applyMatrixSort(p.col, p.dir);
      }
    }
  } catch (_) {}
  function repaintMatrixSortGlyphs() {
    matrixSortBtns.forEach(function (btn) {
      var col = parseInt(btn.getAttribute('data-sort-col'), 10);
      btn.removeAttribute('data-sort-dir');
      if (col === matrixSortState.col) btn.setAttribute('data-sort-dir', matrixSortState.dir);
    });
  }
  repaintMatrixSortGlyphs();
  matrixSortBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var col = parseInt(btn.getAttribute('data-sort-col'), 10);
      var dir = (matrixSortState.col === col && matrixSortState.dir === 'asc') ? 'desc' : 'asc';
      matrixSortState = { col: col, dir: dir };
      applyMatrixSort(col, dir);
      repaintMatrixSortGlyphs();
      try { localStorage.setItem('chip:matrixSort', JSON.stringify(matrixSortState)); } catch (_) {}
    });
  });

  // ============ Stage 11.2 — Heatmap toggle ============
  var matrixCard = document.querySelector('.components-matrix');
  var matrixViewToggle = document.getElementById('matrix-view-toggle');
  function applyMatrixView(mode) {
    if (!matrixCard) return;
    var heat = mode === 'heatmap';
    matrixCard.classList.toggle('components-matrix--heatmap', heat);
    if (matrixViewToggle) {
      matrixViewToggle.setAttribute('aria-pressed', heat ? 'true' : 'false');
      matrixViewToggle.textContent = heat ? 'Numbers' : 'Heatmap';
    }
  }
  try {
    var savedView = localStorage.getItem('chip:matrixView');
    if (savedView) applyMatrixView(savedView);
  } catch (_) {}
  if (matrixViewToggle) matrixViewToggle.addEventListener('click', function () {
    var current = matrixCard && matrixCard.classList.contains('components-matrix--heatmap') ? 'heatmap' : 'numbers';
    var next = current === 'heatmap' ? 'numbers' : 'heatmap';
    applyMatrixView(next);
    try { localStorage.setItem('chip:matrixView', next); } catch (_) {}
  });

  // ============ Stage 11.3 — Surfaces sortable headers ============
  var surfacesListEl = document.getElementById('surfaces-list');
  var surfacesOriginalOrder = surfacesListEl ? Array.prototype.slice.call(surfacesListEl.querySelectorAll('.surfaces__row')) : [];
  var surfacesSortBtns = document.querySelectorAll('.surfaces__sort');
  function surfaceCellText(row, col) {
    var cls = ['.surfaces__name', '.chip', '.surfaces__detail'][col];
    var el = row.querySelector(cls);
    return el ? el.textContent.trim().toLowerCase() : '';
  }
  function applySurfacesSort(col, dir) {
    if (!surfacesListEl) return;
    if (col == null) {
      surfacesOriginalOrder.forEach(function (r) { surfacesListEl.appendChild(r); });
      return;
    }
    var arr = surfacesOriginalOrder.slice();
    arr.sort(function (a, b) {
      var av = surfaceCellText(a, col), bv = surfaceCellText(b, col);
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    arr.forEach(function (r) { surfacesListEl.appendChild(r); });
  }
  var surfacesSortState = { col: null, dir: null };
  try {
    var savedS = localStorage.getItem('chip:surfacesSort');
    if (savedS) { surfacesSortState = JSON.parse(savedS); applySurfacesSort(surfacesSortState.col, surfacesSortState.dir); }
  } catch (_) {}
  function repaintSurfacesSortGlyphs() {
    surfacesSortBtns.forEach(function (btn) {
      var col = parseInt(btn.getAttribute('data-sort-col'), 10);
      btn.removeAttribute('data-sort-dir');
      if (col === surfacesSortState.col) btn.setAttribute('data-sort-dir', surfacesSortState.dir);
    });
  }
  repaintSurfacesSortGlyphs();
  surfacesSortBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var col = parseInt(btn.getAttribute('data-sort-col'), 10);
      var dir = (surfacesSortState.col === col && surfacesSortState.dir === 'asc') ? 'desc' : 'asc';
      surfacesSortState = { col: col, dir: dir };
      applySurfacesSort(col, dir);
      repaintSurfacesSortGlyphs();
      try { localStorage.setItem('chip:surfacesSort', JSON.stringify(surfacesSortState)); } catch (_) {}
    });
  });

  // ============ Stage 11.4 — Research Table view ============
  var researchTableWrapper = document.getElementById('research-table-wrapper');
  var researchTableBody = document.getElementById('research-table-body');
  var researchGrid = document.querySelector('.research-grid');
  function renderResearchTable() {
    if (!researchTableBody) return;
    researchTableBody.innerHTML = '';
    Object.keys(RESEARCH_DATA).forEach(function (id) {
      var d = RESEARCH_DATA[id];
      var tr = document.createElement('tr');
      tr.setAttribute('data-research', id);
      var connCount = (d.connections || []).length;
      var tags = '';
      var entryEl = document.querySelector('[data-research="' + id + '"]');
      if (entryEl) {
        var tagSpans = entryEl.querySelectorAll('.tag');
        tags = Array.prototype.map.call(tagSpans, function (s) { return s.textContent; }).join(' · ');
      }
      tr.innerHTML =
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td>' + escapeHtml(d.author) + '</td>' +
        '<td class="col-title">' + escapeHtml(d.title) + '</td>' +
        '<td class="col-tags">' + escapeHtml(tags) + '</td>' +
        '<td>' + connCount + ' →</td>';
      tr.addEventListener('click', function () {
        if (typeof selectResearch === 'function') selectResearch(id);
      });
      researchTableBody.appendChild(tr);
    });
  }
  function setResearchView(view) {
    document.querySelectorAll('[data-research-view]').forEach(function (b) {
      var active = b.getAttribute('data-research-view') === view;
      b.classList.toggle('view-toggle--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (researchTableWrapper) researchTableWrapper.hidden = view !== 'table';
    if (researchGrid) researchGrid.hidden = view === 'table';
    if (view === 'table') renderResearchTable();
    try { localStorage.setItem('chip:researchView', view); } catch (_) {}
  }
  document.querySelectorAll('[data-research-view]').forEach(function (b) {
    b.addEventListener('click', function () { setResearchView(b.getAttribute('data-research-view')); });
  });
  try {
    var savedRView = localStorage.getItem('chip:researchView');
    if (savedRView) setResearchView(savedRView);
  } catch (_) {}

  // ============ Stage 11.5 — Friction Table view ============
  var frictionTableWrapper = document.getElementById('friction-table-wrapper');
  var frictionTableBody = document.getElementById('friction-table-body');
  var frictionGridEl = document.querySelector('.friction-grid');
  var FRICTION_LABEL = {
    sidebar:  { date: '2026-04-24', status: 'Open',     source: 'Cowork',       headline: 'The sidebar is too wide — and it just stays open.' },
    finder:   { date: '2026-04-24', status: 'Open',     source: 'Cowork',       headline: '"Show in Finder" is an ejection seat.' },
    darkmode: { date: '2026-04-24', status: 'Resolved', source: 'CHIP cockpit', headline: 'Dark mode had invisible button text.' },
    coparent: { date: '2026-04-22', status: 'Open',     source: 'Notion',       headline: 'Conversations with my co-parent should render as meetings.' },
    approval: { date: '2026-04-18', status: 'Resolved', source: 'CHIP cockpit', headline: 'The four-click approval dance.' },
    pink:     { date: '2026-04-15', status: 'Wishlist', source: 'CHIP',         headline: 'One day I want it to be pink.' }
  };
  function renderFrictionTable() {
    if (!frictionTableBody) return;
    frictionTableBody.innerHTML = '';
    Object.keys(FRICTION_LABEL).forEach(function (id) {
      var d = FRICTION_LABEL[id];
      var rel = (FRICTION_DATA && FRICTION_DATA[id] && FRICTION_DATA[id].related) ? FRICTION_DATA[id].related.length : 0;
      var chipCls = d.status === 'Open' ? 'chip--accent' : (d.status === 'Resolved' ? 'chip--success' : 'chip--dusk');
      var tr = document.createElement('tr');
      tr.setAttribute('data-friction', id);
      tr.innerHTML =
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td><span class="chip ' + chipCls + '">' + escapeHtml(d.status) + '</span></td>' +
        '<td>' + escapeHtml(d.source) + '</td>' +
        '<td class="col-headline">' + escapeHtml(d.headline) + '</td>' +
        '<td>' + rel + ' related</td>';
      tr.addEventListener('click', function () {
        if (typeof selectFriction === 'function') selectFriction(id);
      });
      frictionTableBody.appendChild(tr);
    });
  }
  function setFrictionView(view) {
    document.querySelectorAll('[data-friction-view]').forEach(function (b) {
      var active = b.getAttribute('data-friction-view') === view;
      b.classList.toggle('view-toggle--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (frictionTableWrapper) frictionTableWrapper.hidden = view !== 'table';
    if (frictionGridEl) frictionGridEl.hidden = view === 'table';
    if (view === 'table') renderFrictionTable();
    try { localStorage.setItem('chip:frictionView', view); } catch (_) {}
  }
  document.querySelectorAll('[data-friction-view]').forEach(function (b) {
    b.addEventListener('click', function () { setFrictionView(b.getAttribute('data-friction-view')); });
  });
  try {
    var savedFView = localStorage.getItem('chip:frictionView');
    if (savedFView) setFrictionView(savedFView);
  } catch (_) {}

  // ============ Stage 12.1 — Voices map (SVG ring) ============
  var voicesMapEl = document.getElementById('voices-map');
  var voicesMapSvg = document.getElementById('voices-map-svg');
  var voicesMapEmpty = document.getElementById('voices-map-empty');
  var voicesMapDetailContent = document.getElementById('voices-map-detail-content');
  var VOICE_TONE = {
    appleton: 'pattern', curtis: 'sync', friedman: 'sync', pandya: 'sync',
    frost: 'pattern', kavcic: 'sync', cianfrani: 'pattern', pitre: 'sync',
    campbell: 'pattern', if_team: 'trust', wattenberger: 'sync', wroblewski: 'pattern'
  };
  function renderVoicesMap() {
    if (!voicesMapSvg) return;
    while (voicesMapSvg.firstChild) voicesMapSvg.removeChild(voicesMapSvg.firstChild);
    var ids = Object.keys(RESEARCH_DATA);
    var n = ids.length;
    var cx = 320, cy = 250, r = 200;
    var pos = {};
    ids.forEach(function (id, i) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2;
      pos[id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    // Edges first
    var seen = {};
    ids.forEach(function (id) {
      var d = RESEARCH_DATA[id]; if (!d || !d.connections) return;
      d.connections.forEach(function (cid) {
        var key = [id, cid].sort().join('-');
        if (seen[key]) return;
        seen[key] = true;
        var p1 = pos[id], p2 = pos[cid]; if (!p2) return;
        var midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        var dx = p2.x - p1.x, dy = p2.y - p1.y;
        var bend = 0.20;
        var ctrlX = midX - dy * bend, ctrlY = midY + dx * bend;
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'voices-map__edge');
        path.setAttribute('data-from', id);
        path.setAttribute('data-to', cid);
        path.setAttribute('d', 'M ' + p1.x + ' ' + p1.y + ' Q ' + ctrlX + ' ' + ctrlY + ' ' + p2.x + ' ' + p2.y);
        voicesMapSvg.appendChild(path);
      });
    });
    // Nodes
    ids.forEach(function (id) {
      var d = RESEARCH_DATA[id]; var p = pos[id];
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'voices-map__node voices-map__node--' + (VOICE_TONE[id] || 'sync'));
      g.setAttribute('data-voice', id);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', d.author + ' · ' + d.title);
      var ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('class', 'voices-map__node-ring');
      ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y); ring.setAttribute('r', '14');
      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('class', 'voices-map__node-bg');
      bg.setAttribute('cx', p.x); bg.setAttribute('cy', p.y); bg.setAttribute('r', '8');
      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'voices-map__label');
      label.setAttribute('x', p.x);
      label.setAttribute('y', p.y + 28);
      // Use last word of author as a short label
      var parts = d.author.split(' ');
      label.textContent = parts[parts.length - 1].replace(/[—·].*/, '').trim();
      g.appendChild(ring); g.appendChild(bg); g.appendChild(label);
      g.addEventListener('click', function () { selectVoice(id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectVoice(id); }
      });
      voicesMapSvg.appendChild(g);
    });
  }
  function selectVoice(id) {
    if (!voicesMapEl) return;
    voicesMapEl.setAttribute('data-selected', id);
    voicesMapSvg.querySelectorAll('.voices-map__node').forEach(function (g) {
      g.classList.toggle('voices-map__node--selected', g.getAttribute('data-voice') === id);
    });
    voicesMapSvg.querySelectorAll('.voices-map__edge').forEach(function (e) {
      var f = e.getAttribute('data-from'); var t = e.getAttribute('data-to');
      e.classList.toggle('voices-map__edge--connected', f === id || t === id);
    });
    var d = RESEARCH_DATA[id];
    if (d && voicesMapDetailContent) {
      voicesMapEmpty.style.display = 'none';
      voicesMapDetailContent.innerHTML =
        '<p class="research-detail__eyebrow">' + escapeHtml(d.date) + ' · ' + escapeHtml(d.author) + '</p>' +
        '<h3 class="research-detail__title">' + escapeHtml(d.title) + '</h3>' +
        '<p class="research-detail__quote">' + escapeHtml(d.quote) + '</p>' +
        '<p class="research-detail__summary">' + escapeHtml(d.summary) + '</p>';
    }
  }
  // Hook map view into research view toggle
  var _origSetResearchView = setResearchView;
  setResearchView = function (view) {
    _origSetResearchView(view === 'map' ? 'timeline' : view);
    document.querySelectorAll('[data-research-view]').forEach(function (b) {
      var active = b.getAttribute('data-research-view') === view;
      b.classList.toggle('view-toggle--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (voicesMapEl) voicesMapEl.hidden = view !== 'map';
    if (researchTableWrapper) researchTableWrapper.hidden = view !== 'table';
    if (researchGrid) researchGrid.hidden = view !== 'timeline';
    if (view === 'map') renderVoicesMap();
    if (view === 'table') renderResearchTable();
    try { localStorage.setItem('chip:researchView', view); } catch (_) {}
  };
  // Re-bind buttons (since we replaced setResearchView)
  document.querySelectorAll('[data-research-view]').forEach(function (b) {
    var newBtn = b.cloneNode(true);
    b.parentNode.replaceChild(newBtn, b);
    newBtn.addEventListener('click', function () { setResearchView(newBtn.getAttribute('data-research-view')); });
  });
  // Apply saved view
  try {
    var savedRView2 = localStorage.getItem('chip:researchView');
    if (savedRView2) setResearchView(savedRView2);
  } catch (_) {}

  // ============ Stage 12.2 — Surfaces sparklines ============
  var SPARK_DATA = {
    web:       [96, 95, 97, 98, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    ios:       [100, 100, 100, 100, 100, 95, 88, 82, 76, 72, 70, 71, 71, 71],
    android:   [100, 100, 100, 100, 100, 100, 100, 88, 60, 35, 12, 5, 2, 0],
    figma:     [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    storybook: [91, 92, 93, 94, 94, 95, 95, 95, 95, 95, 95, 95, 95, 95],
    docs:      [80, 80, 78, 75, 72, 70, 68, 65, 62, 60, 58, 56, 54, 52],
    jira:      [12, 14, 18, 20, 19, 17, 15, 16, 18, 19, 20, 17, 16, 17],
    channel:   [4, 6, 5, 8, 7, 9, 11, 10, 8, 12, 9, 7, 8, 6],
    research:  [33, 34, 35, 37, 38, 40, 41, 42, 43, 45, 46, 46, 47, 47],
    friction:  [2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
  };
  function buildSparkSvg(values) {
    var w = 56, h = 14;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = (max - min) || 1;
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * w;
      var y = h - ((v - min) / range) * h;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var last = values[values.length - 1], prev = values[values.length - 2];
    var trend = last > prev ? 'up' : (last < prev ? 'down' : 'flat');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg"><polyline class="spark-line spark-line--' + trend + '" points="' + pts + '" /></svg>';
  }
  document.querySelectorAll('[data-spark]').forEach(function (el) {
    var sid = el.getAttribute('data-spark');
    var values = SPARK_DATA[sid];
    if (values) el.innerHTML = buildSparkSvg(values);
  });

  // ============ Stage 12.3 — Friction aggregate filter ============
  var frictionAggregateBtns = document.querySelectorAll('[data-friction-stat]');
  function applyFrictionFilter(stat) {
    var entries = document.querySelectorAll('.friction__entry');
    entries.forEach(function (el) {
      var s = el.getAttribute('data-status') || '';
      var statLower = stat;
      var match = stat === 'all' || s === stat;
      el.style.display = match ? '' : 'none';
    });
    frictionAggregateBtns.forEach(function (b) {
      b.classList.toggle('friction-aggregate__cell--active', b.getAttribute('data-friction-stat') === stat);
    });
  }
  frictionAggregateBtns.forEach(function (b) {
    b.addEventListener('click', function () { applyFrictionFilter(b.getAttribute('data-friction-stat')); });
  });

  // ============ Stage 12.4 — Sync cadence ============
  var SYNC_CADENCE = {
    'Web':       ['sync','sync','sync','sync','sync','sync','sync'],
    'iOS':       ['silent','sparse','sparse','silent','sparse','silent','silent'],
    'Android':   ['silent','silent','silent','silent','silent','silent','silent'],
    'Figma':     ['sync','sync','sync','sync','sync','sync','sync'],
    'Storybook': ['sync','sparse','sync','sync','sparse','sync','sync']
  };
  // ============ Component Map — Concentric Rings Canvas ============

  // BELLA component data with composition relationships
  var BELLA_NODES = [
    { id: 'button',  name: 'Button',   level: 'atom',     sub: 'Action primitive',      composedFrom: [],                      composesInto: [] },
    { id: 'card',    name: 'Card',     level: 'atom',     sub: 'Layout primitive',      composedFrom: [],                      composesInto: [] },
    { id: 'input',   name: 'Input',    level: 'atom',     sub: 'Form primitive',        composedFrom: [],                      composesInto: [] },
    { id: 'chip',    name: 'Chip',     level: 'atom',     sub: 'Tag primitive',         composedFrom: [],                      composesInto: [] },
    { id: 'eyebrow', name: 'Eyebrow',  level: 'atom',     sub: 'Typography primitive',  composedFrom: [],                      composesInto: [] },
    { id: 'navLink', name: 'Nav link', level: 'atom',     sub: 'Navigation primitive',  composedFrom: [],                      composesInto: [] },
    { id: 'modal',   name: 'Modal',    level: 'molecule', sub: 'Overlay pattern',       composedFrom: ['Button','Card'],       composesInto: ['AI Card'] },
    { id: 'avatar',  name: 'Avatar',   level: 'molecule', sub: 'Identity pattern',      composedFrom: ['Card'],                composesInto: ['AI Card'] },
    { id: 'badge',   name: 'Badge',    level: 'molecule', sub: 'Status pattern',        composedFrom: ['Chip'],                composesInto: ['AI Card','AI Diff'] },
    { id: 'aiCard',  name: 'AI Card',  level: 'organism', sub: 'AI surface',            composedFrom: ['Modal','Avatar','Badge'], composesInto: [] },
    { id: 'aiDiff',  name: 'AI Diff',  level: 'organism', sub: 'AI surface',            composedFrom: ['Card','Badge'],        composesInto: [] },
    { id: 'aiMeter', name: 'AI Meter', level: 'organism', sub: 'AI surface',            composedFrom: ['Card','Chip'],         composesInto: [] },
  ];

  // Per-component detail data (desc, scores, rec, variants, history, usedBy, friction count)
  var BELLA_DETAIL = {
    button: {
      desc: 'Primary interactive element. Owns the focus ring contract and the loading state across platforms.',
      scores: { web:100, ios:100, android:62, figma:100, storybook:100 },
      rec: 'Android Button is 38% behind — focus ring contrast 4.2:1 vs WCAG 4.5:1 minimum. File BELLA-1268.',
      auditMsg: 'Button · Android parity fix queued · 38% gap · Operator: Elleta',
      variants: ['primary','secondary','ghost','destructive','loading','disabled'],
      history: [['2h ago','Button v3.1.2','Web Lead','focus ring contrast audit'],['3d ago','Button v3.1.1','iOS Lead','loading state token fix'],['1w ago','Button v3.1.0','Design Lead','destructive variant added']],
      usedBy: ['Modal','Badge'], friction: 1,
    },
    card: {
      desc: 'The base layout primitive. Holds content, surface, and elevation. Every elevated component composes from Card.',
      scores: { web:100, ios:100, android:62, figma:100, storybook:100 },
      rec: 'Regenerate Android Card.kt from Figma source — 38% gap traces to landscape variant not propagated.',
      auditMsg: 'Card · Android parity fix queued · 38% gap · Operator: Elleta',
      variants: ['default','elevated','interactive','focus','selected','disabled'],
      history: [['2h ago','Card v2.14.3','Web Lead','landscape variant added'],['1d ago','Card v2.14.2','Web Lead','focus state revision'],['5d ago','Card v2.14.1','iOS Lead','padding token swap']],
      usedBy: ['Modal','Avatar','AI Card','AI Diff','AI Meter'], friction: 2,
    },
    input: {
      desc: 'Text input. Owns the validation state contract and the label/placeholder contract.',
      scores: { web:100, ios:71, android:0, figma:100, storybook:64 },
      rec: 'Android Input not implemented · iOS validation missing for landscape mode · Storybook stories incomplete.',
      auditMsg: 'Input · cross-platform parity fix queued · Operator: Elleta',
      variants: ['default','focused','error','success','disabled','readonly'],
      history: [['3d ago','Input v1.4.1','Web Lead','error state token'],['1w ago','Input v1.4.0','iOS Lead','iOS validation partial'],['2w ago','Input v1.3.8','Web Lead','label animation']],
      usedBy: ['forms (post-v0)'], friction: 3,
    },
    chip: {
      desc: 'Small status/category indicator. Scales from meta to label sizes. The most-shipped atom in BELLA.',
      scores: { web:100, ios:100, android:100, figma:100, storybook:100 },
      rec: '',
      auditMsg: '',
      variants: ['info','success','warning','accent','muted'],
      history: [['1d ago','Chip v2.1.3','Android Lead','android touch target fix'],['3d ago','Chip v2.1.2','Web Lead','muted variant'],['5d ago','Chip v2.1.1','iOS Lead','letter-spacing sync']],
      usedBy: ['Badge','AI Meter'], friction: 0,
    },
    eyebrow: {
      desc: 'Uppercase mono label above titles. Sets context before the heading.',
      scores: { web:100, ios:76, android:76, figma:100, storybook:100 },
      rec: 'iOS + Android letter-spacing diverges 6px from Web spec. Token --ls-wider applied inconsistently.',
      auditMsg: 'Eyebrow · letter-spacing fix queued · Operator: Elleta',
      variants: ['default','muted'],
      history: [['4d ago','Eyebrow v1.2.1','iOS Lead','spacing partial fix'],['1w ago','Eyebrow v1.2.0','Web Lead','muted variant'],['2w ago','Eyebrow v1.1.9','Android Lead','initial android port']],
      usedBy: ['card headers'], friction: 1,
    },
    navLink: {
      desc: 'Sidebar / topbar link. Owns the active-state contract and the disabled state.',
      scores: { web:100, ios:71, android:0, figma:100, storybook:64 },
      rec: 'Android Nav link missing entirely · iOS active-state contrast 3.8:1 vs 4.5:1 minimum.',
      auditMsg: 'Nav link · cross-platform parity fix queued · Operator: Elleta',
      variants: ['default','active','disabled'],
      history: [['1d ago','Nav link v1.1.2','iOS Lead','active state token'],['4d ago','Nav link v1.1.1','Web Lead','focus ring'],['1w ago','Nav link v1.1.0','Web Lead','initial release']],
      usedBy: ['topbar','sidebar'], friction: 2,
    },
    modal: {
      desc: 'Overlay dialog. Composes Button + Card into a focus-trapped surface. Owns the escape-key contract.',
      scores: { web:100, ios:100, android:62, figma:100, storybook:100 },
      rec: 'Android Modal landscape variant missing — same gap as Card. Block modal flows on Android landscape.',
      auditMsg: 'Modal · Android landscape fix queued · Operator: Elleta',
      variants: ['default','small','large','full-screen','loading','error'],
      history: [['6h ago','Modal v1.8.3','Web Lead','focus trap fix'],['2d ago','Modal v1.8.2','iOS Lead','swipe-to-close'],['1w ago','Modal v1.8.1','Android Lead','partial android port']],
      usedBy: ['AI Card'], friction: 1,
    },
    avatar: {
      desc: 'Identity component. Renders user image or initials with presence indicator. Fully in spec.',
      scores: { web:100, ios:100, android:100, figma:100, storybook:100 },
      rec: '',
      auditMsg: '',
      variants: ['xs','sm','md','lg','xl','with-presence','with-badge'],
      history: [['2d ago','Avatar v2.0.1','iOS Lead','presence token'],['5d ago','Avatar v2.0.0','Web Lead','xl size added'],['2w ago','Avatar v1.9.4','Android Lead','presence sync']],
      usedBy: ['AI Card'], friction: 0,
    },
    badge: {
      desc: 'Status indicator composing Chip into a dismissible label. Bridges semantic state to visual signal.',
      scores: { web:100, ios:100, android:62, figma:100, storybook:100 },
      rec: 'Android Badge dismiss gesture not implemented — 38% gap maps to interaction contract.',
      auditMsg: 'Badge · Android dismiss fix queued · Operator: Elleta',
      variants: ['info','success','warning','critical','dismissible'],
      history: [['1d ago','Badge v1.3.2','Web Lead','dismissible animation'],['3d ago','Badge v1.3.1','iOS Lead','haptic on dismiss'],['1w ago','Badge v1.3.0','Web Lead','critical variant']],
      usedBy: ['AI Card','AI Diff'], friction: 1,
    },
    aiCard: {
      desc: "CHIP's primary response surface. Composes Modal + Avatar + Badge into an agent-native card with proposal flow.",
      scores: { web:95, ios:null, android:null, figma:100, storybook:73 },
      rec: 'iOS + Android not yet implemented. Storybook missing 3 of 5 AI states. Priority for v1.',
      auditMsg: 'AI Card · platform expansion queued · Operator: Elleta',
      variants: ['proposal','approved','declined','loading','error'],
      history: [['1h ago','AI Card v0.4.1','Web Lead','approve animation'],['1d ago','AI Card v0.4.0','Web Lead','decline state'],['3d ago','AI Card v0.3.8','Web Lead','loading skeleton']],
      usedBy: [], friction: 2,
    },
    aiDiff: {
      desc: 'Token-level diff surface. Renders before/after comparison of design decisions CHIP proposes to operators.',
      scores: { web:95, ios:null, android:null, figma:100, storybook:73 },
      rec: 'iOS + Android not yet implemented. Platform-leads contacted — planned for Q3.',
      auditMsg: 'AI Diff · platform expansion queued · Operator: Elleta',
      variants: ['token-diff','variant-diff','platform-diff'],
      history: [['2d ago','AI Diff v0.2.3','Web Lead','platform filter'],['4d ago','AI Diff v0.2.2','Web Lead','color keys'],['1w ago','AI Diff v0.2.1','Web Lead','initial release']],
      usedBy: [], friction: 1,
    },
    aiMeter: {
      desc: 'Parity gauge. Renders platform alignment score as a compact arc that drives operator attention.',
      scores: { web:95, ios:null, android:null, figma:100, storybook:73 },
      rec: 'iOS + Android not yet implemented. Arc animation relies on CSS custom properties — test before platform port.',
      auditMsg: 'AI Meter · platform expansion queued · Operator: Elleta',
      variants: ['compact','expanded','critical','healthy'],
      history: [['3h ago','AI Meter v0.3.1','Web Lead','arc animation'],['2d ago','AI Meter v0.3.0','Web Lead','critical state'],['5d ago','AI Meter v0.2.8','Web Lead','token bind']],
      usedBy: [], friction: 0,
    },
  };

  // Flat edge list derived from composedFrom (from → to direction = atom→molecule→organism)
  var BELLA_EDGES = [];
  BELLA_NODES.forEach(function(node) {
    node.composedFrom.forEach(function(parentName) {
      BELLA_EDGES.push({ from: parentName, to: node.name });
    });
  });

  // Resolved CSS variable values for canvas drawing (Canvas2D ignores CSS vars)
  var CC = {
    bg:       '#F7F4EF',
    surface:  '#F0EBE3',
    ink:      '#111111',
    inkMuted: '#888880',
    amber:    '#C4956A',
    dusk:     '#7B6E8F',
    sage:     '#4A7C6F',
    amberBg:  'rgba(196,149,106,0.10)',
    duskBg:   'rgba(123,110,143,0.10)',
    sageBg:   'rgba(74,124,111,0.10)',
    border:   'rgba(17,17,17,0.10)',
  };
  var LEVEL_C = {
    atom:     { color: CC.amber, bg: CC.amberBg, label: 'Atoms' },
    molecule: { color: CC.dusk,  bg: CC.duskBg,  label: 'Molecules' },
    organism: { color: CC.sage,  bg: CC.sageBg,  label: 'Organisms' },
  };
  var RING_R = [110, 200, 290]; // radii for atom / molecule / organism rings
  var LEVEL_ORDER = ['atom', 'molecule', 'organism'];

  function cmapLayoutNodes() {
    var nodes = [];
    LEVEL_ORDER.forEach(function(level, li) {
      var group = BELLA_NODES.filter(function(n) { return n.level === level; });
      var r = RING_R[li];
      group.forEach(function(comp, i) {
        var angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
        nodes.push({ id: comp.id, name: comp.name, level: level, sub: comp.sub,
          composedFrom: comp.composedFrom, composesInto: comp.composesInto,
          x: Math.cos(angle) * r, y: Math.sin(angle) * r, r: 10 });
      });
    });
    return nodes;
  }

  function cmapDraw(ctx, nodes, w, h, cam, hovered, selected) {
    var dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = CC.bg;
    ctx.fillRect(0, 0, w, h);

    var cx = w / 2 + cam.x * cam.z;
    var cy = h / 2 + cam.y * cam.z;
    ctx.translate(cx, cy);
    ctx.scale(cam.z, cam.z);

    // Draw rings
    LEVEL_ORDER.forEach(function(level, li) {
      var meta = LEVEL_C[level];
      var r = RING_R[li];
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = meta.color;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 52 / cam.z;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.fillStyle = meta.color;
      ctx.globalAlpha = 0.35;
      ctx.font = 'bold ' + Math.max(9, 11 / cam.z) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(meta.label.toUpperCase(), 0, -r - 28 / cam.z);
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // Build name→node lookup for edges
    var nodeByName = {};
    nodes.forEach(function(n) { nodeByName[n.name] = n; });

    // Determine connected set
    var activeId = selected ? selected.id : (hovered ? hovered.id : null);
    var connected = {};
    var activeEdgeSet = {};
    if (activeId) {
      connected[activeId] = true;
      var activeName = (selected || hovered).name;
      BELLA_EDGES.forEach(function(e, i) {
        if (e.from === activeName || e.to === activeName) {
          connected[e.from] = true;
          connected[e.to] = true;
          activeEdgeSet[i] = true;
        }
      });
    }

    // Draw edges
    BELLA_EDGES.forEach(function(e, i) {
      var fn = nodeByName[e.from], tn = nodeByName[e.to];
      if (!fn || !tn) return;
      var isActive = activeEdgeSet[i];
      ctx.beginPath();
      var mx = (fn.x + tn.x) / 2, my = (fn.y + tn.y) / 2;
      var dist = Math.hypot(tn.x - fn.x, tn.y - fn.y) || 1;
      var off = dist * 0.15;
      var px = -(tn.y - fn.y) / dist * off, py = (tn.x - fn.x) / dist * off;
      ctx.moveTo(fn.x, fn.y);
      ctx.quadraticCurveTo(mx + px, my + py, tn.x, tn.y);
      if (isActive) {
        ctx.strokeStyle = LEVEL_C[tn.level].color;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 2 / cam.z;
      } else {
        ctx.strokeStyle = CC.border;
        ctx.globalAlpha = activeId ? 0.05 : 0.18;
        ctx.lineWidth = 1 / cam.z;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Draw nodes
    nodes.forEach(function(node) {
      var meta = LEVEL_C[node.level];
      var isHov = hovered && hovered.id === node.id;
      var isSel = selected && selected.id === node.id;
      var isConn = connected[node.name];
      var dimmed = activeId && !isConn;
      var scale = isHov ? 1.35 : isSel ? 1.2 : 1;
      var dr = node.r * scale;

      ctx.globalAlpha = dimmed ? 0.15 : 1;

      if (isHov || isSel) {
        var glow = ctx.createRadialGradient(node.x, node.y, dr, node.x, node.y, dr * 3);
        glow.addColorStop(0, meta.color + '30');
        glow.addColorStop(1, meta.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, dr * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, dr, 0, Math.PI * 2);
      var fg = ctx.createRadialGradient(node.x - dr * 0.3, node.y - dr * 0.3, 0, node.x, node.y, dr);
      fg.addColorStop(0, 'rgba(255,255,255,0.92)');
      fg.addColorStop(1, meta.bg);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = (isSel || isHov) ? meta.color : meta.color + '66';
      ctx.lineWidth = (isSel || isHov ? 2.5 : 1.2) / cam.z;
      ctx.stroke();

      if (cam.z > 0.55 || isHov || isSel || isConn) {
        ctx.fillStyle = (isSel || isHov) ? meta.color : CC.ink;
        var fs = Math.max(9, Math.min(11, 10 / cam.z));
        ctx.font = (isSel || isHov ? 'bold ' : '') + fs + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.name, node.x, node.y + dr + 4 / cam.z);
      }
      ctx.globalAlpha = 1;
    });

    // Center dot
    ctx.beginPath();
    ctx.arc(0, 0, 4 / cam.z, 0, Math.PI * 2);
    ctx.fillStyle = CC.amber + '50';
    ctx.fill();

    ctx.restore();
  }

  function cmapHitTest(mx, my, nodes, w, h, cam) {
    var cx = w / 2 + cam.x * cam.z, cy = h / 2 + cam.y * cam.z;
    var wx = (mx - cx) / cam.z, wy = (my - cy) / cam.z;
    var best = null, bestD = Infinity;
    nodes.forEach(function(n) {
      var d = Math.hypot(n.x - wx, n.y - wy);
      if (d < n.r * 2 && d < bestD) { best = n; bestD = d; }
    });
    return best;
  }

  function cmapParityRow(platform, score) {
    var label, color, pct;
    if (score === null || score === undefined) {
      label = 'N/A'; color = 'var(--border)'; pct = 0;
      var tip = platform + ' · not applicable';
      return '<div class="cmap-parity__row" title="' + escapeHtml(tip) + '">' +
        '<span class="cmap-parity__plat">' + escapeHtml(platform) + '</span>' +
        '<div class="cmap-parity__track"><span class="cmap-parity__fill" style="width:0;background:' + color + '"></span></div>' +
        '<span class="cmap-parity__score">—</span>' +
        '<span class="cmap-parity__status cmap-parity__status--na">N/A</span></div>';
    }
    if (score === 0) {
      label = 'Missing'; color = 'var(--rust)';
      var tip2 = '0% ' + platform + ' · not implemented';
      return '<div class="cmap-parity__row" title="' + escapeHtml(tip2) + '">' +
        '<span class="cmap-parity__plat">' + escapeHtml(platform) + '</span>' +
        '<div class="cmap-parity__track"><span class="cmap-parity__fill" style="width:0;background:' + color + '"></span></div>' +
        '<span class="cmap-parity__score">0</span>' +
        '<span class="cmap-parity__status cmap-parity__status--missing">Missing</span></div>';
    }
    if (score < 90) {
      label = 'Drift'; color = 'var(--amber)';
      var gap = 90 - score;
      var tip3 = score + '% ' + platform + ' · drift threshold 90 · ' + gap + '% behind master';
      return '<div class="cmap-parity__row" title="' + escapeHtml(tip3) + '">' +
        '<span class="cmap-parity__plat">' + escapeHtml(platform) + '</span>' +
        '<div class="cmap-parity__track"><span class="cmap-parity__fill" style="width:' + score + '%;background:' + color + '"></span></div>' +
        '<span class="cmap-parity__score">' + score + '</span>' +
        '<span class="cmap-parity__status cmap-parity__status--drift">Drift</span></div>';
    }
    var tip4 = score + '% ' + platform + ' · in spec';
    return '<div class="cmap-parity__row" title="' + escapeHtml(tip4) + '">' +
      '<span class="cmap-parity__plat">' + escapeHtml(platform) + '</span>' +
      '<div class="cmap-parity__track"><span class="cmap-parity__fill" style="width:' + score + '%;background:var(--sage)"></span></div>' +
      '<span class="cmap-parity__score">' + score + '</span>' +
      '<span class="cmap-parity__status cmap-parity__status--sync">In sync</span></div>';
  }

  function cmapShowDetail(node) {
    var panel = document.getElementById('cmap-rings-detail');
    var body  = document.getElementById('cmap-rings-detail-body');
    if (!panel || !body) return;
    panel.hidden = false;

    var meta       = LEVEL_C[node.level];
    var tierSingular = meta.label.slice(0, -1); // "Atoms" → "Atom"
    var det        = BELLA_DETAIL[node.id] || {};
    var scores     = det.scores || {};

    // 1–3: badge + name + subtype
    var html = '<span class="cmap-rings-detail__badge" style="background:' + meta.color + '18;border:1px solid ' + meta.color + '35;color:' + meta.color + '">' +
        '<span class="cmap-rings-detail__dot" style="background:' + meta.color + '"></span>' + escapeHtml(tierSingular.toUpperCase()) + '</span>' +
      '<h3 class="cmap-rings-detail__name">' + escapeHtml(node.name) + '</h3>' +
      '<p class="cmap-rings-detail__sub">' + escapeHtml(node.sub) + '</p>';

    // 4: description
    if (det.desc) {
      html += '<p class="cmap-rings-detail__desc">' + escapeHtml(det.desc) + '</p>';
    }

    // 5: parity strip
    html += '<div class="cmap-rings-detail__section">' +
      '<p class="cmap-rings-detail__label">Platform parity</p>' +
      '<div class="cmap-parity">' +
        cmapParityRow('Web',       scores.web) +
        cmapParityRow('iOS',       scores.ios) +
        cmapParityRow('Android',   scores.android) +
        cmapParityRow('Figma',     scores.figma) +
        cmapParityRow('Storybook', scores.storybook) +
      '</div></div>';

    // 6: CHIP recommendation (only when drift exists)
    var hasDrift = Object.values ? Object.values(scores).some(function(v) { return v !== null && v < 90; })
      : ['web','ios','android','figma','storybook'].some(function(k) { return scores[k] !== null && scores[k] !== undefined && scores[k] < 90; });
    if (det.rec && hasDrift) {
      html += '<div class="cmap-rings-detail__section cmap-rec-wrap" id="cmap-rec-' + escapeHtml(node.id) + '">' +
        '<p class="cmap-detail__rec-label">CHIP recommends</p>' +
        '<p class="cmap-detail__rec">' + escapeHtml(det.rec) + '</p>' +
        '<div class="cmap-detail__cta">' +
          '<button class="btn btn--sm btn--primary" data-cmap-approve="' + escapeHtml(det.auditMsg || node.name + ' · parity fix queued · Operator: Elleta') + '" data-cmap-recid="cmap-rec-' + escapeHtml(node.id) + '">Approve fix</button>' +
          '<button class="btn btn--sm btn--neutral" data-cmap-decline data-cmap-recid="cmap-rec-' + escapeHtml(node.id) + '">Decline</button>' +
        '</div></div>';
    }

    // 7: variants
    if (det.variants && det.variants.length) {
      var varChips = det.variants.map(function(v) {
        return '<span class="cmap-rings-detail__chip" style="background:var(--surface);border:1px solid var(--border);color:var(--text-2)">' + escapeHtml(v) + '</span>';
      }).join('');
      html += '<div class="cmap-rings-detail__section"><p class="cmap-rings-detail__label">Variants</p><div class="cmap-rings-detail__chips">' + varChips + '</div></div>';
    }

    // 8: edit history
    if (det.history && det.history.length) {
      var histRows = det.history.map(function(h) {
        return '<div class="cmap-history__entry">' +
          '<span class="cmap-history__when">' + escapeHtml(h[0]) + '</span>' +
          '<span class="cmap-history__ver">' + escapeHtml(h[1]) + '</span>' +
          '<span class="cmap-history__who">' + escapeHtml(h[2]) + '</span>' +
          '<span class="cmap-history__what">' + escapeHtml(h[3]) + '</span>' +
          '</div>';
      }).join('');
      html += '<div class="cmap-rings-detail__section"><p class="cmap-rings-detail__label">Edit history</p><div class="cmap-history">' + histRows + '</div></div>';
    }

    // 9: used by (composesInto from node data + usedBy from detail)
    var usedByAll = (node.composesInto || []).concat(det.usedBy || []).filter(function(v, i, a) { return a.indexOf(v) === i; });
    if (usedByAll.length) {
      var usedChips = usedByAll.map(function(name) {
        var n2 = BELLA_NODES.find(function(n) { return n.name === name; });
        var col = n2 ? LEVEL_C[n2.level].color : CC.inkMuted;
        return '<span class="cmap-rings-detail__chip" style="background:' + col + '18;border:1px solid ' + col + '35;color:' + col + '">' + escapeHtml(name) + '</span>';
      }).join('');
      html += '<div class="cmap-rings-detail__section"><p class="cmap-rings-detail__label">Used by</p><div class="cmap-rings-detail__chips">' + usedChips + '</div></div>';
    }

    // 10: linked surfaces
    var frictionLabel = det.friction ? 'Friction log entries (' + det.friction + ')' : 'Friction log';
    html += '<div class="cmap-rings-detail__section cmap-links">' +
      '<p class="cmap-rings-detail__label">Linked surfaces</p>' +
      '<div class="cmap-links__row">' +
        '<a href="#" class="btn btn--sm btn--neutral cmap-links__btn">Open in Figma</a>' +
        '<a href="#" class="btn btn--sm btn--neutral cmap-links__btn">Open in Storybook</a>' +
        '<a href="#" class="btn btn--sm btn--neutral cmap-links__btn">Zeroheight docs</a>' +
        (det.friction ? '<a href="#" class="btn btn--sm btn--neutral cmap-links__btn">' + escapeHtml(frictionLabel) + '</a>' : '') +
      '</div></div>';

    body.innerHTML = html;

    // Wire approve / decline buttons
    body.addEventListener('click', function handler(e) {
      var approveBtn = e.target.closest('[data-cmap-approve]');
      var declineBtn = e.target.closest('[data-cmap-decline]');
      if (approveBtn) {
        var msg = approveBtn.getAttribute('data-cmap-approve');
        var recId = approveBtn.getAttribute('data-cmap-recid');
        appendAuditEntry(msg);
        var recWrap = document.getElementById(recId);
        if (recWrap) recWrap.classList.add('cmap-rec-wrap--resolved');
        approveBtn.disabled = true;
        var dec = body.querySelector('[data-cmap-decline]');
        if (dec) dec.disabled = true;
      }
      if (declineBtn) {
        var recId2 = declineBtn.getAttribute('data-cmap-recid');
        var recWrap2 = document.getElementById(recId2);
        if (recWrap2) recWrap2.classList.add('cmap-rec-wrap--resolved');
        declineBtn.disabled = true;
        var app = body.querySelector('[data-cmap-approve]');
        if (app) app.disabled = true;
      }
      // Remove this one-shot handler after action
      if (approveBtn || declineBtn) body.removeEventListener('click', handler);
    });
  }

  // Init canvas
  (function initCmapCanvas() {
    var wrap    = document.getElementById('cmap-canvas-wrap');
    var canvas  = document.getElementById('cmap-canvas');
    if (!wrap || !canvas) return;

    var ctx = canvas.getContext('2d');
    var nodes = cmapLayoutNodes();
    var cam = { x: 0, y: 0, z: 0.85 };
    var hovered = null, selected = null;
    var drag = null;
    var raf = null;

    // Build HUD legend
    var legendEl = document.getElementById('cmap-legend');
    if (legendEl) {
      legendEl.innerHTML = LEVEL_ORDER.map(function(level) {
        var count = BELLA_NODES.filter(function(n) { return n.level === level; }).length;
        var meta = LEVEL_C[level];
        return '<div class="cmap-hud__legend-item">' +
          '<span class="cmap-hud__dot" style="background:' + meta.color + '"></span>' +
          '<span style="font-weight:700">' + meta.label + '</span>' +
          '<span style="color:' + CC.inkMuted + '">' + count + '</span>' +
          '</div>';
      }).join('');
    }

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      var w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
    }

    function render() {
      // Only draw when the space is active and wrap has real dimensions
      if (document.body.getAttribute('data-space') === 'component' && wrap.clientWidth > 0) {
        var w = wrap.clientWidth, h = wrap.clientHeight;
        cmapDraw(ctx, nodes, w, h, cam, hovered, selected);
      }
      raf = requestAnimationFrame(render);
    }

    resize();
    render();

    var ro = new ResizeObserver(function() { resize(); });
    ro.observe(wrap);

    // Wheel — zoom only when Shift or Cmd held; otherwise let page scroll
    canvas.addEventListener('wheel', function(e) {
      if (!e.shiftKey && !e.metaKey) return;
      e.preventDefault();
      var f = e.deltaY > 0 ? 0.92 : 1.08;
      cam.z = Math.max(0.25, Math.min(4, cam.z * f));
    }, { passive: false });

    // Mouse — drag + hover + click
    canvas.addEventListener('mousedown', function(e) {
      drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    });
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (drag) {
        cam.x = drag.cx + (e.clientX - drag.sx) / cam.z;
        cam.y = drag.cy + (e.clientY - drag.sy) / cam.z;
      } else {
        var w = wrap.clientWidth, h = wrap.clientHeight;
        hovered = cmapHitTest(mx, my, nodes, w, h, cam);
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
      }
    });
    canvas.addEventListener('mouseup', function(e) {
      if (drag) {
        var moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
        if (moved < 5) {
          var rect = canvas.getBoundingClientRect();
          var mx = e.clientX - rect.left, my = e.clientY - rect.top;
          var w = wrap.clientWidth, h = wrap.clientHeight;
          var hit = cmapHitTest(mx, my, nodes, w, h, cam);
          selected = hit;
          if (hit) { cmapShowDetail(hit); }
          else {
            var panel = document.getElementById('cmap-rings-detail');
            if (panel) panel.hidden = true;
          }
          // Sync matrix selection
          document.querySelectorAll('.space--component .components-matrix__row').forEach(function(r) {
            r.classList.toggle('components-matrix__row--selected', hit && r.getAttribute('data-component') === hit.id);
          });
        }
        drag = null;
      }
    });
    canvas.addEventListener('mouseleave', function() { drag = null; hovered = null; });

    // Close detail panel
    var closeBtn = document.getElementById('cmap-rings-close');
    if (closeBtn) closeBtn.addEventListener('click', function() {
      selected = null;
      var panel = document.getElementById('cmap-rings-detail');
      if (panel) panel.hidden = true;
      document.querySelectorAll('.space--component .components-matrix__row').forEach(function(r) { r.classList.remove('components-matrix__row--selected'); });
    });

    // Controls
    var recenterBtn = document.getElementById('cmap-recenter');
    if (recenterBtn) recenterBtn.addEventListener('click', function() { cam.x = 0; cam.y = 0; cam.z = 0.85; });
    var zoomIn = document.getElementById('cmap-zoom-in');
    if (zoomIn) zoomIn.addEventListener('click', function() { cam.z = Math.min(4, cam.z * 1.3); });
    var zoomOut = document.getElementById('cmap-zoom-out');
    if (zoomOut) zoomOut.addEventListener('click', function() { cam.z = Math.max(0.25, cam.z * 0.7); });

    // Touch support — pan only
    var touch0 = null;
    canvas.addEventListener('touchstart', function(e) { touch0 = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, cx: cam.x, cy: cam.y }; }, { passive: true });
    canvas.addEventListener('touchmove', function(e) {
      if (!touch0) return;
      cam.x = touch0.cx + (e.touches[0].clientX - touch0.sx) / cam.z;
      cam.y = touch0.cy + (e.touches[0].clientY - touch0.sy) / cam.z;
    }, { passive: true });
    canvas.addEventListener('touchend', function() { touch0 = null; });
  })();

  // Matrix rows in Component map → highlight ring node on click
  document.querySelectorAll('.space--component .components-matrix__row').forEach(function(r) {
    r.addEventListener('click', function() {
      var id = r.getAttribute('data-component');
      document.querySelectorAll('.space--component .components-matrix__row').forEach(function(row) {
        row.classList.toggle('components-matrix__row--selected', row.getAttribute('data-component') === id);
      });
      var node = BELLA_NODES.find(function(n) { return n.id === id; });
      if (node) cmapShowDetail(node);
    });
    r.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.click(); }
    });
  });

  // ============ Alerts panel — AI fix approval flow ============
  var alertsPanelList = document.querySelector('.alerts-panel__list');
  if (alertsPanelList) {
    alertsPanelList.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-alert-action]');
      if (!btn) return;
      var row = btn.closest('.alerts-panel__row');
      if (!row) return;
      var action = btn.getAttribute('data-alert-action');
      var titleEl = row.querySelector('strong');
      var title = titleEl ? titleEl.textContent : 'Unknown alert';

      if (action === 'approve') {
        appendAuditEntry('Alert resolved (auto): ' + title + ' · CHIP applied recommended fix');
        row.classList.add('alerts-panel__row--resolved');
        row.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
      } else if (action === 'decline') {
        appendAuditEntry('Alert declined: ' + title);
        row.classList.add('alerts-panel__row--resolved');
        row.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
      } else if (action === 'triage') {
        console.log('[CHIP] Manual triage queued for: ' + title);
      }
    });
  }

  var syncCadenceGrid = document.getElementById('sync-cadence-grid');
  if (syncCadenceGrid) {
    var html = '<span></span>';
    ['S','M','T','W','T','F','S'].forEach(function (d) {
      html += '<span class="sync-cadence__day-label">' + d + '</span>';
    });
    var SYNC_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var SYNC_LABELS = { sync: 'In sync', sparse: 'Sparse — some activity', silent: 'Silent — no activity detected' };
    Object.keys(SYNC_CADENCE).forEach(function (label) {
      html += '<span class="sync-cadence__row-label">' + escapeHtml(label) + '</span>';
      SYNC_CADENCE[label].forEach(function (state, i) {
        var tip = SYNC_DAYS[i] + ' · ' + escapeHtml(label) + ' · ' + (SYNC_LABELS[state] || state);
        html += '<span class="sync-cadence__cell" title="' + tip + '"><span class="sync-cadence__dot sync-cadence__dot--' + state + '"></span></span>';
      });
    });
    syncCadenceGrid.innerHTML = html;
  }

  // ============ Stage 13 — Cmd+K Command Palette ============
  var paletteModal   = document.getElementById('palette-modal');
  var paletteInput   = document.getElementById('palette-input');
  var paletteResults = document.getElementById('palette-results');
  var paletteIndex   = [];
  var paletteFiltered = [];
  var paletteActiveIdx = 0;
  var SCOPES = { '> ': 'action', '# ': 'research', '@ ': 'friction' };
  var RECENT_KEY_SPACES = 'chip:recentSpaces';
  var RECENT_KEY_AUDIT  = 'chip:recentAudit';

  function pushRecent(key, item, max) {
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr = arr.filter(function (x) { return x !== item; });
      arr.unshift(item);
      arr = arr.slice(0, max || 5);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (_) {}
  }
  function readRecent(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
  }

  function buildPaletteIndex() {
    paletteIndex = [];
    var spaceList = [
      { id: 'cockpit',  label: 'Bridge',           chip: 'live', icon: '◉' },
      { id: 'research', label: 'Research library', chip: '47',   icon: '◈' },
      { id: 'friction', label: 'Friction log',     chip: '3',    icon: '◊' },
      { id: 'bella',    label: 'AI-native BELLA',  chip: '6',    icon: '◇' },
      { id: 'component', label: 'Component map',   chip: '12',   icon: '◇' },
      { id: 'map',      label: 'System map',       chip: 'v0',   icon: '△' },
      { id: 'steward',  label: 'Coming up',        chip: '6',    icon: '◯' }
    ];
    spaceList.forEach(function (s) {
      paletteIndex.push({
        type: 'space', icon: s.icon,
        primary: s.label, secondary: 'Space · ' + s.chip,
        run: function () { setSpace(s.id); pushRecent(RECENT_KEY_SPACES, s.id, 5); }
      });
    });
    var actions = [
      { primary: 'Approve current proposal', kbd: 'A',     run: function () { approve(); } },
      { primary: 'Reject',                   kbd: 'R',     run: function () { openReject(); } },
      { primary: 'Modify',                   kbd: 'M',     run: function () { openModify(); } },
      { primary: 'Open audit',               kbd: '',      run: function () { setSpace('cockpit'); setPhase('drift'); } },
      { primary: 'Reset demo',               kbd: '',      run: function () { setPhase('loaded'); } },
      { primary: 'Toggle theme',             kbd: '',      run: function () { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); } },
      { primary: 'Open settings',            kbd: ',',     run: function () { openModal('settings'); } },
      { primary: 'Show keyboard help',       kbd: '?',     run: function () { openModal('help'); } }
    ];
    actions.forEach(function (a) {
      paletteIndex.push({
        type: 'action', icon: '→',
        primary: a.primary, secondary: a.kbd ? 'Action · ' + a.kbd : 'Action',
        run: a.run
      });
    });
    Object.keys(RESEARCH_DATA).forEach(function (id) {
      var d = RESEARCH_DATA[id];
      paletteIndex.push({
        type: 'research', icon: '·',
        primary: d.title, secondary: d.author,
        run: function () { setSpace('research'); if (typeof selectResearch === 'function') selectResearch(id); }
      });
    });
    Object.keys(COMPONENT_DATA).forEach(function (id) {
      var d = COMPONENT_DATA[id];
      paletteIndex.push({
        type: 'component', icon: '·',
        primary: d.title.split(' · ')[0], secondary: 'Component',
        run: function () { setSpace('map'); if (typeof selectComponent === 'function') selectComponent(id); }
      });
    });
    if (typeof FRICTION_DATA !== 'undefined') {
      Object.keys(FRICTION_DATA).forEach(function (id) {
        var d = FRICTION_DATA[id];
        paletteIndex.push({
          type: 'friction', icon: '·',
          primary: d.title, secondary: d.eyebrow,
          run: function () { setSpace('friction'); if (typeof selectFriction === 'function') selectFriction(id); }
        });
      });
    }
    var rituals = [
      'Friday 10:00 — CHIP will surface 23 components for parity review.',
      'Friday 14:00 — Research digest with 3 new sources for review.',
      'Monday 09:00 — elleta.design publish queue: 2 pages awaiting approval.',
      'Monday 11:00 — Subscription sweep flags 1 idle tool.',
      'Wednesday 10:00 — Friction triage on 3 open notes.',
      'Sunday 18:00 — Mise en place: sweep stale entries, prune dormant tokens.'
    ];
    rituals.forEach(function (r) {
      paletteIndex.push({ type: 'ritual', icon: '◯', primary: r, secondary: 'Coming up',
        run: function () { setSpace('steward'); } });
    });
    auditList.querySelectorAll('.audit__entry').forEach(function (li) {
      var summary = li.querySelector('.audit__entry__summary');
      var text = (summary ? summary.textContent : li.textContent) || '';
      paletteIndex.push({ type: 'audit', icon: '·', primary: text, secondary: 'Audit',
        run: function () {
          setSpace('cockpit');
          setTimeout(function () {
            li.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
            li.setAttribute('aria-expanded', 'true');
          }, 100);
        } });
    });
  }

  function paletteScopeFromInput(q) {
    for (var prefix in SCOPES) {
      if (q.indexOf(prefix) === 0) return { scope: SCOPES[prefix], rest: q.slice(prefix.length) };
    }
    return { scope: null, rest: q };
  }

  function renderPaletteResults() {
    if (!paletteResults) return;
    paletteResults.innerHTML = '';
    if (paletteFiltered.length === 0) {
      paletteResults.innerHTML = '<li class="palette__empty">No matches. Try a space name, audit timestamp, or <kbd>&gt;</kbd> for actions.</li>';
      return;
    }
    paletteFiltered.slice(0, 50).forEach(function (item, i) {
      var li = document.createElement('li');
      li.className = 'palette__result' + (i === paletteActiveIdx ? ' palette__result--active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('id', 'palette-result-' + i);
      li.innerHTML =
        '<span class="palette__icon">' + escapeHtml(item.icon) + '</span>' +
        '<span class="palette__primary">' + escapeHtml(item.primary) + '</span>' +
        '<span class="palette__secondary">' + escapeHtml(item.secondary) + '</span>' +
        '<span class="palette__hint">↵</span>';
      li.addEventListener('click', function () { activatePalette(i); });
      li.addEventListener('mouseenter', function () { paletteActiveIdx = i; updatePaletteHighlight(); });
      paletteResults.appendChild(li);
    });
    paletteInput.setAttribute('aria-activedescendant', 'palette-result-' + paletteActiveIdx);
  }
  function updatePaletteHighlight() {
    paletteResults.querySelectorAll('.palette__result').forEach(function (el, i) {
      el.classList.toggle('palette__result--active', i === paletteActiveIdx);
    });
  }
  function applyPaletteFilter() {
    var q = paletteInput.value.toLowerCase();
    var sf = paletteScopeFromInput(q);
    var rest = sf.rest.trim();
    var scope = sf.scope;
    if (!q) {
      // Empty input → recent
      var recent = [];
      var spaceIds = readRecent(RECENT_KEY_SPACES);
      spaceIds.forEach(function (sid) {
        var item = paletteIndex.find(function (x) { return x.type === 'space' && x.primary.toLowerCase().indexOf(sid) !== -1; });
        if (item) recent.push(item);
      });
      var auditTexts = readRecent(RECENT_KEY_AUDIT);
      auditTexts.forEach(function (t) {
        var item = paletteIndex.find(function (x) { return x.type === 'audit' && x.primary === t; });
        if (item) recent.push(item);
      });
      paletteFiltered = recent.length ? recent : paletteIndex.slice(0, 12);
    } else {
      paletteFiltered = paletteIndex.filter(function (item) {
        if (scope && item.type !== scope) return false;
        var hay = (item.primary + ' ' + item.secondary).toLowerCase();
        return !rest || hay.indexOf(rest) !== -1;
      });
    }
    paletteActiveIdx = 0;
    renderPaletteResults();
  }
  function openPalette() {
    if (!paletteModal) return;
    buildPaletteIndex();
    paletteModal.hidden = false;
    paletteInput.value = '';
    applyPaletteFilter();
    setTimeout(function () { paletteInput.focus(); }, 10);
  }
  function closePalette() {
    if (!paletteModal) return;
    paletteModal.hidden = true;
  }
  function activatePalette(i) {
    var item = paletteFiltered[i];
    if (!item) return;
    closePalette();
    if (item.type === 'audit') pushRecent(RECENT_KEY_AUDIT, item.primary, 3);
    setTimeout(function () { item.run(); }, 0);
  }

  if (paletteInput) {
    paletteInput.addEventListener('input', applyPaletteFilter);
    paletteInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteActiveIdx = Math.min(paletteActiveIdx + 1, paletteFiltered.length - 1);
        updatePaletteHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteActiveIdx = Math.max(paletteActiveIdx - 1, 0);
        updatePaletteHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activatePalette(paletteActiveIdx);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    });
  }
  // Backdrop close
  if (paletteModal) {
    var bd = paletteModal.querySelector('.modal__backdrop');
    if (bd) bd.addEventListener('click', closePalette);
  }
  // Global Cmd+K / Ctrl+K toggle
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (paletteModal && paletteModal.hidden) openPalette();
      else closePalette();
    }
  });

  // ============ Stage 18.9 — Stat card click → meaningful action ============
  // Pending     → open the audit (drift phase) so the proposal is visible
  // Inbox       → jump to pending replies, open all three reply drafts
  // Today       → jump to today's events
  // Coming up   → jump to Coming up surface in this week
  // Each writes an audit-ribbon entry so the operator sees the click recorded.
  document.querySelectorAll('[data-stat-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-stat-target');
      var target = document.getElementById(key);
      var ts = nowTs();

      if (key === 'diag-card') {
        // Pending → ensure audit is open so the proposal is visible
        if (body.getAttribute('data-phase') !== 'drift') {
          setPhase('drift');     // setPhase already handles scroll-into-view
        } else if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        appendAuditEntry(ts + ' · Opened pending proposal · landscape mode roadmap · Operator: Elleta');
      }
      else if (key === 'inbox-card') {
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Open reply drafts for all rows that aren't already in a state
        document.querySelectorAll('.inbox-card__row').forEach(function (row) {
          if (!row.getAttribute('data-row-state')) {
            // Defer call so scroll completes first; visually clearer
            setTimeout(function () { openReply(row); }, 250);
          }
        });
        appendAuditEntry(ts + ' · Opened inbox · 3 reply drafts prepared · Operator: Elleta');
      }
      else if (key === 'today-card') {
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        appendAuditEntry(ts + ' · Opened today · 3 events surfaced · next at 10:00 · Operator: Elleta');
      }
      else if (key === 'upcoming-card') {
        setSpace('steward');     // jump to the dedicated Coming up space — full calendar view
        appendAuditEntry(ts + ' · Opened Coming up · 6 rituals scheduled this week · Operator: Elleta');
      }
      else if (target) {
        target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
      }

      // Pulse the target for visual confirmation
      if (target) {
        target.classList.add('bento-stat--pulse');
        setTimeout(function () { target.classList.remove('bento-stat--pulse'); }, 700);
      }
    });
  });

  // 14.2 — "See all 6 in Coming up" link
  var upcomingMore = document.getElementById('upcoming-card-more');
  if (upcomingMore) upcomingMore.addEventListener('click', function () { setSpace('steward'); });

  // ============ Stage 14.6 — Atomic rings system map ============
  var atomicRingsEl = document.getElementById('atomic-rings');
  // RING_ASSIGN: atoms = single-purpose primitives, molecules = composed, organisms = AI-native
  var RING_ASSIGN = {
    button: 'atoms', chip: 'atoms', eyebrow: 'atoms', navLink: 'atoms', badge: 'atoms', avatar: 'atoms',
    card: 'molecules', input: 'molecules', modal: 'molecules',
    aiCard: 'organisms', aiDiff: 'organisms', aiMeter: 'organisms'
  };
  var RING_LAYOUT = {
    atoms:     { r: 130 },
    molecules: { r: 230 },
    organisms: { r: 330 }
  };
  // Score-color: continuous rust → amber → sage based on average platform score
  function avgScore(componentId) {
    var row = document.querySelector('[data-component="' + componentId + '"]');
    if (!row) return 50;
    var cells = row.querySelectorAll('.components-matrix__cell');
    var sum = 0, count = 0;
    cells.forEach(function (c) {
      if (c.classList.contains('components-matrix__cell--na')) return;
      var v = parseFloat(c.textContent);
      if (!isNaN(v)) { sum += v; count++; }
    });
    return count ? sum / count : 50;
  }
  function scoreToFill(score) {
    // 0 → rust, 50 → amber, 100 → sage. Snap to bucket modifier classes.
    if (score >= 90) return 'sync';
    if (score >= 60) return 'drift';
    return 'missing';
  }
  function renderAtomicRings() {
    if (!atomicRingsEl) return;
    var svg = atomicRingsEl.querySelector('.atomic-rings__svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var cx = 360, cy = 360;
    // Zone circles + labels
    Object.keys(RING_LAYOUT).forEach(function (ring) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'atomic-rings__zone');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy);
      c.setAttribute('r', RING_LAYOUT[ring].r);
      svg.appendChild(c);
      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'atomic-rings__zone-label');
      label.setAttribute('x', cx);
      label.setAttribute('y', cy - RING_LAYOUT[ring].r - 10);
      label.textContent = ring.toUpperCase();
      svg.appendChild(label);
    });
    // Tokens core
    var core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    core.setAttribute('class', 'atomic-rings__core');
    core.setAttribute('cx', cx); core.setAttribute('cy', cy); core.setAttribute('r', '36');
    svg.appendChild(core);
    var coreLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    coreLabel.setAttribute('class', 'atomic-rings__core-label');
    coreLabel.setAttribute('x', cx); coreLabel.setAttribute('y', cy + 4);
    coreLabel.textContent = 'TOKENS';
    svg.appendChild(coreLabel);
    // Plot nodes per ring
    var byRing = { atoms: [], molecules: [], organisms: [] };
    Object.keys(COMPONENT_DATA).forEach(function (id) {
      var ring = RING_ASSIGN[id] || 'atoms';
      byRing[ring].push(id);
    });
    var positions = {};
    Object.keys(byRing).forEach(function (ring) {
      var ids = byRing[ring].sort();
      var n = ids.length || 1;
      var r = RING_LAYOUT[ring].r;
      ids.forEach(function (id, i) {
        var a = (i / n) * Math.PI * 2 - Math.PI / 2;
        positions[id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      });
    });
    // Edges (component dependencies — synthesize plausible relations)
    var EDGES = [
      ['button','card'], ['button','modal'], ['button','aiCard'],
      ['card','aiCard'], ['chip','aiCard'], ['eyebrow','aiCard'],
      ['button','aiDiff'], ['eyebrow','aiDiff'],
      ['chip','aiMeter'], ['eyebrow','aiMeter'],
      ['input','modal'], ['avatar','aiCard'], ['badge','navLink']
    ];
    EDGES.forEach(function (pair) {
      var a = positions[pair[0]], b = positions[pair[1]];
      if (!a || !b) return;
      var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      var ctrlX = cx + (midX - cx) * 0.3, ctrlY = cy + (midY - cy) * 0.3;
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'atomic-rings__edge');
      p.setAttribute('data-from', pair[0]);
      p.setAttribute('data-to', pair[1]);
      p.setAttribute('d', 'M ' + a.x + ' ' + a.y + ' Q ' + ctrlX + ' ' + ctrlY + ' ' + b.x + ' ' + b.y);
      svg.appendChild(p);
    });
    // Nodes
    Object.keys(COMPONENT_DATA).forEach(function (id) {
      var p = positions[id]; if (!p) return;
      var s = avgScore(id);
      var bucket = scoreToFill(s);
      var fill = bucket === 'sync' ? 'var(--sage)' : bucket === 'drift' ? 'var(--amber)' : 'var(--rust)';
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'atomic-rings__node');
      g.setAttribute('data-component', id);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      var label = (COMPONENT_DATA[id].title || '').split(' · ')[0];
      g.setAttribute('aria-label', label + ' — average score ' + Math.round(s));
      var ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('class', 'atomic-rings__node-ring');
      ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y); ring.setAttribute('r', '16');
      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('class', 'atomic-rings__node-bg');
      bg.setAttribute('cx', p.x); bg.setAttribute('cy', p.y); bg.setAttribute('r', '13');
      bg.setAttribute('style', 'fill:' + fill);
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'atomic-rings__node-label');
      t.setAttribute('x', p.x); t.setAttribute('y', p.y + 26);
      t.textContent = label;
      g.appendChild(ring); g.appendChild(bg); g.appendChild(t);
      g.addEventListener('click', function () { selectAtomicNode(id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAtomicNode(id); }
      });
      svg.appendChild(g);
    });
  }

  function selectAtomicNode(id) {
    if (!atomicRingsEl) return;
    atomicRingsEl.setAttribute('data-selected', id);
    atomicRingsEl.querySelectorAll('.atomic-rings__node').forEach(function (g) {
      g.classList.toggle('atomic-rings__node--selected', g.getAttribute('data-component') === id);
    });
    atomicRingsEl.querySelectorAll('.atomic-rings__edge').forEach(function (e) {
      var f = e.getAttribute('data-from'), t = e.getAttribute('data-to');
      e.classList.toggle('atomic-rings__edge--connected', f === id || t === id);
    });
    if (typeof selectComponent === 'function') selectComponent(id);
  }
  // Render once on first map view
  var atomicRendered = false;
  var _origSetSpace = setSpace;
  setSpace = function (name) {
    _origSetSpace(name);
    if (name === 'map' && !atomicRendered) {
      renderAtomicRings();
      atomicRendered = true;
    }
  };

  // ============ Stage 15.1 — Map search ============
  var mapSearchInput = document.getElementById('map-search-input');
  var mapSearchCount = document.getElementById('map-search-count');
  function applyMapSearch() {
    if (!atomicRingsEl || !mapSearchInput) return;
    var q = mapSearchInput.value.trim().toLowerCase();
    var nodes = atomicRingsEl.querySelectorAll('.atomic-rings__node');
    var matched = 0;
    if (!q) {
      atomicRingsEl.removeAttribute('data-search-active');
      nodes.forEach(function (n) { n.classList.remove('atomic-rings__node--matched'); });
      if (mapSearchCount) mapSearchCount.textContent = nodes.length + ' of ' + nodes.length + ' components';
      return;
    }
    atomicRingsEl.setAttribute('data-search-active', 'true');
    nodes.forEach(function (n) {
      var id = n.getAttribute('data-component');
      var label = (n.getAttribute('aria-label') || '').toLowerCase();
      var s = avgScore(id);
      var bucket = scoreToFill(s);
      var match = false;
      if (label.indexOf(q) !== -1) match = true;
      if (!match && (q.indexOf('drift') !== -1) && bucket === 'drift') match = true;
      if (!match && (q.indexOf('miss') !== -1 || q.indexOf('critical') !== -1) && bucket === 'missing') match = true;
      if (!match && (q.indexOf('spec') !== -1 || q.indexOf('sync') !== -1) && bucket === 'sync') match = true;
      // Platform: check if row has drift on that platform
      ['web','ios','android','figma','storybook'].forEach(function (plat) {
        if (q.indexOf(plat) !== -1) {
          var row = document.querySelector('[data-component="' + id + '"]');
          if (row) {
            var cells = row.querySelectorAll('.components-matrix__cell');
            var idx = ['web','ios','android','figma','storybook'].indexOf(plat);
            var c = cells[idx];
            if (c && (c.classList.contains('components-matrix__cell--drift') || c.classList.contains('components-matrix__cell--missing'))) match = true;
          }
        }
      });
      n.classList.toggle('atomic-rings__node--matched', match);
      if (match) matched++;
    });
    if (mapSearchCount) mapSearchCount.textContent = matched + ' of ' + nodes.length + ' components match';
  }
  if (mapSearchInput) {
    mapSearchInput.addEventListener('input', applyMapSearch);
    mapSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { mapSearchInput.value = ''; applyMapSearch(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (body.getAttribute('data-space') !== 'map') return;
    if (e.key === '/') {
      e.preventDefault();
      if (mapSearchInput) mapSearchInput.focus();
    }
  });

  // ============ Stage 15.2-15.4 — Implications / Why / Changes ============
  var IMPLICATIONS = {
    button: {
      dependents: ['Card uses Button (3 places)', 'Modal uses Button (footer actions)', 'AI Card uses Button (approve row)'],
      external: ['Storybook · 4 stories will need re-snapshot', 'Figma · master/Button component set', 'Zeroheight · Button page (last edited 6 days ago — STALE)'],
      tickets: ['BELLA-1247 · iOS Button landscape variant · in flight', 'BELLA-1233 · Component freeze for Q3 release · awaiting'],
      friction: ['"Dark mode had invisible button text" · Resolved · 2026-04-24', '"The four-click approval dance" · Resolved · 2026-04-18 (mentions Button)']
    },
    card: {
      dependents: ['AI Card extends Card', 'Friction entries use Card', 'Steward rituals use Card'],
      external: ['Storybook · 2 stories', 'Figma · master/Card', 'Zeroheight · Card page'],
      tickets: ['BELLA-1252 · Card landscape elevation tokens · drafted'],
      friction: []
    },
    input: {
      dependents: ['Friction compose · Search bars · Login splash'],
      external: ['Storybook · 1 story', 'Figma · master/Input'],
      tickets: ['BELLA-1241 · Android Input port · not started'],
      friction: []
    },
    chip: {
      dependents: ['Surfaces shelf · Approve row · Friction meta · Steward rituals · System map'],
      external: ['Storybook · 5 stories', 'Figma · master/Chip'],
      tickets: [],
      friction: []
    },
    eyebrow: {
      dependents: ['Cockpit headers · Card headers · Sidebar sections · Audit ribbon'],
      external: ['Storybook · 2 stories', 'Figma · master/Eyebrow'],
      tickets: ['BELLA-1219 · iOS Eyebrow spacing token drift · in flight'],
      friction: []
    },
    navLink: {
      dependents: ['Sidebar nav · Topbar crumb · Footer'],
      external: ['Storybook · 1 story', 'Figma · master/Nav-link'],
      tickets: ['BELLA-1228 · Android NavLink port · awaiting'],
      friction: []
    },
    modal: {
      dependents: ['Approve confirmations · Settings dialogs · Onboarding sheets'],
      external: ['Storybook · 3 stories', 'Figma · master/Modal'],
      tickets: ['BELLA-1244 · Android landscape backdrop sizing · in flight'],
      friction: []
    },
    avatar: {
      dependents: ['Topbar · Splash · Friction meta'],
      external: ['Storybook · 1 story', 'Figma · master/Avatar'],
      tickets: [],
      friction: []
    },
    badge: {
      dependents: ['Sidebar chips · Topbar notifications · Friction meta'],
      external: ['Storybook · 2 stories', 'Figma · master/Badge'],
      tickets: ['BELLA-1235 · Android landscape positioning · drafted'],
      friction: []
    },
    aiCard: {
      dependents: ['Composes Button + Card + Chip + Eyebrow', 'Cockpit proposals · Inbox cards (Stage 5)'],
      external: ['Storybook · 1 story', 'Figma · master/AI-Card'],
      tickets: ['BELLA-1259 · iOS AI Card not started · v1 candidate', 'BELLA-1260 · Android AI Card not started · v1 candidate'],
      friction: []
    },
    aiDiff: {
      dependents: ['AI Card embeds AI Diff', 'Roadmap proposals'],
      external: ['Storybook · 1 story', 'Figma · master/AI-Diff'],
      tickets: ['BELLA-1262 · Mobile AI Diff geometry undefined · drafted'],
      friction: []
    },
    aiMeter: {
      dependents: ['Cockpit parity meter', 'System map (Stage 6 candidate)'],
      external: ['Storybook · 1 story', 'Figma · master/AI-Meter'],
      tickets: ['BELLA-1264 · Mobile typography for 72px hero · drafted'],
      friction: []
    }
  };
  var WHY_DRIFT = {
    button:  { ios: 'Landscape variant pending. iOS Lead targeting next sprint (BELLA-1247). Tracked in Coming up: Friday parity review.',
               android: 'Component partial. Android squad working on navigation primitives this sprint. Estimated Q3.' },
    card:    { android: 'Landscape elevation tokens not yet ported. BELLA-1252 drafted, awaiting design approval.' },
    input:   { ios: 'Landscape preview pending. iOS Lead landscape variant partial (BELLA-1241).',
               android: 'Component not started on Android. Squad scope blocked.' },
    eyebrow: { ios: 'Letter-spacing token drift detected. BELLA-1219 in flight.',
               android: 'Letter-spacing migration pending.' },
    navLink: { ios: 'Active-state amber underline missing. BELLA-1228 awaiting.',
               android: 'Component not started on Android.' },
    modal:   { android: 'Landscape backdrop sizing issue. BELLA-1244 in flight.' },
    badge:   { android: 'Landscape positioning issue. BELLA-1235 drafted.' },
    aiCard:  { ios: 'iOS primitive not started. v1 candidate.',
               android: 'Android primitive not started. v1 candidate.',
               storybook: 'Storybook coverage drift; needs landscape preview snapshot.' },
    aiDiff:  { ios: 'iOS primitive not started.', android: 'Android primitive not started.',
               storybook: 'Mobile diff geometry undefined; story drafted.' },
    aiMeter: { ios: 'iOS primitive not started.', android: 'Android primitive not started.',
               storybook: 'Mobile typography pending for 72px hero.' }
  };
  var CHANGES = {
    button: [
      { time: '2026-04-26 14:03', summary: 'Landscape variant added (Web only)', meta: 'Web Lead · BELLA-1247 · pending review' },
      { time: '2026-04-22 09:14', summary: 'Token migration: semantic/light → semantic/light.json', meta: 'Elleta · commit cdd396d · stage 2d.5' },
      { time: '2026-04-18 16:30', summary: 'Accessibility focus-ring fix · WCAG AA contrast', meta: 'Web Lead · commit 8f2a9b1 · BELLA-1198' },
      { time: '2026-04-12 11:00', summary: 'Variant renamed: secondary → outline', meta: 'iOS Lead · commit 4d12c84 · breaking change' }
    ]
  };
  function defaultChanges(id) {
    return [
      { time: '2026-04-26 14:03', summary: 'Latest landscape audit · ' + (COMPONENT_DATA[id] ? COMPONENT_DATA[id].title.split(' · ')[0] : id), meta: 'Web Lead · cross-platform review' },
      { time: '2026-04-22 09:14', summary: 'Token migration sweep', meta: 'Elleta · commit cdd396d · stage 2d.5' },
      { time: '2026-04-18 16:30', summary: 'Accessibility audit', meta: 'Web Lead · commit 8f2a9b1' }
    ];
  }
  function whyDriftHtml(id) {
    var w = WHY_DRIFT[id]; if (!w) return '';
    var rows = '';
    Object.keys(w).forEach(function (plat) {
      rows += '<p><strong>' + plat.toUpperCase() + ' · </strong>' + escapeHtml(w[plat]) + '</p>';
    });
    if (!rows) return '';
    return '<div class="detail-section">' +
      '<p class="detail-section__label">Why?</p>' +
      '<div class="detail-section__body"><div class="detail-section__why">' + rows + '</div></div>' +
      '</div>';
  }
  function implicationsHtml(id) {
    var im = IMPLICATIONS[id] || { dependents: [], external: [], tickets: [], friction: [] };
    var html = '<div class="detail-section">' +
      '<p class="detail-section__label">Implications · changing this affects</p>' +
      '<div class="detail-section__body">';
    if (im.dependents.length) {
      html += '<p class="detail-section__category-label">Dependent components</p>';
      html += '<ul class="detail-section__list">' + im.dependents.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
    }
    if (im.external.length) {
      html += '<p class="detail-section__category-label">External surfaces</p>';
      html += '<ul class="detail-section__list">' + im.external.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
    }
    if (im.tickets.length) {
      html += '<p class="detail-section__category-label">Open tickets (Jira)</p>';
      html += '<ul class="detail-section__list">' + im.tickets.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
    }
    if (im.friction.length) {
      html += '<p class="detail-section__category-label">Friction log references</p>';
      html += '<ul class="detail-section__list">' + im.friction.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
    }
    html += '</div></div>';
    return html;
  }
  function changesHtml(id) {
    var c = CHANGES[id] || defaultChanges(id);
    var html = '<div class="detail-section">' +
      '<p class="detail-section__label">Changes · last ' + c.length + ' edits</p>' +
      '<div class="detail-section__body"><div class="detail-section__changes">';
    c.forEach(function (e) {
      html += '<div class="detail-section__change">' +
              '<span class="detail-section__change-time">' + escapeHtml(e.time) + '</span>' +
              '<div><div class="detail-section__change-summary">' + escapeHtml(e.summary) + '</div>' +
              '<div class="detail-section__change-meta">' + escapeHtml(e.meta) + '</div></div>' +
              '</div>';
    });
    html += '</div></div></div>';
    return html;
  }
  // Wrap selectComponent so the panel gets the new sections appended
  if (typeof selectComponent === 'function') {
    var _origSelectComponent = selectComponent;
    selectComponent = function (id) {
      _origSelectComponent(id);
      var panel = document.getElementById('map-detail-content');
      if (!panel) return;
      var extra = whyDriftHtml(id) + implicationsHtml(id) + changesHtml(id);
      panel.insertAdjacentHTML('beforeend', extra);
      // Wire collapsible sections
      panel.querySelectorAll('.detail-section').forEach(function (sec) {
        var label = sec.querySelector('.detail-section__label');
        if (label) label.addEventListener('click', function () {
          var collapsed = sec.getAttribute('data-collapsed') === 'true';
          sec.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
        });
      });
    };
  }

  // ============ Stage 15.5 — Palette → component-name jump hint ============
  // Leave as-is; palette ALREADY routes component selections to map space + selectComponent.

  // ============ Stage 16.2 — Coming up rituals expand on click ============
  var RITUAL_DETAIL = {
    parity: {
      surface: 'Preview · 23 components currently flagged for parity review. Highest-risk: Input (Android 0%) · Nav link (Android 0%) · AI Card (iOS missing).',
      prepped: ['Last week\'s parity audit · 18 components reviewed', 'Friction note · "Modal landscape consistency"', 'Research entry · TJ Pitre — Tokens as primary contract'],
      past: ['2026-04-19 · 4 of 18 components approved · Web Lead led', '2026-04-12 · 6 of 12 components approved · iOS Lead led', '2026-04-05 · 11 of 11 components approved · Elleta led']
    },
    research: {
      surface: 'Preview · 3 new research entries to triage. Maggie Appleton (daemons), Emily Campbell (patterns), Projects By IF (trust).',
      prepped: ['Last digest · 6 entries reviewed', 'Reading queue · 12 articles bookmarked', 'Research library · living map updated'],
      past: ['2026-04-19 · 6 entries · 2 promoted to lineage', '2026-04-12 · 4 entries · 1 promoted', '2026-04-05 · 5 entries · all reviewed']
    },
    publish: {
      surface: 'Preview · 2 pages awaiting approval on elleta.design — "Cockpit case study" and "BELLA palette rationale".',
      prepped: ['Drafts reviewed · both passed inclusion check', 'Friction note · "Show in Finder ejection seat" referenced', 'Last publish · 2026-04-21 · 3 pages'],
      past: ['2026-04-21 · 3 pages published', '2026-04-14 · 2 pages published', '2026-04-07 · 1 page published']
    },
    subscriptions: {
      surface: 'Preview · 1 tool flagged idle (Linear unused 21 days). 9 active subscriptions · $847/mo total.',
      prepped: ['Subscription audit · 9 tools reviewed', 'Friction log · no related entries', 'Last sweep · 2026-04-19 · 0 cancellations'],
      past: ['2026-04-19 · 0 cancelled · all justified', '2026-04-12 · 1 cancelled (Notion AI)', '2026-04-05 · 2 cancelled']
    },
    friction: {
      surface: 'Preview · 3 open notes to triage. "Sidebar too wide", "Show in Finder ejection", "Conversations as meetings".',
      prepped: ['Friction log · all 3 entries reviewed', 'Cowork tag · 2 entries flagged', 'Calendar MCP · v1 candidate identified'],
      past: ['2026-04-19 · 2 of 3 resolved', '2026-04-12 · 1 of 4 resolved · 3 deferred', '2026-04-05 · 0 of 2 resolved · escalated']
    },
    miseenplace: {
      surface: 'Preview · weekend cleanup pass. Sweep stale Notion pages, prune dormant tokens, reset friction log.',
      prepped: ['Last week · 4 stale pages archived', 'Token audit · 0 dormant identified', 'Cleanup checklist ready'],
      past: ['2026-04-20 · 6 pages archived · 0 dormant tokens', '2026-04-13 · 8 pages archived · 2 dormant tokens', '2026-04-06 · 4 pages archived · 1 dormant token']
    }
  };
  var ritualBtns = document.querySelectorAll('[data-ritual]');
  function clearRitualExpand() {
    document.querySelectorAll('.ritual-expand').forEach(function (el) { el.parentNode.removeChild(el); });
    ritualBtns.forEach(function (b) {
      b.classList.remove('ritual--selected');
      b.setAttribute('aria-expanded', 'false');
    });
  }
  function selectRitual(rid) {
    var btn = document.querySelector('[data-ritual="' + rid + '"]'); if (!btn) return;
    var alreadyOpen = btn.getAttribute('aria-expanded') === 'true';
    clearRitualExpand();
    if (alreadyOpen) return;
    btn.classList.add('ritual--selected');
    btn.setAttribute('aria-expanded', 'true');
    var d = RITUAL_DETAIL[rid] || { surface: '', prepped: [], past: [] };
    var html = '<div class="ritual-expand">';
    html += '<div class="ritual-expand__section"><p class="ritual-expand__label">What CHIP will surface</p><p>' + escapeHtml(d.surface) + '</p></div>';
    if (d.prepped && d.prepped.length) {
      html += '<div class="ritual-expand__section"><p class="ritual-expand__label">What you\'ve prepped</p><ul class="ritual-expand__list">' + d.prepped.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></div>';
    }
    if (d.past && d.past.length) {
      html += '<div class="ritual-expand__section"><p class="ritual-expand__label">Past iterations</p><ul class="ritual-expand__list">' + d.past.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<button type="button" class="ritual-expand__open" data-ritual-open="' + rid + '">→ Open in Cockpit when ritual fires</button>';
    html += '</div>';
    btn.insertAdjacentHTML('afterend', html);
    var openBtn = document.querySelector('[data-ritual-open="' + rid + '"]');
    if (openBtn) openBtn.addEventListener('click', function () { setSpace('cockpit'); });
  }
  ritualBtns.forEach(function (b) {
    b.addEventListener('click', function () { selectRitual(b.getAttribute('data-ritual')); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRitual(b.getAttribute('data-ritual')); }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (e.key !== 'Escape') return;
    if (body.getAttribute('data-space') !== 'steward') return;
    if (!document.querySelector('.ritual--selected')) return;
    clearRitualExpand();
  });

  // ============ Stage 16.3 + 17 — Tabbed component detail panel ============
  // Tab labels: Overview, Implications, Changes, Simulation, AI Insights
  var TAB_LABELS = { overview: 'Overview', implications: 'Implications', changes: 'Changes', simulation: 'Simulation', insights: 'AI Insights' };

  function overviewTabHtml(id) {
    var data = COMPONENT_DATA[id] || { title: id, rows: [] };
    var html = '<p class="map-detail__title">' + escapeHtml(data.title) + '</p>';
    html += '<ul class="map-detail__rows">';
    data.rows.forEach(function (r) {
      html += '<li><span>' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></li>';
    });
    html += '</ul>';
    html += whyDriftHtml(id);
    return html;
  }

  // ============ Stage 17.1 — Simulation tab ============
  function simulationHtml(id) {
    var data = COMPONENT_DATA[id]; if (!data) return '';
    var label = (data.title || id).split(' · ')[0];
    var html = '<div class="sim" data-sim-component="' + escapeHtml(id) + '">';
    html += '<p class="card__eyebrow">Simulation · what-if controls</p>';
    html += '<h3 class="card__headline">Simulate changes to this component.</h3>';
    html += '<p class="sim__intro">Adjust effort, complexity, and platform scope. CHIP estimates cost, workload, and downstream implications in real time.</p>';

    // Effort
    html += '<p class="sim__col-label">Effort</p>';
    html += '<div class="sim__row">';
    html += '<span class="sim__field-label">Work hours</span>';
    html += '<input type="range" class="sim__slider" data-sim="hours" min="1" max="40" value="16" aria-label="Work hours" />';
    html += '<span class="sim__readout" data-sim-readout="hours">16h / 40h</span>';
    html += '</div>';

    // Complexity pills
    html += '<div class="sim__row" style="grid-template-columns: max-content 1fr;">';
    html += '<span class="sim__field-label">Complexity</span>';
    html += '<div class="sim__pills" data-sim-group="complexity">';
    ['Low','Medium','High','Breaking'].forEach(function (c) {
      var active = c === 'High';
      html += '<button type="button" class="chip ' + (active ? 'chip--info' : 'chip--muted') + ' sim__pill" data-sim-value="' + c + '" aria-pressed="' + active + '">' + c + '</button>';
    });
    html += '</div></div>';

    // Timeline pills
    html += '<div class="sim__row" style="grid-template-columns: max-content 1fr;">';
    html += '<span class="sim__field-label">Timeline</span>';
    html += '<div class="sim__pills" data-sim-group="timeline">';
    ['1 sprint','2 sprints','1 quarter'].forEach(function (t) {
      var active = t === '2 sprints';
      html += '<button type="button" class="chip ' + (active ? 'chip--info' : 'chip--muted') + ' sim__pill" data-sim-value="' + t + '" aria-pressed="' + active + '">' + t + '</button>';
    });
    html += '</div></div>';

    // Platforms checkboxes (chips)
    html += '<p class="sim__col-label">Platforms affected</p>';
    html += '<div class="sim__platforms" data-sim-group="platforms">';
    [['Web', true],['iOS', true],['Android', false],['Figma', true],['Storybook', true]].forEach(function (p) {
      html += '<button type="button" class="chip ' + (p[1] ? 'chip--info' : 'chip--muted') + ' sim__plat" data-sim-platform="' + p[0] + '" aria-pressed="' + p[1] + '">' + p[0] + '</button>';
    });
    html += '</div>';

    // Impact 2x2 grid
    html += '<div class="sim__impact">';
    html += '<div class="sim__impact-card"><p class="sim__impact-eyebrow">Estimated cost</p><p class="sim__impact-num" data-sim-out="cost">$1,920</p><p class="sim__impact-sub" data-sim-out="cost-sub">16h × $120/h</p></div>';
    html += '<div class="sim__impact-card"><p class="sim__impact-eyebrow">Compliance</p><p class="sim__impact-num" data-sim-out="compliance">94%</p><p class="sim__impact-sub" data-sim-out="compliance-sub">+2 vs current</p></div>';
    html += '<div class="sim__impact-card"><p class="sim__impact-eyebrow">Workload</p><p class="sim__impact-num" data-sim-out="workload">Medium</p><p class="sim__impact-sub" data-sim-out="workload-sub">4 squad-days</p></div>';
    html += '<div class="sim__impact-card"><p class="sim__impact-eyebrow">Predicted tickets</p><p class="sim__impact-num" data-sim-out="tickets">5 tickets</p><p class="sim__impact-sub" data-sim-out="tickets-sub">across active platforms</p></div>';
    html += '</div>';

    // AI Analysis card
    html += '<div class="sim__analysis">';
    html += '<span class="sim__analysis-label">✦ AI Analysis</span><br/>';
    html += '<span data-sim-out="analysis">Based on simulated changes, updating ' + escapeHtml(label) + ' at high complexity across 4 platforms would take ~16 hours of squad effort and yield a 94% compliance score. Two squads would need to coordinate on Storybook story regeneration. iOS Lead has bandwidth this sprint per their last cycle ratio.</span>';
    html += '</div>';

    html += '<button type="button" class="btn btn--primary sim__report" data-sim-report="' + escapeHtml(id) + '">Generate impact report</button>';
    html += '</div>';
    return html;
  }

  function wireSimulation(rootEl, id) {
    if (!rootEl) return;
    var state = {
      hours: 16,
      complexity: 'High',
      timeline: '2 sprints',
      platforms: { Web: true, iOS: true, Android: false, Figma: true, Storybook: true }
    };
    function complexityFactor() {
      return ({Low:5, Medium:2, High:-3, Breaking:-10})[state.complexity] || 0;
    }
    function activePlatformCount() {
      return Object.keys(state.platforms).filter(function (k) { return state.platforms[k]; }).length;
    }
    function recompute() {
      var hours = state.hours;
      var nplat = activePlatformCount();
      var cost = hours * 120;
      var baseScore = 92;
      var compliance = Math.max(0, Math.min(100, baseScore + complexityFactor() + (nplat >= 4 ? 2 : 0)));
      var delta = compliance - 92;
      var workload = (nplat <= 3) ? 'Low' : (nplat === 4 ? 'Medium' : 'High');
      var squadDays = Math.max(1, Math.round(hours / 4));
      var tickets = 1 + nplat;
      rootEl.querySelector('[data-sim-readout="hours"]').textContent = hours + 'h / 40h';
      rootEl.querySelector('[data-sim-out="cost"]').textContent = '$' + cost.toLocaleString();
      rootEl.querySelector('[data-sim-out="cost-sub"]').textContent = hours + 'h × $120/h';
      rootEl.querySelector('[data-sim-out="compliance"]').textContent = compliance + '%';
      rootEl.querySelector('[data-sim-out="compliance-sub"]').textContent = (delta >= 0 ? '+' : '') + delta + ' vs current';
      rootEl.querySelector('[data-sim-out="workload"]').textContent = workload;
      rootEl.querySelector('[data-sim-out="workload-sub"]').textContent = squadDays + ' squad-day' + (squadDays === 1 ? '' : 's');
      rootEl.querySelector('[data-sim-out="tickets"]').textContent = tickets + ' ticket' + (tickets === 1 ? '' : 's');
      rootEl.querySelector('[data-sim-out="tickets-sub"]').textContent = 'across ' + nplat + ' active platform' + (nplat === 1 ? '' : 's');
      var label = ((COMPONENT_DATA[id] || {}).title || id).split(' · ')[0];
      var analysis = 'Based on simulated changes, updating ' + label + ' at ' + state.complexity.toLowerCase() + ' complexity across ' + nplat + ' platforms would take ~' + hours + ' hours of squad effort and yield a ' + compliance + '% compliance score. ';
      if (nplat >= 4) analysis += 'Two squads would need to coordinate on Storybook story regeneration. ';
      analysis += 'iOS Lead has bandwidth this sprint per their last cycle ratio.';
      rootEl.querySelector('[data-sim-out="analysis"]').textContent = analysis;
    }
    var slider = rootEl.querySelector('[data-sim="hours"]');
    if (slider) slider.addEventListener('input', function () { state.hours = parseInt(slider.value, 10); recompute(); });
    rootEl.querySelectorAll('[data-sim-group="complexity"] [data-sim-value]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.complexity = b.getAttribute('data-sim-value');
        rootEl.querySelectorAll('[data-sim-group="complexity"] [data-sim-value]').forEach(function (x) {
          var active = x === b;
          x.setAttribute('aria-pressed', active);
          x.classList.toggle('chip--info', active);
          x.classList.toggle('chip--muted', !active);
        });
        recompute();
      });
    });
    rootEl.querySelectorAll('[data-sim-group="timeline"] [data-sim-value]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.timeline = b.getAttribute('data-sim-value');
        rootEl.querySelectorAll('[data-sim-group="timeline"] [data-sim-value]').forEach(function (x) {
          var active = x === b;
          x.setAttribute('aria-pressed', active);
          x.classList.toggle('chip--info', active);
          x.classList.toggle('chip--muted', !active);
        });
        recompute();
      });
    });
    rootEl.querySelectorAll('[data-sim-platform]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-sim-platform');
        state.platforms[name] = !state.platforms[name];
        b.setAttribute('aria-pressed', state.platforms[name]);
        b.classList.toggle('chip--info', state.platforms[name]);
        b.classList.toggle('chip--muted', !state.platforms[name]);
        recompute();
      });
    });
    var rep = rootEl.querySelector('[data-sim-report]');
    if (rep) rep.addEventListener('click', function () {
      console.log('[CHIP] Impact report:', id, state);
      if (askToast) {
        askToast.textContent = 'Report generation is v1. The simulation is real.';
        askToast.hidden = false;
        askToast.classList.add('toast--visible');
        setTimeout(function () {
          askToast.classList.remove('toast--visible');
          setTimeout(function () { askToast.hidden = true; }, 250);
        }, 2200);
      }
    });
    recompute();
  }

  // ============ Stage 17.2 — AI Insights tab ============
  function gradeFor(score) {
    if (score >= 95) return { letter: 'A+', text: 'Excellent' };
    if (score >= 90) return { letter: 'A',  text: 'Strong' };
    if (score >= 85) return { letter: 'B+', text: 'Solid' };
    if (score >= 80) return { letter: 'B',  text: 'Good' };
    if (score >= 70) return { letter: 'C+', text: 'Mixed' };
    if (score >= 60) return { letter: 'C',  text: 'Drift watch' };
    if (score >= 50) return { letter: 'D',  text: 'Behind' };
    return { letter: 'F', text: 'Critical' };
  }
  var INSIGHTS = {
    button: [
      { tone: 'sage',  glyph: '✦', title: 'Performance improvement',  severity: 'High',   body: 'Web parity at 100% for 14 days. iOS resolved landscape variant in last sprint. Component read times improved 12% post-token migration.' },
      { tone: 'amber', glyph: '⚠', title: 'Coverage gap',              severity: 'Medium', body: 'Android variant pending. iOS landscape rolled out in last sprint; Android squad currently on navigation primitives. Gap visible to consumers.' },
      { tone: 'steel', glyph: '$', title: 'Cost efficiency',           severity: 'Medium', body: 'Storybook regen takes 4 minutes per change. Could cut to 90s with story-fragment compilation. Marginal but compounds across the matrix.' },
      { tone: 'sage',  glyph: '◆', title: 'Low breach risk',           severity: 'High',   body: 'Token contract intact. No semantic-name changes in last 60 days. Safe to extend.' },
      { tone: 'steel', glyph: '✦', title: 'Suggested amendment',       severity: 'High',   body: 'Promote `outline` variant to primary token set. 3 surfaces already use it; adding to BELLA core would clean up 12 hardcoded references.' }
    ]
  };
  function defaultInsights(id, score) {
    var label = ((COMPONENT_DATA[id] || {}).title || id).split(' · ')[0];
    var has = score >= 90;
    return [
      { tone: has ? 'sage' : 'amber', glyph: has ? '✦' : '⚠',
        title: has ? 'Performance improvement' : 'Coverage gap',
        severity: has ? 'High' : 'Medium',
        body: has
          ? label + ' parity holding strong across active platforms. Token migration effects are stable; no recent regression detected.'
          : label + ' shows drift on at least one platform. Likely root cause: landscape rollout still partial. Tracked in Coming up: Friday parity review.' },
      { tone: 'steel', glyph: '$', title: 'Cost efficiency', severity: 'Medium',
        body: 'Storybook regeneration cycle averages 4 minutes for ' + label + '. Story-fragment compilation could halve that.' },
      { tone: 'sage',  glyph: '◆', title: 'Low breach risk', severity: 'High',
        body: 'Token references stable. No breaking changes in the last 30 days. Safe to extend or refactor.' },
      { tone: 'steel', glyph: '✦', title: 'Suggested amendment', severity: 'Medium',
        body: 'Consider promoting variant tokens to a shared primitive. Reduces duplication across the component family.' }
    ];
  }
  function aiInsightsHtml(id) {
    var score = avgScore(id);
    var grade = gradeFor(score);
    var cards = INSIGHTS[id] || defaultInsights(id, score);
    var html = '<p class="card__eyebrow">AI Insights · component health</p>';
    html += '<h3 class="card__headline">What CHIP knows about this component.</h3>';
    html += '<div class="insights">';
    cards.forEach(function (c) {
      html += '<article class="insight insight--' + c.tone + '">';
      html += '<div class="insight__head"><span class="insight__title"><span aria-hidden="true">' + escapeHtml(c.glyph) + '</span>' + escapeHtml(c.title) + '</span><span class="chip chip--' + (c.tone === 'amber' ? 'accent' : c.tone === 'steel' ? 'info' : c.tone === 'sage' ? 'success' : 'muted') + '">' + escapeHtml(c.severity) + '</span></div>';
      html += '<p class="insight__body">' + escapeHtml(c.body) + '</p>';
      html += '</article>';
    });
    html += '</div>';
    var label = ((COMPONENT_DATA[id] || {}).title || id).split(' · ')[0];
    html += '<section class="health">';
    html += '<div class="health__badge">' + grade.letter + '</div>';
    html += '<p class="health__headline">Overall ' + escapeHtml(label) + ' health: ' + grade.text + '.</p>';
    html += '<p class="health__body">Avg score ' + Math.round(score) + ' across active platforms. Continue tracking coverage gaps; the simulation tab can model the cost of closing them.</p>';
    html += '</section>';
    return html;
  }

  // ============ Render component detail with tabs ============
  function renderComponentDetail(id) {
    var content = document.getElementById('map-detail-content');
    var empty = document.getElementById('map-detail-empty');
    if (!content) return;
    if (empty) empty.style.display = 'none';
    var html = '<div class="tabs" role="tablist">';
    ['overview','implications','changes','simulation','insights'].forEach(function (t, i) {
      html += '<button type="button" class="tab' + (i === 0 ? ' tab--active' : '') + '" role="tab" aria-selected="' + (i === 0) + '" data-tab="' + t + '">' + TAB_LABELS[t] + '</button>';
    });
    html += '</div>';
    html += '<div class="tab-panel tab-panel--active" data-tab="overview">' + overviewTabHtml(id) + '</div>';
    html += '<div class="tab-panel" data-tab="implications">' + implicationsHtml(id) + '</div>';
    html += '<div class="tab-panel" data-tab="changes">' + changesHtml(id) + '</div>';
    html += '<div class="tab-panel" data-tab="simulation">' + simulationHtml(id) + '</div>';
    html += '<div class="tab-panel" data-tab="insights">' + aiInsightsHtml(id) + '</div>';
    content.innerHTML = html;

    // Tab switching
    content.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var t = tab.getAttribute('data-tab');
        content.querySelectorAll('.tab').forEach(function (x) {
          var active = x === tab;
          x.classList.toggle('tab--active', active);
          x.setAttribute('aria-selected', active);
        });
        content.querySelectorAll('.tab-panel').forEach(function (p) {
          p.classList.toggle('tab-panel--active', p.getAttribute('data-tab') === t);
        });
        if (t === 'simulation') {
          var sim = content.querySelector('.sim');
          if (sim && !sim.dataset.wired) { sim.dataset.wired = '1'; wireSimulation(sim, id); }
        }
      });
    });
    // Wire collapsible detail-sections inside (legacy)
    content.querySelectorAll('.detail-section').forEach(function (sec) {
      var label = sec.querySelector('.detail-section__label');
      if (label) label.addEventListener('click', function () {
        var collapsed = sec.getAttribute('data-collapsed') === 'true';
        sec.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      });
    });
  }
  // Wrap selectComponent to use the tabbed renderer (replaces Stage 15 behavior)
  if (typeof selectComponent === 'function') {
    var _origSelectComponentForTabs = selectComponent;
    selectComponent = function (id) {
      // Run original DOM-highlight logic but skip the linear render
      mapSection && mapSection.setAttribute('data-selected', '');
      mapNodes && mapNodes.forEach(function (n) { n.classList.remove('map__node--selected'); });
      mapEdges && mapEdges.forEach(function (e) { e.classList.remove('map__edge-group--connected'); });
      matrixRows && matrixRows.forEach(function (r) {
        r.classList.toggle('components-matrix__row--selected', r.getAttribute('data-component') === id);
      });
      renderComponentDetail(id);
    };
  }

  // ============ Stage 18.2 — Persistent strip phase highlight ============
  function setPersistPhase(name) {
    document.querySelectorAll('[data-persist-phase]').forEach(function (el) {
      el.classList.toggle('persist-strip__phase--active', el.getAttribute('data-persist-phase') === name);
    });
  }
  // Wrap setMapek so it ALSO updates the persist strip
  if (typeof setMapek === 'function') {
    var _origSetMapek = setMapek;
    setMapek = function (name) { _origSetMapek(name); setPersistPhase(name); };
  }
  // Persist-strip click → scroll to meter
  var persistStripBtn = document.getElementById('persist-strip-btn');
  if (persistStripBtn && meterCard) {
    persistStripBtn.addEventListener('click', function () {
      meterCard.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // ============ Stage 18.3 — Readiness migration on Approve ============
  if (typeof approve === 'function') {
    var _origApprove = approve;
    approve = function () {
      var phase = body.getAttribute('data-phase');
      if (phase === 'drift') {
        var todo = document.getElementById('readiness-todo');
        var done = document.getElementById('readiness-done');
        if (todo && done) {
          var items = Array.prototype.slice.call(todo.querySelectorAll('li'));
          items.forEach(function (it) {
            // Flip glyph from □ to ✓
            var glyph = it.querySelector('.readiness__glyph');
            if (glyph) glyph.textContent = '✓';
            // Move to done column
            done.appendChild(it);
          });
        }
      }
      _origApprove();
    };
  }
})();
