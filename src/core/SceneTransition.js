export class SceneTransition {
  static async fadeIn(duration) {
    if (this._activeTransition) {
      await this._activeTransition;
    }
    return this._activeTransition = this._createOverlay(true, duration);
  }

  static async fadeOut(duration) {
    if (this._activeTransition) {
      await this._activeTransition;
    }
    return this._activeTransition = this._createOverlay(false, duration);
  }

  static async _createOverlay(fadeIn, duration) {
    return new Promise((resolve) => {
      // Remove existing overlay if any
      const existing = document.getElementById('scene-transition-overlay');
      if (existing) document.body.removeChild(existing);

      // Create new overlay
      const overlay = document.createElement('div');
      overlay.id = 'scene-transition-overlay';
      Object.assign(overlay.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        opacity: fadeIn ? '0' : '1',
        transition: `opacity ${duration}ms ease-in-out`,
        zIndex: 9999,
        pointerEvents: 'none'
      });

      document.body.appendChild(overlay);

      // Force repaint
      overlay.getBoundingClientRect();

      // Start transition
      overlay.style.opacity = fadeIn ? '1' : '0';

      const onTransitionEnd = () => {
        overlay.removeEventListener('transitionend', onTransitionEnd);
        if (!fadeIn) document.body.removeChild(overlay);
        this._activeTransition = null;
        resolve();
      };

      overlay.addEventListener('transitionend', onTransitionEnd);
    });
  }
}