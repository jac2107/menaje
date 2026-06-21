// Menaje login background — Warp shader (@paper-design/shaders-react) loaded via CDN,
// with an animated CSS gradient fallback in the brand palette if the CDN is unreachable.
(function () {
  if (customElements.get('warp-bg')) return;

  const PALETTE = ['#121358', '#232f72', '#2f578a', '#36ada3'];

  // inject keyframes for the fallback drift (once)
  if (!document.getElementById('warp-bg-kf')) {
    const s = document.createElement('style');
    s.id = 'warp-bg-kf';
    s.textContent =
      '@keyframes warpDrift{0%{background-position:0% 0%,100% 0%,50% 100%}' +
      '50%{background-position:100% 50%,0% 100%,50% 0%}' +
      '100%{background-position:0% 0%,100% 0%,50% 100%}}';
    document.head.appendChild(s);
  }

  class WarpBg extends HTMLElement {
    connectedCallback() {
      this.style.position = 'absolute';
      this.style.inset = '0';
      this.style.display = 'block';
      this.style.overflow = 'hidden';
      // immediate fallback paint
      this.style.background =
        'radial-gradient(120% 120% at 12% 18%, #232f72 0%, rgba(35,47,114,0) 55%),' +
        'radial-gradient(120% 120% at 88% 22%, #2f578a 0%, rgba(47,87,138,0) 55%),' +
        'radial-gradient(140% 140% at 50% 120%, #36ada3 0%, rgba(54,173,163,0) 50%),' +
        'linear-gradient(135deg, #0e1147 0%, #121358 45%, #1d2a66 100%)';
      this.style.backgroundSize = '160% 160%,160% 160%,160% 160%,100% 100%';
      this.style.animation = 'warpDrift 22s ease-in-out infinite';

      this.mountShader();
    }

    async mountShader() {
      try {
        const [React, ReactDOMClient, shaders] = await Promise.all([
          import('https://esm.sh/react@18.3.1'),
          import('https://esm.sh/react-dom@18.3.1/client'),
          import('https://esm.sh/@paper-design/shaders-react@0.0.46?deps=react@18.3.1,react-dom@18.3.1')
        ]);
        const Warp = shaders.Warp;
        if (!Warp) throw new Error('Warp export missing');

        const mount = document.createElement('div');
        mount.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity .9s ease';
        this.appendChild(mount);

        ReactDOMClient.createRoot(mount).render(
          React.createElement(Warp, {
            style: { height: '100%', width: '100%' },
            proportion: 0.42,
            softness: 1,
            distortion: 0.28,
            swirl: 0.85,
            swirlIterations: 10,
            shape: 'checks',
            shapeScale: 0.1,
            scale: 1,
            rotation: 0,
            speed: 0.65,
            colors: PALETTE
          })
        );
        // reveal once the canvas has had a moment to paint, then drop the gradient anim
        requestAnimationFrame(() => {
          setTimeout(() => {
            mount.style.opacity = '1';
            this.style.animation = 'none';
          }, 120);
        });
      } catch (e) {
        console.warn('[warp-bg] shader unavailable, using gradient fallback:', e && e.message);
      }
    }
  }

  customElements.define('warp-bg', WarpBg);
})();
