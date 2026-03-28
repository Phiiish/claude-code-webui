import { Resizer } from './resizer.js';
import { escHtml, attachPopoverClose } from './utils.js';

const GROUP_ICONS = {
  'legal': '⚖️', 'finance': '💰', 'hr': '👥', 'data-analytics': '📊',
  'ads': '📢', 'daily-ops': '📅', 'external': '📦',
};
const GROUP_LABELS = {
  'legal': 'Legal', 'finance': 'Finance', 'hr': 'HR', 'data-analytics': 'Data',
  'ads': 'Ads', 'daily-ops': 'Ops', 'external': 'External',
};

function inferGroup(session) {
  const cwd = session.cwd || '';
  // Priority 1: /workspaces/<group>/
  const wsMatch = cwd.match(/\/workspaces\/([^/]+)/);
  if (wsMatch) return wsMatch[1].toLowerCase();
  // Priority 2: session name prefix before first _
  const name = session.name || session.webuiName || '';
  const underIdx = name.indexOf('_');
  if (underIdx > 0) {
    const prefix = name.substring(0, underIdx).toLowerCase().trim();
    if (prefix.length >= 2 && prefix.length <= 20) return prefix;
  }
  // Priority 3: fallback
  return 'external';
}

class Sidebar {
  constructor(app) {
    this.app = app; this.el = document.getElementById('sidebar');
    this.listEl = document.getElementById('all-sessions-list');
    this.isOpen = false;

    // Resizable sidebar width
    this._resizer = new Resizer(this.el, 'horizontal', {
      min: 200, max: 500, initial: parseInt(localStorage.getItem('sidebarWidth')) || 260,
      storageKey: 'sidebarWidth', inside: true,
      onResize: (w) => {
        document.getElementById('main-wrapper').style.marginLeft = this.isOpen ? w + 'px' : '0';
        setTimeout(() => { for (const [, s] of this.app.sessions) { if (s.fit) s.fit(); } }, 50);
      },
    });
    this._allSessions = [];
    this._webuiSessions = [];
    this._starredIds = new Set(JSON.parse(localStorage.getItem('starredSessions') || '[]'));
    this._archivedIds = new Set(JSON.parse(localStorage.getItem('archivedSessions') || '[]'));
    this._customNames = JSON.parse(localStorage.getItem('sessionCustomNames') || '{}');
    this._collapsedGroups = new Set(JSON.parse(localStorage.getItem('collapsedGroups') || '[]'));

    document.getElementById('sidebar-toggle').onclick = () => this.toggle();
    document.getElementById('sidebar-close').onclick = () => this.toggle(false);
    document.getElementById('session-filter').oninput = () => this._render();

    // Status filter dropdown
    this._statusFilter = new Set(['live', 'tmux']);
    const filterBtn = document.getElementById('live-filter');
    filterBtn.onclick = (e) => { e.stopPropagation(); this._showStatusFilterMenu(filterBtn); };

    this._sessionDigest = '';
    app.ws.onGlobal((msg) => {
      if (msg.type === 'active-sessions') { this._webuiSessions = msg.sessions; this._mergeAndRender(); }
    });
    this._poll();
  }

  toggleStar(sessionId) {
    if (this._starredIds.has(sessionId)) this._starredIds.delete(sessionId);
    else this._starredIds.add(sessionId);
    localStorage.setItem('starredSessions', JSON.stringify([...this._starredIds]));
    this._render();
    this.app.updateTaskbar();
  }

  isStarred(sessionId) { return this._starredIds.has(sessionId); }

  toggleArchive(sessionId) {
    if (this._archivedIds.has(sessionId)) this._archivedIds.delete(sessionId);
    else this._archivedIds.add(sessionId);
    localStorage.setItem('archivedSessions', JSON.stringify([...this._archivedIds]));
    this._render();
    this.app.updateTaskbar();
  }

  isArchived(sessionId) { return this._archivedIds.has(sessionId); }

  getCustomName(sessionId) { return this._customNames[sessionId] || null; }

  renameSession(sessionId, currentName) {
    const name = prompt('Session name (used as --name on next resume):', this._customNames[sessionId] || currentName || '');
    if (name === null) return;
    if (name.trim()) { this._customNames[sessionId] = name.trim(); }
    else { delete this._customNames[sessionId]; }
    localStorage.setItem('sessionCustomNames', JSON.stringify(this._customNames));
    this._render();
    const newName = name.trim() || currentName || sessionId.substring(0, 12) + '...';
    this.app.syncSessionName(sessionId, newName);
  }

  highlightSession(sessionId) {
    this.listEl.querySelectorAll('.session-item-card').forEach(c => c.classList.remove('highlighted'));
    if (!sessionId) return;
    for (const card of this.listEl.querySelectorAll('.session-item-card')) {
      if (card._sessionId === sessionId) {
        card.classList.add('highlighted');
        if (card.scrollIntoViewIfNeeded) card.scrollIntoViewIfNeeded(false);
        else card.scrollIntoView({ block: 'nearest' });
        break;
      }
    }
  }

  _showStatusFilterMenu(anchor) {
    document.querySelectorAll('.status-filter-menu').forEach(m => m.remove());
    const menu = document.createElement('div'); menu.className = 'status-filter-menu';
    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 2) + 'px'; menu.style.left = rect.left + 'px';
    const items = [
      { id: 'live', label: 'Live', color: 'var(--green)' },
      { id: 'tmux', label: 'Tmux', color: 'var(--blue)' },
      { id: 'external', label: 'External', color: 'var(--yellow)' },
      { id: 'stopped', label: 'Stopped', color: 'var(--text-dim)' },
      { id: 'archived', label: 'Archived', color: 'var(--text-dim)' },
    ];
    for (const item of items) {
      const row = document.createElement('label'); row.className = 'status-filter-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = this._statusFilter.has(item.id);
      const dot = document.createElement('span'); dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${item.color};flex-shrink:0`;
      const lbl = document.createElement('span'); lbl.textContent = item.label;
      cb.onchange = () => {
        if (cb.checked) this._statusFilter.add(item.id); else this._statusFilter.delete(item.id);
        this._updateFilterBtn(anchor);
        this._render();
      };
      row.append(cb, dot, lbl);
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    attachPopoverClose(menu, anchor);
  }

  _updateFilterBtn(btn) {
    const isDefault = this._statusFilter.size === 2 && this._statusFilter.has('live') && this._statusFilter.has('tmux');
    btn.style.color = isDefault ? '' : 'var(--accent-hover)';
    btn.title = isDefault ? 'Filter by status (Active only)' : `Showing: ${[...this._statusFilter].join(', ')}`;
  }

  toggle(force) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    this.el.classList.toggle('open', this.isOpen);
    const wrapper = document.getElementById('main-wrapper');
    wrapper.classList.toggle('sidebar-open', this.isOpen);
    wrapper.style.marginLeft = this.isOpen ? this.el.offsetWidth + 'px' : '0';
    setTimeout(() => { for (const [, s] of this.app.sessions) { if (s.fit) s.fit(); } }, 250);
  }

  async _poll() {
    try {
      const res = await fetch('/api/sessions'); const data = await res.json();
      this._systemSessions = data.sessions || [];
      this._mergeAndRender();
    } catch {}
    setTimeout(() => this._poll(), 5000);
  }

  _merge() {
    const system = this._systemSessions || [];
    const webui = this._webuiSessions || [];
    const matchedWebuiIds = new Set();
    const unified = system.map(s => {
      const wm = webui.find(ws => ws.claudeSessionId === s.sessionId);
      if (wm) matchedWebuiIds.add(wm.id);
      const status = (wm && s.status === 'stopped') ? 'live' : (wm && s.status !== 'tmux' && s.status !== 'external') ? 'live' : s.status;
      return { ...s, status, webuiId: wm?.id || null, webuiName: wm?.name || null };
    });
    for (const ws of webui) {
      if (!matchedWebuiIds.has(ws.id)) {
        unified.unshift({ sessionId: ws.claudeSessionId || ws.id, cwd: ws.cwd, startedAt: ws.createdAt, status: 'live', webuiId: ws.id, webuiName: ws.name, name: ws.name || '' });
      }
    }
    this._allSessions = unified;
  }

  _mergeAndRender() {
    this._merge();
    const digest = JSON.stringify(this._allSessions.map(s => s.sessionId + ':' + s.status));
    if (digest === this._sessionDigest) return;
    this._sessionDigest = digest;
    this._render();
  }

  _filterSessions() {
    const f = (document.getElementById('session-filter')?.value || '').toLowerCase();
    let sessions = this._allSessions;

    // Text filter
    if (f) sessions = sessions.filter(s => (s.cwd||'').toLowerCase().includes(f) || (s.sessionId||'').toLowerCase().includes(f) || (s.name||'').toLowerCase().includes(f) || (s.webuiName||'').toLowerCase().includes(f));

    // Archive filter
    const showArchived = this._statusFilter.has('archived');
    if (showArchived) {
      sessions = sessions.filter(s => {
        if (this._archivedIds.has(s.sessionId)) return true;
        return this._statusFilter.has(s.status);
      });
    } else {
      sessions = sessions.filter(s => !this._archivedIds.has(s.sessionId));
      const nonArchivedFilters = new Set([...this._statusFilter]);
      nonArchivedFilters.delete('archived');
      if (nonArchivedFilters.size < 4) {
        sessions = sessions.filter(s => nonArchivedFilters.has(s.status));
      }
    }
    return sessions;
  }

  _render() {
    const sessions = this._filterSessions();
    this.listEl.innerHTML = '';

    // "New Session" card
    const newCard = document.createElement('div'); newCard.className = 'session-item-card new-session-card';
    newCard.innerHTML = '<div class="session-card-name" style="color:var(--accent-hover)">+ New Session</div>';
    newCard.onclick = () => this.app.showNewSessionDialog();
    this.listEl.appendChild(newCard);

    if (!sessions.length) { this.listEl.insertAdjacentHTML('beforeend', '<div class="empty-hint">No sessions</div>'); return; }

    // Starred drawer at top
    const starred = sessions.filter(s => this._starredIds.has(s.sessionId));
    if (starred.length) {
      this._renderStarredDrawer(starred);
    }

    // Domain groups (excluding starred from their groups to avoid duplication)
    const starredSet = new Set(starred.map(s => s.sessionId));
    const rest = sessions.filter(s => !starredSet.has(s.sessionId));
    this._renderDomainGroups(rest);
  }

  _renderStarredDrawer(sessions) {
    const group = document.createElement('div'); group.className = 'folder-group starred-drawer';
    const isCollapsed = this._collapsedGroups.has('_starred');

    if (isCollapsed) group.classList.add('collapsed');

    const header = document.createElement('div'); header.className = 'folder-header starred-header';
    const chevron = document.createElement('span'); chevron.className = 'folder-chevron'; chevron.textContent = '▼';
    const iconEl = document.createElement('span'); iconEl.className = 'group-icon'; iconEl.textContent = '★';
    const labelEl = document.createElement('span'); labelEl.className = 'folder-path'; labelEl.textContent = 'Starred';
    const countEl = document.createElement('span'); countEl.className = 'folder-count'; countEl.textContent = `${sessions.length}`;
    header.append(chevron, iconEl, labelEl, countEl);
    header.onclick = () => {
      group.classList.toggle('collapsed');
      if (group.classList.contains('collapsed')) this._collapsedGroups.add('_starred');
      else this._collapsedGroups.delete('_starred');
      localStorage.setItem('collapsedGroups', JSON.stringify([...this._collapsedGroups]));
    };

    const sessionsDiv = document.createElement('div'); sessionsDiv.className = 'folder-sessions';
    sessions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    for (const s of sessions) sessionsDiv.appendChild(this._renderSessionCard(s));

    group.append(header, sessionsDiv);
    this.listEl.appendChild(group);
  }

  _renderDomainGroups(sessions) {
    // Group sessions by inferred domain
    const groups = new Map();
    for (const s of sessions) {
      const g = inferGroup(s);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }

    // Sort groups: groups with active sessions first, then alphabetical. 'external' always last.
    const entries = [...groups.entries()].sort((a, b) => {
      if (a[0] === 'external') return 1;
      if (b[0] === 'external') return -1;
      const aActive = a[1].some(s => s.status === 'live' || s.status === 'tmux') ? 1 : 0;
      const bActive = b[1].some(s => s.status === 'live' || s.status === 'tmux') ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a[0].localeCompare(b[0]);
    });

    for (const [groupName, items] of entries) {
      const hasActive = items.some(s => s.status === 'live' || s.status === 'tmux');
      const activeCount = items.filter(s => s.status === 'live' || s.status === 'tmux').length;

      // Auto-expand groups with active sessions, collapse others (only on first render)
      const isCollapsed = this._collapsedGroups.has(groupName);
      // If user hasn't manually set collapse state, auto-expand active groups
      const autoExpand = hasActive && !this._collapsedGroups.has('_init_done');

      const group = document.createElement('div'); group.className = 'folder-group';
      if (isCollapsed && !autoExpand) group.classList.add('collapsed');

      const icon = GROUP_ICONS[groupName] || '📁';
      const label = GROUP_LABELS[groupName] || groupName.charAt(0).toUpperCase() + groupName.slice(1);

      const header = document.createElement('div'); header.className = 'folder-header';
      const chevron = document.createElement('span'); chevron.className = 'folder-chevron'; chevron.textContent = '▼';
      const iconEl = document.createElement('span'); iconEl.className = 'group-icon'; iconEl.textContent = icon;
      const labelEl = document.createElement('span'); labelEl.className = 'folder-path'; labelEl.textContent = label;
      const countEl = document.createElement('span'); countEl.className = 'folder-count';
      countEl.textContent = activeCount > 0 ? `[${activeCount}]` : `${items.length}`;
      if (activeCount > 0) countEl.classList.add('has-active');

      header.append(chevron, iconEl, labelEl, countEl);

      // "+" button — show folder picker
      const addBtn = document.createElement('button'); addBtn.className = 'folder-add-btn';
      addBtn.textContent = '+'; addBtn.title = 'New session in ' + groupName;
      addBtn.onclick = (e) => {
        e.stopPropagation();
        // Derive group parent dir from session CWDs
        const cwds = items.map(i => i.cwd || '').filter(Boolean);
        const parentDir = this._findGroupParent(cwds);
        this._showFolderPicker(parentDir, addBtn);
      };
      header.appendChild(addBtn);

      header.onclick = (e) => {
        if (e.target.closest('.folder-add-btn')) return;
        group.classList.toggle('collapsed');
        if (group.classList.contains('collapsed')) this._collapsedGroups.add(groupName);
        else this._collapsedGroups.delete(groupName);
        this._collapsedGroups.add('_init_done'); // Mark that user has interacted
        localStorage.setItem('collapsedGroups', JSON.stringify([...this._collapsedGroups]));
      };

      const sessionsDiv = document.createElement('div'); sessionsDiv.className = 'folder-sessions';
      // Sort: starred first, then active first, then by time
      items.sort((a, b) => {
        const as = this._starredIds.has(a.sessionId) ? 1 : 0;
        const bs = this._starredIds.has(b.sessionId) ? 1 : 0;
        if (as !== bs) return bs - as;
        const aLive = (a.status === 'live' || a.status === 'tmux') ? 1 : 0;
        const bLive = (b.status === 'live' || b.status === 'tmux') ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return (b.startedAt || 0) - (a.startedAt || 0);
      });
      for (const s of items) sessionsDiv.appendChild(this._renderSessionCard(s));

      group.append(header, sessionsDiv);
      this.listEl.appendChild(group);
    }
  }

  _findGroupParent(cwds) {
    if (!cwds.length) return '/';
    // Find longest common path prefix
    const parts = cwds.map(c => c.split('/'));
    const common = [];
    for (let i = 0; i < parts[0].length; i++) {
      const seg = parts[0][i];
      if (parts.every(p => p[i] === seg)) common.push(seg);
      else break;
    }
    return common.join('/') || '/';
  }

  async _showFolderPicker(parentDir, anchorBtn) {
    document.querySelectorAll('.folder-picker-popup').forEach(p => p.remove());

    const popup = document.createElement('div'); popup.className = 'folder-picker-popup';
    const title = document.createElement('div'); title.className = 'folder-picker-title';
    title.textContent = 'Select or create folder';
    const pathHint = document.createElement('div'); pathHint.className = 'folder-picker-path';
    pathHint.textContent = parentDir.replace(/^\/Users\/[^/]+/, '~');
    popup.append(title, pathHint);

    const list = document.createElement('div'); list.className = 'folder-picker-list';
    list.innerHTML = '<div class="empty-hint">Loading...</div>';
    popup.appendChild(list);

    // New folder row
    const newRow = document.createElement('div'); newRow.className = 'folder-picker-new';
    const newInput = document.createElement('input'); newInput.className = 'folder-picker-input';
    newInput.placeholder = 'New folder name...';
    const createBtn = document.createElement('button'); createBtn.className = 'session-detail-btn session-detail-open';
    createBtn.textContent = '+ Create & Open';
    createBtn.onclick = async () => {
      const name = newInput.value.trim();
      if (!name) return;
      const newPath = parentDir + '/' + name;
      try {
        await fetch('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: newPath }) });
      } catch {}
      popup.remove();
      this.app.createSession({ cwd: newPath });
    };
    newInput.onkeydown = (e) => { if (e.key === 'Enter') createBtn.click(); };
    newRow.append(newInput, createBtn);
    popup.appendChild(newRow);

    // Position popup
    const rect = anchorBtn.getBoundingClientRect();
    popup.style.left = rect.left + 'px'; popup.style.top = (rect.bottom + 4) + 'px';
    document.body.appendChild(popup);
    attachPopoverClose(popup);

    // Load subdirectories
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(parentDir)}`);
      const data = await res.json();
      list.innerHTML = '';
      const dirs = (data.items || []).filter(i => i.isDirectory).sort((a, b) => (b.modified || 0) - (a.modified || 0));
      if (!dirs.length) {
        list.innerHTML = '<div class="empty-hint">No subfolders</div>';
      } else {
        for (const d of dirs) {
          const item = document.createElement('div'); item.className = 'folder-picker-item';
          const icon = document.createElement('span'); icon.textContent = '📁'; icon.style.marginRight = '6px';
          const label = document.createElement('span'); label.className = 'folder-picker-item-name'; label.textContent = d.name;
          const mod = document.createElement('span'); mod.className = 'folder-picker-item-time';
          mod.textContent = d.modified ? new Date(d.modified).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
          item.append(icon, label, mod);
          item.onclick = () => {
            popup.remove();
            this.app.createSession({ cwd: parentDir + '/' + d.name });
          };
          list.appendChild(item);
        }
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-hint" style="color:var(--red)">${err.message}</div>`;
    }

    newInput.focus();
  }

  _openSession(s) {
    const customName = this._customNames[s.sessionId];
    const displayName = customName || s.name || s.webuiName || s.sessionId.substring(0, 12) + '...';
    if (s.status === 'live' && s.webuiId) {
      this.app.attachSession(s.webuiId, displayName, s.cwd);
    } else if (s.status === 'tmux') {
      this.app.attachTmuxSession(s.tmuxTarget, displayName, s.cwd);
    } else if (s.status === 'stopped') {
      this.app.resumeSession(s.sessionId, s.cwd, customName || s.name);
    }
  }

  _renderSessionCard(s) {
    const card = document.createElement('div'); card.className = 'session-item-card';
    card._sessionId = s.sessionId;
    const isArchived = this._archivedIds.has(s.sessionId);
    if (isArchived) card.classList.add('archived');
    const customName = this._customNames[s.sessionId];
    const originalName = s.name || s.webuiName || s.sessionId.substring(0, 12) + '...';
    const displayName = customName || originalName;

    const badgeMap = {
      live:     { cls: 'badge-live', text: 'LIVE' },
      tmux:     { cls: 'badge-tmux', text: 'TMUX' },
      external: { cls: 'badge-external', text: 'EXT' },
      stopped:  { cls: 'badge-stopped', text: 'STOP' },
    };
    const badge = badgeMap[s.status] || badgeMap.stopped;

    // Summary row: name left, badge right
    const row = document.createElement('div'); row.className = 'session-card-row';
    const nameEl = document.createElement('span'); nameEl.className = 'session-card-name';
    nameEl.textContent = displayName;
    if (customName) nameEl.title = `Custom name. Original: ${originalName}`;
    const badgeEl = document.createElement('span'); badgeEl.className = `session-card-badge ${badge.cls}`;
    badgeEl.textContent = badge.text;
    row.append(nameEl, badgeEl);
    card.appendChild(row);

    // Expandable detail panel (hidden by default)
    const detail = document.createElement('div'); detail.className = 'session-card-detail';
    const date = new Date(s.startedAt);
    const cwdShort = (s.cwd || '').replace(/^\/Users\/[^/]+/, '~');
    detail.innerHTML = `
      <div class="session-detail-row"><span class="session-detail-label">Path</span><span class="session-detail-value">${escHtml(cwdShort)}</span></div>
      <div class="session-detail-row"><span class="session-detail-label">Time</span><span class="session-detail-value">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span></div>
      <div class="session-detail-row"><span class="session-detail-label">ID</span><span class="session-detail-value">${s.sessionId.substring(0, 20)}...</span></div>
      <div class="session-detail-row"><span class="session-detail-label">Status</span><span class="session-detail-value">${s.status}${s.pid ? ' (PID ' + s.pid + ')' : ''}</span></div>`;

    // Action bar inside detail
    const detailActions = document.createElement('div'); detailActions.className = 'session-detail-actions';

    if (s.status !== 'external') {
      const openBtn = document.createElement('button'); openBtn.className = 'session-detail-btn session-detail-open';
      openBtn.textContent = s.status === 'stopped' ? '▶ Resume' : '▶ Open';
      openBtn.onclick = (e) => { e.stopPropagation(); this._openSession(s); };
      detailActions.appendChild(openBtn);
    }

    const starBtn = document.createElement('button'); starBtn.className = 'session-detail-btn';
    const starred = this._starredIds.has(s.sessionId);
    starBtn.textContent = starred ? '★ Starred' : '☆ Star';
    if (starred) starBtn.classList.add('starred');
    starBtn.onclick = (e) => { e.stopPropagation(); this.toggleStar(s.sessionId); };
    detailActions.appendChild(starBtn);

    const archiveBtn = document.createElement('button'); archiveBtn.className = 'session-detail-btn';
    archiveBtn.textContent = isArchived ? '📤 Unarchive' : '📦 Archive';
    archiveBtn.onclick = (e) => { e.stopPropagation(); this.toggleArchive(s.sessionId); };
    detailActions.appendChild(archiveBtn);

    const renameBtn = document.createElement('button'); renameBtn.className = 'session-detail-btn';
    renameBtn.textContent = '✎ Rename';
    renameBtn.onclick = (e) => { e.stopPropagation(); this.renameSession(s.sessionId, originalName); };
    detailActions.appendChild(renameBtn);

    const collapseBtn = document.createElement('button'); collapseBtn.className = 'session-detail-btn session-detail-collapse';
    collapseBtn.textContent = '▲ Collapse';
    collapseBtn.onclick = (e) => { e.stopPropagation(); card.classList.remove('expanded'); };
    detailActions.appendChild(collapseBtn);

    detail.appendChild(detailActions);
    card.appendChild(detail);

    // Click to expand/collapse; double-click to open
    if (s.status === 'external') {
      card.style.opacity = '0.7';
      card.title = 'Running in unsupported terminal (PID ' + (s.pid || '?') + ')';
    }
    card.onclick = (e) => {
      if (e.target.closest('.session-detail-btn')) return;
      card.classList.toggle('expanded');
    };
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('.session-detail-btn')) return;
      e.stopPropagation();
      this._openSession(s);
    });

    return card;
  }
}

export { Sidebar };
