/**
 * GhostMeta AI - Main Application Controller
 * Handles UI interactions, queue management, batch processing,
 * sample creation, theme toggling, and the metadata inspector modal.
 */

import { CleanerHub } from './cleaners/cleaner-hub.js?v=4';
import { SampleGenerator } from './utils/samples.js?v=4';
import { AIDetector } from './detectors/ai-detector.js?v=4';

class App {
  constructor() {
    this.queue = []; // Array of { id, file, result, status: 'pending'|'processing'|'done'|'error', thumbnail }
    this.currentMode = 'lossless'; // 'lossless' | 'deep'
    this.activeModalFile = null;

    this.initElements();
    this.initEventListeners();
    this.initTheme();
    this.initPWA();
  }

  initElements() {
    this.dropzone = document.getElementById('dropzone');
    this.fileInput = document.getElementById('fileInput');
    this.browseBtn = document.getElementById('browseBtn');
    
    // Sample buttons
    this.sampleSdBtn = document.getElementById('sampleSdBtn');
    this.sampleDalleBtn = document.getElementById('sampleDalleBtn');
    this.sampleVideoBtn = document.getElementById('sampleVideoBtn');

    // Mode cards
    this.modeLossless = document.getElementById('modeLossless');
    this.modeDeep = document.getElementById('modeDeep');

    // Toggles
    this.toggleC2PA = document.getElementById('toggleC2PA');
    this.togglePrompts = document.getElementById('togglePrompts');
    this.toggleSynthID = document.getElementById('toggleSynthID');
    this.toggleGPS = document.getElementById('toggleGPS');

    // Action bar & Queue
    this.actionBar = document.getElementById('actionBar');
    this.queueCount = document.getElementById('queueCount');
    this.clearQueueBtn = document.getElementById('clearQueueBtn');
    this.cleanAllBtn = document.getElementById('cleanAllBtn');
    this.downloadZipBtn = document.getElementById('downloadZipBtn');
    this.queueList = document.getElementById('queueList');

    // Progress bar
    this.progressWrapper = document.getElementById('progressWrapper');
    this.progressBar = document.getElementById('progressBar');
    this.progressText = document.getElementById('progressText');
    this.progressPercent = document.getElementById('progressPercent');
    this.liveStatus = document.getElementById('liveStatus');

    // Theme Toggle
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeIconDark = document.getElementById('themeIconDark');
    this.themeIconLight = document.getElementById('themeIconLight');

    // Modal
    this.inspectorModal = document.getElementById('inspectorModal');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalTitle = document.getElementById('modalTitle');
    this.tabButtons = document.querySelectorAll('.inspector-tabs .tab-btn');
    this.tabContents = {
      radar: document.getElementById('tabRadar'),
      prompts: document.getElementById('tabPrompts'),
      diff: document.getElementById('tabDiff'),
      raw: document.getElementById('tabRaw')
    };

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initEventListeners() {
    // Dropzone events
    this.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    this.dropzone.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput.click();
      }
    });

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('drag-over');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('drag-over');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.addFiles(Array.from(e.dataTransfer.files));
      }
    });

    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        this.addFiles(Array.from(this.fileInput.files));
        this.fileInput.value = ''; // Reset for re-selection
      }
    });

    // Clipboard Paste support (Ctrl+V anywhere)
    window.addEventListener('paste', (e) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        this.addFiles(Array.from(e.clipboardData.files));
        this.showToast('Image pasted from clipboard!', 'info');
      }
    });

    // Sample Loaders
    this.sampleSdBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showToast('Generating Stable Diffusion test sample...', 'info');
      const file = await SampleGenerator.createSDSample();
      this.addFiles([file]);
    });

    this.sampleDalleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showToast('Generating ChatGPT / Gemini test sample...', 'info');
      const file = await SampleGenerator.createDalleGeminiSample();
      this.addFiles([file]);
    });

    this.sampleVideoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.showToast('Generating AI Video test sample...', 'info');
      const file = await SampleGenerator.createVideoSample();
      this.addFiles([file]);
    });

    // Scrubbing Mode Toggle
    this.modeLossless.addEventListener('click', () => {
      this.currentMode = 'lossless';
      this.modeLossless.classList.add('selected');
      this.modeDeep.classList.remove('selected');
    });

    this.modeDeep.addEventListener('click', () => {
      this.currentMode = 'deep';
      this.modeDeep.classList.add('selected');
      this.modeLossless.classList.remove('selected');
    });

    // Batch Actions
    this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
    this.cleanAllBtn.addEventListener('click', () => this.processAllPending());
    this.downloadZipBtn.addEventListener('click', () => this.downloadAllAsZip());

    // Theme Toggle
    this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

    // Modal
    this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.inspectorModal.addEventListener('click', (e) => {
      if (e.target === this.inspectorModal) this.closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.inspectorModal.classList.contains('open')) {
        this.closeModal();
      }
    });

    // Modal Tabs
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabKey = btn.dataset.tab;
        Object.entries(this.tabContents).forEach(([key, el]) => {
          el.style.display = key === tabKey ? 'block' : 'none';
        });
      });
    });
  }

  initTheme() {
    const savedTheme = localStorage.getItem('ghostmeta-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcons(savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ghostmeta-theme', next);
    this.updateThemeIcons(next);
  }

  updateThemeIcons(theme) {
    if (theme === 'light') {
      this.themeIconDark.style.display = 'none';
      this.themeIconLight.style.display = 'block';
    } else {
      this.themeIconDark.style.display = 'block';
      this.themeIconLight.style.display = 'none';
    }
  }

  /**
   * Adds uploaded or sampled files to the processing queue
   */
  async addFiles(files) {
    for (const file of files) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
      const item = {
        id: Math.random().toString(36).substring(2, 9),
        file: file,
        result: null,
        status: 'pending',
        thumbnail: this.createThumbnailUrl(file)
      };

      this.queue.push(item);
      this.renderQueueItem(item);

      // Asynchronously extract video frame preview if video
      if (isVideo) {
        this.generateVideoThumbnail(file).then(thumb => {
          if (thumb) {
            item.thumbnail = thumb;
            const thumbEl = document.querySelector(`#card-${item.id} .file-thumbnail`);
            if (thumbEl) {
              thumbEl.innerHTML = `<img src="${thumb}" alt="${this.escapeHtml(file.name)}">`;
            }
          }
        });
      }
    }

    this.updateActionBar();
    this.showToast(`Added ${files.length} file(s) to queue.`, 'info');

    // Automatically inspect the first file's metadata immediately for instant threat preview
    if (this.queue.length === files.length) {
      this.inspectItemPreClean(this.queue[0]);
    }
  }

  createThumbnailUrl(file) {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  }

  /**
   * Extracts a video frame to use as card preview thumbnail
   */
  async generateVideoThumbnail(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadeddata = () => {
        video.currentTime = Math.min(1.0, video.duration > 2 ? 0.5 : 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 160;
          const ctx = canvas.getContext('2d');
          const hRatio = canvas.width / (video.videoWidth || 160);
          const vRatio = canvas.height / (video.videoHeight || 160);
          const ratio = Math.max(hRatio, vRatio);
          const shiftX = (canvas.width - video.videoWidth * ratio) / 2;
          const shiftY = (canvas.height - video.videoHeight * ratio) / 2;
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, shiftX, shiftY, video.videoWidth * ratio, video.videoHeight * ratio);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve(dataUrl);
        } catch {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve(null);
        }
      };

      video.onerror = () => {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resolve(null);
      };

      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(null);
      }, 3000);
    });
  }

  updateActionBar() {
    if (this.queue.length === 0) {
      this.actionBar.style.display = 'none';
      const mobileStickyBar = document.getElementById('mobileStickyBar');
      if (mobileStickyBar) mobileStickyBar.style.display = 'none';
      return;
    }

    this.actionBar.style.display = 'flex';
    const cleanedCount = this.queue.filter(q => q.status === 'done').length;
    this.queueCount.textContent = `${this.queue.length} file(s) in queue (${cleanedCount} cleaned)`;

    if (cleanedCount > 0) {
      this.downloadZipBtn.style.display = 'inline-flex';
    } else {
      this.downloadZipBtn.style.display = 'none';
    }

    // Sync Mobile Floating Sticky Bar
    const mobileStickyBar = document.getElementById('mobileStickyBar');
    const mobileBarInfo = document.getElementById('mobileBarInfo');
    const mobileDownloadZipBtn = document.getElementById('mobileDownloadZipBtn');
    if (mobileStickyBar) {
      mobileStickyBar.style.display = 'flex';
      if (mobileBarInfo) {
        mobileBarInfo.textContent = `${this.queue.length} file(s) (${cleanedCount} clean)`;
      }
      if (mobileDownloadZipBtn) {
        mobileDownloadZipBtn.style.display = cleanedCount > 0 ? 'inline-flex' : 'none';
      }
    }
  }

  renderQueueItem(item) {
    const card = document.createElement('article');
    card.className = 'file-card';
    card.id = `card-${item.id}`;

    const isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(item.file.name);

    let thumbnailHtml = '';
    if (item.thumbnail) {
      thumbnailHtml = `<img src="${item.thumbnail}" alt="${this.escapeHtml(item.file.name)}">`;
    } else if (isVideo) {
      thumbnailHtml = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>`;
    } else {
      thumbnailHtml = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>`;
    }

    card.innerHTML = `
      <div class="file-thumbnail">
        ${thumbnailHtml}
      </div>
      <div class="file-details">
        <div class="file-name-row">
          <span class="file-name" title="${this.escapeHtml(item.file.name)}">${this.escapeHtml(item.file.name)}</span>
          <span class="badge-ai-threat badge-threat-high" id="badge-${item.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Pending Analysis
          </span>
        </div>
        <div class="file-meta-row">
          <span class="meta-item">${this.formatBytes(item.file.size)}</span>
          <span>•</span>
          <span class="meta-item">${item.file.type || 'Binary Data'}</span>
          <span id="diff-${item.id}"></span>
        </div>
        <div class="threat-tags-row" id="tags-${item.id}">
          <span class="tag-badge">Analyzing headers...</span>
        </div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-icon" id="inspectBtn-${item.id}" title="Inspect Metadata & Threats">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </button>
        <button type="button" class="btn-primary" id="cleanBtn-${item.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Clean
        </button>
        <button type="button" class="btn-download-item" id="downloadBtn-${item.id}" style="display: none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </button>
        <button type="button" class="btn-icon" id="deleteBtn-${item.id}" title="Remove from list">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
    `;

    this.queueList.prepend(card);

    // Bind item buttons
    card.querySelector(`#cleanBtn-${item.id}`).addEventListener('click', () => this.processSingleItem(item));
    card.querySelector(`#inspectBtn-${item.id}`).addEventListener('click', () => this.openInspector(item));
    card.querySelector(`#deleteBtn-${item.id}`).addEventListener('click', () => this.removeItem(item));
    card.querySelector(`#downloadBtn-${item.id}`).addEventListener('click', () => this.downloadSingle(item));

    // Run quick pre-inspection to populate tags
    this.inspectItemPreClean(item);
  }

  /**
   * Pre-inspect a file to show its detected AI tags before the user clicks Clean
   */
  async inspectItemPreClean(item) {
    try {
      const buffer = await item.file.arrayBuffer();
      const analysis = await AIDetector.detect(item.file, buffer);
      item.preAnalysis = analysis;

      const badge = document.getElementById(`badge-${item.id}`);
      const tagsContainer = document.getElementById(`tags-${item.id}`);
      if (!badge || !tagsContainer) return;

      if (analysis.hasAIMetadata) {
        badge.className = 'badge-ai-threat badge-threat-high';
        badge.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          AI Metadata Detected
        `;
      } else {
        badge.className = 'badge-ai-threat badge-threat-clean';
        badge.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          No AI Provenance
        `;
      }

      // Populate tags
      tagsContainer.innerHTML = '';
      if (analysis.c2pa?.found) {
        tagsContainer.innerHTML += `<span class="tag-badge c2pa">C2PA Credentials</span>`;
      }
      for (const src of analysis.detectedSources) {
        tagsContainer.innerHTML += `<span class="tag-badge prompt">${this.escapeHtml(src)}</span>`;
      }
      if (analysis.hasGPS) {
        tagsContainer.innerHTML += `<span class="tag-badge gps">GPS Geolocation</span>`;
      }
      if (tagsContainer.children.length === 0) {
        tagsContainer.innerHTML = `<span class="tag-badge">Standard Binary</span>`;
      }
    } catch (e) {
      console.warn('Pre-inspection error:', e);
    }
  }

  /**
   * Process a single queue item
   */
  async processSingleItem(item) {
    const card = document.getElementById(`card-${item.id}`);
    const cleanBtn = document.getElementById(`cleanBtn-${item.id}`);
    const downloadBtn = document.getElementById(`downloadBtn-${item.id}`);
    const badge = document.getElementById(`badge-${item.id}`);
    const diff = document.getElementById(`diff-${item.id}`);

    if (cleanBtn) cleanBtn.disabled = true;
    if (badge) badge.textContent = 'Stripping...';

    try {
      const options = {
        scrubMode: this.currentMode,
        antiSynthID: this.toggleSynthID.checked,
        stripC2PA: this.toggleC2PA.checked,
        stripPrompts: this.togglePrompts.checked,
        stripGPS: this.toggleGPS.checked
      };

      const result = await CleanerHub.processFile(item.file, options);
      item.result = result;
      item.status = 'done';

      if (card) card.classList.add('cleaned');
      if (cleanBtn) cleanBtn.style.display = 'none';
      if (downloadBtn) downloadBtn.style.display = 'inline-flex';

      if (badge) {
        badge.className = 'badge-ai-threat badge-threat-clean';
        badge.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          Fully Cleaned
        `;
      }

      if (diff) {
        const pct = Math.round((result.sizeDiff / result.originalSize) * 100);
        const savingsText = result.sizeDiff > 0 ? `(-${pct}% / ${this.formatBytes(result.sizeDiff)} removed)` : `(Clean)`;
        diff.innerHTML = `• <strong style="color: var(--accent-emerald);">${this.formatBytes(result.cleanedSize)} ${savingsText}</strong>`;
      }

      this.updateActionBar();
      this.showToast(`Cleaned ${item.file.name} in ${result.durationMs}ms!`, 'success');
    } catch (err) {
      console.error(err);
      item.status = 'error';
      if (badge) {
        badge.className = 'badge-ai-threat badge-threat-high';
        badge.textContent = 'Error Cleaning';
      }
      this.showToast(`Error cleaning ${item.file.name}: ${err.message}`, 'error');
    }
  }

  /**
   * Process all pending items in the queue
   */
  async processAllPending() {
    const pendingItems = this.queue.filter(q => q.status === 'pending');
    if (pendingItems.length === 0) {
      this.showToast('No pending files to clean.', 'info');
      return;
    }

    this.progressWrapper.style.display = 'block';
    this.cleanAllBtn.disabled = true;

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      const percent = Math.round(((i + 1) / pendingItems.length) * 100);
      this.progressBar.value = percent;
      this.progressPercent.textContent = `${percent}%`;
      this.progressText.textContent = `Cleaning ${item.file.name} (${i + 1}/${pendingItems.length})...`;
      this.liveStatus.textContent = this.progressText.textContent;

      await this.processSingleItem(item);
    }

    this.progressText.textContent = 'All files processed successfully!';
    this.liveStatus.textContent = 'All files processed successfully!';
    setTimeout(() => {
      this.progressWrapper.style.display = 'none';
      this.cleanAllBtn.disabled = false;
    }, 1200);

    this.showToast('Batch processing complete!', 'success');
  }

  /**
   * Download single cleaned file
   */
  async downloadSingle(item) {
    if (!item.result || !item.result.cleanedBlob) return;
    
    // Ensure clean filename preserves extension
    let filename = item.result.cleanFileName || '';
    if (!filename) {
      const origName = item.file.name || 'cleaned_media';
      const ext = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '.mp4';
      filename = `${origName.replace(/\.[^.]+$/, '')}_clean${ext}`;
    }

    const blob = item.result.cleanedBlob;

    // 0. Primary for Mobile (Android & iOS): Native Web Share API
    // Opens phone's share sheet to save directly to Gallery / Photos or send to WhatsApp / Telegram!
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    const shareFile = new File([blob], filename, { type: blob.type || 'video/mp4' });

    if (isMobile && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      try {
        await navigator.share({
          files: [shareFile],
          title: filename,
          text: 'AI Metadata & Watermarks removed with GhostMeta AI'
        });
        this.showToast(`Shared ${filename}!`, 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User closed share sheet
        console.warn('Mobile share sheet dismissed, falling back:', err);
      }
    }

    // 1. Primary Method for Desktop: Native File System Access API (Immediate Windows "Save As" Dialog)
    // Runs synchronously on the user's click gesture so Chrome/Windows pops up the file picker directly!
    if (window.showSaveFilePicker) {
      try {
        const extMatch = filename.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : '.mp4';
        const mimeType = blob.type || (ext === '.mp4' ? 'video/mp4' : 'application/octet-stream');
        
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: ext === '.mp4' ? 'MP4 Video (*.mp4)' : 'Cleaned File',
            accept: { [mimeType]: [ext] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.showToast(`Saved to ${handle.name}!`, 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          // User clicked Cancel in the Save dialog
          return;
        }
        console.warn('showSaveFilePicker fallback:', err);
      }
    }

    // 2. Direct Anchor with explicit File object and Blob URL
    try {
      const file = new File([blob], filename, { type: blob.type || 'video/mp4' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 60000);
      this.showToast(`Downloading ${filename}...`, 'success');
    } catch (e) {
      console.warn('Blob anchor fallback:', e);
    }

    // 3. Background Local HTTP Streaming via hidden iframe
    try {
      const resp = await fetch('/api/store-download', {
        method: 'POST',
        headers: {
          'x-filename': encodeURIComponent(filename),
          'content-type': blob.type || 'video/mp4'
        },
        body: blob
      });
      if (resp.ok) {
        const { downloadId } = await resp.json();
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `/api/get-download?id=${downloadId}`;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 15000);
      }
    } catch (e) {
      console.warn('Local HTTP download fallback:', e);
    }
  }

  /**
   * Batch download all cleaned files as a ZIP archive
   */
  async downloadAllAsZip() {
    const cleanedItems = this.queue.filter(q => q.status === 'done' && q.result?.cleanedBlob);
    if (cleanedItems.length === 0) {
      this.showToast('No cleaned files ready for ZIP download.', 'error');
      return;
    }

    if (typeof JSZip === 'undefined') {
      this.showToast('JSZip library loading failed. Downloading files individually...', 'info');
      cleanedItems.forEach(item => this.downloadSingle(item));
      return;
    }

    this.showToast('Creating ZIP archive...', 'info');
    const zip = new JSZip();

    for (const item of cleanedItems) {
      zip.file(item.result.cleanFileName, item.result.cleanedBlob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipName = `ghostmeta_cleaned_bundle_${Date.now()}.zip`;

    // 1. Primary: Native Windows Save As Dialog for ZIP
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{
            description: 'ZIP Archive (*.zip)',
            accept: { 'application/zip': ['.zip'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        this.showToast(`Saved ZIP to ${handle.name}!`, 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker for ZIP fallback:', err);
      }
    }

    // 2. Direct Blob URL Download
    try {
      const file = new File([zipBlob], zipName, { type: 'application/zip' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 60000);
      this.showToast(`Downloaded ${cleanedItems.length} cleaned files in ZIP!`, 'success');
    } catch (e) {
      console.warn('ZIP blob fallback:', e);
    }

    // 3. Local HTTP iframe stream for ZIP
    try {
      const resp = await fetch('/api/store-download', {
        method: 'POST',
        headers: {
          'x-filename': encodeURIComponent(zipName),
          'content-type': 'application/zip'
        },
        body: zipBlob
      });
      if (resp.ok) {
        const { downloadId } = await resp.json();
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `/api/get-download?id=${downloadId}`;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 15000);
      }
    } catch (e) {
      console.warn('ZIP HTTP download fallback:', e);
    }

    const URL = window.URL || window.webkitURL;
    const a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
    a.download = zipName;
    a.rel = 'noopener';
    a.href = URL.createObjectURL(zipBlob);
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 180000);
    }, 500);

    this.showToast(`Downloaded ${cleanedItems.length} cleaned files in ZIP!`, 'success');
  }

  removeItem(item) {
    this.queue = this.queue.filter(q => q.id !== item.id);
    const card = document.getElementById(`card-${item.id}`);
    if (card) card.remove();
    this.updateActionBar();
  }

  clearQueue() {
    this.queue = [];
    this.queueList.innerHTML = '';
    this.updateActionBar();
    this.showToast('Queue cleared.', 'info');
  }

  /**
   * Open the detailed Metadata & Threat Inspector Modal
   */
  async openInspector(item) {
    this.activeModalFile = item;
    this.modalTitle.textContent = `Metadata Radar: ${item.file.name}`;

    // Ensure we have analysis data
    let analysis = item.result?.beforeAnalysis || item.preAnalysis;
    if (!analysis) {
      const buffer = await item.file.arrayBuffer();
      analysis = await AIDetector.detect(item.file, buffer);
      item.preAnalysis = analysis;
    }

    const postAnalysis = item.result?.afterAnalysis;

    // 1. Render Radar Tab
    this.tabContents.radar.innerHTML = `
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px;">
        <span class="badge-ai-threat ${analysis.hasAIMetadata ? 'badge-threat-high' : 'badge-threat-clean'}" style="font-size: 0.85rem; padding: 6px 14px;">
          ${analysis.hasAIMetadata ? '🚨 AI Generated Signatures Detected' : '🛡️ No Standard AI Signatures'}
        </span>
        <span style="font-size: 0.82rem; color: var(--text-secondary);">
          Threat Confidence: <strong>${analysis.aiConfidence.toUpperCase()}</strong>
        </span>
      </div>

      <div class="comparison-grid">
        <div class="comparison-col">
          <div class="comparison-title" style="color: var(--accent-rose);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
            </svg>
            Detected Provenance & Credentials
          </div>
          <table class="meta-table">
            <tr>
              <td>C2PA Manifest</td>
              <td>${analysis.c2pa?.found ? `<strong style="color: #f43f5e;">YES (${analysis.c2pa.source})</strong>` : 'None'}</td>
            </tr>
            <tr>
              <td>Claim Generator</td>
              <td>${analysis.c2pa?.generator || 'None'}</td>
            </tr>
            <tr>
              <td>Identified AI Models</td>
              <td>${analysis.detectedSources.length > 0 ? analysis.detectedSources.join(', ') : 'None'}</td>
            </tr>
            <tr>
              <td>GPS Geolocation</td>
              <td>${analysis.hasGPS ? '<strong style="color: #f59e0b;">🚨 Leaking Location</strong>' : 'None'}</td>
            </tr>
          </table>
        </div>

        <div class="comparison-col">
          <div class="comparison-title" style="color: var(--accent-cyan);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Cleaned Status
          </div>
          <table class="meta-table">
            <tr>
              <td>Status</td>
              <td>${item.result ? '<strong style="color: var(--accent-emerald);">100% Stripped & Verified</strong>' : 'Pending cleaning'}</td>
            </tr>
            <tr>
              <td>C2PA Manifests</td>
              <td>${postAnalysis ? (postAnalysis.c2pa?.found ? 'Present' : 'Zero (Removed)') : 'Pending'}</td>
            </tr>
            <tr>
              <td>Prompts & Workflows</td>
              <td>${postAnalysis ? (postAnalysis.prompts.length === 0 ? 'Zero (Erased)' : 'Present') : 'Pending'}</td>
            </tr>
            <tr>
              <td>EXIF / GPS Tags</td>
              <td>${postAnalysis ? (postAnalysis.hasGPS ? 'Present' : 'Zero (Erased)') : 'Pending'}</td>
            </tr>
          </table>
        </div>
      </div>
    `;

    // 2. Render Prompts Tab
    if (analysis.prompts && analysis.prompts.length > 0) {
      let promptHtml = '';
      analysis.prompts.forEach((p, idx) => {
        promptHtml += `
          <div class="prompt-box" style="margin-bottom: 12px;">
            <div class="prompt-box-header">
              <span>${p.source}</span>
              <button type="button" class="btn-copy" data-prompt="${encodeURIComponent(p.text)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                Copy Prompt
              </button>
            </div>
            <div class="prompt-text">${this.escapeHtml(p.text)}</div>
          </div>
        `;
      });
      this.tabContents.prompts.innerHTML = promptHtml;

      // Bind copy buttons
      this.tabContents.prompts.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = decodeURIComponent(btn.dataset.prompt);
          navigator.clipboard.writeText(text);
          this.showToast('Prompt copied to clipboard!', 'success');
        });
      });
    } else {
      this.tabContents.prompts.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          No readable prompts or generation workflows found in container headers.
        </div>
      `;
    }

    // 3. Render Diff Tab
    this.tabContents.diff.innerHTML = `
      <div class="comparison-grid">
        <div class="comparison-col">
          <div class="comparison-title">Original File Header State</div>
          <table class="meta-table">
            <tr><td>File Size</td><td>${this.formatBytes(item.file.size)}</td></tr>
            <tr><td>C2PA Manifest</td><td>${analysis.c2pa?.found ? 'Detected' : 'None'}</td></tr>
            <tr><td>Prompts Found</td><td>${analysis.prompts.length}</td></tr>
            <tr><td>Model Tags</td><td>${analysis.modelInfo.length}</td></tr>
            <tr><td>GPS Coordinates</td><td>${analysis.hasGPS ? 'Leaked' : 'None'}</td></tr>
          </table>
        </div>
        <div class="comparison-col">
          <div class="comparison-title" style="color: var(--accent-emerald);">Post-Scrubbed State</div>
          <table class="meta-table">
            <tr><td>File Size</td><td>${item.result ? this.formatBytes(item.result.cleanedSize) : 'Pending'}</td></tr>
            <tr><td>C2PA Manifest</td><td>${postAnalysis ? (postAnalysis.c2pa?.found ? 'Present' : 'CLEARED (0 B)') : 'Pending'}</td></tr>
            <tr><td>Prompts Found</td><td>${postAnalysis ? postAnalysis.prompts.length : 'Pending'}</td></tr>
            <tr><td>Model Tags</td><td>${postAnalysis ? postAnalysis.modelInfo.length : 'Pending'}</td></tr>
            <tr><td>GPS Coordinates</td><td>${postAnalysis ? (postAnalysis.hasGPS ? 'Present' : 'CLEARED') : 'Pending'}</td></tr>
          </table>
        </div>
      </div>
    `;

    // 4. Render Raw Tab
    this.tabContents.raw.innerHTML = `
      <div class="prompt-box">
        <div class="prompt-box-header"><span>All Raw Findings (${analysis.rawFindings.length})</span></div>
        <div class="prompt-text">${analysis.rawFindings.length > 0 ? analysis.rawFindings.map(f => `• ${this.escapeHtml(f)}`).join('\n') : 'No metadata markers found.'}</div>
      </div>
    `;

    this.inspectorModal.classList.add('open');
  }

  closeModal() {
    this.inspectorModal.classList.remove('open');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  initPWA() {
    // 1. Service Worker registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          console.log('GhostMeta PWA Service Worker registered:', reg.scope);
        }).catch(err => {
          console.warn('GhostMeta SW registration failed:', err);
        });
      });
    }

    // 2. Install App button logic
    const installBtn = document.getElementById('installAppBtn');
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            installBtn.style.display = 'none';
            this.showToast('GhostMeta installed to Home Screen!', 'success');
          }
          deferredPrompt = null;
        } else {
          // If iOS or already installed, open mobile QR modal with tips
          const mobileModal = document.getElementById('mobileModal');
          if (mobileModal) mobileModal.classList.add('open');
        }
      });
    }

    // 3. Mobile Connect QR Modal
    const mobileConnectBtn = document.getElementById('mobileConnectBtn');
    const mobileModal = document.getElementById('mobileModal');
    const closeMobileModalBtn = document.getElementById('closeMobileModalBtn');
    const copyMobileUrlBtn = document.getElementById('copyMobileUrlBtn');

    if (mobileConnectBtn && mobileModal) {
      mobileConnectBtn.addEventListener('click', () => {
        mobileModal.classList.add('open');
      });
    }

    if (closeMobileModalBtn && mobileModal) {
      closeMobileModalBtn.addEventListener('click', () => {
        mobileModal.classList.remove('open');
      });
      mobileModal.addEventListener('click', (e) => {
        if (e.target === mobileModal) mobileModal.classList.remove('open');
      });
    }

    if (copyMobileUrlBtn) {
      copyMobileUrlBtn.addEventListener('click', () => {
        const url = document.getElementById('mobileUrlDisplay')?.textContent || 'http://192.168.1.5:3000';
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('Mobile URL copied to clipboard!', 'success');
        });
      });
    }

    // 4. Mobile Sticky Bar action buttons
    const mobileCleanBtn = document.getElementById('mobileCleanBtn');
    const mobileDownloadZipBtn = document.getElementById('mobileDownloadZipBtn');
    if (mobileCleanBtn) {
      mobileCleanBtn.addEventListener('click', () => this.processAllPending());
    }
    if (mobileDownloadZipBtn) {
      mobileDownloadZipBtn.addEventListener('click', () => this.downloadAllAsZip());
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.ghostMetaApp = new App();
});
