// Global variables
let currentMode = 'barcode'; // Only barcode mode now
const videoElement = document.getElementById('videoElement');
let isQuaggaRunning = false;
let frontCamera = false;
let currentStream = null;
const quaggaContainer = document.getElementById('quaggaContainer');
const barcodeScannerUI = document.getElementById('barcodeScannerUI');
const loadingIndicator = document.getElementById('loadingIndicator');
const permissionError = document.getElementById('permissionError');

// Three.js variables
let scene, camera, renderer;
let nutritionPanel;
let isThreeJsInitialized = false;

// Food database cache for faster lookups
const foodCache = new Map();

// Initialize Three.js scene with modern design
function initThreeJs() {
  if (isThreeJsInitialized) return true;
  
  try {
    // Create scene
    scene = new THREE.Scene();
    
    // Create camera (perspective)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas3d'),
      alpha: true,
      antialias: true // Smoother edges
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setPixelRatio(window.devicePixelRatio); // Sharper rendering
    
    // Better lighting for 3D objects
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Add subtle backlight
    const backLight = new THREE.DirectionalLight(0x9090ff, 0.5);
    backLight.position.set(-5, 5, -5);
    scene.add(backLight);
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    isThreeJsInitialized = true;
    console.log("Three.js initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing Three.js:", error);
    document.getElementById('status').innerText = "Error creating AR display";
    return false;
  }
}

// Animation loop
function animate() {
  try {
    requestAnimationFrame(animate);
    
    if (nutritionPanel) {
      // Gentle floating animation
      nutritionPanel.position.y = 0.1 * Math.sin(Date.now() * 0.001);
      
      // Add slow rotation for AR feel
      nutritionPanel.rotation.y = 0.05 * Math.sin(Date.now() * 0.0005);
    }
    
    renderer.render(scene, camera);
  } catch (error) {
    console.error("Error in animation loop:", error);
  }
}

// Create modern 3D nutrition panel 
function createNutritionPanel(nutritionData) {
  console.log("Creating nutrition panel with data:", nutritionData);
  
  if (!initThreeJs()) {
    console.error("Failed to initialize Three.js, cannot create nutrition panel");
    return;
  }
  
  // Remove any existing nutrition panel
  if (nutritionPanel) {
    scene.remove(nutritionPanel);
  }
  
  try {
    // Create a group to hold all panel elements
    nutritionPanel = new THREE.Group();
    
    // Create the main panel with rounded corners
    const roundedRectShape = new THREE.Shape();
    const width = 3.5;
    const height = 5.5;
    const radius = 0.2;
    
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
    nutritionPanel.add(panel);
    
    // Function to create modern text mesh
    function createTextMesh(text, size, color, y, isBold = false) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 1024;
      canvas.height = 256;
      
      // Fill with transparent background
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw text with better typography
      const fontWeight = isBold ? 'bold' : 'normal';
      context.font = `${fontWeight} 32px Arial, sans-serif`;
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      
      // Add subtle text shadow for legibility
      if (isBold) {
        context.shadowColor = 'rgba(0,0,0,0.2)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
      }
      
      // Handle multiline text
      const lines = text.split('\\n');
      const lineHeight = 40;
      const startY = canvas.height/2 - (lines.length - 1) * lineHeight/2;
      
      lines.forEach((line, index) => {
        context.fillText(line, canvas.width/2, startY + index * lineHeight);
      });
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter; // Better text quality
      texture.magFilter = THREE.LinearFilter;
      
      // Create plane with texture
      const geometry = new THREE.PlaneGeometry(size, size * canvas.height / canvas.width);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.position.z = -0.06; // Position in front
      
      return mesh;
    }
    
    // Parse nutrition data and create text
    const lines = nutritionData.split('\n');
    let startY = 2.3; // Starting position from top
    
    // Add title
    nutritionPanel.add(createTextMesh(lines[0], 3.2, '#1a73e8', startY, true));
    startY -= 0.7;
    
    // Add horizontal divider
    const dividerGeometry = new THREE.PlaneGeometry(3, 0.03);
    const dividerMaterial = new THREE.MeshBasicMaterial({ color: 0x1a73e8 });
    const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
    divider.position.y = startY + 0.2;
    divider.position.z = -0.05;
    nutritionPanel.add(divider);
    
    // Add data lines with better spacing and colors
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Format differently based on content
      if (line.startsWith('Name:') || line.startsWith('Brand:')) {
        // Product info in blue
        nutritionPanel.add(createTextMesh(line, 3, '#1a73e8', startY));
      } else if (line.includes('Ingredients:')) {
        // Ingredients in green
        nutritionPanel.add(createTextMesh(line, 2.7, '#0f9d58', startY));
      } else if (line.includes('kcal')) {
        // Energy in orange
        nutritionPanel.add(createTextMesh(line, 3, '#f57c00', startY));
      } else {
        // Other nutritional info in dark gray
        nutritionPanel.add(createTextMesh(line, 3, '#202124', startY));
      }
      
      startY -= 0.55;
    }
    
    // Add rounded corners for a more modern look
    panel.geometry.computeVertexNormals();
    
    // Position the panel in front of the camera rather than to the side
    nutritionPanel.position.x = 0; 
    nutritionPanel.position.z = -3.5;
    nutritionPanel.rotation.y = 0; // Straight on
    
    // Add to scene with an entry animation
    nutritionPanel.scale.set(0.1, 0.1, 0.1);
    scene.add(nutritionPanel);
    console.log("Nutrition panel added to scene");
    
    // Panel entry animation
    const startTime = Date.now();
    const animatePanelEntry = function() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / 500, 1); // 500ms animation
      
      nutritionPanel.scale.set(
        0.1 + 0.9 * progress,
        0.1 + 0.9 * progress,
        0.1 + 0.9 * progress
      );
      
      if (progress < 1) {
        requestAnimationFrame(animatePanelEntry);
      }
    };
    
    animatePanelEntry();
  } catch (error) {
    console.error("Error creating nutrition panel:", error);
    document.getElementById('status').innerText = "Error displaying nutrition information";
  }
}

// Function to initialize the camera stream
async function initCamera(switchCamera = false) {
  showLoadingIndicator(true);
  
  // Stop any existing streams
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  
  // Toggle camera mode if switching
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
    
    // For mobile Safari compatibility
    if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
      constraints.video = { 
        facingMode: facingMode,
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 }
      };
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    videoElement.srcObject = stream;
    currentStream = stream;
    
    // Update status with which camera is active
    document.getElementById('status').innerText = 'Using ' + 
      (frontCamera ? 'front' : 'back') + ' camera. Ready to scan barcodes.';
    
    showLoadingIndicator(false);
    
    // Start in barcode mode
    startBarcodeScanning();
    
  } catch (err) {
    console.error('Error accessing camera:', err);
    showLoadingIndicator(false);
    showPermissionError(true);
  }
}

// Show/hide loading indicator
function showLoadingIndicator(show) {
  loadingIndicator.style.display = show ? 'block' : 'none';
}

// Show/hide permission error
function showPermissionError(show) {
  permissionError.style.display = show ? 'flex' : 'none';
}

// Start barcode scanning using QuaggaJS
function startBarcodeScanning() {
  if (isQuaggaRunning) return;
  
  // Show scanner UI
  barcodeScannerUI.style.display = 'block';
  
  // Clear the QuaggaJS container before reinitializing
  quaggaContainer.innerHTML = '';
  quaggaContainer.style.display = 'block';
  
  // Make sure video is hidden as Quagga will create its own
  videoElement.style.display = 'none';
  
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
    locator: {
      patchSize: "medium",
      halfSample: true
    },
    numOfWorkers: navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2,
    frequency: 10, // Increased frequency for better detection
    decoder: {
      readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"],
      debug: {
        drawBoundingBox: true,
        showPattern: true
      }
    },
    locate: true
  }, function(err) {
    if (err) {
      console.error(err);
      document.getElementById("status").innerText = "Error initializing barcode scanner.";
      return;
    }
    
    console.log("QuaggaJS initialized.");
    
    // Add willReadFrequently attribute to all canvases
    setTimeout(() => {
      const canvases = quaggaContainer.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.willReadFrequently = true;
      });
      
      // Make sure video is visible
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

// Stop barcode scanning
function stopBarcodeScanning() {
  if (isQuaggaRunning) {
    Quagga.stop();
    isQuaggaRunning = false;
    
    // Clear the container
    quaggaContainer.style.display = 'none';
    quaggaContainer.innerHTML = '';
    
    // Hide scanner UI
    barcodeScannerUI.style.display = 'none';
    
    // Show our video element again
    videoElement.style.display = 'block';
  }
}

// Display product information from API response
function displayProductInfo(product) {
  try {
    console.log("Displaying product info:", product);
    
    // Format nutrition data
    const nutriments = product.nutriments || {};
    
    // Check if we have actual product data
    if (!product.product_name && !product.brands) {
      document.getElementById("status").innerText = "Product information incomplete";
      createGenericNutritionPanel(product.code || "Unknown Product");
      return;
    }
    
    // Format nutrition data with proper checking for undefined values
    let labelText = "Nutrition Facts\n";
    labelText += `Name: ${product.product_name || "N/A"}\n`;
    labelText += `Brand: ${product.brands || "N/A"}\n`;
    
    // Get ingredients if available
    if (product.ingredients_text) {
      const shortIngredients = product.ingredients_text.length > 100 ? 
        product.ingredients_text.substring(0, 100) + "..." : 
        product.ingredients_text;
      labelText += `Ingredients: ${shortIngredients}\n`;
    }
    
    // Format nutrition values with consistent units and fallbacks
    const energy = nutriments["energy-kcal"] ? 
      `${Math.round(nutriments["energy-kcal"])} kcal` : 
      (nutriments["energy"] ? `${Math.round(nutriments["energy"] / 4.184)} kcal` : "N/A");
    
    const fat = nutriments.fat ? 
      `${parseFloat(nutriments.fat).toFixed(1)}g` : "N/A";
    const sugars = nutriments.sugars ? 
      `${parseFloat(nutriments.sugars).toFixed(1)}g` : "N/A";
    const proteins = nutriments.proteins ? 
      `${parseFloat(nutriments.proteins).toFixed(1)}g` : "N/A";
    
    labelText += `Energy: ${energy}\n`;
    labelText += `Fat: ${fat}\n`;
    labelText += `Sugars: ${sugars}\n`;
    labelText += `Proteins: ${proteins}\n`;
    
    // Add salt or sodium if available
    if (nutriments.salt) {
      labelText += `Salt: ${parseFloat(nutriments.salt).toFixed(1)}g\n`;
    } else if (nutriments.sodium) {
      labelText += `Sodium: ${parseFloat(nutriments.sodium).toFixed(1)}g\n`;
    }
    
    // Add serving size if available
    if (product.serving_size) {
      labelText += `Serving: ${product.serving_size}\n`;
    }
    
    document.getElementById('status').innerText = "Found: " + (product.product_name || "Unknown");
    
    // Create 3D nutrition panel
    createNutritionPanel(labelText);
  } catch (error) {
    console.error("Error displaying product info:", error);
    
    // Fallback to generic panel
    const productName = product && product.product_name ? product.product_name : "Unknown Product";
    createGenericNutritionPanel(productName);
  }
}

// Create generic nutrition panel when exact product isn't found
function createGenericNutritionPanel(foodName) {
  // Generic nutrition data based on food type
  let labelText = "Estimated Nutrition\n";
  labelText += `Name: ${foodName}\n`;
  
  // Generic values based on food keywords
  let energy = "N/A";
  let fat = "N/A";
  let sugars = "N/A";
  let proteins = "N/A";
  
  // Very rough estimates for common food categories
  const foodLower = foodName.toLowerCase();
  
  if (foodLower.includes('chip') || foodLower.includes('crisp') || foodLower.includes('snack')) {
    energy = "150 kcal";
    fat = "10.0g";
    sugars = "1.5g";
    proteins = "2.0g";
  } else if (foodLower.includes('chocolate') || foodLower.includes('candy')) {
    energy = "200 kcal";
    fat = "12.0g";
    sugars = "20.0g";
    proteins = "2.5g";
  } else if (foodLower.includes('soda') || foodLower.includes('cola')) {
    energy = "120 kcal";
    fat = "0.0g";
    sugars = "30.0g";
    proteins = "0.0g";
  } else if (foodLower.includes('water') || foodLower.includes('bottle')) {
    energy = "0 kcal";
    fat = "0.0g";
    sugars = "0.0g";
    proteins = "0.0g";
  } else {
    energy = "100 kcal";
    fat = "5.0g";
    sugars = "3.0g";
    proteins = "3.0g";
  }
  
  labelText += `Energy: ${energy}\n`;
  labelText += `Fat: ${fat}\n`;
  labelText += `Sugars: ${sugars}\n`;
  labelText += `Proteins: ${proteins}\n`;
  labelText += `Note: Estimated values\n`;
  
  // Create 3D nutrition panel
  createNutritionPanel(labelText);
}

// Handle barcode detection
Quagga.onDetected = function(result) {
  const code = result.codeResult.code;
  console.log("Barcode detected:", code);
  document.getElementById("status").innerText = "Barcode detected: " + code;
  
  // Show loading indicator
  showLoadingIndicator(true);
  
  // Temporarily stop scanning
  Quagga.pause();
  
  // Highlight detected barcode
  const scanArea = document.querySelector('.scan-area');
  if (scanArea) {
    scanArea.style.borderColor = 'rgba(76, 175, 80, 0.8)';
    scanArea.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.5)';
    setTimeout(() => {
      scanArea.style.borderColor = 'rgba(66, 133, 244, 0.8)';
      scanArea.style.boxShadow = '0 0 0 5000px rgba(0, 0, 0, 0.5)';
    }, 1000);
  }

  // Check cache first
  if (foodCache.has(code)) {
    const cachedData = foodCache.get(code);
    displayProductInfo(cachedData);
    showLoadingIndicator(false);
    setTimeout(() => Quagga.start(), 5000);
    return;
  }

  // Query the Open Food Facts API for product details with fields parameter
  // to ensure we get all needed data
  fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json?fields=product_name,brands,nutriments,ingredients_text,nutrient_levels,serving_size`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if(data.status === 1) {
        const product = data.product;
        
        // Cache the result
        foodCache.set(code, product);
        
        // Display product info
        displayProductInfo(product);
      } else {
        document.getElementById("status").innerText = "Product not found for barcode: " + code;
        // Try alternative API if main one fails
        return fetch(`https://world.openfoodfacts.net/api/v2/product/${code}`);
      }
    })
    .then(response => {
      if (!response || !response.ok) return null;
      return response.json();
    })
    .then(data => {
      if (data && data.product) {
        const product = data.product;
        foodCache.set(code, product);
        displayProductInfo(product);
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
};

document.getElementById('switchCameraBtn').addEventListener('click', function() {
  // Stop current scanning if active
  if (isQuaggaRunning) {
    stopBarcodeScanning();
  }
  
  // Initialize with camera switch
  initCamera(true);
});

document.getElementById('retryPermission').addEventListener('click', function() {
  showPermissionError(false);
  initCamera();
});

// Initialize the app
window.addEventListener('load', () => {
  // Remove the image mode button since we only use barcode mode
  const imageModeBtn = document.getElementById('imageMode');
  if (imageModeBtn) {
    imageModeBtn.style.display = 'none';
  }
  
  // Make barcode mode button look like a title not a toggle
  const barcodeModeBtn = document.getElementById('barcodeMode');
  if (barcodeModeBtn) {
    barcodeModeBtn.classList.add('active');
    barcodeModeBtn.style.pointerEvents = 'none';
    barcodeModeBtn.textContent = 'Barcode Scanner';
    barcodeModeBtn.style.padding = '12px 24px';
  }
  
  // Initialize camera
  initCamera();
  
  // Initialize Three.js
  initThreeJs();
});

// Handle visibility changes (app going to background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // App came back to foreground
    if (!isQuaggaRunning) {
      startBarcodeScanning();
    }
  } else {
    // App went to background
    if (isQuaggaRunning) {
      Quagga.stop();
      isQuaggaRunning = false;
    }
  }
});

// Cleanup function for when the page is unloaded
window.addEventListener('beforeunload', () => {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  if (isQuaggaRunning) {
    Quagga.stop();
  }
});

// Add 3D AR effects to the barcode scanner UI
function enhanceUIWithAREffects() {
  const scanArea = document.querySelector('.scan-area');
  if (scanArea) {
    // Add pulsing effect to scan area
    scanArea.style.animation = 'pulse 2s infinite';
    // Add keyframes for pulse animation to document
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 5000px rgba(0, 0, 0, 0.5), 0 0 0 0 rgba(66, 133, 244, 0.7); }
        70% { box-shadow: 0 0 0 5000px rgba(0, 0, 0, 0.5), 0 0 0 10px rgba(66, 133, 244, 0); }
        100% { box-shadow: 0 0 0 5000px rgba(0, 0, 0, 0.5), 0 0 0 0 rgba(66, 133, 244, 0); }
      }
    `;
    document.head.appendChild(style);
    
    // Add 3D perspective to the scan corners
    const corners = document.querySelectorAll('.corner');
    corners.forEach(corner => {
      corner.style.transition = 'all 0.5s ease';
      corner.style.transformStyle = 'preserve-3d';
    });
  }
}

// Call the enhancement function when document is ready
document.addEventListener('DOMContentLoaded', enhanceUIWithAREffects);