// Helbling E-Mail Agent — Dashboard JavaScript

const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
};

// --- Tab Navigation ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    loadTabData(btn.dataset.tab);
  });
});

function loadTabData(tab) {
  if (tab === 'inbox') loadEmails();
  else if (tab === 'drafts') loadDrafts();
  else if (tab === 'tasks') loadTasks();
  else if (tab === 'knowledge') loadKnowledge();
  else if (tab === 'stats') loadStats();
}

// --- Toast ---
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function closePanel(id) {
  document.getElementById(id).classList.add('hidden');
}

// --- Helpers ---
function bereichBadge(bereich) {
  const cls = { SIBOX: 'sibox', FACETTESTAR: 'facettestar', ALLGEMEIN: 'allgemein' };
  return `<span class="badge badge-${cls[bereich] || 'allgemein'}">${bereich || 'N/A'}</span>`;
}

function prioBadge(prio) {
  return `<span class="badge badge-${prio || 'mittel'}">${prio || 'mittel'}</span>`;
}

function statusBadge(status) {
  return `<span class="badge badge-${status === 'erledigt' ? 'erledigt' : 'offen'}">${status || 'offen'}</span>`;
}

function highlightCheckMarkers(text) {
  return text.replace(/\[PRÜFEN:[^\]]*\]/g, m => `<span class="check-marker">${m}</span>`);
}

// --- INBOX ---
async function loadEmails() {
  const container = document.getElementById('emails-table-container');
  container.innerHTML = '<p class="loading">Lade E-Mails...</p>';
  try {
    const emails = await API.get('/api/emails');
    const bereichFilter = document.getElementById('filter-bereich').value;
    const filtered = bereichFilter
      ? emails.filter(e => e.classification?.bereich === bereichFilter)
      : emails;

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Keine E-Mails vorhanden.<br>Klicken Sie auf "Inbox verarbeiten".</p></div>';
      return;
    }

    const rows = filtered.map(e => {
      if (!e.email_id) return '';
      const clf = e.classification || {};
      const hasEntwurf = e.draft_generated ? '<span class="badge badge-draft">✉ Entwurf</span>' : '';
      const hasTask = e.task_generated ? '<span class="badge badge-task">📋 Aufgabe</span>' : '';
      const prio = clf.dringlichkeit || 'mittel';
      const isDeleted = e.deleted;
      const deletedBadge = isDeleted ? '<span class="badge badge-deleted">🗑 Gelöscht</span>' : '';
      const rowClass = isDeleted ? 'clickable deleted-row' : 'clickable';
      return `
        <tr class="${rowClass}" onclick="showEmailDetail('${e.email_id}')">
          <td>${e.date || '—'}</td>
          <td>${e.from_addr || '—'}</td>
          <td style="max-width:260px">${e.subject || '—'}</td>
          <td>${bereichBadge(clf.bereich)}</td>
          <td><span class="badge badge-info">${clf.aktionstyp || '—'}</span></td>
          <td>${prioBadge(prio)}</td>
          <td>${hasEntwurf} ${hasTask} ${deletedBadge}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Datum</th><th>Von</th><th>Betreff</th>
          <th>Bereich</th><th>Typ</th><th>Priorität</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function showEmailDetail(emailId) {
  const panel = document.getElementById('email-detail-panel');
  const content = document.getElementById('email-detail-content');
  panel.classList.remove('hidden');
  content.innerHTML = '<p class="loading">Lade Details...</p>';

  try {
    const data = await API.get(`/api/emails/${emailId}`);
    const clf = data.classification || {};
    const ta = data.thread_analysis || {};

    content.innerHTML = `
      <h2 style="margin-bottom:16px;font-size:16px">${data.subject || 'E-Mail Detail'}</h2>
      <div class="detail-section">
        <h3>Metadaten</h3>
        <div class="detail-row"><span class="detail-label">Von:</span><span>${data.from_addr || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Datum:</span><span>${data.date || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">ID:</span><span style="font-size:11px;color:var(--text-dim)">${data.email_id || '—'}</span></div>
      </div>
      ${data.pipeline_steps ? '<div class="detail-section"><h3>Pipeline</h3>' + renderPipeline(data.pipeline_steps) + '</div>' : ''}
      <div class="detail-section">
        <h3>Klassifikation</h3>
        <div class="detail-row"><span class="detail-label">Bereich:</span>${bereichBadge(clf.bereich)}</div>
        <div class="detail-row"><span class="detail-label">Typ:</span><span>${clf.aktionstyp || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Dringlichkeit:</span>${prioBadge(clf.dringlichkeit)}</div>
        <div class="detail-row"><span class="detail-label">Zusammenfassung:</span><span style="color:var(--text-dim)">${clf.zusammenfassung || '—'}</span></div>
      </div>
      <div class="detail-section">
        <h3>Thread-Analyse</h3>
        <div class="detail-row"><span class="detail-label">Nachrichten:</span><span>${ta.anzahl_nachrichten || 1}</span></div>
        <div class="detail-row"><span class="detail-label">Tonalität:</span><span>${ta.tonalitaet || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Zusammenfassung:</span><span style="color:var(--text-dim)">${ta.zusammenfassung || '—'}</span></div>
        ${ta.offene_punkte?.length ? `<div class="detail-row"><span class="detail-label">Offen:</span><span>${ta.offene_punkte.join(', ')}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Nächster Schritt:</span><span>${ta.naechster_schritt || '—'}</span></div>
      </div>
      ${data.draft_file ? `
        <div class="detail-section">
          <h3>Entwurf</h3>
          <button class="btn btn-secondary btn-sm" onclick="showDraftById('${data.email_id}')">✉ Entwurf anzeigen</button>
        </div>` : ''}
      ${data.task_id ? `
        <div class="detail-section">
          <h3>Aufgabe</h3>
          <button class="btn btn-secondary btn-sm" onclick="showTaskById('${data.task_id}')">📋 ${data.task_id}</button>
        </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        ${!data.deleted ? `<button class="btn btn-danger btn-sm" onclick="deleteEmail('${data.email_id}')">🗑 Löschen</button>` : '<span style="color:var(--text-dim);font-size:12px">🗑 Bereits gelöscht</span>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function deleteEmail(emailId) {
  if (!confirm('E-Mail wirklich löschen? Die .eml-Datei wird in den Ordner "gelöscht" verschoben.')) return;
  try {
    await API.post(`/api/emails/${emailId}/delete`, {});
    closePanel('email-detail-panel');
    loadEmails();
    showToast('E-Mail gelöscht', 'success');
  } catch (e) {
    showToast('Fehler beim Löschen: ' + e.message, 'error');
  }
}

// --- DRAFTS ---
async function loadDrafts() {
  const container = document.getElementById('drafts-container');
  container.innerHTML = '<p class="loading">Lade Entwürfe...</p>';
  try {
    const drafts = await API.get('/api/drafts');
    if (!drafts.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">✉</div><p>Keine Entwürfe vorhanden.</p></div>';
      return;
    }

    const rows = drafts.map(d => {
      const warnIcon = d.has_check_markers ? '⚠' : '✓';
      const warnColor = d.has_check_markers ? 'var(--orange)' : 'var(--green)';
      return `
        <tr class="clickable" onclick="showDraftById('${d.email_id}')">
          <td>${d.subject || '—'}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${d.recipient || '—'}</td>
          <td>${bereichBadge(d.classification_bereich)}</td>
          <td><span class="badge badge-info">${d.classification_aktionstyp || '—'}</span></td>
          <td><span style="color:${warnColor}">${warnIcon}</span></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Betreff</th><th>Empfänger</th><th>Bereich</th><th>Typ</th><th>Check</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function showDraftById(fileId) {
  // Wechsle zum Drafts-Tab falls nötig
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="drafts"]').classList.add('active');
  document.getElementById('tab-drafts').classList.add('active');

  const panel = document.getElementById('draft-detail-panel');
  const content = document.getElementById('draft-detail-content');
  panel.classList.remove('hidden');
  content.innerHTML = '<p class="loading">Lade Entwurf...</p>';

  try {
    var draft = await API.get('/api/drafts/' + fileId);
    var htmlData = await API.get('/api/drafts/' + fileId + '/html').catch(function() { return { html: '' }; });
    var sigConfig = await loadSignaturen();

    var draftHtml = draft.draft_html_edited || draft.draft_html || htmlData.html || '';
    var draftText = draft.draft_text || '';
    var feedbackRating = draft.feedback_rating || '';
    var templateUsed = draft.template_used || 'allgemein';
    var signaturKey = draft.signatur_key || sigConfig.default || 'standard';
    var history = draft.refinement_history || [];

    // Signatur Dropdown bauen
    var sigOptions = '';
    var sigs = sigConfig.signaturen || {};
    Object.keys(sigs).forEach(function(k) {
      var selected = k === signaturKey ? ' selected' : '';
      sigOptions += '<option value="' + k + '"' + selected + '>' + (sigs[k].name || k) + '</option>';
    });

    // Refinement History
    var historyHtml = '';
    if (history.length) {
      historyHtml = '<div class="detail-section"><h3>Verfeinerungs-Historie</h3>';
      history.forEach(function(h) {
        historyHtml += '<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">';
        historyHtml += '<span style="color:var(--text-dim)">' + (h.timestamp || '').substring(0,16) + '</span> ';
        historyHtml += h.instruction;
        historyHtml += '</div>';
      });
      historyHtml += '</div>';
    }

    content.innerHTML =
      '<h2 style="margin-bottom:16px;font-size:16px">' + (draft.subject || 'Entwurf') + '</h2>' +
      '<div class="detail-section">' +
        '<h3>Metadaten</h3>' +
        '<div class="detail-row"><span class="detail-label">An:</span><span>' + (draft.recipient || '\u2014') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Bereich:</span>' + bereichBadge(draft.classification_bereich) + '</div>' +
        '<div class="detail-row"><span class="detail-label">Template:</span><span>' + templateUsed + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Signatur:</span><select id="sig-select-' + fileId + '" class="sig-select" onchange="changeSignatur(\'' + fileId + '\', this.value)">' + sigOptions + '</select></div>' +
        (draft.used_knowledge_sources && draft.used_knowledge_sources.length ? '<div class="detail-row"><span class="detail-label">Quellen:</span><span style="font-size:11px;color:var(--text-dim)">' + draft.used_knowledge_sources.slice(0,3).join(', ') + '</span></div>' : '') +
        (draft.has_check_markers ? '<div style="color:var(--orange);margin-top:6px">! Enthaelt [PRUEFEN: ...] Markierungen</div>' : '<div style="color:var(--green);margin-top:6px">OK Kein manueller Check erforderlich</div>') +
        '<div style="display:flex;gap:6px;align-items:center;margin-top:4px">' +
          '<span style="font-size:12px;color:var(--text-dim)">Bewertung:</span>' +
          '<button class="btn btn-sm ' + (feedbackRating === 'gut' ? 'btn-success' : 'btn-secondary') + '" onclick="rateDraft(\'' + fileId + '\', \'gut\')">Gut</button>' +
          '<button class="btn btn-sm ' + (feedbackRating === 'schlecht' ? 'btn-danger' : 'btn-secondary') + '" onclick="rateDraft(\'' + fileId + '\', \'schlecht\')">Schlecht</button>' +
          (feedbackRating ? '<span style="font-size:11px;color:var(--text-dim)">\u2014 ' + (feedbackRating === 'gut' ? 'Als gut bewertet' : 'Als schlecht bewertet') + '</span>' : '') +
        '</div>' +
      '</div>' +
      // HTML Preview
      '<div class="detail-section">' +
        '<h3>HTML-Vorschau</h3>' +
        '<div class="draft-html-preview" id="draft-preview-' + fileId + '">' + draftHtml + '</div>' +
      '</div>' +
      // Refine Prompt
      '<div class="detail-section">' +
        '<h3>Entwurf verfeinern</h3>' +
        '<div style="display:flex;gap:8px">' +
          '<input type="text" id="refine-input-' + fileId + '" class="refine-input" placeholder="z.B. Ton formeller gestalten, Preis ergaenzen..." style="flex:1" />' +
          '<button id="refine-btn-' + fileId + '" class="btn btn-primary btn-sm" onclick="refineDraft(\'' + fileId + '\')">Verfeinern</button>' +
        '</div>' +
      '</div>' +
      historyHtml +
      // Actions
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">' +
        '<button class="btn btn-primary btn-sm" onclick="copyDraft(\'' + draftText.replace(/'/g, "\\'").replace(/\n/g, "\\n") + '\')">In Zwischenablage</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteDraft(\'' + fileId + '\')">Loeschen</button>' +
      '</div>';
  } catch (e) {
    content.innerHTML = '<p style="color:var(--red)">Fehler: ' + e.message + '</p>';
  }
}

async function changeSignatur(fileId, newKey) {
  // Signatur-Wechsel wird beim naechsten Speichern/Refine uebernommen
  showToast('Signatur auf "' + newKey + '" geaendert', 'info');
}

function copyDraft(text) {
  navigator.clipboard.writeText(text).then(() => showToast('In Zwischenablage kopiert', 'success'));
}

async function rateDraft(fileId, rating) {
  try {
    await API.post(`/api/drafts/${fileId}/feedback`, { rating });
    showToast(`Entwurf als "${rating}" bewertet`, 'success');
    showDraftById(fileId);  // Neu laden um Bewertung anzuzeigen
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function toggleEditMode(fileId, text) {
  const view = document.getElementById(`draft-view-${fileId}`);
  const edit = document.getElementById(`draft-edit-${fileId}`);
  if (edit.style.display === 'none') {
    view.style.display = 'none';
    edit.style.display = 'block';
    document.getElementById(`draft-textarea-${fileId}`).focus();
  } else {
    view.style.display = 'block';
    edit.style.display = 'none';
  }
}

function cancelEdit(fileId) {
  document.getElementById(`draft-view-${fileId}`).style.display = 'block';
  document.getElementById(`draft-edit-${fileId}`).style.display = 'none';
}

async function saveDraftEdit(fileId) {
  const html = document.getElementById(`draft-textarea-${fileId}`).value;
  var sigSelect = document.getElementById('sig-select-' + fileId);
  var signaturKey = sigSelect ? sigSelect.value : undefined;
  try {
    await API.post(`/api/drafts/${fileId}/edit`, { html, signatur_key: signaturKey });
    showToast('Entwurf gespeichert', 'success');
    showDraftById(fileId);
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- TASKS ---
async function loadTasks() {
  const container = document.getElementById('tasks-container');
  container.innerHTML = '<p class="loading">Lade Aufgaben...</p>';
  try {
    const statusFilter = document.getElementById('filter-task-status').value;
    const bereichFilter = document.getElementById('filter-task-bereich').value;
    let url = '/api/tasks';
    const params = [];
    if (statusFilter) params.push(`status=${statusFilter}`);
    if (bereichFilter) params.push(`bereich=${bereichFilter}`);
    if (params.length) url += '?' + params.join('&');

    const tasks = await API.get(url);
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>Keine Aufgaben vorhanden.</p></div>';
      return;
    }

    // Kanban-Board
    const offen = tasks.filter(t => t.status === 'offen' || !t.status);
    const inBearbeitung = tasks.filter(t => t.status === 'in_bearbeitung');
    const erledigt = tasks.filter(t => t.status === 'erledigt');

    function taskCards(list) {
      return list.map(t => `
        <div class="task-card" onclick="showTaskById('${t.id}')">
          <div class="task-card-title">${t.titel || '—'}</div>
          <div class="task-card-meta">
            ${bereichBadge(t.bereich)}
            ${prioBadge(t.prioritaet)}
            <span class="dim">${t.faellig_bis || '—'}</span>
          </div>
        </div>`).join('');
    }

    container.innerHTML = `
      <div class="kanban-board">
        <div class="kanban-col">
          <div class="kanban-col-title">Offen <span class="kanban-count">${offen.length}</span></div>
          ${taskCards(offen) || '<p class="dim" style="text-align:center">Keine</p>'}
        </div>
        <div class="kanban-col">
          <div class="kanban-col-title">In Bearbeitung <span class="kanban-count">${inBearbeitung.length}</span></div>
          ${taskCards(inBearbeitung) || '<p class="dim" style="text-align:center">Keine</p>'}
        </div>
        <div class="kanban-col">
          <div class="kanban-col-title">Erledigt <span class="kanban-count">${erledigt.length}</span></div>
          ${taskCards(erledigt) || '<p class="dim" style="text-align:center">Keine</p>'}
        </div>
      </div>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function showTaskById(taskId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="tasks"]').classList.add('active');
  document.getElementById('tab-tasks').classList.add('active');
  await loadTasks();

  const panel = document.getElementById('task-detail-panel');
  const content = document.getElementById('task-detail-content');
  panel.classList.remove('hidden');
  content.innerHTML = '<p class="loading">Lade Aufgabe...</p>';

  try {
    const task = await API.get(`/api/tasks/${taskId}`);
    const teilaufgaben = (task.teilaufgaben || []).map(t =>
      `<div style="padding:4px 0;border-bottom:1px solid var(--border)">☐ ${t}</div>`).join('');

    content.innerHTML = `
      <h2 style="margin-bottom:16px;font-size:16px">${task.titel || 'Aufgabe'}</h2>
      <div class="detail-section">
        <h3>Details</h3>
        <div class="detail-row"><span class="detail-label">ID:</span><span>${task.id}</span></div>
        <div class="detail-row"><span class="detail-label">Bereich:</span>${bereichBadge(task.bereich)}</div>
        <div class="detail-row"><span class="detail-label">Typ:</span><span>${task.typ || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Priorität:</span>${prioBadge(task.prioritaet)}</div>
        <div class="detail-row"><span class="detail-label">Fällig:</span><span>${task.faellig_bis || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Status:</span>${statusBadge(task.status)}</div>
        <div class="detail-row"><span class="detail-label">Zugewiesen:</span><span>${task.zugewiesen_an || '—'}</span></div>
      </div>
      <div class="detail-section">
        <h3>Beschreibung</h3>
        <p style="color:var(--text-dim);font-size:13px">${task.beschreibung || '—'}</p>
      </div>
      ${task.teilaufgaben?.length ? `
        <div class="detail-section">
          <h3>Teilaufgaben</h3>
          ${teilaufgaben}
        </div>` : ''}
      ${task.kontakt_name || task.kontakt_email ? `
        <div class="detail-section">
          <h3>Kontakt</h3>
          ${task.kontakt_name ? `<div class="detail-row"><span class="detail-label">Name:</span><span>${task.kontakt_name}</span></div>` : ''}
          ${task.kontakt_email ? `<div class="detail-row"><span class="detail-label">E-Mail:</span><span>${task.kontakt_email}</span></div>` : ''}
          ${task.kontakt_telefon ? `<div class="detail-row"><span class="detail-label">Tel.:</span><span>${task.kontakt_telefon}</span></div>` : ''}
        </div>` : ''}
      ${task.produkte?.length ? `
        <div class="detail-section">
          <h3>Produkte</h3>
          ${task.produkte.map(p => `<div>• ${p}</div>`).join('')}
        </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">
        ${task.status !== 'erledigt' ? `<button class="btn btn-success btn-sm" onclick="updateTaskStatus('${task.id}','erledigt')">Als erledigt markieren</button>` : ''}
        ${task.status !== 'in_bearbeitung' ? `<button class="btn btn-secondary btn-sm" onclick="updateTaskStatus('${task.id}','in_bearbeitung')">In Bearbeitung</button>` : ''}
        ${task.status !== 'offen' ? `<button class="btn btn-secondary btn-sm" onclick="updateTaskStatus('${task.id}','offen')">Zurueck zu Offen</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteTask('${task.id}')">Loeschen</button>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    await API.post(`/api/tasks/${taskId}/status`, { status });
    showToast(`Status auf "${status}" gesetzt`, 'success');
    loadTasks();
    closePanel('task-detail-panel');
  } catch (e) {
    showToast('Fehler beim Aktualisieren', 'error');
  }
}

// --- KNOWLEDGE ---
async function loadKnowledge() {
  await Promise.all([loadKbStatus(), loadKbFiles(), loadKbWebStatus()]);
}

async function loadKbStatus() {
  const container = document.getElementById('kb-status-container');
  try {
    const status = await API.get('/api/knowledge/status');
    container.innerHTML = `
      <div class="stats-grid" style="max-width:600px">
        <div class="stat-card"><div class="stat-value">${status.total_chunks || 0}</div><div class="stat-label">Total Chunks</div></div>
        <div class="stat-card"><div class="stat-value">${status.local_files || 0}</div><div class="stat-label">Lokale Dateien</div></div>
        <div class="stat-card"><div class="stat-value">${status.local_chunks || 0}</div><div class="stat-label">Lokale Chunks</div></div>
        <div class="stat-card"><div class="stat-value">${status.web_chunks || 0}</div><div class="stat-label">Web Chunks</div></div>
      </div>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function loadKbFiles() {
  const container = document.getElementById('kb-files-container');
  try {
    const files = await API.get('/api/knowledge/files');
    const localFiles = files.filter(f => f.source_type === 'lokal');
    if (!localFiles.length) { container.innerHTML = '<p class="dim">Keine lokalen Dateien.</p>'; return; }
    container.innerHTML = `
      <div class="kb-files-grid">
        ${localFiles.map(f => `
          <div class="kb-file-card">
            <div>
              <div class="kb-file-name">📄 ${f.name}</div>
              <div class="kb-file-meta">${f.path} · ${f.size_kb} KB · ${f.modified}</div>
            </div>
            ${bereichBadge(f.category.toUpperCase())}
          </div>`).join('')}
      </div>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function loadKbWebStatus() {
  const container = document.getElementById('kb-web-container');
  try {
    const status = await API.get('/api/knowledge/web-status');
    const entries = Object.entries(status);
    if (!entries.length) { container.innerHTML = '<p class="dim">Keine Web-Quellen konfiguriert.</p>'; return; }

    const rows = entries.map(([name, info]) => {
      const dotClass = info.is_stale ? 'yellow' : 'green';
      const statusTxt = info.is_stale ? 'Veraltet' : 'Aktuell';
      return `
        <tr>
          <td><span class="status-dot ${dotClass}"></span>${name}</td>
          <td style="color:var(--text-dim);font-size:12px">${info.url || '—'}</td>
          <td>${info.pages || 0}</td>
          <td style="font-size:12px;color:var(--text-dim)">${(info.last_crawled || 'nie').substring(0, 16)}</td>
          <td><span class="badge badge-${info.is_stale ? 'warn' : 'erledigt'}">${statusTxt}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="scrapeSource('${name}')">↻ Aktualisieren</button></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Quelle</th><th>URL</th><th>Seiten</th><th>Zuletzt</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

async function reloadKnowledge() {
  showToast('Wissensdatenbank wird geladen...', 'info');
  try {
    const r = await API.post('/api/knowledge/reload', {});
    showToast(`✓ ${r.total_chunks} Chunks geladen`, 'success');
    loadKbStatus();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function scrapeAll() {
  showToast('Web-Quellen werden gecrawlt...', 'info');
  try {
    await API.post('/api/knowledge/scrape', { force: false });
    showToast('✓ Web-Quellen aktualisiert', 'success');
    loadKbWebStatus();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function scrapeSource(name) {
  showToast(`Crawle: ${name}...`, 'info');
  try {
    await API.post('/api/knowledge/scrape', { source: name, force: true });
    showToast(`✓ ${name} aktualisiert`, 'success');
    loadKbWebStatus();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- STATS ---
async function loadStats() {
  const container = document.getElementById('stats-container');
  container.innerHTML = '<p class="loading">Lade Statistiken...</p>';
  try {
    const stats = await API.get('/api/stats');

    const barChart = (data, title) => {
      const max = Math.max(...Object.values(data), 1);
      const bars = Object.entries(data).map(([k, v]) => `
        <div class="bar-row">
          <span class="bar-label">${k}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round(v / max * 100)}%">
              <span class="bar-count">${v}</span>
            </div>
          </div>
        </div>`).join('');
      return `<div class="chart-container"><div class="chart-title">${title}</div><div class="bar-chart">${bars}</div></div>`;
    };

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${stats.total_emails}</div><div class="stat-label">E-Mails total</div></div>
        <div class="stat-card"><div class="stat-value">${stats.today_emails}</div><div class="stat-label">Heute</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_drafts}</div><div class="stat-label">Entwürfe</div></div>
        <div class="stat-card"><div class="stat-value">${stats.total_tasks}</div><div class="stat-label">Aufgaben</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--yellow)">${stats.open_tasks}</div><div class="stat-label">Offene Aufgaben</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--red)">${stats.high_prio_tasks}</div><div class="stat-label">Hohe Priorität</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--green)">${stats.feedback_gut || 0}</div><div class="stat-label">Entwürfe 👍</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--orange)">${stats.drafts_with_markers || 0}</div><div class="stat-label">Prüfen-Marker</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${Object.keys(stats.by_bereich || {}).length ? barChart(stats.by_bereich, 'E-Mails nach Bereich') : ''}
        ${Object.keys(stats.by_aktionstyp || {}).length ? barChart(stats.by_aktionstyp, 'E-Mails nach Typ') : ''}
      </div>`;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red)">Fehler: ${e.message}</p>`;
  }
}

// --- PROCESS ALL ---
async function processAll() {
  showToast('Verarbeite Inbox...', 'info');
  try {
    const r = await API.post('/api/process', {});
    showToast(`✓ ${r.count} E-Mail(s) verarbeitet`, 'success');
    loadEmails();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function silentProcessAll() {
  try {
    const r = await API.post('/api/process', {});
    if (r.count > 0) {
      showToast(`✓ ${r.count} neue E-Mail(s) aus Inbox verarbeitet`, 'success');
      loadEmails();
    }
  } catch (e) { /* Ignorieren */ }
}

// --- AUTO-REFRESH ---
let autoRefreshTimer = null;

function startAutoRefresh() {
  autoRefreshTimer = setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
    if (activeTab) {
      loadTabData(activeTab);
      const indicator = document.getElementById('auto-refresh-indicator');
      if (indicator) {
        indicator.classList.add('refreshing');
        const now = new Date();
        indicator.title = `Zuletzt: ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        setTimeout(() => indicator.classList.remove('refreshing'), 1500);
      }
    }
  }, 30000);
}

// --- DRAG & DROP ---
function initDropZone() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');
    });
  });

  zone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length) uploadEmlFiles(files);
  });
}

async function uploadEmlFiles(files) {
  const zone = document.getElementById('drop-zone');
  const emlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.eml'));
  if (!emlFiles.length) {
    showToast('Nur .eml-Dateien werden akzeptiert', 'error');
    return;
  }

  zone.classList.add('uploading');
  const iconEl = zone.querySelector('.drop-zone-icon');
  const textEl = zone.querySelector('.drop-zone-text');
  const origIcon = iconEl.textContent;
  const origText = textEl.textContent;
  iconEl.textContent = '⏳';
  textEl.textContent = `${emlFiles.length} Datei(en) werden verarbeitet…`;

  const formData = new FormData();
  emlFiles.forEach(f => formData.append('files', f));

  try {
    const r = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await r.json();
    if (data.ok) {
      const msg = `${data.processed || 0} E-Mail(s) verarbeitet`;
      showToast(msg, 'success');
      loadEmails();
    } else {
      showToast(data.error || 'Fehler beim Upload', 'error');
    }
  } catch (err) {
    showToast('Upload fehlgeschlagen', 'error');
  } finally {
    zone.classList.remove('uploading');
    iconEl.textContent = origIcon;
    textEl.textContent = origText;
    document.getElementById('eml-file-input').value = '';
  }
}

// --- BULK DELETE ---
async function deleteAllEmails() {
  if (!confirm('Wirklich ALLE E-Mails, Entwuerfe und Aufgaben loeschen?')) return;
  try {
    await API.post('/api/emails/delete-all', {});
    showToast('Alle Daten geloescht', 'success');
    loadEmails();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteAllDrafts() {
  if (!confirm('Wirklich ALLE Entwuerfe loeschen?')) return;
  try {
    await API.post('/api/drafts/delete-all', {});
    showToast('Alle Entwuerfe geloescht', 'success');
    loadDrafts();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteAllTasks() {
  if (!confirm('Wirklich ALLE Aufgaben loeschen?')) return;
  try {
    await API.post('/api/tasks/delete-all', {});
    showToast('Alle Aufgaben geloescht', 'success');
    loadTasks();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteDraft(fileId) {
  if (!confirm('Entwurf loeschen?')) return;
  try {
    await API.post('/api/drafts/' + fileId + '/delete', {});
    closePanel('draft-detail-panel');
    loadDrafts();
    showToast('Entwurf geloescht', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (!confirm('Aufgabe loeschen?')) return;
  try {
    await API.post('/api/tasks/' + taskId + '/delete', {});
    closePanel('task-detail-panel');
    loadTasks();
    showToast('Aufgabe geloescht', 'success');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- PIPELINE VISUALIZATION ---
function renderPipeline(steps) {
  if (!steps || !Object.keys(steps).length) return '';
  var order = ['parse', 'thread_analyze', 'classify', 'knowledge', 'draft', 'task'];
  var labels = {parse:'Parsen', thread_analyze:'Thread', classify:'Klassifikation', knowledge:'Wissen', draft:'Entwurf', task:'Aufgabe'};
  var icons = {ok:'&#10003;', error:'&#10007;', skipped:'&#8212;', fallback:'~'};
  var colors = {ok:'var(--green)', error:'var(--red)', skipped:'var(--text-dim)', fallback:'var(--orange)'};

  var html = '<div class="pipeline-viz">';
  order.forEach(function(name, i) {
    var s = steps[name];
    if (!s) return;
    var icon = icons[s.status] || '?';
    var color = colors[s.status] || 'var(--text-dim)';
    var title = s.detail || '';
    if (i > 0) html += '<span class="pipeline-arrow">&#8594;</span>';
    html += '<span class="pipeline-step" style="border-color:' + color + '" title="' + title + '">';
    html += '<span style="color:' + color + '">' + icon + '</span> ' + (labels[name] || name);
    html += '</span>';
  });
  html += '</div>';
  return html;
}

// --- DRAFT REFINE (Prompt Window) ---
async function refineDraft(fileId) {
  var input = document.getElementById('refine-input-' + fileId);
  var instruction = input ? input.value.trim() : '';
  if (!instruction) {
    showToast('Bitte eine Anweisung eingeben', 'error');
    return;
  }

  var btn = document.getElementById('refine-btn-' + fileId);
  if (btn) { btn.disabled = true; btn.textContent = 'Wird verfeinert...'; }

  try {
    var r = await API.post('/api/drafts/' + fileId + '/refine', { instruction: instruction });
    if (r.refined_html) {
      showToast('Entwurf verfeinert', 'success');
      showDraftById(fileId);
    } else {
      showToast('Fehler: ' + (r.error || 'Unbekannt'), 'error');
    }
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Verfeinern'; }
  }
}

// --- Signaturen Cache ---
var signaturenCache = null;
async function loadSignaturen() {
  if (signaturenCache) return signaturenCache;
  try {
    signaturenCache = await API.get('/api/config/signaturen');
    return signaturenCache;
  } catch (e) {
    return { signaturen: {}, default: 'standard', bereich_mapping: {} };
  }
}

// --- INIT ---
window.addEventListener('load', function() {
  loadEmails();
  startAutoRefresh();
  initDropZone();
  silentProcessAll();
  loadSignaturen();
});
