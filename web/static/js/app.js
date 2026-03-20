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
  else if (tab === 'vorlagen') loadTemplates();
  else if (tab === 'knowledge') loadKnowledge();
  else if (tab === 'stats') loadStats();
  else if (tab === 'rules') loadRules();
  else if (tab === 'settings') loadSettings();
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
  document.body.classList.remove('panel-open');
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

// --- POSTFACH HELPERS ---
function getPostfaecher() {
  try {
    return JSON.parse(localStorage.getItem('postfaecher') || '[]');
  } catch(e) { return []; }
}

function detectPostfach(email) {
  var toAddrs = (email.to_addrs || []).concat(email.cc_addrs || []);
  var toStr = toAddrs.join(',').toLowerCase();
  // Also check the raw to_addr field
  if (email.to_addr) toStr += ',' + email.to_addr.toLowerCase();
  var postfaecher = getPostfaecher();
  for (var i = 0; i < postfaecher.length; i++) {
    if (toStr.indexOf(postfaecher[i].email.toLowerCase()) !== -1) {
      return postfaecher[i];
    }
  }
  return null;
}

function postfachBadge(pf) {
  if (!pf) return '';
  return '<span class="badge" style="background:' + pf.color + '22;color:' + pf.color + '">' + pf.label + '</span>';
}

function updatePostfachFilter() {
  var select = document.getElementById('filter-postfach');
  if (!select) return;
  var postfaecher = getPostfaecher();
  var html = '<option value="">Alle Postfaecher</option>';
  postfaecher.forEach(function(pf) {
    html += '<option value="' + pf.email + '">' + pf.label + ' (' + pf.email + ')</option>';
  });
  select.innerHTML = html;
}

// --- INBOX ---
async function loadEmails() {
  const container = document.getElementById('emails-table-container');
  container.innerHTML = '<p class="loading">Lade E-Mails...</p>';
  updatePostfachFilter();
  try {
    const emails = await API.get('/api/emails');
    const bereichFilter = document.getElementById('filter-bereich').value;
    const postfachFilter = document.getElementById('filter-postfach')?.value || '';
    let filtered = bereichFilter
      ? emails.filter(e => e.classification?.bereich === bereichFilter)
      : emails;

    if (postfachFilter) {
      filtered = filtered.filter(function(e) {
        var pf = detectPostfach(e);
        return pf && pf.email.toLowerCase() === postfachFilter.toLowerCase();
      });
    }

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Keine E-Mails vorhanden.<br>Klicken Sie auf "Inbox verarbeiten".</p></div>';
      return;
    }

    const rows = filtered.map(e => {
      if (!e.email_id) return '';
      const clf = e.classification || {};
      const pf = detectPostfach(e);
      const pfBadge = postfachBadge(pf);
      const hasEntwurf = e.draft_generated ? '<span class="badge badge-draft">✉ Entwurf</span>' : '';
      const hasTask = e.task_generated ? '<span class="badge badge-task">📋 Aufgabe</span>' : '';
      const hasAttach = e.has_attachments ? '<span title="Anhänge">📎</span>' : '';
      const prio = clf.dringlichkeit || 'mittel';
      const isDeleted = e.deleted;
      const deletedBadge = isDeleted ? '<span class="badge badge-deleted">🗑 Gelöscht</span>' : '';
      const rowClass = isDeleted ? 'clickable deleted-row' : 'clickable';
      const senderName = clf.absender || e.from_addr || '—';
      const dateFormatted = formatDateShort(e.date);
      const summary = clf.zusammenfassung || '';
      return `
        <tr class="${rowClass}" onclick="showEmailDetail('${e.email_id}')">
          <td style="white-space:nowrap">${dateFormatted}</td>
          <td>${pfBadge}</td>
          <td title="${e.from_addr || ''}">${senderName}</td>
          <td>${e.subject || '—'}${summary ? '<br><span style="font-size:11px;color:var(--text-dim)">' + summary.substring(0, 80) + '</span>' : ''}</td>
          <td>${hasAttach}</td>
          <td>${bereichBadge(clf.bereich)}</td>
          <td><span class="badge badge-info">${clf.aktionstyp || '—'}</span></td>
          <td>${prioBadge(prio)}</td>
          <td>${hasEntwurf} ${hasTask} ${deletedBadge}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Datum</th><th>Postfach</th><th>Von</th><th>Betreff</th>
          <th>📎</th><th>Bereich</th><th>Typ</th><th>Priorität</th><th>Status</th>
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
  document.body.classList.add('panel-open');
  content.innerHTML = '<p class="loading">Lade Details...</p>';

  try {
    const data = await API.get(`/api/emails/${emailId}`);
    const clf = data.classification || {};
    const ta = data.thread_analysis || {};
    const attachments = await API.get(`/api/emails/${emailId}/attachments`).catch(() => []);

    var pf = detectPostfach(data);
    var produkteHtml = renderProduktTabelle(data.produkte || (data.task_data || {}).produkte);

    content.innerHTML = `
      <h2 style="margin-bottom:16px;font-size:16px">${data.subject || 'E-Mail Detail'}</h2>
      <div class="detail-section">
        <h3>Metadaten</h3>
        ${pf ? '<div class="detail-row"><span class="detail-label">Postfach:</span>' + postfachBadge(pf) + '</div>' : ''}
        <div class="detail-row"><span class="detail-label">Von:</span><span>${data.from_addr || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">An:</span><span>${(data.to_addrs || []).join(', ') || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Datum:</span><span>${data.date || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">ID:</span><span style="font-size:11px;color:var(--text-dim)">${data.email_id || '—'}</span></div>
      </div>
      ${attachments.length ? `
        <div class="detail-section">
          <h3>Anhaenge (${attachments.length})</h3>
          <div class="attachment-list">
            ${attachments.map(a => `
              <a href="${a.download_url}" target="_blank" class="attachment-item" download>
                <span class="attachment-icon">${getFileIcon(a.filename)}</span>
                <span>${a.filename}</span>
                <span class="attachment-size">${a.size_kb} KB</span>
              </a>`).join('')}
          </div>
        </div>` : ''}
      ${data.pipeline_steps ? '<div class="detail-section"><h3>Pipeline</h3>' + renderPipeline(data.pipeline_steps) + '</div>' : ''}
      <div class="detail-section">
        <h3>Klassifikation</h3>
        <div class="detail-row"><span class="detail-label">Bereich:</span>${bereichBadge(clf.bereich)}</div>
        <div class="detail-row"><span class="detail-label">Typ:</span><span>${clf.aktionstyp || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Dringlichkeit:</span>${prioBadge(clf.dringlichkeit)}</div>
        <div class="detail-row"><span class="detail-label">Zusammenfassung:</span><span style="color:var(--text-dim)">${clf.zusammenfassung || '—'}</span></div>
      </div>
      ${produkteHtml ? '<div class="detail-section"><h3>Produkte</h3>' + produkteHtml + '</div>' : ''}
      <div class="detail-section">
        <h3>Thread-Analyse</h3>
        <div class="detail-row"><span class="detail-label">Nachrichten:</span><span>${ta.anzahl_nachrichten || 1}</span></div>
        <div class="detail-row"><span class="detail-label">Tonalitaet:</span><span>${ta.tonalitaet || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Zusammenfassung:</span><span style="color:var(--text-dim)">${ta.zusammenfassung || '—'}</span></div>
        ${ta.offene_punkte?.length ? `<div class="detail-row"><span class="detail-label">Offen:</span><span>${ta.offene_punkte.join(', ')}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Naechster Schritt:</span><span>${ta.naechster_schritt || '—'}</span></div>
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
      <div class="detail-section">
        <h3>Feedback / Korrektur</h3>
        ${data.feedback_correction ? '<div style="color:var(--green);font-size:12px;margin-bottom:6px">Bereits korrigiert</div>' : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
          <label style="font-size:12px;color:var(--text-dim)">Bereich:</label>
          <select id="fb-bereich-${data.email_id}" class="sig-select" style="font-size:12px">
            <option value="">(beibehalten)</option>
            <option value="SIBOX" ${clf.bereich === 'SIBOX' ? 'selected' : ''}>SIBOX</option>
            <option value="FACETTESTAR" ${clf.bereich === 'FACETTESTAR' ? 'selected' : ''}>FACETTESTAR</option>
            <option value="ALLGEMEIN" ${clf.bereich === 'ALLGEMEIN' ? 'selected' : ''}>ALLGEMEIN</option>
          </select>
          <label style="font-size:12px;color:var(--text-dim)">Typ:</label>
          <select id="fb-typ-${data.email_id}" class="sig-select" style="font-size:12px">
            <option value="">(beibehalten)</option>
            <option value="ANFRAGE" ${clf.aktionstyp === 'ANFRAGE' ? 'selected' : ''}>ANFRAGE</option>
            <option value="ANGEBOT_ANFRAGE" ${clf.aktionstyp === 'ANGEBOT_ANFRAGE' ? 'selected' : ''}>ANGEBOT_ANFRAGE</option>
            <option value="REKLAMATION" ${clf.aktionstyp === 'REKLAMATION' ? 'selected' : ''}>REKLAMATION</option>
            <option value="TERMIN" ${clf.aktionstyp === 'TERMIN' ? 'selected' : ''}>TERMIN</option>
            <option value="NACHFASSEN" ${clf.aktionstyp === 'NACHFASSEN' ? 'selected' : ''}>NACHFASSEN</option>
            <option value="BESTELLUNG" ${clf.aktionstyp === 'BESTELLUNG' ? 'selected' : ''}>BESTELLUNG</option>
            <option value="INFO" ${clf.aktionstyp === 'INFO' ? 'selected' : ''}>INFO</option>
            <option value="INTERN" ${clf.aktionstyp === 'INTERN' ? 'selected' : ''}>INTERN</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <label style="font-size:12px;color:var(--text-dim)">Antwort noetig:</label>
          <select id="fb-antwort-${data.email_id}" class="sig-select" style="font-size:12px">
            <option value="">(beibehalten)</option>
            <option value="true" ${clf.benoetigt_antwort ? 'selected' : ''}>Ja</option>
            <option value="false" ${!clf.benoetigt_antwort ? 'selected' : ''}>Nein</option>
          </select>
          <label style="font-size:12px;color:var(--text-dim)">Aufgabe noetig:</label>
          <select id="fb-aufgabe-${data.email_id}" class="sig-select" style="font-size:12px">
            <option value="">(beibehalten)</option>
            <option value="true" ${clf.benoetigt_aufgabe ? 'selected' : ''}>Ja</option>
            <option value="false" ${!clf.benoetigt_aufgabe ? 'selected' : ''}>Nein</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="fb-kommentar-${data.email_id}" placeholder="Optionaler Kommentar..." style="flex:1;font-size:12px" />
          <button class="btn btn-primary btn-sm" onclick="submitEmailFeedback('${data.email_id}')">Feedback speichern</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;border-top:1px solid var(--border);padding-top:12px">
        ${!data.deleted ? `<button class="btn btn-danger btn-sm" onclick="deleteEmail('${data.email_id}')">🗑 Loeschen</button>` : '<span style="color:var(--text-dim);font-size:12px">🗑 Bereits geloescht</span>'}
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
      const st = d.status || 'offen';
      const stBadge = st === 'abgeschlossen' ? '<span class="badge badge-erledigt">abgeschlossen</span>'
        : st === 'archiviert' ? '<span class="badge badge-allgemein">archiviert</span>'
        : '<span class="badge badge-offen">offen</span>';
      return `
        <tr class="clickable" onclick="showDraftById('${d.email_id}')">
          <td>${d.subject || '—'}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${d.recipient || '—'}</td>
          <td>${bereichBadge(d.classification_bereich)}</td>
          <td><span class="badge badge-info">${d.classification_aktionstyp || '—'}</span></td>
          <td><span style="color:${warnColor}">${warnIcon}</span></td>
          <td>${stBadge}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Betreff</th><th>Empfaenger</th><th>Bereich</th><th>Typ</th><th>Check</th><th>Status</th>
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
  document.body.classList.add('panel-open');
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
    var draftStatus = draft.status || 'offen';
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
      // Status
      '<div class="detail-section">' +
        '<h3>Status</h3>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<span style="font-size:12px;color:var(--text-dim)">Aktuell: </span>' +
          '<span class="badge badge-' + (draftStatus === 'abgeschlossen' ? 'erledigt' : draftStatus === 'archiviert' ? 'allgemein' : 'offen') + '">' + (draftStatus || 'offen') + '</span>' +
          (draftStatus !== 'abgeschlossen' ? '<button class="btn btn-success btn-sm" onclick="setDraftStatus(\'' + fileId + '\', \'abgeschlossen\')">Abschliessen</button>' : '') +
          (draftStatus !== 'archiviert' ? '<button class="btn btn-secondary btn-sm" onclick="setDraftStatus(\'' + fileId + '\', \'archiviert\')">Archivieren</button>' : '') +
          (draftStatus && draftStatus !== 'offen' ? '<button class="btn btn-secondary btn-sm" onclick="setDraftStatus(\'' + fileId + '\', \'offen\')">Wieder oeffnen</button>' : '') +
        '</div>' +
      '</div>' +
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
  document.body.classList.add('panel-open');
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
          ${renderProduktTabelle(task.produkte)}
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

// --- TEMPLATES (VORLAGEN) ---
async function loadTemplates() {
  const container = document.getElementById('templates-container');
  container.innerHTML = '<p class="loading">Lade Vorlagen...</p>';
  try {
    const templates = await API.get('/api/templates');
    if (!templates.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Keine Vorlagen vorhanden.</p></div>';
      return;
    }
    const cards = templates.map(function(t) {
      return '<div class="kb-file-card clickable" onclick="showTemplateDetail(\'' + t.name + '\')">' +
        '<div>' +
          '<div class="kb-file-name">📝 ' + t.name + '</div>' +
          '<div class="kb-file-meta">' + (t.description || t.filename) + ' · ' + t.size_kb + ' KB</div>' +
        '</div>' +
        '<span class="badge badge-info">' + t.type + '</span>' +
      '</div>';
    }).join('');
    container.innerHTML = '<div class="kb-files-grid">' + cards + '</div>';
  } catch(e) {
    container.innerHTML = '<p style="color:var(--red)">Fehler: ' + e.message + '</p>';
  }
}

async function showTemplateDetail(name) {
  var panel = document.getElementById('template-detail-panel');
  var content = document.getElementById('template-detail-content');
  panel.classList.remove('hidden');
  document.body.classList.add('panel-open');
  content.innerHTML = '<p class="loading">Lade Vorlage...</p>';
  try {
    var tpl = await API.get('/api/templates/' + encodeURIComponent(name));
    content.innerHTML =
      '<h2 style="margin-bottom:16px;font-size:16px">' + tpl.name + '</h2>' +
      '<div class="detail-section">' +
        '<h3>HTML-Vorschau</h3>' +
        '<div class="draft-html-preview">' + tpl.html + '</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>Quellcode bearbeiten</h3>' +
        '<textarea id="tpl-edit-' + tpl.name + '" style="width:100%;height:300px;font-family:monospace;font-size:12px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:12px;resize:vertical">' + escapeHtml(tpl.html) + '</textarea>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;border-top:1px solid var(--border);padding-top:12px">' +
        '<button class="btn btn-primary btn-sm" onclick="saveTemplate(\'' + tpl.name + '\')">Speichern</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteTemplate(\'' + tpl.name + '\')">Loeschen</button>' +
      '</div>';
  } catch(e) {
    content.innerHTML = '<p style="color:var(--red)">Fehler: ' + e.message + '</p>';
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNewTemplateForm() {
  var panel = document.getElementById('template-detail-panel');
  var content = document.getElementById('template-detail-content');
  panel.classList.remove('hidden');

  var defaultHtml = '<!DOCTYPE html>\n<html lang="de">\n<head><meta charset="UTF-8"></head>\n<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0;">\n<div style="max-width: 680px; margin: 0 auto; padding: 20px;">\n\n<p>{{anrede}}</p>\n\n<p>Vielen Dank fuer Ihre Nachricht zu <strong>{{betreff}}</strong>.</p>\n\n{{inhalt}}\n\n<p>Bei weiteren Fragen stehen wir Ihnen gerne zur Verfuegung.</p>\n\n<div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0;">\n{{signatur}}\n</div>\n\n</div>\n</body>\n</html>';

  content.innerHTML =
    '<h2 style="margin-bottom:16px;font-size:16px">Neue Vorlage erstellen</h2>' +
    '<div class="detail-section">' +
      '<h3>Name</h3>' +
      '<input type="text" id="new-tpl-name" placeholder="z.B. nachfrage_preis" style="width:100%" />' +
      '<p style="font-size:11px;color:var(--text-dim);margin-top:4px">Ohne Dateiendung. Wird als .html gespeichert.</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h3>Verfuegbare Platzhalter</h3>' +
      '<p style="font-size:12px;color:var(--text-dim)">{{anrede}}, {{betreff}}, {{inhalt}}, {{signatur}}</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h3>HTML-Inhalt</h3>' +
      '<textarea id="new-tpl-html" style="width:100%;height:350px;font-family:monospace;font-size:12px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:12px;resize:vertical">' + escapeHtml(defaultHtml) + '</textarea>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px;border-top:1px solid var(--border);padding-top:12px">' +
      '<button class="btn btn-primary btn-sm" onclick="createTemplate()">Erstellen</button>' +
    '</div>';
}

async function createTemplate() {
  var name = document.getElementById('new-tpl-name').value.trim();
  var html = document.getElementById('new-tpl-html').value;
  if (!name) { showToast('Bitte einen Namen eingeben', 'error'); return; }
  try {
    await API.post('/api/templates', { name: name, html: html });
    showToast('Vorlage "' + name + '" erstellt', 'success');
    closePanel('template-detail-panel');
    loadTemplates();
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function saveTemplate(name) {
  var html = document.getElementById('tpl-edit-' + name).value;
  try {
    await API.post('/api/templates/' + encodeURIComponent(name), { html: html });
    showToast('Vorlage "' + name + '" gespeichert', 'success');
    showTemplateDetail(name);
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteTemplate(name) {
  if (!confirm('Vorlage "' + name + '" wirklich loeschen?')) return;
  try {
    await API.post('/api/templates/' + encodeURIComponent(name) + '/delete', {});
    showToast('Vorlage geloescht', 'success');
    closePanel('template-detail-panel');
    loadTemplates();
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- SETTINGS ---
function loadSettings() {
  // Inbox-Verzeichnis laden
  var savedDir = localStorage.getItem('inbox_dir') || '';
  var input = document.getElementById('inbox-dir-input');
  if (input) input.value = savedDir;

  // Aktuelle Inbox vom Server laden
  API.get('/api/config/inbox-dir').then(function(data) {
    var status = document.getElementById('inbox-dir-status');
    if (status && data.inbox_dir) {
      status.innerHTML = 'Aktuell: <strong>' + data.inbox_dir + '</strong>';
    }
  }).catch(function() {});

  // Postfaecher anzeigen
  renderPostfaecher();
}

function saveInboxDir() {
  var dir = document.getElementById('inbox-dir-input').value.trim();
  if (!dir) { showToast('Bitte ein Verzeichnis angeben', 'error'); return; }
  API.post('/api/config/inbox-dir', { inbox_dir: dir }).then(function(data) {
    if (data.ok) {
      localStorage.setItem('inbox_dir', dir);
      showToast('Inbox-Verzeichnis gespeichert', 'success');
      var status = document.getElementById('inbox-dir-status');
      if (status) status.innerHTML = 'Aktuell: <strong>' + dir + '</strong>';
    } else {
      showToast(data.error || 'Fehler', 'error');
    }
  }).catch(function(e) { showToast('Fehler: ' + e.message, 'error'); });
}

async function scanInboxDir() {
  showToast('Scanne Verzeichnis...', 'info');
  try {
    var r = await API.post('/api/scan-inbox-dir', {});
    if (r.ok) {
      showToast(r.count + ' .eml-Datei(en) gefunden und importiert', 'success');
      loadEmails();
    } else {
      showToast(r.error || 'Fehler beim Scannen', 'error');
    }
  } catch(e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- POSTFACH MANAGEMENT ---
function renderPostfaecher() {
  var list = document.getElementById('postfaecher-list');
  if (!list) return;
  var postfaecher = getPostfaecher();
  if (!postfaecher.length) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:13px">Noch keine Postfaecher konfiguriert. Fuegen Sie unten Ihre E-Mail-Adressen hinzu.</p>';
    return;
  }
  list.innerHTML = postfaecher.map(function(pf, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<span style="width:12px;height:12px;border-radius:50%;background:' + pf.color + ';display:inline-block"></span>' +
      '<strong>' + pf.label + '</strong>' +
      '<span style="color:var(--text-dim)">' + pf.email + '</span>' +
      '<button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="removePostfach(' + i + ')">Entfernen</button>' +
    '</div>';
  }).join('');
}

function addPostfach() {
  var email = document.getElementById('new-postfach-input').value.trim();
  var label = document.getElementById('new-postfach-label').value.trim();
  var color = document.getElementById('new-postfach-color').value;
  if (!email) { showToast('Bitte E-Mail-Adresse eingeben', 'error'); return; }
  if (!label) label = email.split('@')[0].toUpperCase();
  var postfaecher = getPostfaecher();
  // Duplikat pruefen
  if (postfaecher.some(function(p) { return p.email.toLowerCase() === email.toLowerCase(); })) {
    showToast('Postfach bereits vorhanden', 'error');
    return;
  }
  postfaecher.push({ email: email, label: label, color: color });
  localStorage.setItem('postfaecher', JSON.stringify(postfaecher));
  document.getElementById('new-postfach-input').value = '';
  document.getElementById('new-postfach-label').value = '';
  renderPostfaecher();
  updatePostfachFilter();
  showToast('Postfach "' + label + '" hinzugefuegt', 'success');
}

function removePostfach(index) {
  var postfaecher = getPostfaecher();
  postfaecher.splice(index, 1);
  localStorage.setItem('postfaecher', JSON.stringify(postfaecher));
  renderPostfaecher();
  updatePostfachFilter();
  showToast('Postfach entfernt', 'success');
}

// --- EMAIL FEEDBACK ---
async function submitEmailFeedback(emailId) {
  var bereich = document.getElementById('fb-bereich-' + emailId)?.value || '';
  var typ = document.getElementById('fb-typ-' + emailId)?.value || '';
  var antwort = document.getElementById('fb-antwort-' + emailId)?.value;
  var aufgabe = document.getElementById('fb-aufgabe-' + emailId)?.value;
  var kommentar = document.getElementById('fb-kommentar-' + emailId)?.value || '';

  var feedback = { kommentar: kommentar };
  if (bereich) feedback.bereich = bereich;
  if (typ) feedback.aktionstyp = typ;
  if (antwort === 'true') feedback.benoetigt_antwort = true;
  if (antwort === 'false') feedback.benoetigt_antwort = false;
  if (aufgabe === 'true') feedback.benoetigt_aufgabe = true;
  if (aufgabe === 'false') feedback.benoetigt_aufgabe = false;

  try {
    await API.post('/api/emails/' + emailId + '/feedback', feedback);
    showToast('Feedback gespeichert — wird beim naechsten Mal beruecksichtigt', 'success');
    showEmailDetail(emailId);
    loadEmails();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- DRAFT STATUS ---
async function setDraftStatus(fileId, status) {
  try {
    await API.post('/api/drafts/' + fileId + '/status', { status: status });
    showToast('Entwurf als "' + status + '" markiert', 'success');
    showDraftById(fileId);
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

// --- HELPER: Date Formatting ---
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var mins = String(d.getMinutes()).padStart(2, '0');
    return day + '.' + month + '.' + year + ' ' + hours + ':' + mins;
  } catch (e) { return dateStr; }
}

// --- HELPER: File Icons ---
function getFileIcon(filename) {
  if (!filename) return '📄';
  var ext = filename.split('.').pop().toLowerCase();
  var icons = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', zip: '📦', rar: '📦', txt: '📝', csv: '📊' };
  return icons[ext] || '📄';
}

// --- HELPER: Product Table ---
function renderProduktTabelle(produkte) {
  if (!produkte || !produkte.length) return '';
  // Check if structured (objects) or simple (strings)
  var isStructured = typeof produkte[0] === 'object' && produkte[0] !== null;
  if (isStructured) {
    var rows = produkte.map(function(p) {
      return '<tr>' +
        '<td>' + (p.artikelcode || '—') + '</td>' +
        '<td>' + (p.artikelname || p.name || '—') + '</td>' +
        '<td>' + (p.menge != null ? p.menge : '—') + '</td>' +
        '<td>' + (p.preis != null ? Number(p.preis).toFixed(2) + ' CHF' : '—') + '</td>' +
      '</tr>';
    }).join('');
    return '<table class="data-table product-table">' +
      '<thead><tr><th>Artikelcode</th><th>Artikelname</th><th>Menge</th><th>Preis</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }
  // Fallback: simple string list
  return produkte.map(function(p) { return '<div style="padding:2px 0">• ' + p + '</div>'; }).join('');
}

// --- RULES ---
var ruleChatHistory = [];

async function loadRules() {
  var container = document.getElementById('rules-container');
  if (!container) return;
  container.innerHTML = '<p class="loading">Lade Regeln...</p>';
  try {
    var rules = await API.get('/api/rules');
    var rulesListHtml = '';
    if (rules.length) {
      rulesListHtml = '<div class="card">' +
        rules.map(function(r) {
          return '<div class="rule-row">' +
            '<div class="rule-name">' + r.name + '</div>' +
            '<div class="rule-desc">' + (r.beschreibung || '') + '</div>' +
            '<label class="rule-toggle" title="' + (r.aktiv ? 'Aktiv' : 'Inaktiv') + '"><input type="checkbox" ' + (r.aktiv ? 'checked' : '') + ' onchange="toggleRule(\'' + r.id + '\', this.checked)"></label>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteRule(\'' + r.id + '\')">x</button>' +
          '</div>';
        }).join('') +
      '</div>';
    } else {
      rulesListHtml = '<div class="empty-state"><p>Noch keine Regeln definiert. Nutzen Sie das Prompt-Fenster unten.</p></div>';
    }
    container.innerHTML = rulesListHtml;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--red)">Fehler: ' + e.message + '</p>';
  }
}

async function sendRuleChat() {
  var input = document.getElementById('rule-chat-input');
  var msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  var messagesDiv = document.getElementById('rule-chat-messages');
  // Add user message
  messagesDiv.innerHTML += '<div class="rule-chat-msg user">' + escapeHtml(msg) + '</div>';
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  ruleChatHistory.push({ role: 'user', content: msg });

  // Show typing indicator
  messagesDiv.innerHTML += '<div class="rule-chat-msg assistant" id="rule-typing">Denke nach...</div>';
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  try {
    var response = await API.post('/api/rules/chat', { message: msg, history: ruleChatHistory });
    document.getElementById('rule-typing')?.remove();

    var replyHtml = '<div class="rule-chat-msg assistant">' + escapeHtml(response.reply);
    if (response.suggested_rule) {
      replyHtml += '<div class="suggested-rule">' +
        '<strong>' + response.suggested_rule.name + '</strong><br>' +
        '<span style="color:var(--text-dim)">' + response.suggested_rule.beschreibung + '</span><br>' +
        '<div style="margin-top:6px"><button class="btn btn-success btn-sm" onclick=\'confirmRule(' + JSON.stringify(response.suggested_rule).replace(/'/g, "\\'") + ')\'>Regel uebernehmen</button></div>' +
      '</div>';
    }
    replyHtml += '</div>';
    messagesDiv.innerHTML += replyHtml;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    ruleChatHistory.push({ role: 'assistant', content: response.reply });
  } catch (e) {
    document.getElementById('rule-typing')?.remove();
    messagesDiv.innerHTML += '<div class="rule-chat-msg assistant" style="color:var(--red)">Fehler: ' + e.message + '</div>';
  }
}

async function confirmRule(rule) {
  try {
    await API.post('/api/rules/confirm', rule);
    showToast('Regel "' + rule.name + '" gespeichert', 'success');
    loadRules();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function toggleRule(ruleId, aktiv) {
  try {
    await API.post('/api/rules/' + ruleId + '/toggle', { aktiv: aktiv });
    showToast('Regel ' + (aktiv ? 'aktiviert' : 'deaktiviert'), 'info');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

async function deleteRule(ruleId) {
  if (!confirm('Regel wirklich loeschen?')) return;
  try {
    await API.post('/api/rules/' + ruleId + '/delete', {});
    showToast('Regel geloescht', 'success');
    loadRules();
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }
}

function handleRuleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendRuleChat();
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
  updatePostfachFilter();
  loadEmails();
  startAutoRefresh();
  initDropZone();
  silentProcessAll();
  loadSignaturen();
});
