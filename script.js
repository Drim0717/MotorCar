document.addEventListener('DOMContentLoaded', () => {
    // Canvas & UI Elements
    const speedValueEl = document.getElementById('speed-value');
    const speedProgress = document.getElementById('speed-progress');
    const toggleBtn = document.getElementById('toggle-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const volumeSlider = document.getElementById('volume-slider');
    const engineTypeSelector = document.getElementById('engine-type');
    const testBtn = document.getElementById('test-btn');
    const customFileInput = document.getElementById('custom-file');

    // State
    let isRunning = false;
    let currentSpeed = 0; // km/h
    let targetSpeed = 0;
    let isTesting = false;

    // Audio Context
    let audioCtx;
    let mainGain;

    // Sample-Based Engine
    let currentSource = null;
    let engineBuffer = null; // The loaded audio buffer
    let enginePlaybackRate = 1.0;

    // Constants
    const MAX_SPEED = 240; // km/h
    const CIRCUMFERENCE = 2 * Math.PI * 45;

    // Initialize UI
    speedProgress.style.strokeDashoffset = CIRCUMFERENCE;
    speedProgress.style.strokeDasharray = CIRCUMFERENCE;

    // Default "Fake" Sample Generators (Fallback if no file)
    function createProceduralBuffer(type) {
        if (!audioCtx) return null;
        const duration = 2.0; // 2 seconds loop
        const sampleRate = audioCtx.sampleRate;
        const frameCount = sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < frameCount; i++) {
            // Base Noise
            let noise = Math.random() * 2 - 1;

            // Texture based on engine type
            if (type === 'v8') {
                // Low rumble texture (Brown-ish)
                // We add some periodic impulse to simulate cylinder firing at idle (approx 15Hz)
                const impulse = (i % (sampleRate / 15) < 100) ? 0.8 : 0;
                data[i] = (noise * 0.2) + impulse;
            } else if (type === 'revuelto') {
                // V12: Smoother, higher pitch texture
                // 60Hz hum mixed with noise
                const hum = Math.sin(i * 0.05) * 0.5;
                data[i] = (noise * 0.1) + hum;
            } else if (type === 'f1') {
                // High frequency saw-like texture
                const saw = ((i % 200) / 100) - 1;
                data[i] = (saw * 0.6) + (noise * 0.1);
            } else {
                data[i] = noise * 0.5;
            }
        }
        return buffer;
    }

    // Audio Engine Setup
    function initAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();

        // Master Gain
        mainGain = audioCtx.createGain();
        mainGain.gain.value = volumeSlider.value;
        mainGain.connect(audioCtx.destination);

        // Load default buffer
        loadSoundForType(engineTypeSelector.value);
    }

    // Load Sound
    async function loadSoundForType(type) {
        if (!audioCtx) return;

        // Reset custom file if changing type via dropdown
        // (Unless we want a specific 'custom' option, but here we just generate defaults)
        console.log("Loading simulated sample for:", type);
        engineBuffer = createProceduralBuffer(type);

        if (isRunning) {
            playEngine();
        }
    }

    function playEngine() {
        if (!engineBuffer) return;
        // Stop any existing source
        if (currentSource) stopEngine();

        const source = audioCtx.createBufferSource();
        source.buffer = engineBuffer;
        source.loop = true;

        // Rate control
        source.playbackRate.value = enginePlaybackRate;

        // Better lowpass filter to make it sound "muffled" like inside a car
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800; // Start muffled

        source.connect(filter);
        filter.connect(mainGain);
        source.start();

        // Save reference to node and filter to update them
        currentSource = {
            node: source,
            filter: filter
        };
    }

    function stopEngine() {
        if (currentSource) {
            try {
                currentSource.node.stop();
                currentSource.node.disconnect();
            } catch (e) { }
            currentSource = null;
        }
    }

    function updateEngineSound(speed) {
        if (!currentSource) return;

        // Real-Sample Logic:
        // We pitch shift the sample based on speed.
        // Idle (0 km/h) -> 0.8x playback rate
        // Max (240 km/h) -> 3.0x playback rate

        const normSpeed = Math.min(speed / MAX_SPEED, 1.0);
        const rate = 0.8 + (normSpeed * 2.2);

        currentSource.node.playbackRate.setTargetAtTime(rate, audioCtx.currentTime, 0.1);

        // Filter opens up as we speed up
        const filterFreq = 400 + (normSpeed * 10000);
        if (currentSource.filter) {
            currentSource.filter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.1);
        }
    }

    function updateUI(speed) {
        speedValueEl.innerText = Math.round(speed);
        const progress = Math.min(speed / MAX_SPEED, 1);
        const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
        speedProgress.style.strokeDashoffset = offset;
    }

    // Logic: Smooth speed transition
    setInterval(() => {
        let activeTarget = targetSpeed;

        if (isTesting) {
            activeTarget = MAX_SPEED * 0.8;
        }

        const diff = activeTarget - currentSpeed;

        if (isTesting) {
            currentSpeed += diff * 0.05;
        } else {
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
    }, 50);

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
            statusIndicator.style.color = "#4CAF50";
            isRunning = true;

            // Check for custom file
            if (customFileInput && customFileInput.files.length > 0) {
                handleFileUpload(customFileInput.files[0]);
            } else {
                playEngine();
            }

        } else {
            // Stop
            toggleBtn.innerHTML = '<span class="power-icon">⏻</span> INICIAR MOTOR';
            toggleBtn.classList.remove('active');
            statusIndicator.innerText = "OFF";
            statusIndicator.classList.remove('active');
            statusIndicator.style.color = "#444";
            isRunning = false;
            stopEngine();
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        if (mainGain) {
            mainGain.gain.value = e.target.value;
        }
    });

    engineTypeSelector.addEventListener('change', () => {
        loadSoundForType(engineTypeSelector.value);
    });

    // Custom File Handling
    if (customFileInput) {
        customFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                if (!audioCtx) initAudio();
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    function handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            audioCtx.decodeAudioData(e.target.result, function (buffer) {
                engineBuffer = buffer;
                if (isRunning) playEngine();
            }, function (e) { console.error("Error decoding audio data", e); });
        };
        reader.readAsArrayBuffer(file);
    }

    // Test Button Handlers
    function startTest() { if (isRunning || true) isTesting = true; } // Allow testing even if engine off? No, safer if engine on. But logic above checks isRunning in loop.
    function endTest() { isTesting = false; }

    testBtn.addEventListener('mousedown', startTest);
    testBtn.addEventListener('mouseup', endTest);
    testBtn.addEventListener('mouseleave', endTest);
    testBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startTest(); });
    testBtn.addEventListener('touchend', endTest);

    // GPS
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((position) => {
            if (!isTesting) {
                const speedMs = position.coords.speed || 0;
                targetSpeed = (speedMs * 3.6);
            }
        }, (err) => console.warn(err), { enableHighAccuracy: true });
    }
});
