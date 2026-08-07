// utils/cameraHelper.js
// Camera helper with multiple fallback strategies and flip support

export const isSecureContext = () => {
  return (
    window.isSecureContext ||
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
};

export const getCameraConstraints = (facingMode = "environment") => {
  // Try different constraint combinations for maximum compatibility
  const constraints = [
    // Strategy 1: Try with facing mode
    {
      video: {
        facingMode: facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    // Strategy 2: Try without facing mode (laptops)
    {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    // Strategy 3: Try with opposite facing mode
    {
      video: {
        facingMode: facingMode === "environment" ? "user" : "environment",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    // Strategy 4: Minimum constraints
    {
      video: true,
    },
  ];

  return constraints;
};

export const requestCameraWithFallback = async (facingMode = "environment") => {
  const constraintsList = getCameraConstraints(facingMode);
  let lastError = null;

  for (let i = 0; i < constraintsList.length; i++) {
    try {
      console.log(`📷 Trying camera strategy ${i + 1}:`, constraintsList[i]);
      const stream = await navigator.mediaDevices.getUserMedia(
        constraintsList[i],
      );
      console.log(`✅ Camera strategy ${i + 1} succeeded`);
      return stream;
    } catch (error) {
      console.warn(`❌ Camera strategy ${i + 1} failed:`, error.message);
      lastError = error;

      // If this is a permission error, continue to try other strategies
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        continue;
      }
    }
  }

  // If we get here, all strategies failed
  throw new Error(
    `Camera access failed: ${lastError?.message || "No working camera found"}`,
  );
};

// Check if camera is available without requesting
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

// Handle camera error with user-friendly messages
export const getCameraErrorMessage = (error) => {
  if (!error) return "Unknown camera error";

  const errorMap = {
    NotAllowedError:
      "Camera access was denied. Please allow camera access in your browser settings.",
    PermissionDeniedError:
      "Camera access was denied. Please allow camera access in your browser settings.",
    NotFoundError: "No camera found on this device. Please connect a camera.",
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
