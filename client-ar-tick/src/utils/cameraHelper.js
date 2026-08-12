// utils/cameraHelper.js - Optimized for performance

export const isSecureContext = () => {
  return (
    window.isSecureContext ||
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
};

export const getCameraConstraints = (facingMode = "environment") => {
  // LOWER RESOLUTION for better performance
  const constraints = [
    // Strategy 1: Low resolution for performance
    {
      video: {
        facingMode: facingMode,
        width: { ideal: 480, max: 640 },
        height: { ideal: 360, max: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    },
    // Strategy 2: Without facing mode
    {
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 }
      },
      audio: false
    },
    // Strategy 3: Minimum constraints
    {
      video: {
        facingMode: facingMode
      },
      audio: false
    },
    // Strategy 4: Fallback
    {
      video: true,
      audio: false
    }
  ];

  return constraints;
};

export const requestCameraWithFallback = async (facingMode = "environment") => {
  if (!isSecureContext()) {
    console.warn("⚠️ Not in secure context. Camera may not work.");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera not supported on this device/browser.");
  }

  const constraintsList = getCameraConstraints(facingMode);
  let lastError = null;

  for (let i = 0; i < constraintsList.length; i++) {
    try {
      console.log(`📷 Trying camera strategy ${i + 1}:`, constraintsList[i]);
      const stream = await navigator.mediaDevices.getUserMedia(
        constraintsList[i],
      );
      console.log(`✅ Camera strategy ${i + 1} succeeded`);
      
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error("No video tracks available");
      }
      
      console.log(`📹 Using camera: ${videoTracks[0].label || 'Unknown'}`);
      return stream;
    } catch (error) {
      console.warn(`❌ Camera strategy ${i + 1} failed:`, error.message);
      lastError = error;

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        continue;
      }
      
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        continue;
      }
    }
  }

  throw new Error(
    `Camera access failed: ${lastError?.message || "No working camera found"}`,
  );
};

export const checkCameraAvailability = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { available: false, error: "MediaDevices API not available" };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");

    console.log(
      `📷 Found ${cameras.length} camera(s):`,
      cameras.map((c) => c.label || "Unnamed"),
    );

    return {
      available: cameras.length > 0,
      count: cameras.length,
      devices: cameras,
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
};

export const getCameraErrorMessage = (error) => {
  if (!error) return "Unknown camera error";

  const errorMap = {
    NotAllowedError:
      "Camera access denied. Please allow camera access in your browser settings.",
    PermissionDeniedError:
      "Camera access denied. Please allow camera access in your browser settings.",
    NotFoundError: "No camera found on this device. Please connect a camera.",
    DevicesNotFoundError: "No camera found on this device. Please connect a camera.",
    NotReadableError:
      "Camera is in use by another application. Please close other apps using the camera.",
    OverconstrainedError:
      "Camera does not support the requested settings. Try a different camera.",
    SecurityError:
      "Camera access requires HTTPS or localhost. Please use HTTPS or localhost.",
    AbortError: "Camera request was aborted. Please try again.",
    "Camera not supported":
      "Camera not supported. Please use HTTPS or localhost.",
  };

  const key = Object.keys(errorMap).find(
    (key) => error.message?.includes(key) || error.name === key,
  );

  return errorMap[key] || `Camera error: ${error.message || error}`;
};

export const getCameraPermissionStatus = async () => {
  try {
    if (!navigator.permissions || !navigator.permissions.query) {
      return 'unknown';
    }
    
    const result = await navigator.permissions.query({ name: 'camera' });
    return result.state;
  } catch (error) {
    console.warn('Permission query not supported:', error);
    return 'unknown';
  }
};