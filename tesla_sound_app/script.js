document.addEventListener('DOMContentLoaded', () => {
    // Canvas & UI Elements
    const speedValueEl = document.getElementById('speed-value');
    const speedProgress = document.getElementById('speed-progress');
    const toggleBtn = document.getElementById('toggle-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const volumeSlider = document.getElementById('volume-slider');
    const engineTypeSelector = document.getElementById('engine-type');

    // State
    let isRunning = false;
    let currentSpeed = 0; // km/h
    let targetSpeed = 0;

    // Audio Context
    let audioCtx;
    let mainGain;
    let engineOscillators = [];
    let lfo;
    let masterFilter;

    // Constants
    const MAX_SPEED = 200; // km/h for UI scale
    const CIRCUMFERENCE = 2 * Math.PI * 45; // 282.74...

    // Initialize UI
    speedProgress.style.strokeDashoffset = CIRCUMFERENCE;
    speedProgress.style.strokeDasharray = CIRCUMFERENCE;

    // Logic: Smooth speed transition
    setInterval(() => {
        // Interpolate current speed towards target speed for smoothness
        const diff = targetSpeed - currentSpeed;
        if (Math.abs(diff) > 0.5) {
            currentSpeed += diff * 0.1;
        } else {
            currentSpeed = targetSpeed;
        }

        updateUI(currentSpeed);
        if (isRunning) {
            updateEngineSound(currentSpeed);
        }
    }, 50); // 20fps update

    // GPS Tracking
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((position) => {
            // position.coords.speed is in m/s. 
            // If null (stationary), use 0.
            const speedMs = position.coords.speed || 0;
            targetSpeed = (speedMs * 3.6); // Convert to km/h

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
        alert("Tu navegador no soporta Geolocation. La app no funcionará correctamente.");
    }

    // Audio Engine Setup
    function initAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // Master Gain
        mainGain = audioCtx.createGain();
        mainGain.gain.value = volumeSlider.value;
        mainGain.connect(audioCtx.destination);

        // Master Filter (Lowpass) - Muffles the sound at idle
        masterFilter = audioCtx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = 200; // Start muffled
        masterFilter.connect(mainGain);

        createEngineSound();
    }

    function createEngineSound() {
        // Stop previous if exists
        stopEngine();

        const type = engineTypeSelector.value;
        engineOscillators = [];

        if (type === 'v8') {
            // V8: Deep rumble. Multiple sawtooths slightly detuned.
            const freqs = [50, 51, 100]; // Fundamental + harmonics
            freqs.forEach(f => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(f, audioCtx.currentTime);
                osc.connect(masterFilter);
                osc.start();
                engineOscillators.push({ node: osc, baseFreq: f });
            });

            // LFO for "rumble" texture
            lfo = audioCtx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 15; // 15Hz rumble
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.value = 500; // Depth of modulation
            lfo.connect(lfoGain);
            lfoGain.connect(masterFilter.frequency); // Modulate filter cutoff
            lfo.start();
            engineOscillators.push({ node: lfo, isLfo: true });

        } else if (type === 'f1') {
            // F1: High pitched, square/saw mix
            const freqs = [100, 200, 300, 400];
            freqs.forEach(f => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(f, audioCtx.currentTime);
                osc.connect(masterFilter);
                osc.start();
                engineOscillators.push({ node: osc, baseFreq: f });
            });
            // Less rumble, more scream
        } else if (type === 'spaceship') {
            // Sine/Triangle
            const freqs = [60, 120];
            freqs.forEach(f => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, audioCtx.currentTime);
                osc.connect(masterFilter);
                osc.start();
                engineOscillators.push({ node: osc, baseFreq: f });
            });
        }
    }

    function stopEngine() {
        engineOscillators.forEach(obj => {
            try {
                obj.node.stop();
                obj.node.disconnect();
            } catch (e) { }
        });
        engineOscillators = [];
    }

    function updateEngineSound(speed) {
        if (!audioCtx) return;

        // Map speed (0 - 150) to pitch multiplier (1.0 - 4.0)
        // Idle (0 km/h) shouldn't be silence, but idle RPM.
        // Let's assume Idle is 1.0x pitch.
        const pitchMultiplier = 1 + (speed / 50);

        // Map speed to filter cutoff (brightness)
        // Idle: 200Hz, Max: 3000Hz
        const filterFreq = 200 + (speed * 20);
        masterFilter.frequency.setTargetAtTime(Math.min(filterFreq, 5000), audioCtx.currentTime, 0.1);

        engineOscillators.forEach(obj => {
            if (!obj.isLfo) {
                // Adjust frequency
                obj.node.frequency.setTargetAtTime(obj.baseFreq * pitchMultiplier, audioCtx.currentTime, 0.1);
            }
        });

        // Volume logic? Maybe idle is quieter?
        // Keep volume constant based on slider, but maybe add slight boost at speed?
    }

    function updateUI(speed) {
        // Update number
        speedValueEl.innerText = Math.round(speed);

        // Update Ring
        const progress = Math.min(speed / MAX_SPEED, 1);
        const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
        speedProgress.style.strokeDashoffset = offset;

        // Color shift? Green to Red?
        // kept simple red for tesla vibe
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
});
