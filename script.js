// ----- GLOBAL VARIABLES & SETUP -----
let currentStream = null;
let frontCamera = false;
let isQuaggaRunning = false;

// Three.js & AR variables
let scene, camera, renderer;
let reticle; // used for hit testing
let hitTestSource = null;
let hitTestSourceRequested = false;

// Food database cache for faster lookups
const foodCache = new Map();

// ----- SPATIAL ANCHORING FALLBACK (For devices without WebXR) -----
let usingWebXRFallback = false;
let activeNutritionPanels = [];
let panelPositions = []; // Store panel positions relative to camera orientation
let lastDeviceOrientation = null;
let isOrientationAvailable = false;
let orientationPermissionGranted = false;
let isComparisonMode = false;

// Check if WebXR is supported, otherwise use fallback
function checkARSupport() {
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (!supported) {
          console.log("WebXR AR not supported, using fallback mode");
          usingWebXRFallback = true;
          setupARFallback();
        } else {
          console.log("WebXR AR is supported");
          // Continue with WebXR initialization
          initThreeJs();
        }
      })
      .catch(err => {
        console.error("Error checking WebXR support:", err);
        usingWebXRFallback = true;
        setupARFallback();
      });
  } else {
    console.log("WebXR not available, using fallback mode");
    usingWebXRFallback = true;
    setupARFallback();
  }
}

// Setup AR Fallback mode for devices without WebXR
function setupARFallback() {
  // Hide WebXR specific elements
  const canvas3d = document.getElementById('canvas3d');
  if (canvas3d) canvas3d.style.display = 'none';
  
  // Show video element as background
  const videoElement = document.getElementById('videoElement');
  videoElement.style.display = 'block';
  
  // Create container for nutrition panels
  const panelsContainer = document.createElement('div');
  panelsContainer.id = 'nutritionPanelsContainer';
  panelsContainer.className = 'nutrition-panels-container';
  document.body.appendChild(panelsContainer);
  
  // Check if device orientation is available
  if (window.DeviceOrientationEvent) {
    // For iOS 13+ which requires permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Create permission button
      const permissionBtn = document.createElement('button');
      permissionBtn.id = 'orientationPermissionBtn';
      permissionBtn.className = 'control-button';
      permissionBtn.innerHTML = '📱';
      permissionBtn.title = 'Enable spatial tracking';
      permissionBtn.addEventListener('click', requestOrientationPermission);
      document.querySelector('.button-container').appendChild(permissionBtn);
    } else {
      // For devices that don't need permission
      window.addEventListener('deviceorientation', handleOrientation);
      isOrientationAvailable = true;
      orientationPermissionGranted = true;
      showNotification("Spatial tracking active");
    }
  }
}

// Request permission for device orientation (iOS 13+)
function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          isOrientationAvailable = true;
          orientationPermissionGranted = true;
          
          // Hide permission button
          const permissionBtn = document.getElementById('orientationPermissionBtn');
          if (permissionBtn) permissionBtn.style.display = 'none';
          
          showNotification("Spatial tracking enabled");
        } else {
          console.log("Device orientation permission denied");
          showNotification("Spatial tracking denied");
        }
      })
      .catch(console.error);
  }
}

// Show notification
function showNotification(message, duration = 3000) {
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'notification';
    document.body.appendChild(notification);
  }
  
  // Set message and show notification
  notification.textContent = message;
  notification.classList.add('show');
  
  // Hide notification after duration
  setTimeout(() => {
    notification.classList.remove('show');
  }, duration);
}

// Handle device orientation changes
function handleOrientation(event) {
  if (!isOrientationAvailable || isComparisonMode) return;
  
  const orientation = {
    alpha: event.alpha || 0, // compass direction (0-360)
    beta: event.beta || 0,   // front-to-back tilt (-180-180)
    gamma: event.gamma || 0  // left-to-right tilt (-90-90)
  };
  
  // First orientation reading
  if (!lastDeviceOrientation) {
    lastDeviceOrientation = orientation;
    return;
  }

  // Calculate orientation change
  const deltaAlpha = orientation.alpha - lastDeviceOrientation.alpha;
  const deltaBeta = orientation.beta - lastDeviceOrientation.beta;
  const deltaGamma = orientation.gamma - lastDeviceOrientation.gamma;
  
  // Update panel positions based on orientation change
  if (activeNutritionPanels.length > 0) {
    updatePanelPositionsWithOrientation(deltaAlpha, deltaBeta, deltaGamma);
  }
  
  lastDeviceOrientation = orientation;
}

// Update panel positions when device orientation changes
function updatePanelPositionsWithOrientation(deltaAlpha, deltaBeta, deltaGamma) {
  // Only make updates for significant changes to prevent jitter
  if (Math.abs(deltaAlpha) < 0.5 && Math.abs(deltaBeta) < 0.5 && Math.abs(deltaGamma) < 0.5) {
    return;
  }
  
  // Update each panel's position based on orientation change
  activeNutritionPanels.forEach((panel, index) => {
    if (!panelPositions[index]) return;

    // Calculate new position with scaling factors to make movement feel natural
    const scalingFactor = 2.5;
    
    // Adjust panel position based on orientation (more gamma (left-right) than alpha (compass))
    let newLeft = panelPositions[index].left - (deltaGamma * scalingFactor);
    let newTop = panelPositions[index].top + (deltaBeta * scalingFactor / 2);
    
    // Keep panels in view
    const maxLeft = window.innerWidth - 310;
    const maxTop = window.innerHeight - 400;
    newLeft = Math.max(10, Math.min(maxLeft, newLeft));
    newTop = Math.max(70, Math.min(maxTop, newTop));
    
    // Update panel position
    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    
    // Store updated position
    panelPositions[index] = { left: newLeft, top: newTop };
  });
}

// Create a nutrition panel in fallback AR mode
function createFallbackNutritionPanel(nutritionData) {
  if (!usingWebXRFallback) return;
  
  const panelsContainer = document.getElementById('nutritionPanelsContainer');
  const panel = document.createElement('div');
  panel.className = 'nutrition-panel';
  
  // Position panel based on device orientation and touch point
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // Generate a position that feels AR-like but doesn't obscure the camera view
  let posX = screenWidth * 0.5 - 150;
  let posY = screenHeight * 0.4;
  
  // Add some randomness to make multiple panels visible
  if (activeNutritionPanels.length > 0) {
    posX += (Math.random() - 0.5) * 100;
    posY += (Math.random() - 0.5) * 100;
  }
  
  // Keep panel on screen
  posX = Math.max(10, Math.min(posX, screenWidth - 310));
  posY = Math.max(70, Math.min(posY, screenHeight - 400));
  
  panel.style.left = `${posX}px`;
  panel.style.top = `${posY}px`;
  
  // Parse nutrition data
  const lines = nutritionData.split('\n');
  const titleLine = lines[0];
  
  // Create panel content with title
  let panelHTML = `<div class="panel-header">${titleLine}</div><div class="panel-content">`;
  
  // Add other nutrition data
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('kcal')) {
      panelHTML += `<div class="nutrition-row highlight-energy">${line}</div>`;
    } else if (line.startsWith('Name:') || line.startsWith('Brand:')) {
      panelHTML += `<div class="nutrition-row highlight-name">${line}</div>`;
    } else {
      panelHTML += `<div class="nutrition-row">${line}</div>`;
    }
  }
  
  // Close panel content and add controls
  panelHTML += `</div>
    <div class="panel-controls">
      <button class="panel-close" onclick="this.parentNode.parentNode.remove()">×</button>
    </div>`;
  
  panel.innerHTML = panelHTML;
  
  // Add panel to container with animation
  panel.style.transform = 'scale(0.1)';
  panel.style.opacity = '0';
  panelsContainer.appendChild(panel);
  
  // Add to active panels array
  activeNutritionPanels.push(panel);
  
  // Store panel position for spatial tracking
  panelPositions.push({ left: posX, top: posY });
  
  // Animate panel entry
  setTimeout(() => {
    panel.style.transform = 'scale(1)';
    panel.style.opacity = '1';
  }, 50);
  
  // Add panel interaction events
  panel.addEventListener('touchstart', handlePanelTouch);
  panel.addEventListener('mousedown', handlePanelMouseDown);
  
  // If in comparison mode, arrange panels
  if (isComparisonMode && activeNutritionPanels.length > 1) {
    arrangeComparisonPanels();
  }
  
  return panel;
}

// Handle panel touch events
function handlePanelTouch(event) {
  if (isComparisonMode) return; // Don't allow moving in comparison mode
  
  const panel = event.currentTarget;
  
  // Get original position
  const startX = event.touches[0].clientX;
  const startY = event.touches[0].clientY;
  const startLeft = parseFloat(panel.style.left);
  const startTop = parseFloat(panel.style.top);
  
  // Add to front
  activeNutritionPanels.forEach(p => p.style.zIndex = '20');
  panel.style.zIndex = '21';
  
  // Moving class for styling
  panel.classList.add('moving');
  
  // Move handlers
  function handleTouchMove(e) {
    const deltaX = e.touches[0].clientX - startX;
    const deltaY = e.touches[0].clientY - startY;
    
    const newLeft = startLeft + deltaX;
    const newTop = startTop + deltaY;
    
    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    
    // Update position in tracking array
    const index = activeNutritionPanels.indexOf(panel);
    if (index !== -1) {
      panelPositions[index] = { left: newLeft, top: newTop };
    }
    
    // Prevent default to avoid page scrolling
    e.preventDefault();
  }
  
  function handleTouchEnd() {
    panel.classList.remove('moving');
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  }
  
  document.addEventListener('touchmove', handleTouchMove);
  document.addEventListener('touchend', handleTouchEnd);
}

// Handle panel mouse events (for desktop)
function handlePanelMouseDown(event) {
  if (isComparisonMode) return; // Don't allow moving in comparison mode
  
  const panel = event.currentTarget;
  
  // Get original position
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = parseFloat(panel.style.left);
  const startTop = parseFloat(panel.style.top);
  
  // Add to front
  activeNutritionPanels.forEach(p => p.style.zIndex = '20');
  panel.style.zIndex = '21';
  
  // Moving class for styling
  panel.classList.add('moving');
  
  // Move handlers
  function handleMouseMove(e) {
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newLeft = startLeft + deltaX;
    const newTop = startTop + deltaY;
    
    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    
    // Update position in tracking array
    const index = activeNutritionPanels.indexOf(panel);
    if (index !== -1) {
      panelPositions[index] = { left: newLeft, top: newTop };
    }
  }
  
  function handleMouseUp() {
    panel.classList.remove('moving');
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

// ----- THREE.JS & AR SETUP -----
function initThreeJs() {
  // Create scene, camera, and renderer
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 20);
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: document.getElementById('canvas3d') });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  
  // Add ARButton so the user can start an AR session.
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));
  
  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  const backLight = new THREE.DirectionalLight(0x9090ff, 0.5);
  backLight.position.set(-5, 5, -5);
  scene.add(backLight);
  
  // Create a reticle (to show the hit test result)
  const geometry = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x0fff0, side: THREE.DoubleSide });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  
  window.addEventListener('resize', onWindowResize, false);
  
  // Start the render loop using setAnimationLoop when in AR mode.
  renderer.setAnimationLoop(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----- ANIMATION LOOP & HIT-TESTING -----
function animate(timestamp, frame) {
  // If an AR session is active and we have a frame, try to get hit test results.
  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then(function (referenceSpace) {
        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }
    if (frame && hitTestSource) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }
  
  renderer.render(scene, camera);
}

// ----- BUILDING THE NUTRITION PANEL -----
function buildNutritionPanel(nutritionData) {
  // Instead of using a global nutritionPanel, we build and return a new panel group.
  const panelGroup = new THREE.Group();
  panelGroup.name = 'nutrition-panel-' + Date.now(); // Add unique identifier
  
  // Create a rounded rectangle panel
  const roundedRectShape = new THREE.Shape();
  const width = 3.5, height = 5.5, radius = 0.2;
  roundedRectShape.moveTo(-width/2 + radius, -height/2);
  roundedRectShape.lineTo(width/2 - radius, -height/2);
  roundedRectShape.quadraticCurveTo(width/2, -height/2, width/2, -height/2 + radius);
  roundedRectShape.lineTo(width/2, height/2 - radius);
  roundedRectShape.quadraticCurveTo(width/2, height/2, width/2 - radius, height/2);
  roundedRectShape.lineTo(-width/2 + radius, height/2);
  roundedRectShape.quadraticCurveTo(-width/2, height/2, -width/2, height/2 - radius);
  roundedRectShape.lineTo(-width/2, -height/2 + radius);
  roundedRectShape.quadraticCurveTo(-width/2, -height/2, -width/2 + radius, -height/2);
  
  const extrudeSettings = {
    steps: 1,
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3
  };
  const panelGeometry = new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);
  const panelMaterial = new THREE.MeshPhongMaterial({
    color: 0xf9f9f9,
    transparent: true,
    opacity: 0.95,
    specular: 0x111111,
    shininess: 30
  });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  panel.rotation.x = Math.PI; // Flip to show front face
  panelGroup.add(panel);
  
  // Function to create text mesh
  function createTextMesh(text, size, color, y, isBold = false) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const fontWeight = isBold ? 'bold' : 'normal';
    context.font = `${fontWeight} 32px Arial, sans-serif`;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (isBold) {
      context.shadowColor = 'rgba(0,0,0,0.2)';
      context.shadowBlur = 4;
      context.shadowOffsetX = 1;
      context.shadowOffsetY = 1;
    }
    const lines = text.split('\n');
    const lineHeight = 40;
    const startY = canvas.height/2 - (lines.length - 1) * lineHeight/2;
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width/2, startY + index * lineHeight);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const geometry = new THREE.PlaneGeometry(size, size * canvas.height / canvas.width);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.position.z = -0.06;
    return mesh;
  }
  
  // Split nutritionData into lines and add title and details
  const lines = nutritionData.split('\n');
  let startY = 2.3;
  panelGroup.add(createTextMesh(lines[0], 3.2, '#1a73e8', startY, true));
  startY -= 0.7;
  // Divider
  const dividerGeometry = new THREE.PlaneGeometry(3, 0.03);
  const dividerMaterial = new THREE.MeshBasicMaterial({ color: 0x1a73e8 });
  const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
  divider.position.y = startY + 0.2;
  divider.position.z = -0.05;
  panelGroup.add(divider);
  // Other lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('Name:') || line.startsWith('Brand:')) {
      panelGroup.add(createTextMesh(line, 3, '#1a73e8', startY));
    } else if (line.includes('kcal')) {
      panelGroup.add(createTextMesh(line, 3, '#f57c00', startY));
    } else {
      panelGroup.add(createTextMesh(line, 3, '#202124', startY));
    }
    startY -= 0.55;
  }
  
  // Apply entry animation (optional)
  panelGroup.scale.set(0.1, 0.1, 0.1);
  const startTime = Date.now();
  (function animatePanelEntry() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / 500, 1);
    panelGroup.scale.set(
      0.1 + 0.9 * progress,
      0.1 + 0.9 * progress,
      0.1 + 0.9 * progress
    );
    if (progress < 1) {
      requestAnimationFrame(animatePanelEntry);
    }
  })();
  
  return panelGroup;
}

// Anchor a new nutrition panel in AR
function anchorNutritionPanel(nutritionData) {
  if (usingWebXRFallback) {
    createFallbackNutritionPanel(nutritionData);
  } else {
    // Existing WebXR implementation
    const panel = buildNutritionPanel(nutritionData);
    if (reticle && reticle.visible) {
      panel.position.setFromMatrixPosition(reticle.matrix);
      panel.quaternion.setFromRotationMatrix(reticle.matrix);
    } else {
      panel.position.set(0, 0, -2).applyMatrix4(camera.matrixWorld);
    }
    scene.add(panel);
  }
}

// ----- CAMERA & BARCODE SCANNING (QuaggaJS) -----
async function initCamera(switchCamera = false) {
  showLoadingIndicator(true);
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  if (switchCamera) {
    frontCamera = !frontCamera;
  }
  try {
    const facingMode = frontCamera ? 'user' : 'environment';
    document.getElementById('status').innerText = `Accessing ${frontCamera ? 'front' : 'back'} camera...`;
    const constraints = {
      video: { 
        facingMode: facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
      constraints.video = { 
        facingMode: facingMode,
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 }
      };
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const videoElement = document.getElementById('videoElement');
    videoElement.srcObject = stream;
    currentStream = stream;
    document.getElementById('status').innerText = 'Using ' + (frontCamera ? 'front' : 'back') + ' camera. Ready to scan.';
    // Hide the video element because Quagga will handle its own view.
    videoElement.style.display = 'none';
    showLoadingIndicator(false);
    startBarcodeScanning();
  } catch (err) {
    console.error('Error accessing camera:', err);
    showLoadingIndicator(false);
    showPermissionError(true);
  }
}

function showLoadingIndicator(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}
function showPermissionError(show) {
  document.getElementById('permissionError').style.display = show ? 'flex' : 'none';
}

// Start barcode scanning via QuaggaJS
function startBarcodeScanning() {
  const quaggaContainer = document.getElementById('quaggaContainer');
  const barcodeScannerUI = document.getElementById('barcodeScannerUI');
  if (isQuaggaRunning) return;
  barcodeScannerUI.style.display = 'block';
  quaggaContainer.innerHTML = '';
  quaggaContainer.style.display = 'block';
  document.getElementById('videoElement').style.display = 'none';
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: quaggaContainer,
      constraints: {
        facingMode: frontCamera ? "user" : "environment",
        width: { min: 640 },
        height: { min: 480 },
        aspectRatio: { min: 1, max: 2 }
      }
    },
    locator: { patchSize: "medium", halfSample: true },
    numOfWorkers: navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2,
    frequency: 10,
    decoder: {
      readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"],
      debug: { drawBoundingBox: true, showPattern: true }
    },
    locate: true
  }, function(err) {
    if (err) {
      console.error(err);
      document.getElementById("status").innerText = "Error initializing barcode scanner.";
      return;
    }
    console.log("QuaggaJS initialized.");
    setTimeout(() => {
      const canvases = quaggaContainer.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.willReadFrequently = true;
      });
      const quaggaVideo = quaggaContainer.querySelector('video');
      if (quaggaVideo) {
        quaggaVideo.style.width = '100%';
        quaggaVideo.style.height = '100%';
        quaggaVideo.style.objectFit = 'cover';
      }
    }, 500);
    Quagga.start();
    isQuaggaRunning = true;
    document.getElementById("status").innerText = "Scanning for product barcode...";
  });
}

function stopBarcodeScanning() {
  const quaggaContainer = document.getElementById('quaggaContainer');
  const barcodeScannerUI = document.getElementById('barcodeScannerUI');
  if (isQuaggaRunning) {
    Quagga.stop();
    isQuaggaRunning = false;
    quaggaContainer.style.display = 'none';
    quaggaContainer.innerHTML = '';
    barcodeScannerUI.style.display = 'none';
    document.getElementById('videoElement').style.display = 'block';
  }
}

// ----- PRODUCT DATA & NUTRITION DISPLAY -----
function searchFoodItem(itemName) {
  showLoadingIndicator(true);
  const searchTerm = itemName.split(',')[0].trim().toLowerCase();
  document.getElementById('status').innerText = `Searching for: ${searchTerm}...`;
  if (foodCache.has(searchTerm)) {
    const cachedData = foodCache.get(searchTerm);
    displayProductInfo(cachedData);
    showLoadingIndicator(false);
    return;
  }
  fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchTerm)}&search_simple=1&action=process&json=1`)
    .then(response => {
      if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.products && data.products.length > 0) {
        const product = data.products[0];
        foodCache.set(searchTerm, product);
        displayProductInfo(product);
      } else {
        document.getElementById('status').innerText = `No product found for: ${searchTerm}`;
        createGenericNutritionPanel(searchTerm);
      }
      showLoadingIndicator(false);
    })
    .catch(err => {
      console.error("Error searching product:", err);
      document.getElementById('status').innerText = "Error searching for product data.";
      createGenericNutritionPanel(searchTerm);
      showLoadingIndicator(false);
    });
}

function displayProductInfo(product) {
  try {
    console.log("Displaying product info:", product);
    const nutriments = product.nutriments || {};
    let labelText = "Nutrition Facts\n";
    labelText += `Name: ${product.product_name || "N/A"}\n`;
    labelText += `Brand: ${product.brands || "N/A"}\n`;
    const energy = nutriments["energy-kcal"] ? 
      `${Math.round(nutriments["energy-kcal"])} kcal` : 
      (nutriments["energy"] ? `${Math.round(nutriments["energy"] / 4.184)} kcal` : "N/A");
    const fat = nutriments.fat ? `${parseFloat(nutriments.fat).toFixed(1)}g` : "N/A";
    const sugars = nutriments.sugars ? `${parseFloat(nutriments.sugars).toFixed(1)}g` : "N/A";
    const proteins = nutriments.proteins ? `${parseFloat(nutriments.proteins).toFixed(1)}g` : "N/A";
    labelText += `Energy: ${energy}\n`;
    labelText += `Fat: ${fat}\n`;
    labelText += `Sugars: ${sugars}\n`;
    labelText += `Proteins: ${proteins}\n`;
    if (nutriments.salt) {
      labelText += `Salt: ${parseFloat(nutriments.salt).toFixed(1)}g\n`;
    } else if (nutriments.sodium) {
      labelText += `Sodium: ${parseFloat(nutriments.sodium).toFixed(1)}g\n`;
    }
    document.getElementById('status').innerText = "Found: " + (product.product_name || "Unknown");
    // Instead of directly creating a panel overlay, anchor it in AR:
    anchorNutritionPanel(labelText);
  } catch (error) {
    console.error("Error displaying product info:", error);
    const productName = product && product.product_name ? product.product_name : "Unknown Product";
    createGenericNutritionPanel(productName);
  }
}

function createGenericNutritionPanel(foodName) {
  let labelText = "Estimated Nutrition\n";
  labelText += `Name: ${foodName}\n`;
  let energy = "N/A", fat = "N/A", sugars = "N/A", proteins = "N/A";
  const foodLower = foodName.toLowerCase();
  if (foodLower.includes('chip') || foodLower.includes('crisp') || foodLower.includes('snack')) {
    energy = "150 kcal"; fat = "10.0g"; sugars = "1.5g"; proteins = "2.0g";
  } else if (foodLower.includes('chocolate') || foodLower.includes('candy')) {
    energy = "200 kcal"; fat = "12.0g"; sugars = "20.0g"; proteins = "2.5g";
  } else if (foodLower.includes('soda') || foodLower.includes('cola')) {
    energy = "120 kcal"; fat = "0.0g"; sugars = "30.0g"; proteins = "0.0g";
  } else if (foodLower.includes('water') || foodLower.includes('bottle')) {
    energy = "0 kcal"; fat = "0.0g"; sugars = "0.0g"; proteins = "0.0g";
  } else {
    energy = "100 kcal"; fat = "5.0g"; sugars = "3.0g"; proteins = "3.0g";
  }
  labelText += `Energy: ${energy}\n`;
  labelText += `Fat: ${fat}\n`;
  labelText += `Sugars: ${sugars}\n`;
  labelText += `Proteins: ${proteins}\n`;
  labelText += `Note: Estimated values\n`;
  anchorNutritionPanel(labelText);
}

// ----- QUAGGAJS BARCODE DETECTION HANDLER -----
Quagga.onDetected(function(result) {
  const code = result.codeResult.code;
  console.log("Barcode detected:", code);
  document.getElementById("status").innerText = "Barcode detected: " + code;
  
  showLoadingIndicator(true);
  Quagga.pause();
  
  // Optional: highlight detected barcode area if your UI has a .scan-area element
  const scanArea = document.querySelector('.scan-area');
  if (scanArea) {
    scanArea.style.borderColor = 'rgba(76, 175, 80, 0.8)';
    scanArea.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.5)';
    setTimeout(() => {
      scanArea.style.borderColor = 'rgba(66, 133, 244, 0.8)';
      scanArea.style.boxShadow = '0 0 0 5000px rgba(0, 0, 0, 0.5)';
    }, 1000);
  }
  
  if (foodCache.has(code)) {
    const cachedData = foodCache.get(code);
    displayProductInfo(cachedData);
    showLoadingIndicator(false);
    setTimeout(() => Quagga.start(), 5000);
    return;
  }
  
  fetch("https://world.openfoodfacts.org/api/v0/product/" + code + ".json")
    .then(response => {
      if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.status === 1) {
        const product = data.product;
        foodCache.set(code, product);
        displayProductInfo(product);
      } else {
        document.getElementById("status").innerText = "Product not found for barcode: " + code;
      }
      showLoadingIndicator(false);
      setTimeout(() => Quagga.start(), 5000);
    })
    .catch(err => {
      console.error("Error fetching product data:", err);
      document.getElementById("status").innerText = "Error fetching nutrition data.";
      showLoadingIndicator(false);
      setTimeout(() => Quagga.start(), 3000);
    });
});

// ----- SHARING FUNCTIONALITY -----
function addSharingFeature() {
  const shareBtn = document.createElement('button');
  shareBtn.id = 'shareResultsBtn';
  shareBtn.className = 'control-button';
  shareBtn.innerHTML = '📤';
  shareBtn.title = 'Share results';
  shareBtn.addEventListener('click', shareResults);
  
  document.querySelector('.button-container').appendChild(shareBtn);
}

// Share nutrition results
function shareResults() {
  // Create a canvas to capture the current state
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  
  // Draw video background if available
  const video = document.getElementById('videoElement');
  if (video.style.display !== 'none' && video.videoWidth > 0) {
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 
                  0, 0, canvas.width, canvas.height);
  } else {
    // Draw Quagga view if active
    const quaggaVideo = document.querySelector('#quaggaContainer video');
    if (quaggaVideo && quaggaVideo.videoWidth > 0) {
      ctx.drawImage(quaggaVideo, 0, 0, quaggaVideo.videoWidth, quaggaVideo.videoHeight, 
                    0, 0, canvas.width, canvas.height);
    } else {
      // Fallback to black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  
  // Draw status bar
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, 50);
  ctx.fillStyle = '#fff';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(document.getElementById('status').innerText, canvas.width / 2, 30);
  
  // Draw nutrition panels if in fallback mode
  if (usingWebXRFallback) {
    document.querySelectorAll('.nutrition-panel').forEach(panel => {
      try {
        // Get panel position and size
        const rect = panel.getBoundingClientRect();
        
        // Create a representation of the panel on canvas
        ctx.save();
        
        // Draw panel background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;
        ctx.beginPath();
        ctx.roundRect(rect.left, rect.top, rect.width, rect.height, 12);
        ctx.fill();
        
        // Draw panel header
        const headerHeight = 45;
        ctx.fillStyle = '#4285f4';
        ctx.beginPath();
        ctx.roundRect(rect.left, rect.top, rect.width, headerHeight, [12, 12, 0, 0]);
        ctx.fill();
        
        // Extract and draw panel title
        const title = panel.querySelector('.panel-header').innerText;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, rect.left + rect.width / 2, rect.top + 28);
        
        // Extract and draw nutrition info
        ctx.textAlign = 'left';
        ctx.font = '16px Arial';
        ctx.fillStyle = '#000';
        
        const rows = panel.querySelectorAll('.nutrition-row');
        rows.forEach((row, index) => {
          let textColor = '#000';
          if (row.classList.contains('highlight-name')) {
            textColor = '#1a73e8';
          } else if (row.classList.contains('highlight-energy')) {
            textColor = '#f57c00';
          }
          
          ctx.fillStyle = textColor;
          ctx.fillText(
            row.innerText, 
            rect.left + 15, 
            rect.top + headerHeight + 30 + (index * 25)
          );
        });
        
        ctx.restore();
      } catch (error) {
        console.error("Error drawing panel to canvas:", error);
      }
    });
  }
  
  // Convert to data URL
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  
  // Use Web Share API if available
  if (navigator.share) {
    const fileName = 'nutrition-scan-' + new Date().toISOString().slice(0, 10) + '.jpg';
    const file = dataURLtoFile(dataUrl, fileName);
    
    navigator.share({
      title: 'Nutrition Scanner Results',
      text: 'Check out this nutrition info I scanned!',
      files: [file]
    }).then(() => {
      showNotification("Shared successfully");
    }).catch((error) => {
      console.error('Error sharing:', error);
      // Fallback to download if share fails
      downloadImage(dataUrl);
    });
  } else {
    // Fallback to download
    downloadImage(dataUrl);
  }
}

// Convert data URL to file
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new File([u8arr], filename, { type: mime });
}

// Download image
function downloadImage(dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'nutrition-scan-' + new Date().toISOString().slice(0, 10) + '.jpg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showNotification("Image saved");
}

// ----- COMPARISON FEATURE -----
function addCompareButton() {
  // Add compare button in scanMode area
  const compareBtn = document.createElement('button');
  compareBtn.id = 'compareItemsBtn';
  compareBtn.className = 'modeBtn';
  compareBtn.style.marginLeft = '15px';
  compareBtn.innerHTML = 'Compare';
  compareBtn.title = 'Compare products';
  compareBtn.addEventListener('click', toggleComparisonMode);
  
  document.getElementById('scanMode').appendChild(compareBtn);
}

// Toggle comparison mode
function toggleComparisonMode() {
  isComparisonMode = !isComparisonMode;
  const compareBtn = document.getElementById('compareItemsBtn');
  
  if (isComparisonMode) {
    // Enter comparison mode
    compareBtn.classList.add('active');
    document.getElementById('status').innerText = "Comparison mode active";
    
    // Arrange panels for comparison
    if (activeNutritionPanels.length >= 2) {
      arrangeComparisonPanels();
    } else {
      showNotification("Scan at least 2 products to compare");
    }
  } else {
    // Exit comparison mode
    compareBtn.classList.remove('active');
    document.getElementById('status').innerText = "Comparison mode disabled";
    
    // Restore original panel positions
    activeNutritionPanels.forEach((panel, index) => {
      if (panelPositions[index]) {
        panel.classList.remove('comparison-mode');
        // Animate back to original position
        panel.style.transition = 'all 0.5s ease';
        setTimeout(() => {
          panel.style.left = `${panelPositions[index].left}px`;
          panel.style.top = `${panelPositions[index].top}px`;
          panel.style.transform = 'scale(1)';
        }, 50);
      }
    });
  }
}

// Arrange panels for comparison
function arrangeComparisonPanels() {
  if (!isComparisonMode || activeNutritionPanels.length < 2) return;
  
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // First, save original positions if not saved yet
  activeNutritionPanels.forEach((panel, index) => {
    // Save original position if not already saved
    if (!panelPositions[index]) {
      panelPositions[index] = {
        left: parseFloat(panel.style.left),
        top: parseFloat(panel.style.top)
      };
    }
    
    // Add comparison mode class for styling
    panel.classList.add('comparison-mode');
    
    // Calculate new position for grid layout
    const panelWidth = 300;
    const totalWidth = Math.min(activeNutritionPanels.length * panelWidth, screenWidth);
    const startX = (screenWidth - totalWidth) / 2;
    
    // Determine position based on index
    const columnCount = Math.min(activeNutritionPanels.length, Math.floor(screenWidth / panelWidth));
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    
    const posX = startX + (col * panelWidth);
    const posY = 100 + (row * 380);
    
    // Apply new position with animation
    panel.style.transition = 'all 0.5s ease';
    panel.style.left = `${posX}px`;
    panel.style.top = `${posY}px`;
    panel.style.transform = 'scale(0.9)';
    panel.style.zIndex = '20';
  });
  
  showNotification("Products arranged for comparison");
}

// ----- INFO SCREEN -----
function addInfoButton() {
  // Create info button
  const infoBtn = document.createElement('button');
  infoBtn.id = 'infoButton';
  infoBtn.className = 'info-button';
  infoBtn.innerHTML = '<i class="fas fa-info-circle"></i>';
  infoBtn.title = 'Help';
  infoBtn.addEventListener('click', showHelpOverlay);
  document.body.appendChild(infoBtn);
  
  // Create help overlay
  const helpOverlay = document.createElement('div');
  helpOverlay.id = 'helpOverlay';
  helpOverlay.className = 'help-overlay';
  helpOverlay.innerHTML = `
    <div class="help-content">
      <h2>How to Use</h2>
      <ul>
        <li><strong>Barcode Mode:</strong> Scan product barcodes to view nutritional information</li>
        <li><strong>Compare Mode:</strong> Scan multiple products and compare them side by side</li>
        <li><strong>Switch Camera:</strong> Toggle between front and back cameras</li>
        <li><strong>Spatial Tracking:</strong> The nutrition panels will try to stay in position as you move your camera</li>
        <li><strong>Panel Movement:</strong> Touch and drag panels to reposition them</li>
        <li><strong>Share Results:</strong> Tap the share button to save or share your findings</li>
        <li><strong>Clear Panels:</strong> Remove all nutrition panels with the trash button</li>
      </ul>
      <h3>Tips:</h3>
      <ul>
        <li>For best barcode scanning, ensure good lighting</li>
        <li>Multiple products can be scanned for comparison</li>
        <li>iOS users may need to enable motion sensors for spatial tracking</li>
      </ul>
      <button id="closeHelpBtn">Got it!</button>
    </div>
  `;
  document.body.appendChild(helpOverlay);
  
  // Add close button handler
  document.getElementById('closeHelpBtn').addEventListener('click', hideHelpOverlay);
}

// Show help overlay
function showHelpOverlay() {
  document.getElementById('helpOverlay').style.display = 'flex';
}

// Hide help overlay
function hideHelpOverlay() {
  document.getElementById('helpOverlay').style.display = 'none';
}

// ----- UI EVENT LISTENERS -----
if (document.getElementById('barcodeMode')) {
  document.getElementById('barcodeMode').addEventListener('click', function() {
    startBarcodeScanning();
  });
}

document.getElementById('switchCameraBtn').addEventListener('click', function() {
  if (isQuaggaRunning) stopBarcodeScanning();
  initCamera(true);
});

document.getElementById('retryPermission').addEventListener('click', function() {
  showPermissionError(false);
  initCamera();
});

// Clear all nutrition panels
function clearNutritionPanels() {
  if (usingWebXRFallback) {
    const panels = document.querySelectorAll('.nutrition-panel');
    panels.forEach(panel => {
      panel.style.opacity = '0';
      panel.style.transform = 'scale(0.8)';
      setTimeout(() => {
        panel.remove();
      }, 300);
    });
    activeNutritionPanels = [];
    panelPositions = [];
  } else {
    // Remove panels from Three.js scene
    scene.traverse((object) => {
      if (object.isGroup && object.name.includes('nutrition-panel')) {
        scene.remove(object);
      }
    });
  }
  
  document.getElementById('status').innerText = "Cleared all nutrition panels";
}

// Add clear button
function addClearButton() {
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clearPanelsBtn';
  clearBtn.className = 'control-button';
  clearBtn.innerHTML = '🗑️';
  clearBtn.title = 'Clear all panels';
  clearBtn.addEventListener('click', clearNutritionPanels);
  
  document.querySelector('.button-container').appendChild(clearBtn);
}

// Show welcome message
function showWelcomeMessage() {
  const welcomeOverlay = document.createElement('div');
  welcomeOverlay.className = 'welcome-overlay';
  welcomeOverlay.innerHTML = `
    <div class="welcome-content">
      <h1>AR Nutrition Scanner</h1>
      <p>Scan food products to see nutrition information in augmented reality</p>
      <div class="welcome-features">
        <div class="feature">
          <div class="feature-icon">📷</div>
          <div class="feature-text">Scan barcodes</div>
        </div>
        <div class="feature">
          <div class="feature-icon">📊</div>
          <div class="feature-text">Compare products</div>
        </div>
        <div class="feature">
          <div class="feature-icon">📍</div>
          <div class="feature-text">AR positioning</div>
        </div>
      </div>
      <button id="startScanningBtn">Start Scanning</button>
    </div>
  `;
  
  document.body.appendChild(welcomeOverlay);
  
  // Add animation classes
  setTimeout(() => {
    welcomeOverlay.classList.add('active');
  }, 100);
  
  // Add button event listener
  document.getElementById('startScanningBtn').addEventListener('click', () => {
    welcomeOverlay.classList.remove('active');
    setTimeout(() => {
      welcomeOverlay.remove();
    }, 500);
  });
}

// ----- INITIALIZATION -----
window.addEventListener('load', () => {
  initCamera();
  checkARSupport();
  setTimeout(() => {
    // Add UI components
    addClearButton();
    addSharingFeature();
    addInfoButton();
    addCompareButton();
    
    // Show welcome message
    showWelcomeMessage();
  }, 2000);
});

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!isQuaggaRunning) startBarcodeScanning();
  } else {
    if (isQuaggaRunning) {
      Quagga.stop();
      isQuaggaRunning = false;
    }
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  if (isQuaggaRunning) Quagga.stop();
});