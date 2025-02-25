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

// (Retain foodKeywords in case you want to filter later for nutrition lookups)
const foodKeywords = [
  'food', 'snack', 'chip', 'crisp', 'fruit', 'vegetable', 'meat', 'drink', 'beverage',
  'chocolate', 'candy', 'sweet', 'cookie', 'cracker', 'bread', 'cereal', 'yogurt', 
  'milk', 'juice', 'soda', 'water', 'coffee', 'tea', 'sandwich', 'burger', 'pizza',
  'pasta', 'rice', 'bean', 'nut', 'cake', 'pie', 'ice cream', 'dessert', 'soup',
  'salad', 'sauce', 'oil', 'vinegar', 'sugar', 'salt', 'pepper', 'spice', 'herb',
  'package', 'box', 'bag', 'bottle', 'can', 'container', 'wrapper', 'packet',
  'doritos', 'lays', 'cheetos', 'pringles', 'oreo', 'kitkat', 'snickers', 'popcorn',
  'cola', 'pepsi', 'sprite', 'fanta', 'mountain dew', 'redbull', 'monster', 'coke',
  'packaged', 'processed', 'junk', 'fast', 'frozen', 'dried', 'instant', 'ready',
  'nestle', 'kraft', 'hershey', 'nabisco', 'frito', 'kellogg', 'heinz', 'campbell',
  'coca', 'pepsi', 'mars', 'general', 'mills', 'unilever', 'danone', 'mondelez'
];

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
    const lines = nutritionData.split('\n');
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
  const panel = buildNutritionPanel(nutritionData);
  // If the reticle is visible (i.e. a hit test was successful) use its pose; otherwise, fallback
  if (reticle && reticle.visible) {
    panel.position.setFromMatrixPosition(reticle.matrix);
    panel.quaternion.setFromRotationMatrix(reticle.matrix);
  } else {
    // Fallback: place panel 2 meters in front of the camera
    panel.position.set(0, 0, -2).applyMatrix4(camera.matrixWorld);
  }
  scene.add(panel);
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

// ----- UI EVENT LISTENERS -----
document.getElementById('barcodeMode').addEventListener('click', function() {
  startBarcodeScanning();
});

document.getElementById('switchCameraBtn').addEventListener('click', function() {
  if (isQuaggaRunning) stopBarcodeScanning();
  initCamera(true);
});

document.getElementById('retryPermission').addEventListener('click', function() {
  showPermissionError(false);
  initCamera();
});

// ----- INITIALIZATION -----
window.addEventListener('load', () => {
  initCamera();
  initThreeJs();
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