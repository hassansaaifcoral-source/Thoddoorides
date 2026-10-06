/**
 * <image-slot> — a lightweight custom element used throughout the site for
 * photos. If a usable `src` is provided it shows the image (cropped per the
 * `fit` attribute); otherwise it shows a labelled placeholder. Images that
 * fail to load fall back to the placeholder gracefully, so missing uploads
 * never break the layout.
 *
 * Attributes: src, placeholder, fit ("cover" | "contain"), shape ("rect" | "round").
 * You can also set images at runtime:  document.getElementById('hero-snap').src = '...'
 */
(function () {
  'use strict';

  const PH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/>' +
    '<path d="M21 16l-5-5L5 20"/></svg>';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'placeholder', 'fit', 'shape'];
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    get src() {
      return this.getAttribute('src');
    }
    set src(v) {
      if (v == null || v === '') this.removeAttribute('src');
      else this.setAttribute('src', v);
    }

    render() {
      const src = this.getAttribute('src');
      const fit = this.getAttribute('fit') === 'contain' ? 'contain' : 'cover';
      const placeholder = this.getAttribute('placeholder') || 'Photo';
      this.classList.add('image-slot');
      if (this.getAttribute('shape') === 'round') this.classList.add('is-round');

      if (src) {
        const img = document.createElement('img');
        img.alt = this.getAttribute('alt') || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.cssText =
          'width:100%;height:100%;display:block;object-fit:' + fit + ';';
        img.addEventListener('error', () => this.renderPlaceholder(placeholder));
        this.replaceChildren(img);
        img.src = src;
      } else {
        this.renderPlaceholder(placeholder);
      }
    }

    renderPlaceholder(text) {
      const box = document.createElement('div');
      box.className = 'image-slot-ph';
      box.innerHTML = PH_ICON + '<span></span>';
      box.querySelector('span').textContent = text;
      this.replaceChildren(box);
    }
  }

  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();
