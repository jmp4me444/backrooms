// Nintendo Switch Joy-Con & Pro Controller Gamepad Manager
export interface GamepadState {
  connected: boolean;
  name: string;
  moveX: number; // Left Stick X (-1 to 1)
  moveZ: number; // Left Stick Y (-1 to 1)
  lookYaw: number; // Right Stick X (-1 to 1)
  lookPitch: number; // Right Stick Y (-1 to 1)
  hammerPressed: boolean; // ZR or A button
  flashlightPressed: boolean; // ZL or X button
  pausePressed: boolean; // Plus (+) button
}

class GamepadManager {
  private isConnected = false;
  private gamepadName = '';
  private prevHammer = false;
  private prevFlashlight = false;
  private prevPause = false;

  constructor() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected:', e.gamepad.id);
      this.isConnected = true;
      this.gamepadName = e.gamepad.id;
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('Gamepad disconnected:', e.gamepad.id);
      this.isConnected = false;
      this.gamepadName = '';
    });
  }

  public poll(): GamepadState {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let activePad: Gamepad | null = null;

    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]?.connected) {
        activePad = gamepads[i];
        break;
      }
    }

    if (!activePad) {
      return {
        connected: false,
        name: '',
        moveX: 0,
        moveZ: 0,
        lookYaw: 0,
        lookPitch: 0,
        hammerPressed: false,
        flashlightPressed: false,
        pausePressed: false,
      };
    }

    // Apply stick deadzones to prevent drift
    const applyDeadzone = (val: number, deadzone = 0.15): number => {
      if (Math.abs(val) < deadzone) return 0;
      return (val - Math.sign(val) * deadzone) / (1 - deadzone);
    };

    const moveX = applyDeadzone(activePad.axes[0] || 0);
    const moveZ = applyDeadzone(activePad.axes[1] || 0);
    const lookYaw = applyDeadzone(activePad.axes[2] || 0);
    const lookPitch = applyDeadzone(activePad.axes[3] || 0);

    // Nintendo Switch Button mapping
    // ZR (Trigger 7) or Button 0 (A/B) for Hammer
    const hammerDown = Boolean(
      activePad.buttons[7]?.pressed || 
      activePad.buttons[0]?.pressed ||
      activePad.buttons[5]?.pressed
    );
    
    // ZL (Trigger 6) or Button 3 (X/Y) for Flashlight
    const flashlightDown = Boolean(
      activePad.buttons[6]?.pressed || 
      activePad.buttons[3]?.pressed ||
      activePad.buttons[4]?.pressed
    );

    // Plus (+) Button (9) for Pause/Menu
    const pauseDown = Boolean(activePad.buttons[9]?.pressed);

    // Edge triggers (only trigger once per press)
    const hammerJustPressed = hammerDown && !this.prevHammer;
    const flashlightJustPressed = flashlightDown && !this.prevFlashlight;
    const pauseJustPressed = pauseDown && !this.prevPause;

    this.prevHammer = hammerDown;
    this.prevFlashlight = flashlightDown;
    this.prevPause = pauseDown;

    return {
      connected: true,
      name: activePad.id,
      moveX,
      moveZ,
      lookYaw,
      lookPitch,
      hammerPressed: hammerJustPressed,
      flashlightPressed: flashlightJustPressed,
      pausePressed: pauseJustPressed,
    };
  }
}

export const SwitchGamepad = new GamepadManager();
