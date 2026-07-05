class SoundSynthesizer {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private intervals: number[] = [];
  
  private humOscillators: OscillatorNode[] = [];
  private humGain: GainNode | null = null;
  
  private noiseGain: GainNode | null = null;


  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  
  private currentSoundType: string = 'none';
  private volumeLevel: number = 0.5;

  init() {
    if (this.audioCtx) return;
    
    // Create audio context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    this.audioCtx = new AudioContextClass();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.setValueAtTime(this.volumeLevel, this.audioCtx.currentTime);
    
    // Feedback Delay Network for space/reverb simulation
    this.delayNode = this.audioCtx.createDelay(1.0);
    this.delayGain = this.audioCtx.createGain();
    
    this.delayNode.delayTime.setValueAtTime(0.35, this.audioCtx.currentTime);
    this.delayGain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
    
    // Wire up master delay network
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.delayNode); // Feedback loop
    
    this.masterGain.connect(this.audioCtx.destination);
    this.delayGain.connect(this.masterGain);
  }

  setVolume(volume: number) {
    this.volumeLevel = volume;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.linearRampToValueAtTime(volume, this.audioCtx.currentTime + 0.1);
    }
  }

  resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  stopAll() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    
    this.activeNodes.forEach(node => {
      try {
        (node as any).stop?.();
      } catch (e) {}
      try {
        node.disconnect();
      } catch (e) {}
    });
    this.activeNodes = [];
    
    this.humOscillators = [];
    this.humGain = null;
    this.noiseGain = null;

    this.currentSoundType = 'none';
  }

  start(type: 'hum' | 'drips' | 'drone' | 'beeps' | 'synth' | 'crickets' | 'static') {
    this.init();
    this.resume();
    
    if (this.currentSoundType === type) return;
    this.stopAll();
    this.currentSoundType = type;
    
    if (!this.audioCtx || !this.masterGain) return;

    const ctx = this.audioCtx;

    switch (type) {
      case 'hum':
        this.createFluorescentHum(ctx);
        break;
      case 'drips':
        this.createWaterDrips(ctx);
        break;
      case 'drone':
        this.createIndustrialDrone(ctx);
        break;
      case 'beeps':
        this.createHospitalBeeps(ctx);
        break;
      case 'synth':
        this.createRetroSynthPad(ctx);
        break;
      case 'crickets':
        this.createCrickets(ctx);
        break;
      case 'static':
        this.createTvStatic(ctx);
        break;
    }
  }

  private createFluorescentHum(ctx: AudioContext) {
    // Fluorescent hum is 60Hz + harmonics (120Hz, 180Hz, 300Hz, etc.)
    const baseFreq = 60;
    const harmonics = [1, 2, 3, 5, 8];
    
    this.humGain = ctx.createGain();
    this.humGain.gain.setValueAtTime(0.15, ctx.currentTime);
    this.humGain.connect(this.masterGain!);
    
    harmonics.forEach((h, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq * h, ctx.currentTime);
      
      const gain = ctx.createGain();
      // Higher harmonics are quieter
      gain.gain.setValueAtTime(0.08 / (h * 0.8), ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(this.humGain!);
      
      osc.start();
      this.humOscillators.push(osc);
      this.activeNodes.push(osc);
    });

    // Add a tiny buzz frequency modulation (LFO)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(8, ctx.currentTime); // 8Hz flicker
    lfoGain.gain.setValueAtTime(1.5, ctx.currentTime); // strength of frequency flicker
    
    lfo.connect(lfoGain);
    this.humOscillators.forEach(osc => {
      lfoGain.connect(osc.frequency);
    });
    lfo.start();
    this.activeNodes.push(lfo);

    // Add a periodic volume sputter/flicker
    const volumeLfo = ctx.createOscillator();
    const volumeLfoGain = ctx.createGain();
    volumeLfo.frequency.setValueAtTime(15, ctx.currentTime);
    volumeLfoGain.gain.setValueAtTime(0.04, ctx.currentTime);
    volumeLfo.connect(volumeLfoGain);
    volumeLfoGain.connect(this.humGain.gain);
    volumeLfo.start();
    this.activeNodes.push(volumeLfo);
  }

  private createWaterDrips(ctx: AudioContext) {
    // Start a continuous low-level humid hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(45, ctx.currentTime); // sub bass hum
    const humGainNode = ctx.createGain();
    humGainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    hum.connect(humGainNode);
    humGainNode.connect(this.masterGain!);
    hum.start();
    this.activeNodes.push(hum);

    // Dynamic water dripping loop
    const scheduleDrip = () => {
      if (this.currentSoundType !== 'drips') return;

      const dripTime = ctx.currentTime + Math.random() * 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // A water drip is a fast sine wave pitch sweep from high to medium
      const startFreq = 900 + Math.random() * 600;
      const endFreq = 400 + Math.random() * 200;
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, dripTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, dripTime + 0.08);
      
      gain.gain.setValueAtTime(0.0, dripTime);
      gain.gain.linearRampToValueAtTime(0.08, dripTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, dripTime + 0.12);
      
      osc.connect(gain);
      
      // Connect to the delay node for huge warehouse echo
      if (this.delayNode) {
        gain.connect(this.delayNode);
      }
      gain.connect(this.masterGain!);
      
      osc.start(dripTime);
      osc.stop(dripTime + 0.2);
      
      // Set next drip timeout
      const nextTime = 1200 + Math.random() * 3000;
      const id = window.setTimeout(scheduleDrip, nextTime);
      this.intervals.push(id);
    };

    scheduleDrip();
  }

  private createIndustrialDrone(ctx: AudioContext) {
    // Create a deep rumble with a low pass filtered noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Generate pinkish noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 * 0.5362;
      output[i] *= 0.11; // rough compensation
      b6 = white * 0.115926;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    
    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(80, ctx.currentTime); // very low bass rumble
    
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
    
    noise.connect(lpFilter);
    lpFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain!);
    noise.start();
    
    this.activeNodes.push(noise);
    
    // Add industrial machine hums (overlapping oscillators)
    const machineryFreqs = [52, 78, 104, 156];
    machineryFreqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(8, ctx.currentTime);
      filter.frequency.setValueAtTime(freq, ctx.currentTime);
      
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.015, ctx.currentTime);
      
      // LFO modulation to simulate rotating engine cycles
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.2 + Math.random() * 0.3, ctx.currentTime);
      const lfoG = ctx.createGain();
      lfoG.gain.setValueAtTime(0.01, ctx.currentTime);
      
      lfo.connect(lfoG);
      lfoG.connect(oscGain.gain);
      lfo.start();
      this.activeNodes.push(lfo);
      
      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(this.masterGain!);
      osc.start();
      
      this.activeNodes.push(osc);
    });
  }

  private createHospitalBeeps(ctx: AudioContext) {
    // Standard sterile background hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(100, ctx.currentTime);
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.04, ctx.currentTime);
    hum.connect(humGain);
    humGain.connect(this.masterGain!);
    hum.start();
    this.activeNodes.push(hum);

    // Beep loop
    const scheduleBeep = () => {
      if (this.currentSoundType !== 'beeps') return;
      
      const beepTime = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      // 1000Hz clear medical beep
      osc.frequency.setValueAtTime(1000, beepTime);
      
      gain.gain.setValueAtTime(0.0, beepTime);
      gain.gain.linearRampToValueAtTime(0.04, beepTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, beepTime + 0.15);
      
      osc.connect(gain);
      
      if (this.delayNode) {
        gain.connect(this.delayNode);
      }
      gain.connect(this.masterGain!);
      
      osc.start(beepTime);
      osc.stop(beepTime + 0.2);
      
      const nextTime = 4000 + Math.random() * 2000;
      const id = window.setTimeout(scheduleBeep, nextTime);
      this.intervals.push(id);
    };

    scheduleBeep();
  }

  private createRetroSynthPad(ctx: AudioContext) {
    // Generate a deep ambient synthetic synth pad
    const chords = [
      [110.00, 138.61, 164.81], // A major
      [98.00, 116.54, 146.83],  // G minor
      [87.31, 110.00, 130.81]   // F major
    ];
    
    let chordIndex = 0;
    
    const playChord = () => {
      if (this.currentSoundType !== 'synth') return;
      
      const chord = chords[chordIndex];
      const now = ctx.currentTime;
      const duration = 5.0; // 5 seconds per chord
      
      const oscillators: OscillatorNode[] = [];
      const chordGain = ctx.createGain();
      chordGain.gain.setValueAtTime(0, now);
      chordGain.gain.linearRampToValueAtTime(0.06, now + 1.5); // Attack
      chordGain.gain.setValueAtTime(0.06, now + duration - 1.5);
      chordGain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // Release
      
      chordGain.connect(this.masterGain!);
      if (this.delayNode) {
        chordGain.connect(this.delayNode);
      }
      
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        
        // Detune slightly for chorus effect
        osc.detune.setValueAtTime((Math.random() - 0.5) * 12, now);
        
        osc.connect(chordGain);
        osc.start(now);
        osc.stop(now + duration);
        oscillators.push(osc);
      });
      
      chordIndex = (chordIndex + 1) % chords.length;
      
      const id = window.setTimeout(playChord, (duration - 1.0) * 1000);
      this.intervals.push(id);
    };
    
    playChord();
  }

  private createCrickets(ctx: AudioContext) {
    // Eerie wind hum
    const wind = ctx.createOscillator();
    wind.type = 'triangle';
    wind.frequency.setValueAtTime(90, ctx.currentTime);
    const windG = ctx.createGain();
    windG.gain.setValueAtTime(0.03, ctx.currentTime);
    
    // Slow LFO for wind gust swelling
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.1, ctx.currentTime);
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(0.02, ctx.currentTime);
    lfo.connect(lfoG);
    lfoG.connect(windG.gain);
    lfo.start();
    this.activeNodes.push(lfo);
    
    wind.connect(windG);
    windG.connect(this.masterGain!);
    wind.start();
    this.activeNodes.push(wind);

    // Chirping crickets simulation
    const scheduleCricket = () => {
      if (this.currentSoundType !== 'crickets') return;

      const now = ctx.currentTime;
      const numChirps = 3 + Math.floor(Math.random() * 4);
      let timeOffset = 0;

      for (let i = 0; i < numChirps; i++) {
        const osc = ctx.createOscillator();
        const bandpass = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(4500, now + timeOffset); // high pitch cricket sound
        
        bandpass.type = 'bandpass';
        bandpass.Q.setValueAtTime(15, now + timeOffset);
        bandpass.frequency.setValueAtTime(4500, now + timeOffset);

        // Fast envelope for a single cricket click
        gain.gain.setValueAtTime(0.0, now + timeOffset);
        gain.gain.linearRampToValueAtTime(0.015, now + timeOffset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + timeOffset + 0.04);

        osc.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(this.masterGain!);
        
        osc.start(now + timeOffset);
        osc.stop(now + timeOffset + 0.06);

        timeOffset += 0.07; // delay between clicks in a chirp
      }

      const nextChirp = 1500 + Math.random() * 3000;
      const id = window.setTimeout(scheduleCricket, nextChirp);
      this.intervals.push(id);
    };

    scheduleCricket();
  }

  private createTvStatic(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(1.0, ctx.currentTime);
    
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.04, ctx.currentTime);
    
    // Crackle glitch oscillator
    const crackle = ctx.createOscillator();
    crackle.type = 'triangle';
    crackle.frequency.setValueAtTime(4, ctx.currentTime); // LFO at 4Hz
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.03, ctx.currentTime);
    
    crackle.connect(crackleGain);
    crackleGain.connect(this.noiseGain.gain);
    
    noise.connect(filter);
    filter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain!);
    
    noise.start();
    crackle.start();
    
    this.activeNodes.push(noise);
    this.activeNodes.push(crackle);
  }

  // Trigger a synchronized light crackle spark sound effect
  triggerLightCrackle(volumeScale: number = 1.0) {
    // No-op (removed at user request)
  }

  // Generate a terrifying glitch overlay sound when entity is nearby
  triggerEntityGlitch() {
    if (!this.audioCtx || !this.masterGain) return;
    
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    
    const glitchOsc = ctx.createOscillator();
    glitchOsc.type = 'sawtooth';
    glitchOsc.frequency.setValueAtTime(80, now);
    glitchOsc.frequency.linearRampToValueAtTime(30, now + 0.4);
    
    const glitchFilter = ctx.createBiquadFilter();
    glitchFilter.type = 'lowpass';
    glitchFilter.frequency.setValueAtTime(300, now);
    
    const glitchGain = ctx.createGain();
    glitchGain.gain.setValueAtTime(0.0, now);
    glitchGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    glitchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    
    glitchOsc.connect(glitchFilter);
    glitchFilter.connect(glitchGain);
    glitchGain.connect(this.masterGain);
    
    glitchOsc.start(now);
    glitchOsc.stop(now + 0.6);
  }
}

export const Synthesizer = new SoundSynthesizer();
export default Synthesizer;
