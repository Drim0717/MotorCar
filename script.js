document.addEventListener('DOMContentLoaded', () => {
    // Canvas & UI Elements
    const speedValueEl = document.getElementById('speed-value');
    const speedProgress = document.getElementById('speed-progress');
    const toggleBtn = document.getElementById('toggle-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const volumeSlider = document.getElementById('volume-slider');
    const engineTypeSelector = document.getElementById('engine-type');
    const testBtn = document.getElementById('test-btn');

    // State
    let isRunning = false;
    let currentSpeed = 0; // km/h
    let targetSpeed = 0;
    let isTesting = false;

    // Audio Context
    let audioCtx;
    let mainGain;
    let engineNodes = []; // Store active audio nodes
    let noiseBuffer; // Shared buffer for noise

    // Constants
    const MAX_SPEED = 240; // km/h (Increased specifically for Tesla)
    const CIRCUMFERENCE = 2 * Math.PI * 45; // 282.74...

    // Initialize UI
    speedProgress.style.strokeDashoffset = CIRCUMFERENCE;
    speedProgress.style.strokeDasharray = CIRCUMFERENCE;

    // Logic: Smooth speed transition
    setInterval(() => {
        let activeTarget = targetSpeed;

        // Manual override for testing
        if (isTesting) {
            activeTarget = MAX_SPEED * 0.8; // Target 80% speed when held
        }

        // Interpolate current speed towards target speed for smoothness
        const diff = activeTarget - currentSpeed;

        if (isTesting) {
            // Accelerate faster when testing
            currentSpeed += diff * 0.05;
        } else {
            // Normal GPS smoothing
            if (Math.abs(diff) > 0.5) {
                currentSpeed += diff * 0.15;
            } else {
                currentSpeed = activeTarget;
            }
        }

        updateUI(currentSpeed);
        if (isRunning) {
            updateEngineSound(currentSpeed);
        }
    }, 50); // 20fps update

    // GPS Tracking
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((position) => {
            if (!isTesting) {
                // position.coords.speed is in m/s. 
                const speedMs = position.coords.speed || 0;
                targetSpeed = (speedMs * 3.6); // Convert to km/h
            }

            // Debugging: If speed is 0 but accuracy is high, we are stopped.
            // console.log(`GPS Speed: ${targetSpeed.toFixed(1)} km/h`);
        }, (err) => {
            console.warn('GPS Error:', err);
            statusIndicator.innerText = "GPS ERR";
            statusIndicator.style.color = "red";
        }, {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 5000
        });
    } else {
        // alert("Tu navegador no soporta Geolocation. La app no funcionará correctamente.");
    }

    // Audio Engine Setup
    function initAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // Generate Brown/Pink Noise Buffer
        const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Simple Brown Noise filter
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // Gain compensation
        }

        // Master Gain
        mainGain = audioCtx.createGain();
        mainGain.gain.value = volumeSlider.value;
        mainGain.connect(audioCtx.destination);
    }

    function createEngineSound() {
        // Stop previous if exists
        stopEngine();

        if (!audioCtx) initAudio();

        const type = engineTypeSelector.value;
        engineNodes = [];

        if (type === 'v8') {
            // V8 Realistic Model:
            // 1. Rumble: Low freq Sawtooth
            // 2. Texture: Noise modulated by the Rumble
            // 3. Whaaa: Bandpass filter moving with RPM

            // Fundamental Frequency Control (The "RPM")
            // Node 1: Rumble Oscillator
            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = 50; // Idle

            // Node 2: Noise Source
            const noise = audioCtx.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.loop = true;

            // Node 3: Noise Gain (Modulated by Osc)
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.value = 0;

            // Filter for the noise (Exhaust tone)
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 400;

            // Connect: Noise -> Filter -> NoiseGain -> MainGain
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(mainGain);

            // Connect: Osc -> Modulate Noise Gain
            // This creates the "chug chug" as the saw wave peaks open the gate
            const modGain = audioCtx.createGain();
            modGain.gain.value = 0.5; // Modulation depth
            osc.connect(modGain);
            modGain.connect(noiseGain.gain);

            // Also connect Osc directly for the "body" sound, but lowpassed
            const oscFilter = audioCtx.createBiquadFilter();
            oscFilter.type = 'lowpass';
            oscFilter.frequency.value = 120;
            const oscOutGain = audioCtx.createGain();
            oscOutGain.gain.value = 0.3;

            osc.connect(oscFilter);
            oscFilter.connect(oscOutGain);
            oscOutGain.connect(mainGain);

            osc.start();
            noise.start();

            engineNodes.push({
                type: 'v8',
                osc,
                noise,
                noiseFilter,
                oscFilter,
                masterGain: mainGain
            });

        } else if (type === 'revuelto') {
            // Lamborghini Revuelto: V12 Hybrid
            // Characteristic: Smooth, screaming high-pitch, very rich harmonics.
            // We use stacked oscillators at specific intervals to create that "chord" of a V12.

            // Major components: Fundamental, Octave, and a Fifth for texture.
            const harmonics = [1, 2, 3];

            harmonics.forEach((h, index) => {
                const osc = audioCtx.createOscillator();
                osc.type = index === 0 ? 'sawtooth' : 'triangle'; // Saw for base, Triangle for singing highs
                osc.frequency.value = 100 * h;

                const gain = audioCtx.createGain();
                // Higher harmonics are quieter but present
                gain.gain.value = 0.15 / (index === 0 ? 1 : 1.5);

                // We add a distortion/filter effect for the "rasp"
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 800; // Starting muffled

                // Chain: Osc -> Filter -> Gain -> Main
                osc.disconnect();
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(mainGain);

                osc.start();

                // Store nodes for update
                engineNodes.push({ type: 'revuelto', node: osc, filter, ratio: h, gainNode: gain });
            });

        } else if (type === 'f1') {
            // F1: Multiple Sawtooths, High Pitch, Distortion
            const fundamental = 100;
            const harmonics = [1, 1.5, 2, 2.5]; // High harmonics

            harmonics.forEach((h, index) => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = fundamental * h;

                const gain = audioCtx.createGain();
                gain.gain.value = 0.15 / (index + 1);

                osc.connect(gain);
                gain.connect(mainGain);
                osc.start();

                engineNodes.push({ type: 'f1', node: osc, ratio: h, gainNode: gain });
            });

        } else if (type === 'spaceship') {
            // Sci-fi: Sine + FM Synthesis
            const osc = audioCtx.createOscillator(); // Carrier
            osc.type = 'sine';

            const lfo = audioCtx.createOscillator(); // Modulator
            lfo.type = 'triangle';
            lfo.frequency.value = 10;

            const lfoGain = audioCtx.createGain();
            lfoGain.gain.value = 50;

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'peaking';
            filter.Q.value = 5;

            osc.connect(filter);
            filter.connect(mainGain);

            osc.start();
            lfo.start();

            engineNodes.push({ type: 'spaceship', osc, lfo, filter, lfoGain });
        }
    }

    function stopEngine() {
        engineNodes.forEach(obj => {
            // Safely stop all nodes
            try { if (obj.osc) { obj.osc.stop(); obj.osc.disconnect(); } } catch (e) { }
            try { if (obj.noise) { obj.noise.stop(); obj.noise.disconnect(); } } catch (e) { }
            try { if (obj.node) { obj.node.stop(); obj.node.disconnect(); } } catch (e) { }
            try { if (obj.lfo) { obj.lfo.stop(); obj.lfo.disconnect(); } } catch (e) { }
        });
        engineNodes = [];
    }

    function updateEngineSound(speed) {
        if (!audioCtx || engineNodes.length === 0) return;

        const type = engineNodes[0].type;

        // Calculate abstract "RPM"
        // Idle: 800 RPM. Max: 8000 RPM.
        // NormSpeed 0..1
        const normSpeed = Math.min(speed / MAX_SPEED, 1.0);
        const rpm = 800 + (normSpeed * 7200);

        if (type === 'v8') {
            const params = engineNodes[0];

            // V8 Frequency Calculation:
            // The dominant freq is roughly RPM/30
            const mainFreq = rpm / 25;

            params.osc.frequency.setTargetAtTime(mainFreq, audioCtx.currentTime, 0.1);

            // Filter opens with speed
            const filterFreq = 300 + (normSpeed * 4000);
            params.noiseFilter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.1);
            params.oscFilter.frequency.setTargetAtTime(mainFreq * 2, audioCtx.currentTime, 0.1);

        } else if (type === 'revuelto') {
            // V12 Revuelto Logic
            // Idle is higher than V8. Redline is very high (9500 RPM).
            // Smooth transition.

            const baseFreq = 120 + (normSpeed * 700); // 120Hz idle -> ~800Hz base (creating 2.4kHz harmonic scream)
            const filterCutoff = 800 + (normSpeed * 10000); // Filter opens WIDE

            engineNodes.forEach(item => {
                if (item.node) {
                    item.node.frequency.setTargetAtTime(baseFreq * item.ratio, audioCtx.currentTime, 0.1);
                    // Filter opening
                    item.filter.frequency.setTargetAtTime(filterCutoff, audioCtx.currentTime, 0.1);
                }
            });

        } else if (type === 'f1') {
            // F1: High-revving
            const baseFreq = 150 + (normSpeed * 600);

            engineNodes.forEach(item => {
                if (item.node) {
                    item.node.frequency.setTargetAtTime(baseFreq * item.ratio, audioCtx.currentTime, 0.1);
                }
            });

        } else if (type === 'spaceship') {
            const params = engineNodes[0];
            const baseFreq = 60 + (normSpeed * 400);

            params.osc.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.2);
            params.lfo.frequency.setTargetAtTime(10 + (normSpeed * 50), audioCtx.currentTime, 0.2);
            params.lfoGain.gain.setTargetAtTime(50 + (normSpeed * 200), audioCtx.currentTime, 0.2);
            params.filter.frequency.setTargetAtTime(baseFreq * 2, audioCtx.currentTime, 0.1);
        }
    }

    function updateUI(speed) {
        // Update number (Int)
        speedValueEl.innerText = Math.round(speed);

        // Update Ring
        const progress = Math.min(speed / MAX_SPEED, 1);
        const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
        speedProgress.style.strokeDashoffset = offset;
    }

    // Wake Lock
    let wakeLock = null;
    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock acquired');
        } catch (err) {
            console.log(`Wake Lock error: ${err.name}, ${err.message}`);
        }
    }

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        if (!isRunning) {
            // Start
            if (!audioCtx) initAudio();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            toggleBtn.innerHTML = '<span class="power-icon">⏻</span> DETENER MOTOR';
            toggleBtn.classList.add('active');
            statusIndicator.innerText = "ENCENDIDO";
            statusIndicator.classList.add('active');
            statusIndicator.style.color = "#4CAF50"; // Green
            isRunning = true;

            // Request Wake Lock
            if ('wakeLock' in navigator) {
                requestWakeLock();
            }

            // Re-create sound
            createEngineSound();

        } else {
            // Stop
            toggleBtn.innerHTML = '<span class="power-icon">⏻</span> INICIAR MOTOR';
            toggleBtn.classList.remove('active');
            statusIndicator.innerText = "OFF";
            statusIndicator.classList.remove('active');
            statusIndicator.style.color = "#444";
            isRunning = false;
            stopEngine();

            if (wakeLock !== null) {
                wakeLock.release()
                    .then(() => {
                        wakeLock = null;
                    });
            }
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        if (mainGain) {
            mainGain.gain.value = e.target.value;
        }
    });

    engineTypeSelector.addEventListener('change', () => {
        if (isRunning) {
            createEngineSound();
        }
    });

    // Test Button Logic
    function startTest() {
        if (!isRunning) return;
        isTesting = true;
    }

    function endTest() {
        isTesting = false;
    }

    testBtn.addEventListener('mousedown', startTest);
    testBtn.addEventListener('mouseup', endTest);
    testBtn.addEventListener('mouseleave', endTest);

    testBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent ghost clicks
        startTest();
    });
    testBtn.addEventListener('touchend', endTest);
});
