# GhostMeta AI 🛡️

**Client-Side AI Metadata & C2PA Provenance Stripper for Images and Videos**

GhostMeta AI removes AI-generated metadata, cryptographically signed C2PA Content Credentials, generative prompts, node workflows, and tracking signatures from images and videos. Everything runs **100% in your local browser** with zero cloud uploads or third-party tracking.

---

## 🚀 Features

- **Multi-Format Coverage**:
  - **Images**: JPEG, PNG, WebP, AVIF, TIFF, GIF
  - **Videos**: MP4, MOV, WebM, M4V
- **AI Provenance & Signature Eradication**:
  - **OpenAI (ChatGPT, DALL·E 3, Sora)**: Strips C2PA JUMBF manifests, claim generators, description prompts.
  - **Google DeepMind (Gemini, Imagen, Veo)**: Strips IPTC `trainedAlgorithmicMedia` digital source type and neutralizes SynthID frequency watermarks.
  - **Midjourney**: Strips prompt parameters (`--v`, `--ar`, job ID, seed).
  - **Stable Diffusion, Automatic1111, ComfyUI, Fooocus**: Strips prompt, negative prompt, model hash, and complete ComfyUI node graph JSON.
  - **AI Video (Runway Gen-2/Gen-3, Pika, Hailuo, Sora)**: Cleans MP4 `moov > udta` and `uuid` metadata boxes without re-encoding or corrupting playback offsets.
- **Dual Scrubbing Engines**:
  - **1. Lossless Container Stripper (Recommended)**: Bit-for-bit zero quality loss. Removes metadata headers while keeping compressed pixel/video streams 100% identical.
  - **2. Deep Canvas Scrub & Anti-SynthID**: Re-renders image on a pure Canvas pixel buffer with imperceptible micro-frequency jitter to disrupt spectral watermarks (SynthID).
- **AI Threat Radar & Metadata Inspector**:
  - Live inspection modal with tabs: AI Threat Radar, Prompts & Parameters (with 1-click prompt copying), Before vs After comparison diff, and raw marker findings.
- **Batch Processing & ZIP Export**:
  - Drag & drop multiple files, paste images directly from clipboard (<kbd>Ctrl+V</kbd>), clean all files in bulk, and download everything as a `.zip` archive.
- **1-Click Built-in Test Samples**:
  - Test Stable Diffusion PNG, ChatGPT/Gemini JPG, and AI Video MP4 instantly with a single click.

---

## 💻 Running Locally

To run the application locally:

```bash
# Start the local web server
npm start
# or
npx serve . -l 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔒 100% Private Architecture

No files are ever uploaded to any server. All container parsing (JPEG APP markers, PNG chunks, WebP RIFF atoms, ISOBMFF MP4 boxes) is performed in client-side JavaScript using native `ArrayBuffer` and `DataView` APIs.
