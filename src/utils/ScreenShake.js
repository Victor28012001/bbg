export class ScreenShake {
    static shake(intensity = 10, duration = 500) {
      // Create shake element dynamically
      const shakeElement = document.createElement('div');
      shakeElement.id = 'shake-effect';
      shakeElement.style.position = 'absolute';
      shakeElement.style.top = '0';
      shakeElement.style.left = '0';
      shakeElement.style.width = '100%';
      shakeElement.style.height = '100%';
      shakeElement.style.pointerEvents = 'none'; // Don't block user interaction
      document.body.appendChild(shakeElement);
  
      // Add shake animation
      shakeElement.style.animation = `shakeAnimation ${duration}ms ease`;
  
      // Remove after animation ends
      shakeElement.addEventListener('animationend', () => {
        shakeElement.remove();
      });
  
      // Trigger shake with keyframes animation
      const styleSheet = document.styleSheets[0];
      styleSheet.insertRule(`
        @keyframes shakeAnimation {
          0% { transform: translate(0px, 0px); }
          25% { transform: translate(${intensity}px, ${intensity}px); }
          50% { transform: translate(-${intensity}px, -${intensity}px); }
          75% { transform: translate(${intensity}px, -${intensity}px); }
          100% { transform: translate(0px, 0px); }
        }
      `, styleSheet.cssRules.length);
    }
  }
  