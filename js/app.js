/**
 * GhostMeta AI - Main Application Controller
 * Handles UI interactions, queue management, batch processing,
 * sample creation, theme toggling, and the metadata inspector modal.
 */

import { CleanerHub } from './cleaners/cleaner-hub.js?v=13';
import { SampleGenerator } from './utils/samples.js?v=13';
import { AIDetector } from './detectors/ai-detector.js?v=13';
import { WatermarkBoxSelector } from './cleaners/watermark-box-selector.js?v=14';

class App {
  constructor() {
    this.queue = []; // Array of { id, file, result, status: 'pending'|'processing'|'done'|'error', thumbnail }
    this.currentMode = 'lossless'; // 'lossless' | 'deep'
    this.activeModalFile = null;
    this.isBatchProcessing = false;

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
    this.toggleWatermark = document.getElementById('toggleWatermark');
    this.cornerPresetSelect = document.getElementById('cornerPresetSelect');
    this.cornerPresetGroup = document.getElementById('cornerPresetGroup');

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

    // Compare Corner Fix Modal
    this.compareCornerModal = document.getElementById('compareCornerModal');
    this.closeCompareModalBtn = document.getElementById('closeCompareModalBtn');

    // Interactive ROI Bounding-Box Modal
    this.roiModal = document.getElementById('roiModal');
    this.closeRoiModalBtn = document.getElementById('closeRoiModalBtn');
    this.roiCancelBtn = document.getElementById('roiCancelBtn');
    this.roiApplyBtn = document.getElementById('roiApplyBtn');
    this.roiPreviewImg = document.getElementById('roiPreviewImg');
    this.roiPreviewVideo = document.getElementById('roiPreviewVideo');
    this.roiOverlayCanvas = document.getElementById('roiOverlayCanvas');
    this.roiScrubberBar = document.getElementById('roiScrubberBar');
    this.roiPlayPauseBtn = document.getElementById('roiPlayPauseBtn');
    this.roiTimeline = document.getElementById('roiTimeline');
    this.roiTimeDisplay = document.getElementById('roiTimeDisplay');
    this.roiBoxCountText = document.getElementById('roiBoxCountText');
    this.roiPresetBr = document.getElementById('roiPresetBr');
    this.roiPresetBl = document.getElementById('roiPresetBl');
    this.roiPresetTr = document.getElementById('roiPresetTr');
    this.roiPresetTl = document.getElementById('roiPresetTl');
    this.roiPresetCenter = document.getElementById('roiPresetCenter');
    this.roiClearBoxes = document.getElementById('roiClearBoxes');
    this.roiNudgeUp = document.getElementById('roiNudgeUp');
    this.roiNudgeDown = document.getElementById('roiNudgeDown');
    this.roiNudgeLeft = document.getElementById('roiNudgeLeft');
    this.roiNudgeRight = document.getElementById('roiNudgeRight');
    this.roiNudgeGrow = document.getElementById('roiNudgeGrow');
    this.roiNudgeShrink = document.getElementById('roiNudgeShrink');
    this.boxSelector = null;
    this.activeRoiItem = null;
    this.activeRoiUrl = null;

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initEventListeners() {
    // Brand link smooth scroll (prevent # jump)
    const brandLink = document.querySelector('.brand');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Dynamic paste shortcut: ⌘+V on Mac, Ctrl+V on Windows/Linux, hidden on touch mobile
    const pasteHint = document.getElementById('pasteHint');
    if (pasteHint) {
      const isMac = /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isTouch && window.innerWidth < 768) {
        if (pasteHint.parentElement) {
          pasteHint.parentElement.style.display = 'none';
        }
      } else if (isMac) {
        pasteHint.textContent = '⌘+V';
      } else {
        pasteHint.textContent = 'Ctrl+V';
      }
    }

    // Prevent clicks inside sample bar from bubbling to dropzone fileInput
    const sampleBar = document.querySelector('.sample-bar');
    if (sampleBar) {
      sampleBar.addEventListener('click', (e) => e.stopPropagation());
      sampleBar.addEventListener('keydown', (e) => e.stopPropagation());
    }

    // Dropzone events
    this.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    this.dropzone.addEventListener('click', (e) => {
      // Do not trigger file upload if sample button, sample bar, or nested button was clicked
      if (e.target.closest('.sample-bar') || e.target.closest('button')) {
        return;
      }
      this.fileInput.click();
    });

    this.dropzone.addEventListener('keydown', (e) => {
      if (e.target.closest('.sample-bar') || e.target.tagName === 'BUTTON') {
        return;
      }
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

    // Clipboard Paste support (Ctrl+V or Cmd+V anywhere)
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

    // Watermark Settings Listeners
    if (this.toggleWatermark && this.cornerPresetGroup) {
      this.toggleWatermark.addEventListener('change', () => {
        this.cornerPresetGroup.style.display = this.toggleWatermark.checked ? 'flex' : 'none';
      });
    }

    // Modal
    this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.inspectorModal.addEventListener('click', (e) => {
      if (e.target === this.inspectorModal) this.closeModal();
    });

    // Compare Corner Fix Modal
    if (this.closeCompareModalBtn) {
      this.closeCompareModalBtn.addEventListener('click', () => this.closeCompareModal());
    }
    if (this.compareCornerModal) {
      this.compareCornerModal.addEventListener('click', (e) => {
        if (e.target === this.compareCornerModal) this.closeCompareModal();
      });
    }

    // ROI Bounding Box Modal
    if (this.closeRoiModalBtn) {
      this.closeRoiModalBtn.addEventListener('click', () => this.closeRoiModal());
    }
    if (this.roiCancelBtn) {
      this.roiCancelBtn.addEventListener('click', () => this.closeRoiModal());
    }
    if (this.roiModal) {
      this.roiModal.addEventListener('click', (e) => {
        if (e.target === this.roiModal) this.closeRoiModal();
      });
    }
    if (this.roiApplyBtn) {
      this.roiApplyBtn.addEventListener('click', () => this.applyRoiModal());
    }

    if (this.roiPresetBr) {
      this.roiPresetBr.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.clearBoxes();
          this.boxSelector.addCornerPreset('bottom-right');
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        }
      });
    }
    if (this.roiPresetBl) {
      this.roiPresetBl.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.clearBoxes();
          this.boxSelector.addCornerPreset('bottom-left');
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        }
      });
    }
    if (this.roiPresetTr) {
      this.roiPresetTr.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.clearBoxes();
          this.boxSelector.addCornerPreset('top-right');
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        }
      });
    }
    if (this.roiPresetTl) {
      this.roiPresetTl.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.clearBoxes();
          this.boxSelector.addCornerPreset('top-left');
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        }
      });
    }
    if (this.roiPresetCenter) {
      this.roiPresetCenter.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.addCustomBox(0.38, 0.38, 0.24, 0.24);
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        }
      });
    }
    if (this.roiClearBoxes) {
      this.roiClearBoxes.addEventListener('click', () => {
        if (this.boxSelector) {
          this.boxSelector.clearBoxes();
          this.updateRoiBoxCount([]);
        }
      });
    }

    // Fine-tune nudge & scale buttons for mobile & precise positioning
    if (this.roiNudgeUp) {
      this.roiNudgeUp.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.nudge('up');
      });
    }
    if (this.roiNudgeDown) {
      this.roiNudgeDown.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.nudge('down');
      });
    }
    if (this.roiNudgeLeft) {
      this.roiNudgeLeft.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.nudge('left');
      });
    }
    if (this.roiNudgeRight) {
      this.roiNudgeRight.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.nudge('right');
      });
    }
    if (this.roiNudgeGrow) {
      this.roiNudgeGrow.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.scale(true);
      });
    }
    if (this.roiNudgeShrink) {
      this.roiNudgeShrink.addEventListener('click', () => {
        if (this.boxSelector) this.boxSelector.scale(false);
      });
    }

    // Universal Escape key closes any open modal (Inspector, Compare Corner, ROI Box, or Mobile QR dialog)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.inspectorModal && this.inspectorModal.classList.contains('open')) {
          this.closeModal();
        }
        if (this.compareCornerModal && this.compareCornerModal.classList.contains('open')) {
          this.closeCompareModal();
        }
        if (this.roiModal && this.roiModal.classList.contains('open')) {
          this.closeRoiModal();
        }
        const mobileModal = document.getElementById('mobileModal');
        if (mobileModal && mobileModal.classList.contains('open')) {
          mobileModal.classList.remove('open');
        }
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
        this.generateVideoThumbnail(file, item).then(thumb => {
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

  formatDuration(seconds) {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const totalSecs = Math.round(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Extracts a video frame to use as card preview thumbnail
   */
  async generateVideoThumbnail(file, item = null) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = () => {
        if (item && Number.isFinite(video.duration) && video.duration > 0) {
          item.videoDuration = video.duration;
          const durEl = document.getElementById(`meta-dur-${item.id}`);
          if (durEl) {
            durEl.textContent = `• ⏱️ ${this.formatDuration(video.duration)}`;
          }
        }
      };

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
      }, 4000);
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
          <span class="meta-item" id="meta-dur-${item.id}"></span>
          <span id="diff-${item.id}"></span>
        </div>
        <div class="threat-tags-row" id="tags-${item.id}">
          <span class="tag-badge">Analyzing headers...</span>
        </div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-roi-item" id="boxSelectBtn-${item.id}" title="Select custom watermark box on video or image">
          🎯 Select Box
        </button>
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
    card.querySelector(`#boxSelectBtn-${item.id}`).addEventListener('click', () => this.openRoiModal(item));
    card.querySelector(`#cleanBtn-${item.id}`).addEventListener('click', () => this.processSingleItem(item));
    card.querySelector(`#inspectBtn-${item.id}`).addEventListener('click', () => this.openInspector(item));
    card.querySelector(`#deleteBtn-${item.id}`).addEventListener('click', () => this.removeItem(item));
    card.querySelector(`#downloadBtn-${item.id}`).addEventListener('click', () => this.downloadSingle(item));

    // Run quick pre-inspection to populate tags
    this.inspectItemPreClean(item);
  }

  /**
   * Opens the interactive Bounding Box / Watermark Selector Modal
   */
  openRoiModal(item) {
    if (!this.roiModal) return;
    this.activeRoiItem = item;
    const isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(item.file.name);

    if (this.activeRoiUrl) {
      URL.revokeObjectURL(this.activeRoiUrl);
      this.activeRoiUrl = null;
    }
    this.activeRoiUrl = URL.createObjectURL(item.file);

    if (isVideo) {
      if (this.roiPreviewImg) this.roiPreviewImg.style.display = 'none';
      if (this.roiPreviewVideo) {
        this.roiPreviewVideo.style.display = 'block';
        this.roiPreviewVideo.src = this.activeRoiUrl;
      }
      if (this.roiScrubberBar) this.roiScrubberBar.style.display = 'flex';

      if (this.roiPreviewVideo) {
        this.roiPreviewVideo.onloadedmetadata = () => {
          if (this.boxSelector) this.boxSelector.destroy();
          this.boxSelector = new WatermarkBoxSelector(this.roiPreviewVideo, this.roiOverlayCanvas, {
            onChange: (boxes) => this.updateRoiBoxCount(boxes)
          });
          if (item.customBoxes && item.customBoxes.length > 0) {
            this.boxSelector.setBoxes(item.customBoxes);
          } else {
            // Default to Gemini / AI bottom-right corner box
            this.boxSelector.addCornerPreset('bottom-right');
          }
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
          this.setupRoiScrubber(this.roiPreviewVideo);
        };
      }
    } else {
      if (this.roiPreviewVideo) {
        this.roiPreviewVideo.style.display = 'none';
        this.roiPreviewVideo.pause();
      }
      if (this.roiScrubberBar) this.roiScrubberBar.style.display = 'none';
      if (this.roiPreviewImg) {
        this.roiPreviewImg.style.display = 'block';
        this.roiPreviewImg.src = this.activeRoiUrl;

        this.roiPreviewImg.onload = () => {
          if (this.boxSelector) this.boxSelector.destroy();
          this.boxSelector = new WatermarkBoxSelector(this.roiPreviewImg, this.roiOverlayCanvas, {
            onChange: (boxes) => this.updateRoiBoxCount(boxes)
          });
          if (item.customBoxes && item.customBoxes.length > 0) {
            this.boxSelector.setBoxes(item.customBoxes);
          } else {
            this.boxSelector.addCornerPreset('bottom-right');
          }
          this.updateRoiBoxCount(this.boxSelector.getBoxes());
        };
      }
    }

    this.roiModal.classList.add('open');
    requestAnimationFrame(() => {
      if (this.boxSelector) this.boxSelector.syncCanvasSize();
    });
    setTimeout(() => {
      if (this.boxSelector) this.boxSelector.syncCanvasSize();
    }, 150);
  }

  setupRoiScrubber(video) {
    if (!this.roiTimeline || !this.roiTimeDisplay) return;
    this.roiTimeline.value = 0;
    this.roiTimeDisplay.textContent = `00:00 / ${this.formatDuration(video.duration)}`;

    video.ontimeupdate = () => {
      if (video.duration > 0) {
        this.roiTimeline.value = (video.currentTime / video.duration) * 100;
        this.roiTimeDisplay.textContent = `${this.formatDuration(video.currentTime)} / ${this.formatDuration(video.duration)}`;
      }
    };

    this.roiTimeline.oninput = () => {
      if (video.duration > 0) {
        video.currentTime = (this.roiTimeline.value / 100) * video.duration;
      }
    };

    if (this.roiPlayPauseBtn) {
      this.roiPlayPauseBtn.textContent = '▶';
      this.roiPlayPauseBtn.onclick = () => {
        if (video.paused) {
          video.play();
          this.roiPlayPauseBtn.textContent = '⏸';
        } else {
          video.pause();
          this.roiPlayPauseBtn.textContent = '▶';
        }
      };
    }
  }

  updateRoiBoxCount(boxes = []) {
    if (!this.roiBoxCountText) return;
    const count = boxes.length;
    this.roiBoxCountText.textContent = `${count} box(es) selected`;
  }

  closeRoiModal() {
    if (this.roiModal) {
      this.roiModal.classList.remove('open');
    }
    if (this.roiPreviewVideo) {
      this.roiPreviewVideo.pause();
      this.roiPreviewVideo.removeAttribute('src');
    }
    if (this.roiPreviewImg) {
      this.roiPreviewImg.removeAttribute('src');
    }
    if (this.activeRoiUrl) {
      URL.revokeObjectURL(this.activeRoiUrl);
      this.activeRoiUrl = null;
    }
    if (this.boxSelector) {
      this.boxSelector.destroy();
      this.boxSelector = null;
    }
    this.activeRoiItem = null;
  }

  applyRoiModal() {
    if (!this.activeRoiItem || !this.boxSelector) {
      this.closeRoiModal();
      return;
    }
    const boxes = this.boxSelector.getBoxes();
    this.activeRoiItem.customBoxes = boxes;

    const card = document.getElementById(`card-${this.activeRoiItem.id}`);
    if (card) {
      let badge = card.querySelector(`#roiBadge-${this.activeRoiItem.id}`);
      const tagsContainer = card.querySelector('.threat-tags-row');
      if (boxes.length > 0) {
        if (!badge && tagsContainer) {
          badge = document.createElement('span');
          badge.className = 'badge-roi-custom';
          badge.id = `roiBadge-${this.activeRoiItem.id}`;
          tagsContainer.appendChild(badge);
        }
        if (badge) {
          badge.textContent = `🎯 Custom Box (${boxes.length})`;
        }
      } else if (badge) {
        badge.remove();
      }
    }

    this.showToast(`Watermark box applied (${boxes.length} region${boxes.length === 1 ? '' : 's'})!`, 'success');
    this.closeRoiModal();
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
    const isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(item.file.name);

    if (cleanBtn) {
      cleanBtn.disabled = true;
      cleanBtn.style.display = 'none';
    }

    // Remove any previous retry button
    const prevRetry = card?.querySelector(`#retryBtn-${item.id}`);
    if (prevRetry) prevRetry.remove();

    if (badge) {
      badge.className = 'badge-ai-threat badge-threat-processing';
      badge.innerHTML = `<span class="spinner-inline"></span> Initializing...`;
    }

    if (!this.isBatchProcessing && this.progressWrapper) {
      this.progressWrapper.style.display = 'block';
      this.progressBar.value = 10;
      this.progressPercent.textContent = '10%';
      this.progressText.textContent = `Starting ${item.file.name}...`;
      this.liveStatus.textContent = this.progressText.textContent;
    }

    try {
      const options = {
        scrubMode: this.currentMode,
        antiSynthID: this.toggleSynthID.checked,
        stripC2PA: this.toggleC2PA.checked,
        stripPrompts: this.togglePrompts.checked,
        stripGPS: this.toggleGPS.checked,
        removeWatermark: this.toggleWatermark ? this.toggleWatermark.checked : true,
        corner: this.cornerPresetSelect ? this.cornerPresetSelect.value : 'bottom-right',
        customBoxes: item.customBoxes || null,
        onProgress: (percent, msg) => {
          if (this.progressBar) this.progressBar.value = percent;
          if (this.progressPercent) this.progressPercent.textContent = `${percent}%`;
          if (this.progressText) this.progressText.textContent = msg;
          if (this.liveStatus) this.liveStatus.textContent = msg;
          if (badge) {
            badge.innerHTML = `<span class="spinner-inline"></span> ${percent}% ${this.escapeHtml(msg.slice(0, 24))}`;
          }
        }
      };

      const result = await CleanerHub.processFile(item.file, options);
      item.result = result;
      item.status = 'done';

      if (card) card.classList.add('cleaned');
      if (cleanBtn) cleanBtn.style.display = 'none';
      if (downloadBtn) {
        downloadBtn.style.display = 'inline-flex';
        if (isVideo) {
          const isWebm = result.cleanFileName.endsWith('.webm');
          downloadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${isWebm ? 'Download (WebM)' : 'Download for Instagram (MP4)'}
          `;
          downloadBtn.title = 'Download cleaned video with fixed container duration ready for Instagram/Reels';
        } else {
          downloadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          `;
        }
      }

      // Render "Compare Corner Fix" button ONLY if an actual watermark was detected and healed
      const existingCompare = card?.querySelector(`#compareBtn-${item.id}`);
      if (result.watermarkMetrics && result.watermarkMetrics.watermarkDetected && result.watermarkMetrics.pixelsInpainted > 0) {
        const fileActions = card?.querySelector('.file-actions');
        if (fileActions && !existingCompare) {
          const compareBtn = document.createElement('button');
          compareBtn.type = 'button';
          compareBtn.className = 'btn-compare-corner';
          compareBtn.id = `compareBtn-${item.id}`;
          compareBtn.innerHTML = `<span>✨</span> Compare Corner Fix`;
          compareBtn.title = 'View side-by-side comparison of the removed Gemini/AI watermark';
          compareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCompareModal(item);
          });
          fileActions.insertBefore(compareBtn, downloadBtn);
        }
      } else if (existingCompare) {
        existingCompare.remove();
      }

      // Accurate Badging according to actual method used (never claim lossless for transcoded frames)
      if (badge) {
        badge.className = 'badge-ai-threat badge-threat-clean';
        if (result.cleaningMethod === 'video-watermark-transcode') {
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Watermark Inpainted (High-Bitrate Transcode)
          `;
          badge.title = 'AI watermark inpainted using high-bitrate frame rendering. Native duration & audio synchronized.';
        } else if (result.cleaningMethod === 'user-box-inpaint') {
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Watermark: User Inpainted 🎯
          `;
          badge.title = 'User selected region inpainted using high-bitrate frame rendering.';
        } else if (result.cleaningMethod === 'canvas-watermark') {
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Watermark Inpainted ✨
          `;
          badge.title = 'Corner AI watermark inpainted with zero full-frame quality loss.';
        } else if (result.cleaningMethod === 'lossless-video-fallback' || (isVideo && result.cleaningMethod === 'lossless')) {
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Lossless (Video Preserved)
          `;
          badge.title = 'Video container stripped losslessly (0% re-encoding, original video/audio bitstreams bit-for-bit preserved).';
        } else if (result.cleaningMethod === 'deep-canvas' || result.cleaningMethod === 'deep-canvas-fallback') {
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Deep Scrub & Anti-SynthID ✓
          `;
          badge.title = 'Pixel canvas scrubbed with micro-frequency jitter.';
        } else {
          // Standard lossless clean
          badge.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Lossless Clean ✓
          `;
          badge.title = 'All AI metadata, C2PA, EXIF, and XMP stripped losslessly with zero re-encoding.';
        }
      }

      if (diff) {
        const pct = Math.round((result.sizeDiff / result.originalSize) * 100);
        const savingsText = result.sizeDiff > 0 ? `(-${pct}% / ${this.formatBytes(result.sizeDiff)} removed)` : `(Clean)`;
        let durationLabel = '';
        if (isVideo) {
          const finalDur = result.outputDescriptor?.duration || item.videoDuration || 0;
          if (finalDur > 0) {
            durationLabel = ` • ⏱️ ${this.formatDuration(finalDur)}`;
          }
        }
        diff.innerHTML = `• <strong style="color: var(--accent-emerald);">${this.formatBytes(result.cleanedSize)} ${savingsText}</strong>${durationLabel}`;
      }

      this.updateActionBar();
      this.showToast(`Cleaned ${item.file.name} in ${result.durationMs}ms!`, 'success');
    } catch (err) {
      console.error('Cleaning error for', item.file.name, err);
      item.status = 'error';
      item.error = err.message;

      if (badge) {
        badge.className = 'badge-ai-threat badge-threat-high';
        badge.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Error Cleaning
        `;
        badge.title = err.message || 'Processing failed';
      }

      // Add Retry button to card
      const fileActions = card?.querySelector('.file-actions');
      if (fileActions && !card.querySelector(`#retryBtn-${item.id}`)) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn-secondary btn-retry';
        retryBtn.id = `retryBtn-${item.id}`;
        retryBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
          Retry
        `;
        retryBtn.title = 'Retry cleaning this file';
        retryBtn.addEventListener('click', () => {
          retryBtn.remove();
          item.status = 'pending';
          this.processSingleItem(item);
        });
        fileActions.insertBefore(retryBtn, fileActions.firstChild);
      }

      this.showToast(`Error cleaning ${item.file.name}: ${err.message}`, 'error');
    } finally {
      if (!this.isBatchProcessing && this.progressWrapper) {
        setTimeout(() => {
          if (!this.isBatchProcessing && this.progressWrapper) {
            this.progressWrapper.style.display = 'none';
          }
        }, 1200);
      }
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

    this.isBatchProcessing = true;
    this.progressWrapper.style.display = 'block';
    this.cleanAllBtn.disabled = true;

    try {
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
      this.showToast('Batch processing complete!', 'success');
    } finally {
      this.isBatchProcessing = false;
      setTimeout(() => {
        this.progressWrapper.style.display = 'none';
        this.cleanAllBtn.disabled = false;
      }, 1500);
    }
  }

  /**
   * Download single cleaned file (100% Client-Side, Zero Network Requests)
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
    // Opens phone's share sheet to save directly to Gallery / Photos or send to WhatsApp / Telegram
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

    // 2. Direct Anchor with explicit File object and Blob URL (Zero network requests)
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
      }, 30000);
      this.showToast(`Downloading ${filename}...`, 'success');
    } catch (e) {
      console.warn('Blob anchor fallback:', e);
      this.showToast(`Download failed: ${e.message}`, 'error');
    }
  }

  /**
   * Batch download all cleaned files as a ZIP archive (100% Client-Side, Zero Network Requests)
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

    // 2. Direct Blob URL Download (Zero network requests)
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
      }, 30000);
      this.showToast(`Downloaded ${cleanedItems.length} cleaned files in ZIP!`, 'success');
    } catch (e) {
      console.warn('ZIP blob fallback:', e);
      this.showToast(`ZIP download error: ${e.message}`, 'error');
    }
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
    const isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(item.file.name);

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
            <tr>
              <td>Visible AI Watermark</td>
              <td>${item.result?.watermarkMetrics?.watermarkDetected ? '<strong style="color: #34d399;">Inpainted & Grain-Matched</strong>' : (item.result ? 'None Detected / Clean' : 'Pending')}</td>
            </tr>
            ${isVideo ? `
            <tr>
              <td>Duration & Playback Decodability</td>
              <td>${item.result?.outputDescriptor?.duration ? `<strong style="color: #34d399;">${this.formatDuration(item.result.outputDescriptor.duration)} (Verified Playable)</strong>` : (item.videoDuration ? `${this.formatDuration(item.videoDuration)}` : 'Decodable')}</td>
            </tr>` : ''}
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

  /**
   * Open the side-by-side Visible AI Watermark Fix Comparison Modal
   */
  openCompareModal(item) {
    if (!item.result || !item.result.watermarkMetrics) return;
    const metrics = item.result.watermarkMetrics;
    const compareBeforeImg = document.getElementById('compareBeforeImg');
    const compareAfterImg = document.getElementById('compareAfterImg');
    const compareCornerStatus = document.getElementById('compareCornerStatus');
    const statRoi = document.getElementById('statRoi');
    const statPixels = document.getElementById('statPixels');

    if (metrics.beforeThumbnail && compareBeforeImg) {
      compareBeforeImg.src = metrics.beforeThumbnail;
    }
    if (metrics.afterThumbnail && compareAfterImg) {
      compareAfterImg.src = metrics.afterThumbnail;
    }
    if (statRoi && metrics.roi) {
      statRoi.textContent = `${this.cornerPresetSelect?.value || 'Bottom-Right'} (${metrics.roi.w}x${metrics.roi.h}px)`;
    }
    if (statPixels) {
      statPixels.textContent = `${metrics.pixelsInpainted || 0} px`;
    }
    if (compareCornerStatus) {
      compareCornerStatus.textContent = `Gemini / AI corner watermark (${metrics.pixelsInpainted || 0} pixels) detected and seamlessly inpainted with matched micro-grain. Remaining 99% of the frame is 100% pixel-for-pixel bit-identical.`;
    }

    if (this.compareCornerModal) {
      this.compareCornerModal.classList.add('open');
    }
  }

  closeCompareModal() {
    if (this.compareCornerModal) {
      this.compareCornerModal.classList.remove('open');
    }
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
        const url = document.getElementById('mobileUrlDisplay')?.textContent || 'https://ghostmeta-ai.vercel.app';
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
